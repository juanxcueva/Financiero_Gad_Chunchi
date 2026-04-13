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

async function registrarAuditoriaCheque({ orden_pago_id, accion, codigo_banco, cheque_anterior, cheque_nuevo, motivo, usuario_id, usuario_nombre, ip_address }) {
  try {
    await pool.query(
      `INSERT INTO financiero.auditoria_cheques
       (orden_pago_id, accion, codigo_banco, cheque_anterior, cheque_nuevo, motivo, usuario_id, usuario_nombre, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        orden_pago_id || null,
        accion,
        codigo_banco || null,
        cheque_anterior || null,
        cheque_nuevo || null,
        motivo || null,
        usuario_id,
        usuario_nombre,
        ip_address,
      ]
    );
  } catch (err) {
    console.error('Error registrando auditoria de cheque:', err.message);
  }
}

module.exports = { registrarAuditoria, registrarAuditoriaCheque };
