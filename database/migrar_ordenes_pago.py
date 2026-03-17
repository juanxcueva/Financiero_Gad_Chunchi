#!/usr/bin/env python3
"""
Migración: APContabOrdenPago (Access) → financiero.ordenes_pago (PostgreSQL)
GAD Municipal de Chunchi
"""

import csv
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime
import os
import sys

# Configuración
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'dbname': os.getenv('DB_NAME', 'financiero_gad_chunchi'),
    'user': os.getenv('DB_USER', 'juancuevabermeo'),
    'password': os.getenv('DB_PASSWORD', ''),
}

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'migracion_output', 'APContabOrdenPago.csv')


def limpiar_texto(val):
    if val is None:
        return None
    val = val.strip()
    return val if val else None


def limpiar_decimal(val):
    if val is None:
        return 0
    val = str(val).strip().replace(',', '')
    try:
        return round(float(val), 2)
    except (ValueError, TypeError):
        return 0


def limpiar_entero(val):
    if val is None:
        return None
    val = str(val).strip()
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def limpiar_fecha(val):
    if val is None:
        return None
    val = str(val).strip()
    if not val:
        return None
    for fmt in ['%m/%d/%y %H:%M:%S', '%m/%d/%Y %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y', '%m/%d/%y']:
        try:
            return datetime.strptime(val, fmt)
        except ValueError:
            continue
    return None


