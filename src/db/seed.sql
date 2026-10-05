-- ==============================================================================
-- 🌱 GIDA İSRAFI İLE MÜCADELE VE SÜRDÜRÜLEBİLİRLİK SOSYAL SORUMLULUK PROJESİ
-- PostgreSQL Başlangıç Tohum Verileri (seed.sql)
-- Birleşmiş Milletler SKA 12.3: Evsel Gıda İsrafını Önleme İlkeleri
-- ==============================================================================

-- 1. Temel Gıda Kategorileri
INSERT INTO categories (name, description) VALUES
    ('Et, Tavuk & Balık', 'Çabuk bozulabilen yüksek proteinli et ve tavuk ürünleri'),
    ('Süt & Süt Ürünleri', 'Kısa raf ömrüne sahip pastörize ve fermente süt ürünleri'),
    ('Sebze & Meyve', 'Taze tüketilmesi gereken vitamin ve mineral kaynağı bahçe ürünleri'),
    ('Kahvaltılık & Şarküteri', 'Yumurta ve şarküteri grubu ürünleri'),
    ('Bakliyat & Kuru Gıda', 'Uzun raf ömürlü temel kiler erzağı')
ON CONFLICT (name) DO NOTHING;

-- 2. Kiler Gıda Envanteri (pantry_items)
-- 6 Ekim 2026 referans tarihiyle hesaplanmış dinamik SKT ve risk seviyeleri
INSERT INTO pantry_items (id, name, ingredient_lookup, category, quantity, unit, expiration_date, days_remaining, status, priority_score) VALUES
    ('item-001', 'Tavuk Göğsü', 'chicken breast', 'Et, Tavuk & Balık', 500, 'gram', '2026-10-08', 2, 'RED', 2),
    ('item-002', 'Süt', 'milk', 'Süt & Süt Ürünleri', 1000, 'ml', '2026-10-09', 3, 'YELLOW', 3),
    ('item-003', 'Mantar', 'mushroom', 'Sebze & Meyve', 300, 'gram', '2026-10-08', 2, 'RED', 2),
    ('item-004', 'Kıyma', 'ground beef', 'Et, Tavuk & Balık', 400, 'gram', '2026-10-10', 4, 'YELLOW', 4),
    ('item-005', 'Kaşar Peyniri', 'cheese', 'Süt & Süt Ürünleri', 250, 'gram', '2026-10-11', 5, 'YELLOW', 5),
    ('item-006', 'Domates', 'tomato', 'Sebze & Meyve', 4, 'adet', '2026-10-12', 6, 'YELLOW', 6),
    ('item-007', 'Havuç', 'carrot', 'Sebze & Meyve', 5, 'adet', '2026-10-18', 12, 'GREEN', 12),
    ('item-008', 'Yumurta', 'egg', 'Kahvaltılık & Şarküteri', 10, 'adet', '2026-10-24', 18, 'GREEN', 18),
    ('item-009', 'Kırmızı Mercimek', 'lentil', 'Bakliyat & Kuru Gıda', 1, 'kg', '2027-04-04', 180, 'GREEN', 180),
    ('item-010', 'Makarna', 'pasta', 'Bakliyat & Kuru Gıda', 2, 'paket', '2027-08-02', 300, 'GREEN', 300)
ON CONFLICT (id) DO NOTHING;

-- 3. Sıfır Atık Kurtarma Yemek Tarifleri (recipes)
-- Kaggle Food.com'dan filtrelenmiş, acil tüketim gerektiren malzemelerle eşleşen gerçek tarifler
INSERT INTO recipes (recipe_id, title, prep_time_minutes, matched_ingredients, instructions) VALUES
    (
        'rec-31490',
        'A Bit Different  Breakfast Pizza',
        30,
        ARRAY['milk', 'cheese'],
        '["preheat oven to 425 degrees f", "press dough into the bottom and sides of a 12 inch pizza pan", "bake for 5 minutes until set but not browned", "cut sausage into small pieces"]'::jsonb
    ),
    (
        'rec-112140',
        'All In The Kitchen  Chili',
        130,
        ARRAY['ground beef', 'cheese', 'tomato'],
        '["brown ground beef in large pot", "add chopped onions to ground beef when almost brown and sautee until wilted", "add all other ingredients", "add kidney beans if you like beans in your chili"]'::jsonb
    ),
    (
        'rec-54272',
        'Fool The Meat Eaters  Chili',
        40,
        ARRAY['ground beef', 'tomato'],
        '["rehydrate tvp if needed", "spray or oil a large pot", "chop the onion , hot peppers , and garlic and add to the pot", "chop remaining vegetables , add to pot and brown lightly"]'::jsonb
    ),
    (
        'rec-47366',
        'Forgotten  Minestrone',
        495,
        ARRAY['cheese', 'tomato'],
        '["in a slow cooker , combine the first nine ingredients", "cover and cook on low for 7-9 hours or until meat is tender", "add zucchini , cabbage , beans and macaroni", "cook on high 30-45 minutes more or until the vegetables are tender"]'::jsonb
    ),
    (
        'rec-59952',
        'Global Gourmet  Taco Casserole',
        55,
        ARRAY['ground beef', 'cheese', 'tomato'],
        '["heat oven to 375 degrees", "brown ground beef and onion over medium heat", "drain", "stir in tomato sauce , taco or other sauce , salt , pepper , tabasco , chiles , and cornmeal , adjusting for\"hot\" taste preference and desired thickness"]'::jsonb
    ),
    (
        'rec-25775',
        'How I Got My Family To Eat Spinach  Spinach Casserole',
        50,
        ARRAY['mushroom', 'cheese'],
        '["preheat oven to 350 degrees", "place spinach in strainer and squeeze all extra liquid from it", "in a large bowl , combine spinach with the rest of ingredients , except croutons , and combine well", "pour into a 2 quart casserole dish and top with croutons"]'::jsonb
    ),
    (
        'rec-22123',
        'I Don T Feel Like Cooking Tonight  Casserole',
        45,
        ARRAY['mushroom', 'ground beef'],
        '["brown onion and meat in the oil , drain any excess moisture", "remove from heat and add both cans of soup and the veggies of your choice and stir", "salt and pepper to taste", "pour mixture into a greased 9x9 inch baking pan"]'::jsonb
    ),
    (
        'rec-58224',
        'Immoral  Sandwich Filling  Loose Meat',
        35,
        ARRAY['ground beef', 'cheese'],
        '["brown the meat & drain fat", "stir in sugar , mustard , beer , cayenne , garlic and salt & pepper to taste", "simmer until liquid has mostly cooked away", "lay slices of cheese over top of meat , then cover for about 5 minutes , with heat on very low , until cheese has melted"]'::jsonb
    ),
    (
        'rec-33606',
        'Italian Sandwich  Pasta Salad',
        25,
        ARRAY['cheese', 'tomato'],
        '["cook pasta and set aside", "place onions , dill pickles , olives , water chestnuts , chives and peppers in a bowl", "add oil , vinegar and spices", "marinate for 15-20 minutes or so"]'::jsonb
    ),
    (
        'rec-53402',
        'Killer  Lasagna',
        90,
        ARRAY['ground beef', 'cheese', 'tomato'],
        '["brown the sausage and ground meat and drain all the fat", "add all the other ingredients for the meat filling and simmer on the stove , uncovered , for about 1 / 2 hour", "i usually add a bay leaf or two", "mix up the cheese filling and set aside in fridge until ready to use"]'::jsonb
    )
ON CONFLICT (recipe_id) DO NOTHING;
