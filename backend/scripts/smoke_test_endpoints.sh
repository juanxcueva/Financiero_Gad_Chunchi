#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_PORT="${TEST_PORT:-3002}"
API_BASE="${API_BASE:-http://localhost:${TEST_PORT}/api}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-financiero_gad_chunchi}"
DB_USER="${DB_USER:-financiero_user}"
DB_PASSWORD="${DB_PASSWORD:-financiero_pass}"
JWT_SECRET="${JWT_SECRET:-cambia_esto_en_produccion}"

TMP_DIR="$(mktemp -d)"
SERVER_LOG="$TMP_DIR/backend.log"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Iniciando backend para pruebas..."
(
  cd "$ROOT_DIR"
  PORT="$TEST_PORT" DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" JWT_SECRET="$JWT_SECRET" \
    node backend/src/app.js
) >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!

for _ in {1..40}; do
  if curl -fsS "$API_BASE/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "$API_BASE/health" >/dev/null 2>&1; then
  echo "ERROR: backend no respondio en /api/health"
  echo "---- backend log ----"
  cat "$SERVER_LOG"
  exit 1
fi

request_json() {
  local method="$1"
  local path="$2"
  local expected="$3"
  local token="${4:-}"

  local out="$TMP_DIR/resp.json"
  local code

  if [[ -n "$token" ]]; then
    code=$(curl -sS -o "$out" -w "%{http_code}" -X "$method" "$API_BASE$path" -H "Authorization: Bearer $token" -H "Content-Type: application/json")
  else
    code=$(curl -sS -o "$out" -w "%{http_code}" -X "$method" "$API_BASE$path" -H "Content-Type: application/json")
  fi

  if [[ "$code" != "$expected" ]]; then
    echo "ERROR: $method $path -> HTTP $code (esperado $expected)"
    cat "$out"
    exit 1
  fi

  echo "OK: $method $path -> $code"
}

request_json_body() {
  local method="$1"
  local path="$2"
  local expected="$3"
  local token="$4"
  local body="$5"

  local out="$TMP_DIR/resp.json"
  local code

  code=$(curl -sS -o "$out" -w "%{http_code}" -X "$method" "$API_BASE$path" -H "Authorization: Bearer $token" -H "Content-Type: application/json" -d "$body")

  if [[ "$code" != "$expected" ]]; then
    echo "ERROR: $method $path -> HTTP $code (esperado $expected)"
    cat "$out"
    exit 1
  fi

  echo "OK: $method $path -> $code"
}

login_resp=$(curl -sS -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
login_ok=$(echo "$login_resp" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.success===true));")
if [[ "$login_ok" != "true" ]]; then
  echo "ERROR: login admin fallo"
  echo "$login_resp"
  exit 1
fi

TOKEN=$(echo "$login_resp" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(d.data.token);")

request_json GET "/auth/verify" "200" "$TOKEN"
request_json GET "/auth/usuarios" "200" "$TOKEN"

# auth: crear/editar/cambiar password/eliminar usuario temporal
TMP_USERNAME="tmp_api_user_$(date +%s)"
tmp_user_json="{\"username\":\"$TMP_USERNAME\",\"password\":\"Tmp123456!\",\"nombre_completo\":\"Usuario Temporal\",\"rol\":\"financiero\"}"
request_json_body POST "/auth/usuarios" "201" "$TOKEN" "$tmp_user_json"

tmp_user_id=$(cat "$TMP_DIR/resp.json" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.data.id));")

tmp_user_update='{"nombre_completo":"Usuario Temporal Editado","rol":"auditor","activo":true}'
request_json_body PUT "/auth/usuarios/$tmp_user_id" "200" "$TOKEN" "$tmp_user_update"

tmp_login_resp=$(curl -sS -X POST "$API_BASE/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"$TMP_USERNAME\",\"password\":\"Tmp123456!\"}")
tmp_login_ok=$(echo "$tmp_login_resp" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.success===true));")
if [[ "$tmp_login_ok" != "true" ]]; then
  echo "ERROR: login temporal fallo"
  echo "$tmp_login_resp"
  exit 1
fi

TMP_TOKEN=$(echo "$tmp_login_resp" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(d.data.token);")
change_pwd='{"password_actual":"Tmp123456!","password_nueva":"Tmp654321!"}'
request_json_body POST "/auth/cambiar-password" "200" "$TMP_TOKEN" "$change_pwd"

request_json GET "/ordenes-pago?page=1&limit=5" "200" "$TOKEN"
request_json GET "/ordenes-pago/siguiente-numero" "200" "$TOKEN"
request_json GET "/ordenes-pago/estadisticas" "200" "$TOKEN"
request_json GET "/beneficiarios?page=1&limit=5" "200" "$TOKEN"
request_json GET "/beneficiarios/buscar?q=11" "200" "$TOKEN"

# beneficiarios: crear y editar
TMP_RUC="9$(date +%s | tail -c 10)"
ben_create="{\"ruc_cedula\":\"$TMP_RUC\",\"nombre\":\"Beneficiario Prueba API\"}"
request_json_body POST "/beneficiarios" "201" "$TOKEN" "$ben_create"
BEN_ID=$(cat "$TMP_DIR/resp.json" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.data.id));")

