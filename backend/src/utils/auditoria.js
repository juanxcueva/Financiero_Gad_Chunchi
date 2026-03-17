const pool = require('../config/database');

async function registrarAuditoria({ tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id, usuario_nombre, ip_address }) {
  try {
    await pool.query(
      `INSERT INTO financiero.auditoria (tabla, registro_id, accion, datos_anteriores, datos_nuevos, usuario_id, usuario_nombre, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tabla,
        registro_id,
        accion,
        datos_anteriores ? JSON.stringify(datos_anteriores) : null,
        datos_nuevos ? JSON.stringify(datos_nuevos) : null,
        usuario_id,
        usuario_nombre,
        ip_address,
      ]
    );
  } catch (err) {
    console.error('Error registrando auditoría:', err.message);
  }
}

module.exports = { registrarAuditoria };
