"""
================================================================================
🌱 GIDA İSRAFI İLE MÜCADELE VE AKILLI KİLER YÖNETİM SİSTEMİ
   Sosyal Sorumluluk Projesi - Otomasyon ve Veri Hazırlama Boru Hattı

   Misyon:
   Birleşmiş Milletler Sürdürülebilir Kalkınma Amaçları (SKA 12.3: Gıda İsrafının
   Yarıya İndirilmesi) doğrultusunda; evsel gıdaların raf ömürlerini takip etmek,
   bozulma riski yüksek gıdaları önceliklendirmek ve sıfır atık prensibiyle
   bu gıdaların değerlendirilebileceği uygun yemek tariflerini eşleştirmek.

   Veri Kaynakları:
   1. USDA FoodKeeper & Saklama Kılavuzu: Gıda kategorileri ve raf ömrü parametreleri
   2. Food.com Veri Seti: 230,000+ tarif arasından acil kiler gıdalarıyla eşleşen tarifler

   Üretilen Çıktılar:
   - pantry_seed.json  : Kiler takip sistemi için 100 adet SKT ve risk puanlı gıda
   - recipes_seed.json : İsrafı önlemeye yönelik 100 adet kurtarma odaklı gerçek tarif
================================================================================
"""

import os
import sys
import json
import zipfile
import ast
import warnings
from datetime import datetime, timedelta
import pandas as pd

# Harici kütüphane uyarılarını temizle (konsol estetiği için)
warnings.filterwarnings("ignore")

# Windows Türkçe konsollarda (cp1254) Unicode ve Türkçe karakter desteği
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# ==============================================================================
# 1. DİZİN YAPILANDIRMASI VE ORTAM DEĞİŞKENLERİ (.ENV)
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "raw_kaggle")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)


def load_project_environment():
    """Proje kök dizinindeki .env dosyasını okuyarak Kaggle kimlik bilgilerini yükler."""
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


# ==============================================================================
# 2. KAGGLE API KİMLİK DOĞRULAMA (AÇIK VERİ ERİŞİMİ)
# ==============================================================================
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
        print("⚠️ Kaggle kimlik bilgisi bulunamadı, mevcut yerel dosyalar kullanılacak.")
        return None

    try:
        from kaggle.api.kaggle_api_extended import KaggleApi
        api = KaggleApi()
        api.authenticate()
        print("✅ Kaggle API kimlik doğrulaması başarılı.")
        return api
    except Exception as e:
        print(f"⚠️ Kaggle API bağlanırken uyarı ({e}), yerel dosyalar kullanılacak.")
        return None


# ==============================================================================
# 3. VERİ İNDİRME VE ARŞİV ÇIKARMA
# ==============================================================================
def extract_all_archives(target_dir):
    """İndirilen veri seti zip arşivlerini ayıklar."""
    for item in os.listdir(target_dir):
        if item.endswith(".zip"):
            zip_path = os.path.join(target_dir, item)
            print(f"📦 Arşiv paketi açılıyor: {item}...")
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(target_dir)


def download_datasets(api):
    """Gerektiğinde Kaggle üzerinden veri setlerini indirir."""
    recipes_csv = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv")
    recipes_zip = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv.zip")

    if not os.path.exists(recipes_csv) and not os.path.exists(recipes_zip):
        if api:
            print("\n📥 Food.com Gerçek Yemek Tarifleri İndiriliyor (shuyangli94)...")
            api.dataset_download_file(
                dataset="shuyangli94/food-com-recipes-and-user-interactions",
                file_name="RAW_recipes.csv",
                path=DOWNLOAD_DIR,
            )
    else:
        print("   -> Food.com veri paketi mevcut, indirme adımı atlandı.")

    fk_json = os.path.join(DOWNLOAD_DIR, "foodkeeper.json")
    if not os.path.exists(fk_json) and api:
        try:
            api.dataset_download_file(
                dataset="parvezthabarak/foodkeeper",
                file_name="foodkeeper.json",
                path=DOWNLOAD_DIR,
            )
        except Exception:
            pass

    extract_all_archives(DOWNLOAD_DIR)


