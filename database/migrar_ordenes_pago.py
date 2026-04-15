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
import argparse

# Configuración
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'dbname': os.getenv('DB_NAME', 'financiero_gad_chunchi'),
    'user': os.getenv('DB_USER', 'juancuevabermeo'),
    'password': os.getenv('DB_PASSWORD', ''),
}

DEFAULT_CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'migracion_output', 'APContabOrdenPago.csv')


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


def limpiar_porcentaje(val):
    num = limpiar_decimal(val)
    # La columna porcentaje es NUMERIC(6,3): rango maximo absoluto 999.999
    if num > 999.999:
        return 999.999
    if num < -999.999:
        return -999.999


def corregir_cheque_typo(cheque_str, num_orden, fecha_str):
    """
    Corrige typos conocidos en números de cheque según análisis de datos históricos.
    
    El 26642 del 2023-03-29 es un outlier documentado: debería ser 24642.
    Patrón detectado en Access: 24641 → 26642 → 24643 (typo de digitación)
    """
    if cheque_str is None:
        return None
    
    cheque_str = cheque_str.strip()
    if not cheque_str or not cheque_str.isdigit():
        return cheque_str
    
    cheque_num = int(cheque_str)
    
    # Diccionario de correcciones conocidas: {num_orden: (cheque_incorrecto, cheque_correcto)}
    correcciones_conocidas = {
        27361: (26642, '24642'),  # Typo histórico del 2023-03-29: 26642 → 24642
    }
    
    if num_orden in correcciones_conocidas:
        incorrecto, correcto = correcciones_conocidas[num_orden]
        if cheque_num == incorrecto:
            print(f"  ✓ CORRIGIENDO CHEQUE: Orden {num_orden} (Fecha {fecha_str}): {incorrecto} → {correcto}")
            return correcto
    
    return cheque_str
    return round(num, 3)


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


def migrar(csv_path):
    print("=" * 60)
    print("MIGRACIÓN: APContabOrdenPago → financiero.ordenes_pago")
    print("=" * 60)

    if not os.path.exists(csv_path):
        print(f"ERROR: No se encontró el archivo CSV: {csv_path}")
        sys.exit(1)

    print(f"CSV origen: {csv_path}")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Leer CSV
    with open(csv_path, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    print(f"Registros en CSV: {len(rows)}")
    print(f"PROGRESS total={len(rows)} inserted=0 stage=reading_csv")

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
            SELECT %s, %s, %s, %s
            WHERE NOT EXISTS (
                SELECT 1 FROM financiero.beneficiarios WHERE ruc_cedula = %s
            )
        """, (b['ruc_cedula'], b['nombre'], b['tipo_cuenta'], b['cuenta_bancaria'], b['ruc_cedula']))

    conn.commit()
    print("Beneficiarios insertados.")
    print(f"PROGRESS total={len(rows)} inserted=0 stage=migrating")

    # Insertar órdenes de pago
    insertados = 0
    omitidos = 0
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
                porcen = limpiar_porcentaje(row.get(f'Porcen{j}'))
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
                tasa_iva = limpiar_porcentaje(row.get(f'TasaIVA{j}'))
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
                tasa_ir = limpiar_porcentaje(row.get(f'TasaIR{j}'))
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
                ON CONFLICT (numero_orden) DO NOTHING
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
                corregir_cheque_typo(limpiar_texto(row.get('ChequeNum')), num_orden, row.get('FechaOrden', '')),
                limpiar_decimal(row.get('ValorCheque')),
                num_orden,
                limpiar_texto(row.get('UserMov')),
                limpiar_fecha(row.get('FechaComp')),
                limpiar_texto(row.get('UserMod')),
                limpiar_fecha(row.get('FechaMod')),
            ))

            inserted_row = cur.fetchone()
            if inserted_row is None:
                omitidos += 1
                cur.execute("RELEASE SAVEPOINT sp_row")
                if (omitidos + insertados) % 500 == 0:
                    print(f"PROGRESS total={len(rows)} inserted={insertados} stage=migrating")
                continue

            orden_id = inserted_row[0]

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

            if insertados % 500 == 0:
                conn.commit()
                print(f"  Progreso: {insertados} registros insertados...")
                print(f"PROGRESS total={len(rows)} inserted={insertados} stage=migrating")

        except Exception as e:
            cur.execute("ROLLBACK TO SAVEPOINT sp_row")
            errores += 1
            if errores <= 10:
                print(f"  Error en registro {i}: {e}")

    conn.commit()

    print(f"\nResultado:")
    print(f"  Insertados: {insertados}")
    print(f"  Omitidos por duplicados: {omitidos}")
    print(f"  Errores: {errores}")

    # Verificar
    cur.execute("SELECT COUNT(*) FROM financiero.ordenes_pago")
    count = cur.fetchone()[0]
    print(f"  Total en PostgreSQL: {count}")

    cur.execute("SELECT MAX(numero_orden) FROM financiero.ordenes_pago")
    max_orden = cur.fetchone()[0]
    print(f"  Último número de orden: {max_orden}")

    # Sincronizar consecutivo para nuevas órdenes creadas desde la API
    if max_orden:
        cur.execute(
            "UPDATE financiero.configuracion SET valor = %s WHERE clave = 'siguiente_numero_orden'",
            (str(int(max_orden) + 1),)
        )
        conn.commit()
        print(f"  Siguiente número de orden configurado en: {int(max_orden) + 1}")

    cur.execute("SELECT COUNT(*) FROM financiero.beneficiarios")
    ben_count = cur.fetchone()[0]
    print(f"  Beneficiarios: {ben_count}")

    cur.close()
    conn.close()
    print(f"PROGRESS total={len(rows)} inserted={insertados} stage=completed")
    if omitidos > 0:
        print(f"ATENCION: {omitidos} registros ya existian y se omitieron.")
    print("\nMigración completada.")


def parse_args():
    parser = argparse.ArgumentParser(description='Migrar APContabOrdenPago.csv a PostgreSQL')
    parser.add_argument(
        '--csv-path',
        default=os.getenv('ACCESS_CSV_PATH', DEFAULT_CSV_PATH),
        help='Ruta del CSV a migrar (también puede usar ACCESS_CSV_PATH)'
    )
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    migrar(args.csv_path)
