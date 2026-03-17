const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Usuario y contraseña requeridos' });
    }

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
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// GET /api/auth/verify
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

// POST /api/auth/cambiar-password
router.post('/cambiar-password', authMiddleware, async (req, res) => {
  try {
    const { password_actual, password_nueva } = req.body;
    if (!password_actual || !password_nueva) {
      return res.status(400).json({ success: false, error: 'Contraseñas requeridas' });
    }

    const result = await pool.query('SELECT password_hash FROM financiero.usuarios WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(password_actual, result.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, error: 'Contraseña actual incorrecta' });
    }

    const hash = await bcrypt.hash(password_nueva, 10);
    await pool.query('UPDATE financiero.usuarios SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Error cambiando password:', err);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// GET /api/auth/usuarios - listar usuarios (solo admin)
router.get('/usuarios', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, nombre_completo, rol, activo, ultimo_login, created_at FROM financiero.usuarios ORDER BY id'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// POST /api/auth/usuarios - crear usuario (solo admin)
router.post('/usuarios', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { username, password, nombre_completo, rol } = req.body;
    if (!username || !password || !nombre_completo || !rol) {
      return res.status(400).json({ success: false, error: 'Campos requeridos: username, password, nombre_completo, rol' });
    }

    const validRoles = ['admin', 'financiero', 'auditor'];
    if (!validRoles.includes(rol)) {
      return res.status(400).json({ success: false, error: 'Rol inválido' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO financiero.usuarios (username, password_hash, nombre_completo, rol)
       VALUES ($1, $2, $3, $4) RETURNING id, username, nombre_completo, rol`,
      [username, hash, nombre_completo, rol]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'El username ya existe' });
    }
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// PUT /api/auth/usuarios/:id - editar usuario (solo admin)
router.put('/usuarios/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const { username, nombre_completo, rol, activo, password } = req.body;

    if (rol) {
      const validRoles = ['admin', 'financiero', 'auditor'];
      if (!validRoles.includes(rol)) {
        return res.status(400).json({ success: false, error: 'Rol inválido' });
      }
    }

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
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'El username ya existe' });
    }
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// DELETE /api/auth/usuarios/:id - eliminar usuario (lógico, solo admin)
router.delete('/usuarios/:id', authMiddleware, roleMiddleware('admin'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    if (req.user.id === userId) {
      return res.status(400).json({ success: false, error: 'No puede eliminar su propio usuario' });
    }

    const result = await pool.query(
      `UPDATE financiero.usuarios
       SET activo = false, updated_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
    }

    res.json({ success: true, message: 'Usuario desactivado' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

module.exports = router;
