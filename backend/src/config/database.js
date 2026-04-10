const { Pool } = require('pg');
const path = require('path');
const dotenv = require('dotenv');

// Cargar variables desde rutas comunes sin depender del cwd.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
dotenv.config();

const dbPort = Number.parseInt(process.env.DB_PORT || '5432', 10);
const dbPassword = String(process.env.DB_PASSWORD ?? process.env.PGPASSWORD ?? '');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number.isNaN(dbPort) ? 5432 : dbPort,
  database: process.env.DB_NAME || 'financiero_gad_chunchi',
  user: process.env.DB_USER || 'juancuevabermeo',
  password: dbPassword,
});

pool.on('connect', () => {
  console.log('PostgreSQL conectado');
});

pool.on('error', (err) => {
  console.error('Error en pool PostgreSQL:', err.message);
});

module.exports = pool;
