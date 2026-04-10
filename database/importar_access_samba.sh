#!/usr/bin/env bash
set -euo pipefail

# Flujo:
# 1) Toma un archivo Access (.mdb/.accdb) desde carpeta Samba
# 2) Exporta tabla APContabOrdenPago a CSV con mdbtools
# 3) Ejecuta migración a PostgreSQL con migrar_ordenes_pago.py
#
# Uso:
#   bash database/importar_access_samba.sh
#   bash database/importar_access_samba.sh /srv/financiero/import/archivo.accdb

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INBOX_DIR="${ACCESS_INBOX_DIR:-/srv/financiero/import}"
TABLE_NAME="${ACCESS_TABLE_NAME:-APContabOrdenPago}"
CSV_OUT="${ACCESS_CSV_OUT:-$ROOT_DIR/migracion_output/APContabOrdenPago.csv}"

if ! command -v mdb-export >/dev/null 2>&1; then
  echo "ERROR: mdb-export no está instalado. Instale mdbtools: sudo apt install -y mdbtools"
  exit 1
fi

ACCESS_FILE="${1:-}"
if [[ -z "$ACCESS_FILE" ]]; then
  # Toma el archivo más reciente .mdb/.accdb de la carpeta compartida
  ACCESS_FILE="$(ls -1t "$INBOX_DIR"/*.{mdb,accdb} 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "$ACCESS_FILE" || ! -f "$ACCESS_FILE" ]]; then
  echo "ERROR: No se encontró archivo Access en $INBOX_DIR"
  echo "Coloque un archivo .mdb o .accdb y reintente."
  exit 1
fi

mkdir -p "$(dirname "$CSV_OUT")"

echo "Archivo Access: $ACCESS_FILE"
echo "Tabla origen:  $TABLE_NAME"
echo "CSV destino:   $CSV_OUT"

# Exportar a CSV (sobrescribe salida anterior)
mdb-export "$ACCESS_FILE" "$TABLE_NAME" > "$CSV_OUT"

echo "Exportación completada. Iniciando migración a PostgreSQL..."

python3 "$ROOT_DIR/database/migrar_ordenes_pago.py" --csv-path "$CSV_OUT"

echo "Proceso finalizado correctamente."
