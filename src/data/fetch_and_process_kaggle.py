"""
Kaggle Food.com ve USDA FoodKeeper veri setlerinden dinamik veri işleme boru hattı.
Tüm depo ve tarif verileri doğrudan Kaggle'dan indirilen veri setlerinden okunur.
"""

import os
import sys
import json
import zipfile
import ast
import warnings
from datetime import datetime, timedelta
import pandas as pd

warnings.filterwarnings("ignore")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "raw_kaggle")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


def load_project_environment():
    """Proje kök dizinindeki .env dosyasından Kaggle kimlik bilgilerini yükler."""
    env_path = os.path.join(PROJECT_ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    os.environ[key] = val

    token = os.environ.get("KAGGLE_TOKEN") or os.environ.get("KAGGLE_API_TOKEN")
    if token:
        os.environ["KAGGLE_API_TOKEN"] = token
        os.environ["KAGGLE_TOKEN"] = token

        kaggle_home = os.path.normpath(os.path.expanduser("~/.kaggle"))
        os.makedirs(kaggle_home, exist_ok=True)
        token_file = os.path.join(kaggle_home, "access_token")
        try:
            with open(token_file, "w", encoding="utf-8") as tf:
                tf.write(token)
        except Exception:
            pass


def authenticate_kaggle_api():
    """Kaggle API bağlantısını doğrular."""
    load_project_environment()

    kaggle_home = os.path.normpath(os.path.expanduser("~/.kaggle"))
    kaggle_json = os.path.join(kaggle_home, "kaggle.json")
    access_token = os.path.join(kaggle_home, "access_token")

    has_token = bool(os.environ.get("KAGGLE_API_TOKEN") or os.environ.get("KAGGLE_TOKEN"))
    has_user_key = bool(os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"))
    has_file = os.path.exists(kaggle_json) or os.path.exists(access_token)

    if not (has_token or has_user_key or has_file):
        print("Kaggle kimlik bilgisi bulunamadı, mevcut yerel dosyalar kullanılacak.")
        return None

    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        api = KaggleApi()
        api.authenticate()
        print("Kaggle API doğrulaması başarılı.")
        return api
    except Exception as e:
        print(f"Kaggle API uyarısı ({e}), yerel dosyalar kullanılacak.")
        return None


def extract_all_archives(target_dir):
    """Zip arşivlerini belirtilen dizine ayıklar."""
    for item in os.listdir(target_dir):
        if item.endswith(".zip"):
            zip_path = os.path.join(target_dir, item)
            print(f"Arşiv paketi açılıyor: {item}")
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(target_dir)


def download_datasets(api):
    """Eksik veri setlerini Kaggle üzerinden otomatik olarak temin eder."""
    recipes_csv = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv")
    recipes_zip = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv.zip")

    if not os.path.exists(recipes_csv) and not os.path.exists(recipes_zip):
        if api:
            print("Food.com veri seti Kaggle'dan indiriliyor...")
            api.dataset_download_file(
                dataset="shuyangli94/food-com-recipes-and-user-interactions",
                file_name="RAW_recipes.csv",
                path=DOWNLOAD_DIR,
            )
    else:
        print("Food.com veri seti mevcut.")

    fk_json = os.path.join(DOWNLOAD_DIR, "foodkeeper.json")
    if not os.path.exists(fk_json) and api:
        try:
            print("USDA FoodKeeper veri seti Kaggle'dan indiriliyor...")
            api.dataset_download_file(
                dataset="parvezthabarak/foodkeeper",
                file_name="foodkeeper.json",
                path=DOWNLOAD_DIR,
            )
        except Exception:
            pass

    extract_all_archives(DOWNLOAD_DIR)


def parse_foodkeeper_dataset():
    """
    Kaggle üzerinden indirilen USDA FoodKeeper veri setini okur ve 
    ürünlerin raf ömrü ve kategori kurallarını dinamik olarak çıkarır.
    """
    fk_json = os.path.join(DOWNLOAD_DIR, "foodkeeper.json")
    if not os.path.exists(fk_json):
        raise FileNotFoundError(f"FoodKeeper veri seti bulunamadı: {fk_json}")

    with open(fk_json, "r", encoding="utf-8", errors="ignore") as f:
        data = json.load(f)

    # 1. Kategori isim eşlemeleri (FoodKeeper Category tablosu)
    cat_map = {}
    for cat_row in data["sheets"][1]["data"]:
        c_dict = {}
        for item in cat_row:
            c_dict.update(item)
        cat_map[c_dict.get("ID")] = c_dict.get("Category_Name")

    # 2. Raf ömrünü gün cinsine çeviren yardımcı fonksiyon
    def to_days(val, metric):
        if not val or not metric:
            return None
        try:
            val = float(val)
        except Exception:
            return None
        m = str(metric).lower()
        if "day" in m:
            return int(val)
        if "week" in m:
            return int(val * 7)
        if "month" in m:
            return int(val * 30)
        if "year" in m:
            return int(val * 365)
        return None

    category_translation = {
        "Dairy Products & Eggs": "Süt & Süt Ürünleri",
        "Meat": "Et, Tavuk & Balık",
        "Poultry": "Et, Tavuk & Balık",
        "Seafood": "Et, Tavuk & Balık",
        "Produce": "Sebze & Meyve",
        "Grains, Beans & Pasta": "Bakliyat & Kuru Gıda",
        "Baked Goods": "Ekmek & Unlu Mamuller",
        "Condiments, Sauces & Canned Goods": "Sos & Baharat",
        "Deli & Prepared Foods": "Kahvaltılık & Şarküteri",
        "Shelf Stable Foods": "Temel Gıda",
        "Vegetarian Proteins": "Bakliyat & Kuru Gıda",
        "Beverages": "İçecekler"
    }

    # 3. Ürün tablosunu dinamik olarak ayrıştır
    extracted_products = []
    seen = set()

    for prod_row in data["sheets"][2]["data"]:
        p_dict = {}
        for item in prod_row:
            p_dict.update(item)

        name = p_dict.get("Name")
        if not name or name.strip().lower() in seen:
            continue

        # Saklama süresini (Refrigerate / Pantry) FoodKeeper parametrelerinden oku
        days = (
            to_days(p_dict.get("Refrigerate_Max"), p_dict.get("Refrigerate_Metric")) or
            to_days(p_dict.get("DOP_Refrigerate_Max"), p_dict.get("DOP_Refrigerate_Metric")) or
            to_days(p_dict.get("Pantry_Max"), p_dict.get("Pantry_Metric")) or
            to_days(p_dict.get("DOP_Pantry_Max"), p_dict.get("DOP_Pantry_Metric")) or
            14
        )

        cat_raw = cat_map.get(p_dict.get("Category_ID"), "Shelf Stable Foods")
        cat_tr = category_translation.get(cat_raw, "Temel Gıda")

        seen.add(name.strip().lower())
        extracted_products.append({
            "name": name.strip(),
            "category": cat_tr,
            "max_shelf_life_days": days,
            "subtitle": p_dict.get("Name_subtitle")
        })

    return extracted_products


def build_pantry_seed_from_kaggle(today, target_count=105):
    """
    Kaggle FoodKeeper veri setinden dinamik olarak okunan ürünlerle
    evsel depo envanterini oluşturur. Kalan günleri hesaplar.
    """
    products = parse_foodkeeper_dataset()

    pantry_seed = []
    for idx, p in enumerate(products[:target_count]):
        max_days = p["max_shelf_life_days"]

        # Evsel mutfak dinamiklerine göre kalan gün simülasyonu:
        # Raf ömrü kısa ürünler öncelikli risk grubuna atanır.
        if max_days <= 3:
            days_remaining = max(1, max_days - 1)
        elif max_days <= 7:
            days_remaining = max(2, (idx % 5) + 2)
        elif max_days <= 30:
            days_remaining = max(4, (idx % 15) + 3)
        else:
            days_remaining = min(max_days, (idx * 5) + 15)

        exp_date = today + timedelta(days=days_remaining)

        if days_remaining <= 2:
            status = "RED"
        elif days_remaining <= 6:
            status = "YELLOW"
        else:
            status = "GREEN"

        # Lookup için temizlenmiş küçük harfli malzeme adı
        lookup_name = p["name"].lower().replace('"', '').replace("'", "").strip()

        # Birim belirleme
        unit = "gram"
        qty = 500
        if "milk" in lookup_name or "cream" in lookup_name or "juice" in lookup_name:
            unit = "ml"
            qty = 1000
        elif "oil" in lookup_name or "vinegar" in lookup_name:
            unit = "litre"
            qty = 1
        elif "egg" in lookup_name:
            unit = "adet"
            qty = 10
        elif p["category"] == "Sebze & Meyve":
            unit = "adet"
            qty = 5

        pantry_seed.append({
            "id": f"item-{idx+1:03d}",
            "name": p["name"],
            "ingredient_lookup": lookup_name,
            "category": p["category"],
            "quantity": qty,
            "unit": unit,
            "expiration_date": exp_date.strftime("%Y-%m-%d"),
            "days_remaining": days_remaining,
            "status": status,
            "priority_score": days_remaining,
        })

    return pantry_seed


def match_rescue_recipes(pantry_seed, target_count=100):
    recipes_csv = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv")
    if not os.path.exists(recipes_csv):
        raise FileNotFoundError(f"Tarif veri seti bulunamadı: {recipes_csv}")

    urgent_pantry_items = [item for item in pantry_seed if item["status"] in ["RED", "YELLOW"]]
    target_ingredients = list(set([item["ingredient_lookup"] for item in urgent_pantry_items]))

    chunk_size = 10000
    extracted_recipes = []
    seen_titles = set()

    for chunk in pd.read_csv(recipes_csv, chunksize=chunk_size):
        for _, row in chunk.iterrows():
            recipe_name = str(row.get("name", "")).strip()
            if not recipe_name or recipe_name.lower() in seen_titles:
                continue

            raw_ingredients_text = str(row.get("ingredients", "")).lower()
            matched_ings = [ing for ing in target_ingredients if ing in raw_ingredients_text]

            # En az 2 acil kiler malzemesini kurtaran tarifleri seç
            if len(matched_ings) >= 2:
                raw_steps = row.get("steps", "")
                try:
                    steps_list = ast.literal_eval(raw_steps) if isinstance(raw_steps, str) else []
                except Exception:
                    steps_list = [raw_steps]

                curated_steps = [str(s).strip() for s in steps_list[:5] if str(s).strip()]
                if not curated_steps:
                    curated_steps = ["Malzemeleri hazırlayın ve pişirin."]

                recipe_id_val = f"rec-{int(row.get('id', len(extracted_recipes) + 1))}"
                clean_title = recipe_name.title()
                seen_titles.add(recipe_name.lower())

                extracted_recipes.append({
                    "recipe_id": recipe_id_val,
                    "title": clean_title,
                    "prep_time_minutes": int(row.get("minutes", 30)),
                    "matched_ingredients": matched_ings,
                    "instructions": curated_steps,
                })

                if len(extracted_recipes) >= target_count:
                    break

        if len(extracted_recipes) >= target_count:
            break

    return extracted_recipes


def main():
    api = authenticate_kaggle_api()
    download_datasets(api)

    today = datetime(2026, 10, 6)

    # 1. Kaggle FoodKeeper veri setinden kiler verisini dinamik olarak üret
    pantry_seed = build_pantry_seed_from_kaggle(today, target_count=105)

    # 2. Kaggle Food.com CSV veri setinden kurtarma tariflerini dinamik olarak filtrele
    recipes_seed = match_rescue_recipes(pantry_seed, target_count=100)

    pantry_json_path = os.path.join(BASE_DIR, "pantry_seed.json")
    recipes_json_path = os.path.join(BASE_DIR, "recipes_seed.json")

    with open(pantry_json_path, "w", encoding="utf-8") as f:
        json.dump(pantry_seed, f, ensure_ascii=False, indent=2)

    with open(recipes_json_path, "w", encoding="utf-8") as f:
        json.dump(recipes_seed, f, ensure_ascii=False, indent=2)

    print(f"Kaggle FoodKeeper'dan {len(pantry_seed)} adet kiler ürünü dinamik olarak okundu ve işlendi.")
    print(f"Kaggle Food.com CSV'den {len(recipes_seed)} adet kurtarma tarifi dinamik olarak eşleştirildi.")


if __name__ == "__main__":
    main()
