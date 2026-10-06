-- SaveBite PostgreSQL Semasi (schema.sql)

DROP TABLE IF EXISTS recipe_ingredients CASCADE;
DROP TABLE IF EXISTS recipes CASCADE;
DROP TABLE IF EXISTS pantry_items CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

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
    priority_score INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pantry_status ON pantry_items (status);
CREATE INDEX idx_pantry_priority_score ON pantry_items (priority_score ASC);
CREATE INDEX idx_pantry_expiration_date ON pantry_items (expiration_date ASC);

CREATE TABLE recipes (
    recipe_id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    prep_time_minutes INTEGER NOT NULL DEFAULT 30,
    matched_ingredients TEXT[] NOT NULL,
    instructions JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipes_ingredients ON recipes USING GIN (matched_ingredients);
CREATE INDEX idx_recipes_instructions ON recipes USING GIN (instructions);

CREATE TABLE recipe_ingredients (
    id SERIAL PRIMARY KEY,
    recipe_id VARCHAR(50) NOT NULL REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    ingredient_name VARCHAR(150) NOT NULL,
    is_rescued BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients (recipe_id);
CREATE INDEX idx_recipe_ingredients_name ON recipe_ingredients (ingredient_name);