# ==============================================================================
# 4. SOSYAL SORUMLULUK GIDA KATALOĞU VE RAF ÖMRÜ (100 ADET KİLER ÜRÜNÜ)
# ==============================================================================
def build_social_pantry_catalog(today):
    """
    Evsel mutfaklarda en sık israf edilen temel gıdaları ve USDA FoodKeeper
    raf ömrü standartlarını baz alarak 100 adetlik kiler veri modelini (pantry_seed) üretir.

    İsraf Risk Sınıflandırması:
    - RED (KIRMIZI - Yüksek Risk)  : Kalan gün <= 2 (Acil tüketime yönlendirilmeli)
    - YELLOW (SARI - Orta Risk)    : Kalan gün 3-6 (Haftalık menüde önceliklendirilmeli)
    - GREEN (YEŞİL - Düşük Risk)   : Kalan gün >= 7 (Kilerde güvenli saklama durumu)
    """
    print("\n📊 Gıda İsrafını Önleme: 100 Adet Kiler Ürünü Raf Ömrü ve Risk Puanlaması Hesaplanıyor...")

    # 100 adet gerçekçi evsel gıda kataloğu
    core_items = [
        # --- 1-25: ACİL VE YÜKSEK RİSKLİ TAZE GIDALAR (RED & EARLY YELLOW) ---
        {"name": "Tavuk Göğsü", "eng": "chicken breast", "category": "Et, Tavuk & Balık", "days": 1, "unit": "gram", "qty": 500},
        {"name": "Somon Fileto", "eng": "salmon", "category": "Et, Tavuk & Balık", "days": 1, "unit": "gram", "qty": 400},
        {"name": "Karides", "eng": "shrimp", "category": "Et, Tavuk & Balık", "days": 1, "unit": "gram", "qty": 300},
        {"name": "Taze Mantar", "eng": "mushroom", "category": "Sebze & Meyve", "days": 2, "unit": "gram", "qty": 300},
        {"name": "Taze Ispanak", "eng": "spinach", "category": "Sebze & Meyve", "days": 2, "unit": "gram", "qty": 400},
        {"name": "Dana Biftek", "eng": "steak", "category": "Et, Tavuk & Balık", "days": 2, "unit": "gram", "qty": 600},
        {"name": "Çilek", "eng": "strawberries", "category": "Sebze & Meyve", "days": 2, "unit": "gram", "qty": 250},
        {"name": "Taze Roka", "eng": "arugula", "category": "Sebze & Meyve", "days": 2, "unit": "demet", "qty": 2},
        {"name": "Kuşkonmaz", "eng": "asparagus", "category": "Sebze & Meyve", "days": 2, "unit": "gram", "qty": 250},
        {"name": "Hindi Göğsü", "eng": "turkey", "category": "Et, Tavuk & Balık", "days": 2, "unit": "gram", "qty": 500},
        {"name": "Avokado", "eng": "avocado", "category": "Sebze & Meyve", "days": 2, "unit": "adet", "qty": 3},
        {"name": "Ekmek", "eng": "bread", "category": "Ekmek & Unlu Mamuller", "days": 2, "unit": "adet", "qty": 2},
        {"name": "Krema", "eng": "cream", "category": "Süt & Süt Ürünleri", "days": 2, "unit": "ml", "qty": 200},
        {"name": "Taze Marul", "eng": "lettuce", "category": "Sebze & Meyve", "days": 2, "unit": "adet", "qty": 1},
        {"name": "Süt", "eng": "milk", "category": "Süt & Süt Ürünleri", "days": 3, "unit": "ml", "qty": 1000},
        {"name": "Kıyma", "eng": "ground beef", "category": "Et, Tavuk & Balık", "days": 3, "unit": "gram", "qty": 500},
        {"name": "Yoğurt", "eng": "yogurt", "category": "Süt & Süt Ürünleri", "days": 3, "unit": "gram", "qty": 1000},
        {"name": "Muz", "eng": "banana", "category": "Sebze & Meyve", "days": 3, "unit": "adet", "qty": 6},
        {"name": "Taze Fasulye", "eng": "green beans", "category": "Sebze & Meyve", "days": 3, "unit": "gram", "qty": 500},
        {"name": "Brokoli", "eng": "broccoli", "category": "Sebze & Meyve", "days": 3, "unit": "gram", "qty": 400},
        {"name": "Sosis", "eng": "sausage", "category": "Et, Tavuk & Balık", "days": 3, "unit": "gram", "qty": 300},
        {"name": "Taze Fesleğen", "eng": "basil", "category": "Sebze & Meyve", "days": 3, "unit": "demet", "qty": 1},
        {"name": "Maydanoz", "eng": "parsley", "category": "Sebze & Meyve", "days": 3, "unit": "demet", "qty": 2},
        {"name": "Dereotu", "eng": "dill", "category": "Sebze & Meyve", "days": 3, "unit": "demet", "qty": 1},
        {"name": "Taze Bezelye", "eng": "peas", "category": "Sebze & Meyve", "days": 3, "unit": "gram", "qty": 400},

        # --- 26-55: YAKLAŞAN RİSK GRUBU (YELLOW: 4-6 GÜN) ---
        {"name": "Kaşar Peyniri", "eng": "cheese", "category": "Süt & Süt Ürünleri", "days": 4, "unit": "gram", "qty": 300},
        {"name": "Mozzarella Peyniri", "eng": "mozzarella", "category": "Süt & Süt Ürünleri", "days": 4, "unit": "gram", "qty": 250},
        {"name": "Kabak", "eng": "zucchini", "category": "Sebze & Meyve", "days": 4, "unit": "adet", "qty": 4},
        {"name": "Patlıcan", "eng": "eggplant", "category": "Sebze & Meyve", "days": 4, "unit": "adet", "qty": 3},
        {"name": "Karnabahar", "eng": "cauliflower", "category": "Sebze & Meyve", "days": 4, "unit": "adet", "qty": 1},
        {"name": "Salatalık", "eng": "cucumber", "category": "Sebze & Meyve", "days": 4, "unit": "adet", "qty": 5},
        {"name": "Labne Peyniri", "eng": "cream cheese", "category": "Süt & Süt Ürünleri", "days": 4, "unit": "gram", "qty": 200},
        {"name": "Taze Soğan", "eng": "green onions", "category": "Sebze & Meyve", "days": 4, "unit": "demet", "qty": 2},
        {"name": "Enginar", "eng": "artichoke", "category": "Sebze & Meyve", "days": 4, "unit": "adet", "qty": 3},
        {"name": "Ricotta Peyniri", "eng": "ricotta", "category": "Süt & Süt Ürünleri", "days": 4, "unit": "gram", "qty": 250},
        {"name": "Lor Peyniri", "eng": "cottage cheese", "category": "Süt & Süt Ürünleri", "days": 4, "unit": "gram", "qty": 300},
        {"name": "Biber (Dolmalık & Çarliston)", "eng": "bell pepper", "category": "Sebze & Meyve", "days": 5, "unit": "adet", "qty": 6},
        {"name": "Kangal Sucuk", "eng": "sausage", "category": "Kahvaltılık & Şarküteri", "days": 5, "unit": "gram", "qty": 350},
        {"name": "Pırasa", "eng": "leek", "category": "Sebze & Meyve", "days": 5, "unit": "kg", "qty": 1},
        {"name": "Domates", "eng": "tomato", "category": "Sebze & Meyve", "days": 5, "unit": "adet", "qty": 6},
        {"name": "Armut", "eng": "pear", "category": "Sebze & Meyve", "days": 5, "unit": "adet", "qty": 4},
        {"name": "Şeftali", "eng": "peach", "category": "Sebze & Meyve", "days": 5, "unit": "adet", "qty": 4},
        {"name": "Üzüm", "eng": "grapes", "category": "Sebze & Meyve", "days": 5, "unit": "gram", "qty": 500},
        {"name": "Beyaz Peynir", "eng": "feta cheese", "category": "Süt & Süt Ürünleri", "days": 6, "unit": "gram", "qty": 500},
        {"name": "Kereviz", "eng": "celery", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 1},
        {"name": "Kivi", "eng": "kiwi", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 4},
        {"name": "Kavun", "eng": "melon", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 1},
        {"name": "Taze Mısır", "eng": "corn", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 3},
        {"name": "Yufka", "eng": "phyllo dough", "category": "Ekmek & Unlu Mamuller", "days": 6, "unit": "paket", "qty": 1},
        {"name": "Kırmızı Lahana", "eng": "cabbage", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 1},
        {"name": "Beyaz Lahana", "eng": "cabbage", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 1},
        {"name": "Turp", "eng": "radish", "category": "Sebze & Meyve", "days": 6, "unit": "demet", "qty": 1},
        {"name": "Pancar", "eng": "beet", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 3},
        {"name": "Balkabağı", "eng": "pumpkin", "category": "Sebze & Meyve", "days": 6, "unit": "dilim", "qty": 2},
        {"name": "Taze Biberiye", "eng": "rosemary", "category": "Sebze & Meyve", "days": 6, "unit": "demet", "qty": 1},

        # --- 56-100: GÜVENLİ VE UZUN RAF ÖMÜRLÜ KİLER ERZAĞI (GREEN: >= 7 GÜN) ---
        {"name": "Lavaş Ekmeği", "eng": "tortilla", "category": "Ekmek & Unlu Mamuller", "days": 7, "unit": "paket", "qty": 2},
        {"name": "Tereyağı", "eng": "butter", "category": "Süt & Süt Ürünleri", "days": 10, "unit": "gram", "qty": 250},
        {"name": "Havuç", "eng": "carrot", "category": "Sebze & Meyve", "days": 12, "unit": "adet", "qty": 6},
        {"name": "Limon", "eng": "lemon", "category": "Sebze & Meyve", "days": 14, "unit": "adet", "qty": 5},
        {"name": "Portakal", "eng": "orange", "category": "Sebze & Meyve", "days": 14, "unit": "adet", "qty": 5},
        {"name": "Elma", "eng": "apple", "category": "Sebze & Meyve", "days": 15, "unit": "adet", "qty": 6},
        {"name": "Çedar Peyniri", "eng": "cheddar cheese", "category": "Süt & Süt Ürünleri", "days": 15, "unit": "gram", "qty": 200},
        {"name": "Taze Zencefil", "eng": "ginger", "category": "Sebze & Meyve", "days": 16, "unit": "gram", "qty": 150},
        {"name": "Yumurta", "eng": "egg", "category": "Kahvaltılık & Şarküteri", "days": 18, "unit": "adet", "qty": 15},
        {"name": "Kuru Soğan", "eng": "onion", "category": "Sebze & Meyve", "days": 20, "unit": "kg", "qty": 2},
        {"name": "Patates", "eng": "potato", "category": "Sebze & Meyve", "days": 20, "unit": "kg", "qty": 3},
        {"name": "Parmesan Peyniri", "eng": "parmesan", "category": "Süt & Süt Ürünleri", "days": 20, "unit": "gram", "qty": 150},
        {"name": "Sarımsak", "eng": "garlic", "category": "Sebze & Meyve", "days": 25, "unit": "baş", "qty": 4},
        {"name": "Mayonez", "eng": "mayonnaise", "category": "Sos & Baharat", "days": 30, "unit": "kavanoz", "qty": 1},
        {"name": "Zeytin (Yeşil)", "eng": "olives", "category": "Kahvaltılık & Şarküteri", "days": 45, "unit": "kavanoz", "qty": 1},
        {"name": "Siyah Zeytin", "eng": "black olives", "category": "Kahvaltılık & Şarküteri", "days": 45, "unit": "kavanoz", "qty": 1},
        {"name": "Domates Salçası", "eng": "tomato paste", "category": "Sos & Baharat", "days": 60, "unit": "kavanoz", "qty": 1},
        {"name": "Biber Salçası", "eng": "pepper paste", "category": "Sos & Baharat", "days": 60, "unit": "kavanoz", "qty": 1},
        {"name": "Çam Fıstığı", "eng": "pine nuts", "category": "Kuru Yemiş & Atıştırmalık", "days": 60, "unit": "gram", "qty": 100},
        {"name": "Hardal", "eng": "mustard", "category": "Sos & Baharat", "days": 90, "unit": "kavanoz", "qty": 1},
        {"name": "Ketçap", "eng": "ketchup", "category": "Sos & Baharat", "days": 90, "unit": "şişe", "qty": 1},
        {"name": "Ceviz İçi", "eng": "walnuts", "category": "Kuru Yemiş & Atıştırmalık", "days": 90, "unit": "gram", "qty": 250},
        {"name": "Fındık İçi", "eng": "hazelnuts", "category": "Kuru Yemiş & Atıştırmalık", "days": 90, "unit": "gram", "qty": 250},
        {"name": "Badem", "eng": "almonds", "category": "Kuru Yemiş & Atıştırmalık", "days": 120, "unit": "gram", "qty": 250},
        {"name": "Kuru İncir", "eng": "dried figs", "category": "Kuru Yemiş & Atıştırmalık", "days": 120, "unit": "gram", "qty": 200},
        {"name": "Kırmızı Mercimek", "eng": "lentil", "category": "Bakliyat & Kuru Gıda", "days": 180, "unit": "kg", "qty": 1},
        {"name": "Yeşil Mercimek", "eng": "lentils", "category": "Bakliyat & Kuru Gıda", "days": 180, "unit": "kg", "qty": 1},
        {"name": "Yulaf Ezmesi", "eng": "oats", "category": "Bakliyat & Kuru Gıda", "days": 180, "unit": "paket", "qty": 1},
        {"name": "Kuru Üzüm", "eng": "raisins", "category": "Kuru Yemiş & Atıştırmalık", "days": 180, "unit": "gram", "qty": 200},
        {"name": "Çilek Reçeli", "eng": "jam", "category": "Kahvaltılık & Şarküteri", "days": 180, "unit": "kavanoz", "qty": 1},
        {"name": "Tahin", "eng": "tahini", "category": "Kahvaltılık & Şarküteri", "days": 180, "unit": "kavanoz", "qty": 1},
        {"name": "Konserve Mısır", "eng": "canned corn", "category": "Konserve & Hazır Gıda", "days": 180, "unit": "kutu", "qty": 2},
        {"name": "Konserve Bezelye", "eng": "canned peas", "category": "Konserve & Hazır Gıda", "days": 180, "unit": "kutu", "qty": 2},
        {"name": "Buğday Unu", "eng": "flour", "category": "Temel Gıda", "days": 180, "unit": "kg", "qty": 2},
        {"name": "Nohut", "eng": "chickpeas", "category": "Bakliyat & Kuru Gıda", "days": 200, "unit": "kg", "qty": 1},
        {"name": "Kuru Fasulye", "eng": "beans", "category": "Bakliyat & Kuru Gıda", "days": 200, "unit": "kg", "qty": 1},
        {"name": "Pirinç (Baldo)", "eng": "rice", "category": "Bakliyat & Kuru Gıda", "days": 240, "unit": "kg", "qty": 2},
        {"name": "Pilavlık Bulgur", "eng": "bulgur", "category": "Bakliyat & Kuru Gıda", "days": 240, "unit": "kg", "qty": 1},
        {"name": "Pekmez", "eng": "molasses", "category": "Kahvaltılık & Şarküteri", "days": 240, "unit": "kavanoz", "qty": 1},
        {"name": "Konserve Ton Balığı", "eng": "tuna", "category": "Konserve & Hazır Gıda", "days": 240, "unit": "kutu", "qty": 3},
        {"name": "Makarna (Burgu)", "eng": "pasta", "category": "Bakliyat & Kuru Gıda", "days": 300, "unit": "paket", "qty": 2},
        {"name": "Spagetti", "eng": "spaghetti", "category": "Bakliyat & Kuru Gıda", "days": 300, "unit": "paket", "qty": 2},
        {"name": "Soya Sosu", "eng": "soy sauce", "category": "Sos & Baharat", "days": 300, "unit": "şişe", "qty": 1},
        {"name": "Sızma Zeytinyağı", "eng": "olive oil", "category": "Sos & Baharat", "days": 365, "unit": "litre", "qty": 1},
        {"name": "Ayçiçek Yağı", "eng": "vegetable oil", "category": "Sos & Baharat", "days": 365, "unit": "litre", "qty": 2},
        {"name": "Balzamik Sirke", "eng": "vinegar", "category": "Sos & Baharat", "days": 365, "unit": "şişe", "qty": 1},
        {"name": "Kuru Kekik", "eng": "thyme", "category": "Sos & Baharat", "days": 365, "unit": "kavanoz", "qty": 1},
        {"name": "Kuru Nane", "eng": "mint", "category": "Sos & Baharat", "days": 365, "unit": "kavanoz", "qty": 1},
        {"name": "Kimyon", "eng": "cumin", "category": "Sos & Baharat", "days": 365, "unit": "kavanoz", "qty": 1},
        {"name": "Süzme Çiçek Balı", "eng": "honey", "category": "Kahvaltılık & Şarküteri", "days": 500, "unit": "kavanoz", "qty": 1},
    ]

    pantry_seed = []
    for idx, item in enumerate(core_items):
        exp_date = today + timedelta(days=item["days"])

        # SKT ve İsraf Riski Durum Belirleme
        if item["days"] <= 2:
            status = "RED"
        elif item["days"] <= 6:
            status = "YELLOW"
        else:
            status = "GREEN"

        pantry_seed.append({
            "id": f"item-{idx+1:03d}",
            "name": item["name"],
            "ingredient_lookup": item["eng"],
            "category": item["category"],
            "quantity": item["qty"],
            "unit": item["unit"],
            "expiration_date": exp_date.strftime("%Y-%m-%d"),
            "days_remaining": item["days"],
            "status": status,
            "priority_score": item["days"],  # Düşük skor = Yüksek israf riski ve öncelik
        })

    return pantry_seed


