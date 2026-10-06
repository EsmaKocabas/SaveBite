const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const { Client } = require('pg');

const pantrySeed = require('../data/pantry_seed.json');
const recipesSeed = require('../data/recipes_seed.json');

const defaultCategories = [
  { name: 'Et, Tavuk & Balık', description: 'Et ve tavuk ürünleri' },
  { name: 'Süt & Süt Ürünleri', description: 'Süt ve süt ürünleri' },
  { name: 'Sebze & Meyve', description: 'Meyve ve sebzeler' },
  { name: 'Kahvaltılık & Şarküteri', description: 'Kahvaltılık ve şarküteri ürünleri' },
  { name: 'Bakliyat & Kuru Gıda', description: 'Bakliyat ve kuru gıda' },
  { name: 'Ekmek & Unlu Mamuller', description: 'Ekmek ve unlu mamuller' },
  { name: 'Sos & Baharat', description: 'Soslar, sıvı yağlar ve baharatlar' },
  { name: 'Kuru Yemiş & Atıştırmalık', description: 'Kuru yemiş ve kuru meyveler' },
  { name: 'Konserve & Hazır Gıda', description: 'Konserve ve hazır gıdalar' },
  { name: 'Temel Gıda', description: 'Mutfak temel gıdaları' }
];

async function migrateToNeon() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("Hata: .env dosyasında DATABASE_URL bulunamadı.");
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Veritabanına bağlanılıyor...");
    await client.connect();
    console.log("Bağlantı sağlandı.");

    // Tabloları ve indeksleri oluştur
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(150) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT
      );

      CREATE TABLE IF NOT EXISTS pantry_items (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        ingredient_lookup VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL,
        quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
        unit VARCHAR(50) NOT NULL,
        expiration_date DATE NOT NULL,
        days_remaining INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('RED', 'YELLOW', 'GREEN')),
        priority_score INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_pantry_status ON pantry_items (status);
      CREATE INDEX IF NOT EXISTS idx_pantry_priority_score ON pantry_items (priority_score ASC);
      CREATE INDEX IF NOT EXISTS idx_pantry_expiration_date ON pantry_items (expiration_date ASC);

      CREATE TABLE IF NOT EXISTS recipes (
        recipe_id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        prep_time_minutes INTEGER NOT NULL DEFAULT 30,
        matched_ingredients TEXT[] NOT NULL,
        instructions JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_recipes_ingredients ON recipes USING GIN (matched_ingredients);
      CREATE INDEX IF NOT EXISTS idx_recipes_instructions ON recipes USING GIN (instructions);
    `);
    console.log("Tablolar ve indeksler doğrulandı.");

    await client.query('BEGIN');

    // Kategorileri ekle
    for (const cat of defaultCategories) {
      await client.query(
        `INSERT INTO categories (name, description) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [cat.name, cat.description]
      );
    }
    console.log(`${defaultCategories.length} kategori kaydedildi.`);

    // Kiler ürünlerini ekle
    for (const item of pantrySeed) {
      await client.query(`
        INSERT INTO pantry_items (
          id, name, ingredient_lookup, category, quantity, unit, 
          expiration_date, days_remaining, status, priority_score
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          ingredient_lookup = EXCLUDED.ingredient_lookup,
          category = EXCLUDED.category,
          quantity = EXCLUDED.quantity,
          unit = EXCLUDED.unit,
          expiration_date = EXCLUDED.expiration_date,
          days_remaining = EXCLUDED.days_remaining,
          status = EXCLUDED.status,
          priority_score = EXCLUDED.priority_score,
          updated_at = CURRENT_TIMESTAMP
      `, [
        item.id,
        item.name,
        item.ingredient_lookup,
        item.category,
        item.quantity,
        item.unit,
        item.expiration_date,
        item.days_remaining,
        item.status,
        item.priority_score
      ]);
    }
    console.log(`${pantrySeed.length} kiler ürünü kaydedildi.`);

    // Kurtarma tariflerini ekle
    for (const r of recipesSeed) {
      await client.query(`
        INSERT INTO recipes (recipe_id, title, prep_time_minutes, matched_ingredients, instructions)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (recipe_id) DO UPDATE SET
          title = EXCLUDED.title,
          prep_time_minutes = EXCLUDED.prep_time_minutes,
          matched_ingredients = EXCLUDED.matched_ingredients,
          instructions = EXCLUDED.instructions
      `, [
        r.recipe_id,
        r.title,
        r.prep_time_minutes,
        r.matched_ingredients,
        JSON.stringify(r.instructions)
      ]);
    }
    console.log(`${recipesSeed.length} kurtarma tarifi kaydedildi.`);

    await client.query('COMMIT');

    const pantryCount = await client.query('SELECT COUNT(*) FROM pantry_items;');
    const recipeCount = await client.query('SELECT COUNT(*) FROM recipes;');
    const categoryCount = await client.query('SELECT COUNT(*) FROM categories;');

    console.log("\nAktarım tamamlandı:");
    console.log(`- Kategori sayısı: ${categoryCount.rows[0].count}`);
    console.log(`- Kiler ürünü sayısı: ${pantryCount.rows[0].count}`);
    console.log(`- Tarif sayısı: ${recipeCount.rows[0].count}\n`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error("Aktarım hatası:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrateToNeon();
