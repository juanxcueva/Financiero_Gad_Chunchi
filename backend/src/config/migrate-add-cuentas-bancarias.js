const { execSync } = require('child_process');
const fs = require('fs');
const pool = require('./database');

const DEFAULT_MDB_FILE = '/home/juan/Documents/Access/Sofacd1.mdb';

const fallbackBancos = [
  { codigo_banco: '1110302', cuenta_bancaria: '79220009', descripcion_banco: 'Banco C. el Ecuador Matriz Quito  79220099 PRAGUAS', descripcion_cuenta: 'TRANSFERENCIAS GENERALES', siguiente_numero_cheque: 24801 },
  { codigo_banco: '1110303', cuenta_bancaria: '79220009', descripcion_banco: 'Banco C. el Ecuador Matriz Quito  79220009', descripcion_cuenta: 'CHEQUES UNICEF', siguiente_numero_cheque: 26643 },
  { codigo_banco: '1110304', cuenta_bancaria: '79220009', descripcion_banco: 'Banco C. el Ecuador BDE CREDITO CN  79220398', descripcion_cuenta: 'TRANSFERENCIA MATERNIDAD GRATUITA', siguiente_numero_cheque: 25112 },
  { codigo_banco: '1110305', cuenta_bancaria: '79220401', descripcion_banco: 'BCE . DONACIONES/DN  79220401', descripcion_cuenta: 'CONVENIO 65393 BD - GAD CHUNCHI', siguiente_numero_cheque: 7 },
  { codigo_banco: '1110309', cuenta_bancaria: '79220337', descripcion_banco: 'GAD MUN-CANT CHUNCHI-06D01-DIREC-DISTRITAL MIES 79220337', descripcion_cuenta: 'GAD MUN-CHUNCHI-DIRECCION DISTRITAL MIES DN', siguiente_numero_cheque: 24805 },
  { codigo_banco: '1110310', cuenta_bancaria: '79220401', descripcion_banco: 'Convenio 65393 Banco de Desarrollo', descripcion_cuenta: 'CONVENIO 65393 BD - GAD CHUNCHI', siguiente_numero_cheque: 3 },
  { codigo_banco: '1110311', cuenta_bancaria: '79220398', descripcion_banco: 'Convenio 65386 Banco de Desarrollo', descripcion_cuenta: 'CONVENIO 65386 BD - GAD CHUNCHI', siguiente_numero_cheque: 3 },
];

const fallbackCuentasBC = [
  { cuenta_bancaria: '41007717', descripcion_cuenta: 'CHEQUES UNICEF', siguiente_numero_transfer: 296 },
  { cuenta_bancaria: '79220009', descripcion_cuenta: 'TRANSFERENCIAS GENERALES', siguiente_numero_transfer: 26289 },
  { cuenta_bancaria: '79220061', descripcion_cuenta: 'TRANSFERENCIA MATERNIDAD GRATUITA', siguiente_numero_transfer: 3 },
  { cuenta_bancaria: '79220074', descripcion_cuenta: 'TRANSFERENCIAS 65% imp renta', siguiente_numero_transfer: 172 },
  { cuenta_bancaria: '79220075', descripcion_cuenta: 'TRANSFERENCIAS 35%', siguiente_numero_transfer: 151 },
  { cuenta_bancaria: '79220196', descripcion_cuenta: 'CHUNCHI- INFA', siguiente_numero_transfer: 217 },
  { cuenta_bancaria: '79220223', descripcion_cuenta: 'CHUNCHI INFA PE', siguiente_numero_transfer: 88 },
  { cuenta_bancaria: '79220337', descripcion_cuenta: 'GAD MUN-CHUNCHI-DIRECCION DISTRITAL MIES DN', siguiente_numero_transfer: 440 },
  { cuenta_bancaria: '79220389', descripcion_cuenta: 'GADCHUNCHI BDE CREDITO CN', siguiente_numero_transfer: 1 },
  { cuenta_bancaria: '79220398', descripcion_cuenta: 'CONVENIO 65386 BD - GAD CHUNCHI', siguiente_numero_transfer: 8 },
  { cuenta_bancaria: '79220401', descripcion_cuenta: 'CONVENIO 65393 BD - GAD CHUNCHI', siguiente_numero_transfer: 6 },
];

