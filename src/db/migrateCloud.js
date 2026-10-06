const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const { Client } = require('pg');

// Kaggle veri setinden üretilen 100+ kiler ve 100 gerçek tarif verisi
const pantrySeed = require('../data/pantry_seed.json');
const recipesSeed = require('../data/recipes_seed.json');

const defaultCategories = [
  { name: 'Et, Tavuk & Balık', description: 'Çabuk bozulabilen yüksek proteinli et ve tavuk ürünleri' },
  { name: 'Süt & Süt Ürünleri', description: 'Kısa raf ömrüne sahip pastörize ve fermente süt ürünleri' },
  { name: 'Sebze & Meyve', description: 'Taze tüketilmesi gereken vitamin ve mineral kaynağı bahçe ürünleri' },
  { name: 'Kahvaltılık & Şarküteri', description: 'Yumurta, peynir ve şarküteri grubu ürünleri' },
  { name: 'Bakliyat & Kuru Gıda', description: 'Uzun raf ömürlü temel kiler erzağı' },
  { name: 'Ekmek & Unlu Mamuller', description: 'Ekmek, un, yufka ve lavaş çeşitleri' },
  { name: 'Sos & Baharat', description: 'Yemek yapımında kullanılan soslar, sıvı yağlar ve baharatlar' },
  { name: 'Kuru Yemiş & Atıştırmalık', description: 'Ceviz, badem, fındık ve kurutulmuş meyveler' },
  { name: 'Konserve & Hazır Gıda', description: 'Konserve bakliyat, ton balığı ve hazır gıdalar' },
  { name: 'Temel Gıda', description: 'Un, şeker ve mutfak temel ihtiyaçları' }
];

async function migrateToNeon() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("❌ Hata: .env dosyasında DATABASE_URL bulunamadı!");
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("☁️ Neon.tech Cloud PostgreSQL sunucusuna bağlanılıyor...");
    await client.connect();
    console.log("✅ Bulut bağlantısı kuruldu!\n");

    // 1. Tabloları Otomatik Oluştur
    console.log("🛠️ 1/4 - Veritabanı tabloları ve indeksleri otomatik oluşturuluyor...");
    
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
    console.log("   ✅ Tablolar ve indeksler hazır.");

    // Transaction başlatıyoruz
    await client.query('BEGIN');

    // 2. Kategorileri Otomatik Yükle
    console.log("🌱 2/4 - Temel gıda kategorileri yükleniyor...");
    for (const cat of defaultCategories) {
      await client.query(
        `INSERT INTO categories (name, description) 
         VALUES ($1, $2) 
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [cat.name, cat.description]
      );
    }
    console.log(`   ✅ ${defaultCategories.length} kategori hazır.`);

    // 3. Kiler Ürünlerini JSON'dan Neon'a Aktar
    console.log(`📦 3/4 - ${pantrySeed.length} Adet kiler verisi Kaggle JSON'dan buluta aktarılıyor...`);
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
    console.log(`   ✅ ${pantrySeed.length} kiler ürünü Neon'a aktarıldı.`);

    // 4. Kurtarma Tariflerini JSON'dan Neon'a Aktar
    console.log(`🍳 4/4 - ${recipesSeed.length} Adet gerçek Kaggle kurtarma tarifi buluta aktarılıyor...`);
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
    console.log(`   ✅ ${recipesSeed.length} kurtarma tarifi Neon'a aktarıldı.`);

    await client.query('COMMIT');

    // 5. Doğrulama ve İstatistik
    const pantryCount = await client.query('SELECT COUNT(*) FROM pantry_items;');
    const recipeCount = await client.query('SELECT COUNT(*) FROM recipes;');
    const categoryCount = await client.query('SELECT COUNT(*) FROM categories;');
    const redCount = await client.query("SELECT COUNT(*) FROM pantry_items WHERE status = 'RED';");
    const yellowCount = await client.query("SELECT COUNT(*) FROM pantry_items WHERE status = 'YELLOW';");
    const greenCount = await client.query("SELECT COUNT(*) FROM pantry_items WHERE status = 'GREEN';");

    console.log("\n========================================================");
    console.log("🚀 BULUT VERİTABANI BAŞARIYLA GÜNCELLENDİ (100x100 VERİ)!");
    console.log(`🏷️ Toplam Kategori      : ${categoryCount.rows[0].count}`);
    console.log(`📦 Toplam Kiler Ürünü   : ${pantryCount.rows[0].count}`);
    console.log(`   🔴 Acil Tüketim (RED): ${redCount.rows[0].count}`);
    console.log(`   🟡 Riskli (YELLOW)   : ${yellowCount.rows[0].count}`);
    console.log(`   🟢 Güvenli (GREEN)   : ${greenCount.rows[0].count}`);
    console.log(`🍳 Kurtarma Tarifleri   : ${recipeCount.rows[0].count}`);
    console.log("========================================================\n");

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error("❌ Aktarım sırasında hata oluştu:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrateToNeon();