def migrar():
    print("=" * 60)
    print("MIGRACIÓN: APContabOrdenPago → financiero.ordenes_pago")
    print("=" * 60)

    if not os.path.exists(CSV_PATH):
        print(f"ERROR: No se encontró el archivo CSV: {CSV_PATH}")
        sys.exit(1)

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Leer CSV
    with open(CSV_PATH, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Registros en CSV: {len(rows)}")

    # Primero extraer beneficiarios únicos e insertar
    beneficiarios = {}
    for row in rows:
        cod = limpiar_texto(row.get('CodBeneficiario'))
        nombre = limpiar_texto(row.get('Beneficiario'))
        if cod and nombre:
            key = cod
            if key not in beneficiarios:
                beneficiarios[key] = {
                    'ruc_cedula': cod,
                    'nombre': nombre,
                    'tipo_cuenta': limpiar_texto(row.get('TipoCuenB')),
                    'cuenta_bancaria': limpiar_texto(row.get('CuentaBenef')),
                }

    print(f"Beneficiarios únicos: {len(beneficiarios)}")

    # Insertar beneficiarios
    for b in beneficiarios.values():
        cur.execute("""
            INSERT INTO financiero.beneficiarios (ruc_cedula, nombre, tipo_cuenta, cuenta_bancaria)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT DO NOTHING
        """, (b['ruc_cedula'], b['nombre'], b['tipo_cuenta'], b['cuenta_bancaria']))

    conn.commit()
    print("Beneficiarios insertados.")

    # Insertar órdenes de pago
    insertados = 0
    errores = 0

    for i, row in enumerate(rows):
        cur.execute("SAVEPOINT sp_row")
        try:
            num_orden = limpiar_entero(row.get('NumOrdenPago'))
            if num_orden is None:
                continue

            fecha = limpiar_fecha(row.get('FechaOrden'))
            if fecha is None:
                fecha = datetime(2000, 1, 1)

            # Calcular total retenciones
            retenciones_data = []
            for j in range(1, 9):
                razon = limpiar_texto(row.get(f'Razon{j}'))
                porcen = limpiar_decimal(row.get(f'Porcen{j}'))
                valor = limpiar_decimal(row.get(f'ValorRet{j}'))
                if razon and (porcen > 0 or valor > 0):
                    retenciones_data.append({
                        'tipo': 'OTRO',
                        'concepto': razon,
                        'base': 0,
                        'porcentaje': porcen,
                        'valor': valor,
                    })

            # Retenciones IVA
            for j in range(1, 3):
                base_iva = limpiar_decimal(row.get(f'BaseIVA{j}'))
                tasa_iva = limpiar_decimal(row.get(f'TasaIVA{j}'))
                ret_iva = limpiar_decimal(row.get(f'RetIVA{j}'))
                if ret_iva > 0:
                    retenciones_data.append({
                        'tipo': 'IVA',
                        'concepto': f'Ret. IVA {tasa_iva}%',
                        'base': base_iva,
                        'porcentaje': tasa_iva,
                        'valor': ret_iva,
                    })

            # Retenciones IR
            for j in range(1, 3):
                base_ir = limpiar_decimal(row.get(f'BaseIR{j}'))
                tasa_ir = limpiar_decimal(row.get(f'TasaIR{j}'))
                ret_ir = limpiar_decimal(row.get(f'RetIR{j}'))
                if ret_ir > 0:
                    retenciones_data.append({
                        'tipo': 'IR',
                        'concepto': f'Ret. IR {tasa_ir}%',
                        'base': base_ir,
                        'porcentaje': tasa_ir,
                        'valor': ret_ir,
                    })

            total_retenciones = sum(r['valor'] for r in retenciones_data)
            total_retenciones += limpiar_decimal(row.get('ValorOtrasReten'))

            # Otros valores
            otros_valores = []
            for j in range(1, 7):
                razon_ov = limpiar_texto(row.get(f'ROtrosValores{j}'))
                valor_ov = limpiar_decimal(row.get(f'VOtrosValores{j}'))
                if razon_ov and valor_ov > 0:
                    otros_valores.append({
                        'tipo': 'DEDUCCION',
                        'concepto': razon_ov,
                        'valor': valor_ov,
                    })

            valor_planilla = limpiar_decimal(row.get('ValorPlanilla'))
            valor_iva = limpiar_decimal(row.get('ValorIVA'))
            total_cargos = limpiar_decimal(row.get('TotalOrdenPago'))

            if total_cargos == 0:
                total_cargos = valor_planilla + valor_iva
                for k in range(6):
                    suffix = '' if k == 0 else str(k)
                    total_cargos += limpiar_decimal(row.get(f'VOtrosCargos{suffix}'))

            liquido = total_cargos - total_retenciones

            cur.execute("""
                INSERT INTO financiero.ordenes_pago (
                    numero_orden, tipo_comprobante, numero_comprobante, fecha, situacion,
                    codigo_beneficiario, nombre_beneficiario,
                    cuenta_banco_central, codigo_inst_financiera,
                    tipo_cuenta_beneficiario, cuenta_beneficiario,
                    detalle,
                    valor_planilla, valor_iva, porcentaje_iva,
                    razon_otros_cargos, valor_otros_cargos,
                    razon_otros_cargos_1, valor_otros_cargos_1,
                    razon_otros_cargos_2, valor_otros_cargos_2,
                    razon_otros_cargos_3, valor_otros_cargos_3,
                    razon_otros_cargos_4, valor_otros_cargos_4,
                    razon_otros_cargos_5, valor_otros_cargos_5,
                    total_cargos, total_retenciones, liquido_pagar,
                    codigo_banco, cheque_numero, valor_cheque,
                    access_num_orden_pago, access_user_mov, access_fecha_comp,
                    access_user_mod, access_fecha_mod
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s,
                    %s, %s,
                    %s, %s,
                    %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s, %s
                )
                RETURNING id
            """, (
                num_orden,
                limpiar_texto(row.get('TipoComp')),
                limpiar_texto(row.get('NumComprob')),
                fecha,
                limpiar_texto(row.get('SituacionOrden')) or 'ACTIVO',
                limpiar_texto(row.get('CodBeneficiario')),
                limpiar_texto(row.get('Beneficiario')) or 'SIN NOMBRE',
                limpiar_texto(row.get('CuentaBC')),
                limpiar_texto(row.get('CodInsF')),
                limpiar_texto(row.get('TipoCuenB')),
                limpiar_texto(row.get('CuentaBenef')),
                limpiar_texto(row.get('DetalleOrden')) or '',
                valor_planilla,
                valor_iva,
                15 if valor_iva > 0 and valor_planilla > 0 else 0,
                limpiar_texto(row.get('RazonOtrosCargos')),
                limpiar_decimal(row.get('VOtrosCargos')),
                limpiar_texto(row.get('ROtrosCargos1')),
                limpiar_decimal(row.get('VOtrosCargos1')),
                limpiar_texto(row.get('ROtrosCargos2')),
                limpiar_decimal(row.get('VOtrosCargos2')),
                limpiar_texto(row.get('ROtrosCargos3')),
                limpiar_decimal(row.get('VOtrosCargos3')),
                limpiar_texto(row.get('ROtrosCargos4')),
                limpiar_decimal(row.get('VOtrosCargos4')),
                limpiar_texto(row.get('ROtrosCargos5')),
                limpiar_decimal(row.get('VOtrosCargos5')),
                total_cargos,
                total_retenciones,
                liquido,
                limpiar_texto(row.get('CodigoBanco')),
                limpiar_texto(row.get('ChequeNum')),
                limpiar_decimal(row.get('ValorCheque')),
                num_orden,
                limpiar_texto(row.get('UserMov')),
                limpiar_fecha(row.get('FechaComp')),
                limpiar_texto(row.get('UserMod')),
                limpiar_fecha(row.get('FechaMod')),
            ))

            orden_id = cur.fetchone()[0]

            # Insertar retenciones
            for ret in retenciones_data:
                cur.execute("""
                    INSERT INTO financiero.ordenes_pago_retenciones
                    (orden_pago_id, tipo, concepto, base, porcentaje, valor)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (orden_id, ret['tipo'], ret['concepto'], ret['base'], ret['porcentaje'], ret['valor']))

            # Insertar otros valores
            for ov in otros_valores:
                cur.execute("""
                    INSERT INTO financiero.ordenes_pago_otros_valores
                    (orden_pago_id, tipo, concepto, valor)
                    VALUES (%s, %s, %s, %s)
                """, (orden_id, ov['tipo'], ov['concepto'], ov['valor']))

            insertados += 1
            cur.execute("RELEASE SAVEPOINT sp_row")

            if insertados % 5000 == 0:
                conn.commit()
                print(f"  Progreso: {insertados} registros insertados...")

        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp_row")
            errores += 1
            if errores <= 10:
                print(f"  Error en registro {i}: {e}")

    conn.commit()

    print(f"\nResultado:")
    print(f"  Insertados: {insertados}")
    print(f"  Errores: {errores}")

    # Verificar
    cur.execute("SELECT COUNT(*) FROM financiero.ordenes_pago")
    count = cur.fetchone()[0]
    print(f"  Total en PostgreSQL: {count}")

    cur.execute("SELECT MAX(numero_orden) FROM financiero.ordenes_pago")
    max_orden = cur.fetchone()[0]
    print(f"  Último número de orden: {max_orden}")

    cur.execute("SELECT COUNT(*) FROM financiero.beneficiarios")
    ben_count = cur.fetchone()[0]
    print(f"  Beneficiarios: {ben_count}")

    cur.close()
    conn.close()
    print("\nMigración completada.")


if __name__ == '__main__':
    migrar()
