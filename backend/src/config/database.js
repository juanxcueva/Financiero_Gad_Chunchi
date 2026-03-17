const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'financiero_gad_chunchi',
  user: process.env.DB_USER || 'juancuevabermeo',
  password: process.env.DB_PASSWORD || '',
});

pool.on('connect', () => {
  console.log('PostgreSQL conectado');
});

pool.on('error', (err) => {
  console.error('Error en pool PostgreSQL:', err.message);
});

module.exports = pool;
