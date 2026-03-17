const pool = require('./database');

async function runMigration() {
  try {
    await pool.query('BEGIN');

    // Usuarios: quitar email
    await pool.query(`
      ALTER TABLE financiero.usuarios
      DROP COLUMN IF EXISTS email;
    `);

    // Beneficiarios: dejar solo identificacion + nombres/apellidos
    await pool.query(`
      ALTER TABLE financiero.beneficiarios
      DROP COLUMN IF EXISTS tipo_cuenta,
      DROP COLUMN IF EXISTS cuenta_bancaria,
      DROP COLUMN IF EXISTS banco,
      DROP COLUMN IF EXISTS direccion,
      DROP COLUMN IF EXISTS telefono,
      DROP COLUMN IF EXISTS email;
    `);

    await pool.query('COMMIT');
    console.log('Migracion aplicada: columnas no usadas eliminadas.');
    process.exit(0);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('Error aplicando migracion:', err.message);
    process.exit(1);
  }
}

runMigration();