# ==============================================================================
# 5. SIFIR ATIK TARİF EŞLEŞTİRME MOTORU (100 ADET GERÇEK KAGGLE TARİFİ)
# ==============================================================================
def match_rescue_recipes(pantry_seed, target_count=100):
    """
    Food.com yemek tarifleri veri setini tarar.
    Kilerde bozulmak üzere olan (RED & YELLOW etiketli) acil malzemelerden
    en az 2 tanesini içeren 100 adet kurtarma tarifini filtreleyip hazırlar.
    """
    recipes_csv = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv")
    if not os.path.exists(recipes_csv):
        raise FileNotFoundError(f"Tarif veri seti bulunamadı: {recipes_csv}")

    print(f"\n🍳 Sıfır Atık Tarif Motoru: Kaggle Food.com taranıyor (Hedef: {target_count} Tarif)...")

    # Acil tüketilmesi gereken gıdalar (RED ve YELLOW grubundaki malzemeler)
    urgent_pantry_items = [item for item in pantry_seed if item["status"] in ["RED", "YELLOW"]]
    target_ingredients = list(set([item["ingredient_lookup"] for item in urgent_pantry_items]))

    print(f"   -> {len(target_ingredients)} adet kurtarılacak acil malzeme baz alınıyor...")
    print(f"   -> Gerçek Food.com veri seti taranıyor (230,000+ tarif)...")

    chunk_size = 10000
    extracted_recipes = []
    seen_titles = set()

    for chunk in pd.read_csv(recipes_csv, chunksize=chunk_size):
        for _, row in chunk.iterrows():
            recipe_name = str(row.get("name", "")).strip()
            if not recipe_name or recipe_name.lower() in seen_titles:
                continue

            raw_ingredients_text = str(row.get("ingredients", "")).lower()

            # Tarifin içerdiği acil kiler malzemelerini bul
            matched_ings = [ing for ing in target_ingredients if ing in raw_ingredients_text]

            # Sosyal Sorumluluk Kuralı: En az 2 acil kiler malzemesini kurtaran tarifleri seç
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

    print(f"   ✅ Toplam {len(extracted_recipes)} adet gerçek kurtarma tarifi Kaggle'dan başarıyla çıkarıldı.")
    return extracted_recipes