function norm(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim().replace(/^"|"$/g, '');
}

function toInt(value, fallback = 0) {
  const n = parseInt(String(value || '').replace(/[^0-9-]/g, ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseTsv(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  const headers = lines[0].split('\t').map((h) => norm(h));
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = norm(cols[i] || '');
    });
    rows.push(row);
  }
  return rows;
}

function exportTable(mdbFile, tableName) {
  const cmd = `mdb-export -d '\t' "${mdbFile}" "${tableName}"`;
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 80 });
}

function buildFromMdb(mdbFile) {
  const cuentasRows = parseTsv(exportTable(mdbFile, 'APContabSPICuentasBC'));
  const ordenRows = parseTsv(exportTable(mdbFile, 'APContabOrdenPago'));
  const planRows = parseTsv(exportTable(mdbFile, 'APContabPlan'));

  const cuentaCatalog = new Map();
  for (const r of cuentasRows) {
    const cuenta = norm(r.CUENTA);
    if (!cuenta) {
      continue;
    }
    cuentaCatalog.set(cuenta, {
      cuenta_bancaria: cuenta,
      descripcion_cuenta: norm(r.DETALLECUENTABC) || cuenta,
      siguiente_numero_transfer: Math.max(1, toInt(r.NUMTRANSFER, 1)),
    });
  }

  const planByCodigo = new Map();
  for (const r of planRows) {
    const codigo = norm(r.CodigoCuenta);
    if (!codigo) {
      continue;
    }
    planByCodigo.set(codigo, norm(r.DetalleCuenta));
  }

  const numericPairs = new Map();
  const cuentasPorCodigo = new Map();
  const maxChequeByCode = new Map();

  for (const r of ordenRows) {
    const cuenta = norm(r.CuentaBC);
    const codigo = norm(r.CodigoBanco);
    const cheque = norm(r.ChequeNum);

    if (!/^\d+$/.test(codigo)) {
      continue;
    }

    if (cuenta) {
      const pairKey = `${codigo}::${cuenta}`;
      cuentasPorCodigo.set(pairKey, (cuentasPorCodigo.get(pairKey) || 0) + 1);
    }

    if (/^\d+$/.test(cuenta)) {
      const pairKey = `${codigo}::${cuenta}`;
      numericPairs.set(pairKey, (numericPairs.get(pairKey) || 0) + 1);
    }

    const chequeNum = toInt(cheque, 0);
    if (chequeNum > 0) {
      maxChequeByCode.set(codigo, Math.max(maxChequeByCode.get(codigo) || 0, chequeNum));
    }
  }

  const fallbackByCode = new Map(fallbackBancos.map((b) => [b.codigo_banco, b]));
  const codigos = [...new Set([
    ...[...maxChequeByCode.keys()],
    ...[...cuentasPorCodigo.keys()].map((k) => k.split('::')[0]),
  ])].sort();
  const bancos = [];

  for (const codigo of codigos) {
    const cuentasNumericas = [...numericPairs.entries()]
      .filter(([k]) => k.startsWith(`${codigo}::`))
      .map(([k, count]) => ({ cuenta: k.split('::')[1], count }))
      .sort((a, b) => b.count - a.count);

    const cuentasGenerales = [...cuentasPorCodigo.entries()]
      .filter(([k]) => k.startsWith(`${codigo}::`))
      .map(([k, count]) => ({ cuenta: k.split('::')[1], count }))
      .sort((a, b) => b.count - a.count);

    let cuenta = cuentasNumericas[0]?.cuenta || '';
    if (!cuenta) {
      const catalogHit = cuentasGenerales.find((entry) => cuentaCatalog.has(entry.cuenta));
      cuenta = catalogHit?.cuenta || cuentasGenerales[0]?.cuenta || fallbackByCode.get(codigo)?.cuenta_bancaria || '';
    }

    const fallbackBanco = fallbackByCode.get(codigo);
    const descripcionCuenta = cuentaCatalog.get(cuenta)?.descripcion_cuenta || fallbackBanco?.descripcion_cuenta || cuenta;
    const descripcionBanco = planByCodigo.get(codigo) || fallbackBanco?.descripcion_banco || `Codigo banco ${codigo}`;

    bancos.push({
      codigo_banco: codigo,
      cuenta_bancaria: cuenta,
      descripcion_cuenta: descripcionCuenta,
      descripcion_banco: descripcionBanco,
      siguiente_numero_cheque: (maxChequeByCode.get(codigo) || 0) + 1,
    });
  }

  return {
    bancos,
    cuentasBC: [...cuentaCatalog.values()].sort((a, b) => a.cuenta_bancaria.localeCompare(b.cuenta_bancaria)),
  };
}

