const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('connect', () => {
  // Veritabanı havuzu bağlantı logu
});

pool.on('error', (err) => {
  console.error('Beklenmeyen veritabanı havuz hatası:', err.message);
});

/**
 * users ve pantry_items tablolarında eksik olabilecek kolonları güvenle tamamlar
 */
async function initDbExtensions() {
  try {
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR(255);
      ALTER TABLE pantry_items ADD COLUMN IF NOT EXISTS user_id INTEGER;
    `);
  } catch (err) {
    console.warn('Veritabanı kolon kontrolü uyarısı:', err.message);
  }
}

// Sunucu ayağa kalktığında şema uyumluluğunu kontrol et
initDbExtensions();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};

