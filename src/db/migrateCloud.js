const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const { Client } = require('pg');

async function migrateToNeon() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('Hata: .env dosyasında DATABASE_URL bulunamadı.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Veritabanına bağlanılıyor...');
    await client.connect();
    console.log('Bağlantı sağlandı.');

    // 1. Şemayı Yükle
    console.log('Tablolar ve indeksler oluşturuluyor (schema.sql)...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await client.query(schemaSql);
    console.log('Tablolar ve indeksler hazır.');

    // 2. Tohum Verileri Yükle
    console.log('Tohum verileri yükleniyor (seed.sql)...');
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
    await client.query(seedSql);
    console.log('Tohum verileri hazır.');

    // 3. Doğrulama ve Raporlama
    const catCount = await client.query('SELECT COUNT(*) FROM categories;');
    const pantryCount = await client.query('SELECT COUNT(*) FROM pantry_items;');
    const recipeCount = await client.query('SELECT COUNT(*) FROM recipes;');
    const ingCount = await client.query('SELECT COUNT(*) FROM recipe_ingredients;');

    console.log('\nAktarım tamamlandı:');
    console.log('- Kategori sayısı: ' + catCount.rows[0].count);
    console.log('- Kiler ürünü sayısı: ' + pantryCount.rows[0].count);
    console.log('- Tarif sayısı: ' + recipeCount.rows[0].count);
    console.log('- Tarif malzemesi sayısı: ' + ingCount.rows[0].count + '\n');

  } catch (err) {
    console.error('Aktarım hatası:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrateToNeon();