async function upsertCatalogs({ bancos, cuentasBC }) {
  await pool.query('BEGIN');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS financiero.cuentas_bancarias (
      id SERIAL PRIMARY KEY,
      codigo_banco VARCHAR(20) UNIQUE NOT NULL,
      nombre_banco VARCHAR(200) NOT NULL,
      cuenta_bancaria VARCHAR(50) NOT NULL,
      descripcion_cuenta VARCHAR(200),
      descripcion_banco VARCHAR(300),
      siguiente_numero_cheque INTEGER DEFAULT 1,
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS financiero.cuentas_bc_catalogo (
      id SERIAL PRIMARY KEY,
      cuenta_bancaria VARCHAR(50) UNIQUE NOT NULL,
      descripcion_cuenta VARCHAR(200),
      siguiente_numero_transfer INTEGER DEFAULT 1,
      activo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE financiero.cuentas_bancarias
    ADD COLUMN IF NOT EXISTS descripcion_cuenta VARCHAR(200),
    ADD COLUMN IF NOT EXISTS descripcion_banco VARCHAR(300);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cuentas_codigo
    ON financiero.cuentas_bancarias(codigo_banco);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cuentas_bc_catalogo_cuenta
    ON financiero.cuentas_bc_catalogo(cuenta_bancaria);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS financiero.auditoria_cheques (
      id SERIAL PRIMARY KEY,
      orden_pago_id INTEGER REFERENCES financiero.ordenes_pago(id) ON DELETE SET NULL,
      accion VARCHAR(30) NOT NULL CHECK (accion IN ('MANUAL_OVERRIDE_CREAR', 'MANUAL_OVERRIDE_EDITAR')),
      codigo_banco VARCHAR(20),
      cheque_anterior VARCHAR(20),
      cheque_nuevo VARCHAR(20),
      motivo VARCHAR(300),
      usuario_id INTEGER REFERENCES financiero.usuarios(id),
      usuario_nombre VARCHAR(200),
      ip_address VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_auditoria_cheques_fecha
    ON financiero.auditoria_cheques(created_at);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_auditoria_cheques_orden
    ON financiero.auditoria_cheques(orden_pago_id);
  `);

  if (bancos.length > 0) {
    await pool.query('UPDATE financiero.cuentas_bancarias SET activo = false');
  }
  for (const banco of bancos) {
    await pool.query(
      `INSERT INTO financiero.cuentas_bancarias (
         codigo_banco, nombre_banco, cuenta_bancaria, descripcion_cuenta, descripcion_banco, siguiente_numero_cheque, activo
       ) VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (codigo_banco) DO UPDATE SET
         nombre_banco = EXCLUDED.nombre_banco,
         cuenta_bancaria = EXCLUDED.cuenta_bancaria,
         descripcion_cuenta = EXCLUDED.descripcion_cuenta,
         descripcion_banco = EXCLUDED.descripcion_banco,
         siguiente_numero_cheque = GREATEST(financiero.cuentas_bancarias.siguiente_numero_cheque, EXCLUDED.siguiente_numero_cheque),
         activo = true,
         updated_at = NOW()`,
      [
        banco.codigo_banco,
        banco.descripcion_banco,
        banco.cuenta_bancaria,
        banco.descripcion_cuenta,
        banco.descripcion_banco,
        banco.siguiente_numero_cheque,
      ]
    );
  }

  if (cuentasBC.length > 0) {
    await pool.query('UPDATE financiero.cuentas_bc_catalogo SET activo = false');
  }
  for (const cuenta of cuentasBC) {
    await pool.query(
      `INSERT INTO financiero.cuentas_bc_catalogo (
         cuenta_bancaria, descripcion_cuenta, siguiente_numero_transfer, activo
       ) VALUES ($1, $2, $3, true)
       ON CONFLICT (cuenta_bancaria) DO UPDATE SET
         descripcion_cuenta = EXCLUDED.descripcion_cuenta,
         siguiente_numero_transfer = GREATEST(financiero.cuentas_bc_catalogo.siguiente_numero_transfer, EXCLUDED.siguiente_numero_transfer),
         activo = true,
         updated_at = NOW()`,
      [cuenta.cuenta_bancaria, cuenta.descripcion_cuenta, cuenta.siguiente_numero_transfer]
    );
  }

  // Sincronizar secuenciales con historial real para evitar conflictos por desfase.
  await pool.query(`
    UPDATE financiero.cuentas_bc_catalogo cbc
    SET siguiente_numero_transfer = GREATEST(
      COALESCE(cbc.siguiente_numero_transfer, 1),
      COALESCE(mx.max_cheque + 1, 1)
    )
    FROM (
      SELECT
        cuenta_banco_central,
        MAX(CAST(cheque_numero AS BIGINT)) AS max_cheque
      FROM financiero.ordenes_pago
      WHERE cheque_numero ~ '^[0-9]+$'
      GROUP BY cuenta_banco_central
    ) mx
    WHERE mx.cuenta_banco_central = cbc.cuenta_bancaria
  `);

  // Mantener tambien el secuencial global en coherencia con el mayor cheque numerico historico.
  await pool.query(`
    UPDATE financiero.configuracion cfg
    SET valor = GREATEST(
      COALESCE(NULLIF(cfg.valor, '')::BIGINT, 1),
      COALESCE((
        SELECT MAX(CAST(cheque_numero AS BIGINT)) + 1
        FROM financiero.ordenes_pago
        WHERE cheque_numero ~ '^[0-9]+$'
      ), 1)
    )::TEXT,
    updated_at = NOW()
    WHERE cfg.clave = 'siguiente_numero_cheque'
  `);

  await pool.query('COMMIT');
}

async function runMigration() {
  const mdbFile = process.env.MDB_FILE || DEFAULT_MDB_FILE;
  let catalogs = { bancos: fallbackBancos, cuentasBC: fallbackCuentasBC };

  try {
    if (fs.existsSync(mdbFile)) {
      catalogs = buildFromMdb(mdbFile);
      console.log(`Catalogos cargados desde MDB: ${mdbFile}`);
    } else {
      console.warn(`MDB no encontrado en ${mdbFile}. Se usara catalogo fallback.`);
    }

    await upsertCatalogs(catalogs);
    console.log(`Migracion aplicada: ${catalogs.bancos.length} codigos de banco y ${catalogs.cuentasBC.length} cuentas BC.`);
    process.exit(0);
  } catch (err) {
    try {
      await pool.query('ROLLBACK');
    } catch (_) {
      // ignore
    }
    console.error('Error aplicando migracion:', err.message);
    process.exit(1);
  }
}

runMigration();
