const pool = require('./database');

async function runMigration() {
  try {
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
      ALTER TABLE financiero.cuentas_bancarias
      ADD COLUMN IF NOT EXISTS descripcion_cuenta VARCHAR(200),
      ADD COLUMN IF NOT EXISTS descripcion_banco VARCHAR(300);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cuentas_codigo
      ON financiero.cuentas_bancarias(codigo_banco);
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

    await pool.query(`
      INSERT INTO financiero.cuentas_bancarias (
        codigo_banco, nombre_banco, cuenta_bancaria, descripcion_cuenta, descripcion_banco, siguiente_numero_cheque
      )
      VALUES
        ('1110303', 'Banco C. el Ecuador Matriz Quito', '79220009', 'CHEQUES UNICEF', 'Banco C. el Ecuador Matriz Quito Cta. Cte 79220099 PRAGUAS', 26643),
        ('1110302', 'Banco C. el Ecuador Matriz Quito', '79220009', 'TRANSFERENCIAS GENERALES', 'Banco C. el Ecuador Matriz Quito 79220099 PRAGUAS', 24801),
        ('1110309', 'Banco C. el Ecuador Matriz Quito', '79220337', 'CONVENIO 65393 BANCO DE DESARROLLO', 'Convenio 65393 Banco de Desarrollo', 24805),
        ('1110304', 'Banco C. el Ecuador BDE Credito CN', '79220009', 'TRANSFERENCIA MATERNIDAD GRATUITA', 'Banco C. el Ecuador BDE CREDITO CN 79220398', 25112),
        ('1110305', 'BCE Donaciones', '79220401', 'DONACIONES D/N', 'BCE - DONACIONES/DN 79220401', 7),
        ('1110310', 'Bco. Pichincha', '79220401', 'CHUNCHI INFA PE', 'Cta. 01523914-8 Bco. Pichincha Suc. Riobamba', 3),
        ('1110311', 'Banco Bolivariano', '79220398', 'GAD MUN-CANT CHUNCHI', 'GADCHUNCHI BDE CREDITO CN', 3)
      ON CONFLICT (codigo_banco) DO UPDATE SET
        nombre_banco = EXCLUDED.nombre_banco,
        cuenta_bancaria = EXCLUDED.cuenta_bancaria,
        descripcion_cuenta = EXCLUDED.descripcion_cuenta,
        descripcion_banco = EXCLUDED.descripcion_banco,
        siguiente_numero_cheque = GREATEST(
          financiero.cuentas_bancarias.siguiente_numero_cheque,
          EXCLUDED.siguiente_numero_cheque
        ),
        activo = true,
        updated_at = NOW();
    `);

    await pool.query('COMMIT');
    console.log('Migracion aplicada: cuentas_bancarias creadas/actualizadas.');
    process.exit(0);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error aplicando migracion:', err.message);
    process.exit(1);
  }
}

runMigration();
