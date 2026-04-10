const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { validateBody } = require('../utils/validators');
const { loginSchema, crearUsuarioSchema, editarUsuarioSchema, cambiarPasswordSchema } = require('../utils/validators');
const { asyncHandler } = require('../middleware/common');

// POST /api/auth/login
router.post('/login', validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  const result = await pool.query(
    'SELECT * FROM financiero.usuarios WHERE username = $1 AND activo = true',
    [username]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
  }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Credenciales inválidas' });
  }

  // Actualizar último login
  await pool.query(
    'UPDATE financiero.usuarios SET ultimo_login = NOW() WHERE id = $1',
    [user.id]
  );

  const token = jwt.sign(
    { id: user.id, username: user.username, nombre: user.nombre_completo, rol: user.rol },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre_completo,
        rol: user.rol,
      },
    },
  });
}));

// GET /api/auth/verify
router.get('/verify', authMiddleware, asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user });
}));

// POST /api/auth/cambiar-password
router.post('/cambiar-password', authMiddleware, validateBody(cambiarPasswordSchema), asyncHandler(async (req, res) => {
  const { password_actual, password_nueva } = req.body;

  const result = await pool.query('SELECT password_hash FROM financiero.usuarios WHERE id = $1', [req.user.id]);
  const valid = await bcrypt.compare(password_actual, result.rows[0].password_hash);
  if (!valid) {
    return res.status(400).json({ success: false, error: 'Contraseña actual incorrecta' });
  }

  const hash = await bcrypt.hash(password_nueva, 10);
  await pool.query('UPDATE financiero.usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

  res.json({ success: true, message: 'Contraseña actualizada' });
}));

// GET /api/auth/usuarios - listar usuarios (solo admin)
router.get('/usuarios', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, username, nombre_completo, rol, activo, ultimo_login, created_at FROM financiero.usuarios ORDER BY id'
  );
  res.json({ success: true, data: result.rows });
}));

// POST /api/auth/usuarios - crear usuario (solo admin)
router.post('/usuarios', authMiddleware, roleMiddleware('admin'), validateBody(crearUsuarioSchema), asyncHandler(async (req, res) => {
  const { username, password, nombre_completo, rol } = req.body;

  const hash = await bcrypt.hash(password, 10);
  const result = await pool.query(
    `INSERT INTO financiero.usuarios (username, password_hash, nombre_completo, rol)
     VALUES ($1, $2, $3, $4) RETURNING id, username, nombre_completo, rol`,
    [username, hash, nombre_completo, rol]
  );

  res.status(201).json({ success: true, data: result.rows[0] });
}));

// PUT /api/auth/usuarios/:id - editar usuario (solo admin)
router.put('/usuarios/:id', authMiddleware, roleMiddleware('admin'), validateBody(editarUsuarioSchema), asyncHandler(async (req, res) => {
  const { username, nombre_completo, rol, activo, password } = req.body;

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const result = await pool.query(
    `UPDATE financiero.usuarios
     SET username = COALESCE($1, username),
         nombre_completo = COALESCE($2, nombre_completo),
         rol = COALESCE($3, rol),
         activo = COALESCE($4, activo),
         password_hash = COALESCE($5, password_hash),
         updated_at = NOW()
     WHERE id = $6
     RETURNING id, username, nombre_completo, rol, activo, ultimo_login, created_at`,
    [username, nombre_completo, rol, activo, passwordHash, req.params.id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
  }

  res.json({ success: true, data: result.rows[0], message: 'Usuario actualizado' });
}));

// DELETE /api/auth/usuarios/:id - eliminar usuario (lógico o definitivo, solo admin)
router.delete('/usuarios/:id', authMiddleware, roleMiddleware('admin'), asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ success: false, error: 'ID inválido' });
  }

  if (req.user.id === userId) {
    return res.status(400).json({ success: false, error: 'No puede eliminar su propio usuario' });
  }

  const hardDelete = String(req.query.hard || '').toLowerCase() === 'true';

  let result;
  if (hardDelete) {
    try {
      result = await pool.query(
        'DELETE FROM financiero.usuarios WHERE id = $1 RETURNING id',
        [userId]
      );
    } catch (err) {
      if (err.code === '23503') {
        return res.status(400).json({
          success: false,
          error: 'No se puede eliminar definitivamente: el usuario tiene registros históricos relacionados. Use desactivar.',
        });
      }
      throw err;
    }
  } else {
    result = await pool.query(
      `UPDATE financiero.usuarios
       SET activo = false, updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [userId]
    );
  }

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
  }

  res.json({
    success: true,
    message: hardDelete ? 'Usuario eliminado definitivamente' : 'Usuario desactivado',
  });
}));

module.exports = router;
