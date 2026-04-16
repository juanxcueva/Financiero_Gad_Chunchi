#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PORT="${BACKEND_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5174}"

if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  echo "ERROR: No se encontraron carpetas backend y frontend en $ROOT_DIR"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node no esta instalado o no esta en PATH"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm no esta instalado o no esta en PATH"
  exit 1
fi

port_in_use() {
  local port="$1"
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ":${port}$"
}

if port_in_use "$BACKEND_PORT"; then
  echo "ERROR: el puerto $BACKEND_PORT ya esta en uso."
  echo "Cierra el proceso actual o cambia BACKEND_PORT antes de ejecutar el script."
  exit 1
fi

if port_in_use "$FRONTEND_PORT"; then
  echo "ERROR: el puerto $FRONTEND_PORT ya esta en uso."
  echo "Cierra el proceso actual o cambia FRONTEND_PORT antes de ejecutar el script."
  exit 1
fi

cleanup() {
  echo ""
  echo "Deteniendo servicios..."
  if [[ -n "${BACK_PID:-}" ]] && kill -0 "$BACK_PID" >/dev/null 2>&1; then
    kill "$BACK_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONT_PID:-}" ]] && kill -0 "$FRONT_PID" >/dev/null 2>&1; then
    kill "$FRONT_PID" >/dev/null 2>&1 || true
  fi
  wait >/dev/null 2>&1 || true
}

trap cleanup INT TERM EXIT

echo "Iniciando backend en puerto $BACKEND_PORT..."
(Opción 3
  cd "$BACKEND_DIR"
  PORT="$BACKEND_PORT" node src/app.js
) &
BACK_PID=$!

echo "Iniciando frontend en puerto $FRONTEND_PORT..."
(
  cd "$FRONTEND_DIR"
  npm run dev -- --port "$FRONTEND_PORT" --strictPort
) &
FRONT_PID=$!

echo ""
echo "Servicios levantados:"
echo "- Backend:  http://localhost:$BACKEND_PORT/api/health"
echo "- Frontend: http://localhost:$FRONTEND_PORT"
echo ""
echo "Presiona Ctrl+C para detener ambos servicios."
echo ""

wait -n "$BACK_PID" "$FRONT_PID"

echo "Uno de los procesos se detuvo. Cerrando ambos..."
exit 1
