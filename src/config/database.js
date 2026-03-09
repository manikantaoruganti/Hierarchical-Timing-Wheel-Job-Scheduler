const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function connectDb() {
  try {
    await pool.query('SELECT 1'); // Simple query to check connection
    logger.info('PostgreSQL connected.');
  } catch (error) {
    logger.error('Error connecting to PostgreSQL:', error);
    throw error;
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  connectDb,
  pool, // Export pool for direct access if needed (e.g., for transactions)
};