ben_update="{\"ruc_cedula\":\"$TMP_RUC\",\"nombre\":\"Beneficiario Prueba API Editado\"}"
request_json_body PUT "/beneficiarios/$BEN_ID" "200" "$TOKEN" "$ben_update"

request_json GET "/configuracion" "200" "$TOKEN"
request_json GET "/configuracion/firmantes" "200" "$TOKEN"
request_json GET "/configuracion/retenciones-catalogo" "200" "$TOKEN"

# configuracion: actualizar clave
cfg_update='{"institucion_ruc":"0699999999001"}'
request_json_body PUT "/configuracion" "200" "$TOKEN" "$cfg_update"

# firmantes: crear y editar
firm_create='{"cargo":"Cargo Prueba","nombre":"Firmante Prueba","orden":99}'
request_json_body POST "/configuracion/firmantes" "201" "$TOKEN" "$firm_create"
FIRM_ID=$(cat "$TMP_DIR/resp.json" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.data.id));")

firm_update='{"cargo":"Cargo Prueba Editado","nombre":"Firmante Editado","orden":98}'
request_json_body PUT "/configuracion/firmantes/$FIRM_ID" "200" "$TOKEN" "$firm_update"

# retenciones catalogo: crear y editar
ret_create='{"codigo":"TST001","nombre":"Retencion Test","tipo":"OTRO","porcentaje":1.5}'
request_json_body POST "/configuracion/retenciones-catalogo" "201" "$TOKEN" "$ret_create"
RET_ID=$(cat "$TMP_DIR/resp.json" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.data.id));")

ret_update='{"nombre":"Retencion Test Editada","tipo":"OTRO","porcentaje":2.0,"activo":true}'
request_json_body PUT "/configuracion/retenciones-catalogo/$RET_ID" "200" "$TOKEN" "$ret_update"

request_json GET "/auditoria?page=1&limit=5" "200" "$TOKEN"

ordenes_resp=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API_BASE/ordenes-pago?page=1&limit=1")
ORDEN_ID=$(echo "$ordenes_resp" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.data?.[0]?.id || ''));")
if [[ -z "$ORDEN_ID" ]]; then
  echo "ERROR: no se pudo obtener un id de orden para pruebas"
  echo "$ordenes_resp"
  exit 1
fi

request_json GET "/ordenes-pago/$ORDEN_ID" "200" "$TOKEN"

# ordenes: crear, editar y anular
orden_create='{"codigo_beneficiario":"0990000000001","nombre_beneficiario":"Beneficiario Orden Test","detalle":"Orden de prueba API","valor_planilla":100,"porcentaje_iva":15,"otros_cargos":[{"razon":"Cargo Test","valor":10}],"retenciones":[{"tipo":"IR","concepto":"Ret Test","base":100,"porcentaje":1,"valor":1}]}'
request_json_body POST "/ordenes-pago" "201" "$TOKEN" "$orden_create"
NEW_ORDEN_ID=$(cat "$TMP_DIR/resp.json" | node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync(0,'utf8')); process.stdout.write(String(d.data.id));")

orden_update='{"nombre_beneficiario":"Beneficiario Orden Test Editado","codigo_beneficiario":"0990000000001","detalle":"Orden de prueba API editada","valor_planilla":120,"porcentaje_iva":15,"otros_cargos":[{"razon":"Cargo Test 2","valor":12}],"retenciones":[{"tipo":"IR","concepto":"Ret Test 2","base":120,"porcentaje":1,"valor":1.2}]}'
request_json_body PUT "/ordenes-pago/$NEW_ORDEN_ID" "200" "$TOKEN" "$orden_update"

orden_anular='{"motivo":"Prueba automatica"}'
request_json_body PATCH "/ordenes-pago/$NEW_ORDEN_ID/anular" "200" "$TOKEN" "$orden_anular"

request_json_body DELETE "/auth/usuarios/$tmp_user_id" "200" "$TOKEN" "{}"

pdf_code=$(curl -sS -o "$TMP_DIR/doc.pdf" -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/documentos/$ORDEN_ID/pdf")
if [[ "$pdf_code" != "200" ]]; then
  echo "ERROR: GET /documentos/$ORDEN_ID/pdf -> HTTP $pdf_code"
  exit 1
fi
echo "OK: GET /documentos/$ORDEN_ID/pdf -> 200"

word_code=$(curl -sS -o "$TMP_DIR/doc.docx" -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/documentos/$ORDEN_ID/word")
if [[ "$word_code" != "200" ]]; then
  echo "ERROR: GET /documentos/$ORDEN_ID/word -> HTTP $word_code"
  exit 1
fi
echo "OK: GET /documentos/$ORDEN_ID/word -> 200"

echo "Smoke tests completados correctamente."
