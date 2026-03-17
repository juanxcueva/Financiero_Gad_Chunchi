require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Servir logo como estático
app.use('/static', express.static(path.join(__dirname, '..', '..')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ordenes-pago', require('./routes/ordenes-pago'));
app.use('/api/beneficiarios', require('./routes/beneficiarios'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/auditoria', require('./routes/auditoria'));
app.use('/api/documentos', require('./routes/documentos'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Servir frontend en producción
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Ruta no encontrada' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🏛️  Sistema Financiero GAD Chunchi`);
  console.log(`   Servidor: http://localhost:${PORT}`);
  console.log(`   API:      http://localhost:${PORT}/api/health\n`);
});
