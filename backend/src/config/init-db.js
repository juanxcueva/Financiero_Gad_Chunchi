/**
 * Inicializar base de datos: crear usuario admin por defecto
 */
const pool = require('./database');
const bcrypt = require('bcryptjs');

async function initDB() {
  try {
    // Verificar si ya existe un usuario admin
    const check = await pool.query(
      "SELECT id FROM financiero.usuarios WHERE username = 'admin'"
    );

    if (check.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO financiero.usuarios (username, password_hash, nombre_completo, rol)
         VALUES ('admin', $1, 'Administrador del Sistema', 'admin')`,
        [hash]
      );
      console.log('Usuario admin creado (password: admin123 - CAMBIAR EN PRODUCCIÓN)');
    } else {
      console.log('Usuario admin ya existe');
    }

    // Crear usuario financiero de ejemplo
    const checkFin = await pool.query(
      "SELECT id FROM financiero.usuarios WHERE username = 'financiero'"
    );
    if (checkFin.rows.length === 0) {
      const hash = await bcrypt.hash('financiero123', 10);
      await pool.query(
        `INSERT INTO financiero.usuarios (username, password_hash, nombre_completo, rol)
         VALUES ('financiero', $1, 'Usuario Financiero', 'financiero')`,
        [hash]
      );
      console.log('Usuario financiero creado (password: financiero123)');
    }

    console.log('Base de datos inicializada correctamente.');
    process.exit(0);
  } catch (err) {
    console.error('Error inicializando DB:', err.message);
    process.exit(1);
  }
}

initDB();
