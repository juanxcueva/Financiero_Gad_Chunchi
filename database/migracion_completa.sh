#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACCESS_INBOX_DIR="${ACCESS_INBOX_DIR:-$ROOT_DIR/uploads/access}"
DEFAULT_MDB_FILE="/home/juan/Documents/Access/Sofacd1.mdb"
MDB_FILE="${1:-${MDB_FILE:-}}"
if [[ -z "$MDB_FILE" ]]; then
  MDB_FILE="$(ls -1t "$ACCESS_INBOX_DIR"/*.{mdb,accdb} 2>/dev/null | head -n 1 || true)"
fi
MDB_FILE="${MDB_FILE:-$DEFAULT_MDB_FILE}"
CSV_FILE="$ROOT_DIR/migracion_output/APContabOrdenPago.csv"

# Cargar credenciales del backend si existen, para reutilizar la misma configuración que usa la app.
if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT_DIR/backend/.env"
  set +a
fi
if [[ -f "$ROOT_DIR/backend/.env.local" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "$ROOT_DIR/backend/.env.local"
  set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-financiero_gad_chunchi}"
DB_USER="${DB_USER:-${PGUSER:-financiero_user}}"
DB_PASSWORD="${DB_PASSWORD:-${PGPASSWORD:-financiero_pass}}"
JWT_SECRET="${JWT_SECRET:-cambia_esto_en_produccion}"

RUN_SMOKE_TESTS="${RUN_SMOKE_TESTS:-1}"

echo "== Migracion completa GAD Chunchi =="
echo "ROOT_DIR: $ROOT_DIR"
echo "ACCESS_INBOX_DIR: $ACCESS_INBOX_DIR"
echo "MDB_FILE: $MDB_FILE"
echo "DB: $DB_HOST:$DB_PORT/$DB_NAME (user=$DB_USER)"

for cmd in mdb-export psql node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: comando requerido no encontrado: $cmd"
    exit 1
  fi
done

if [[ ! -f "$MDB_FILE" ]]; then
  echo "ERROR: no existe el archivo MDB: $MDB_FILE"
  echo "Coloque el archivo en $ACCESS_INBOX_DIR o pase la ruta como primer argumento."
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"

if [[ -d "$ROOT_DIR/.venv" ]]; then
  PYTHON_CMD="$ROOT_DIR/.venv/bin/python"
else
  PYTHON_CMD="python3"
fi

if ! "$PYTHON_CMD" -c "import psycopg2" >/dev/null 2>&1; then
  echo "Instalando dependencia Python: psycopg2-binary"
  "$PYTHON_CMD" -m pip install psycopg2-binary
fi

if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -Atqc "SELECT 1" >/dev/null 2>&1; then
  echo "ERROR: no se pudo conectar a PostgreSQL con el usuario configurado."
  echo "Verifica DB_HOST, DB_PORT, DB_USER y DB_PASSWORD."
  exit 1
fi

if [[ "$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")" != "1" ]]; then
  echo "Creando base de datos $DB_NAME"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\""
fi

echo "Recreando schema financiero"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS financiero CASCADE"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/database/schema.sql"

echo "Inicializando usuarios por defecto"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" JWT_SECRET="$JWT_SECRET" \
  node "$ROOT_DIR/backend/src/config/init-db.js"

echo "Exportando APContabOrdenPago desde Access"
mkdir -p "$ROOT_DIR/migracion_output"
mdb-export "$MDB_FILE" APContabOrdenPago > "$CSV_FILE"

echo "Ejecutando migracion a PostgreSQL"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
  "$PYTHON_CMD" "$ROOT_DIR/database/migrar_ordenes_pago.py"

echo "Sincronizando catalogos bancarios desde Access"
DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" MDB_FILE="$MDB_FILE" \
  node "$ROOT_DIR/backend/src/config/migrate-add-cuentas-bancarias.js"

echo "Verificacion final"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atqc "
SELECT 'ordenes_pago=' || COUNT(*) FROM financiero.ordenes_pago;
SELECT 'beneficiarios=' || COUNT(*) FROM financiero.beneficiarios;
SELECT 'max_numero_orden=' || COALESCE(MAX(numero_orden), 0) FROM financiero.ordenes_pago;
"

if [[ "$RUN_SMOKE_TESTS" == "1" ]]; then
  echo "Ejecutando smoke tests de API"
  DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" JWT_SECRET="$JWT_SECRET" \
    "$ROOT_DIR/backend/scripts/smoke_test_endpoints.sh"
fi

echo "Migracion completa finalizada."
