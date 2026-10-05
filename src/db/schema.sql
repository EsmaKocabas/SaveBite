-- ==============================================================================
-- 🌱 GIDA İSRAFI İLE MÜCADELE VE SÜRDÜRÜLEBİLİRLİK SOSYAL SORUMLULUK PROJESİ
-- PostgreSQL Veritabanı Şeması (schema.sql)
-- Birleşmiş Milletler SKA 12.3: Evsel Gıda İsrafını Önleme İlkeleri
-- ==============================================================================

-- 1. Eski Tabloları Temizleme (Opsiyonel / Sıfırdan Kurulum İçin)
DROP TABLE IF EXISTS pantry_items CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Kullanıcılar Tablosu (Kiler Sahipleri)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Gıda Kategorileri Tablosu
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- 4. Kiler Envanteri Tablosu (pantry_items)
-- Gıdaların son tüketim tarihi, kalan gün ve aciliyet risk skorları burada takip edilir.
CREATE TABLE pantry_items (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    ingredient_lookup VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit VARCHAR(50) NOT NULL,
    expiration_date DATE NOT NULL,
    days_remaining INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('RED', 'YELLOW', 'GREEN')),
    priority_score INTEGER NOT NULL, -- Düşük gün sayısı = Yüksek risk ve tüketim önceliği
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Hızlı risk filtrelemeleri ve sorgular için indeksler
CREATE INDEX idx_pantry_status ON pantry_items (status);
CREATE INDEX idx_pantry_priority_score ON pantry_items (priority_score ASC);
CREATE INDEX idx_pantry_expiration_date ON pantry_items (expiration_date ASC);

-- 5. Sıfır Atık Kurtarma Yemek Tarifleri Tablosu (recipes)
-- Kilerde bozulma riski altındaki malzemelerle eşleşen kurtarma tarifleri
CREATE TABLE recipes (
    recipe_id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    prep_time_minutes INTEGER NOT NULL DEFAULT 30,
    matched_ingredients TEXT[] NOT NULL, -- Kurtarılan acil malzemelerin listesi
    instructions JSONB NOT NULL,        -- Pişirme adımları (dizi formatında JSONB)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Malzeme bazlı arama ve indeksleme (GIN Index)
CREATE INDEX idx_recipes_ingredients ON recipes USING GIN (matched_ingredients);
CREATE INDEX idx_recipes_instructions ON recipes USING GIN (instructions);

COMMENT ON TABLE pantry_items IS 'Evsel gıda israfını önlemek amacıyla takip edilen kiler ürünleri ve SKT risk durumu.';
COMMENT ON TABLE recipes IS 'Bozulma riski olan gıdaları kurtarmak için Kaggle Food.com veri setinden filtrelenmiş sıfır atık tarifleri.';