# ==============================================================================
# 6. ANA İŞLEYİŞ VE VERİTABANI TOHUMLAMA (SEED) ÇIKTILARI
# ==============================================================================
def main():
    print("=" * 80)
    print("🌱 GIDA İSRAFI İLE MÜCADELE VE SÜRDÜRÜLEBİLİRLİK PROJESİ")
    print("   Akıllı Kiler ve Sıfır Atık Yemek Tarifi Eşleştirme Motoru (100x100)")
    print("   Birleşmiş Milletler SKA 12.3: Evsel Gıda İsrafını Önleme Girişimi")
    print("=" * 80)

    # Adım 1: Kaggle API kontrolü
    api = authenticate_kaggle_api()

    # Adım 2: Veri setlerini kontrol et
    download_datasets(api)

    # Adım 3: 100 Adet Kiler ve SKT modeli (Referans Tarih: 6 Ekim 2026)
    today = datetime(2026, 10, 6)
    pantry_seed = build_social_pantry_catalog(today)

    # Adım 4: 100 Adet Sıfır atık tarif eşleştirme algoritmasını çalıştır
    recipes_seed = match_rescue_recipes(pantry_seed, target_count=100)

    # Adım 5: JSON dosyalarını oluştur
    pantry_json_path = os.path.join(BASE_DIR, "pantry_seed.json")
    recipes_json_path = os.path.join(BASE_DIR, "recipes_seed.json")

    with open(pantry_json_path, "w", encoding="utf-8") as f:
        json.dump(pantry_seed, f, ensure_ascii=False, indent=2)

    with open(recipes_json_path, "w", encoding="utf-8") as f:
        json.dump(recipes_seed, f, ensure_ascii=False, indent=2)

    # Konsol Bilgilendirme Raporu
    print("\n" + "=" * 80)
    print("🎉 SOSYAL SORUMLULUK VERİ HAZIRLAMA İŞLEMİ TAMAMLANDI!")
    print(f"📁 Kiler Tohum Verisi : src/data/pantry_seed.json ({len(pantry_seed)} ürün, SKT ve risk etiketli)")
    print(f"📁 Tarif Tohum Verisi : src/data/recipes_seed.json ({len(recipes_seed)} kurtarma odaklı tarif)")
    print("-" * 80)
    print("📌 Kiler Risk Dağılımı:")
    red_count = sum(1 for item in pantry_seed if item["status"] == "RED")
    yellow_count = sum(1 for item in pantry_seed if item["status"] == "YELLOW")
    green_count = sum(1 for item in pantry_seed if item["status"] == "GREEN")
    print(f"   🔴 Kırmızı (Acil Tüketim / 0-2 Gün): {red_count} ürün")
    print(f"   🟡 Sarı (Yaklaşan Risk / 3-6 Gün)   : {yellow_count} ürün")
    print(f"   🟢 Yeşil (Güvenli Kiler)            : {green_count} ürün")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
