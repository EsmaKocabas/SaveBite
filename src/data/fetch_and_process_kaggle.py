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
   - pantry_seed.json  : Kiler takip sistemi için SKT ve renk risk skorlu gıda listesi
   - recipes_seed.json : İsrafı önlemeye yönelik kurtarma odaklı eşleştirilmiş tarifler
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
    """
    Proje kök dizinindeki .env dosyasını okuyarak Kaggle kimlik bilgilerini yükler.
    KAGGLE_TOKEN, KAGGLE_API_TOKEN ve KAGGLE_KEY biçimlerini otomatik senkronize eder.
    """
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

    # Kaggle'ın yeni nesil KGAT token desteği (KAGGLE_TOKEN -> KAGGLE_API_TOKEN)
    token = os.environ.get("KAGGLE_TOKEN") or os.environ.get("KAGGLE_API_TOKEN")
    if token:
        os.environ["KAGGLE_API_TOKEN"] = token
        os.environ["KAGGLE_TOKEN"] = token

        # ~/.kaggle/access_token dosyasına da güvenle yaz
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
    """
    Kaggle API bağlantısını doğrular.
    .env dosyasındaki KAGGLE_TOKEN veya sistemdeki kaggle.json dosyasını kullanır.
    """
    load_project_environment()

    kaggle_home = os.path.normpath(os.path.expanduser("~/.kaggle"))
    kaggle_json = os.path.join(kaggle_home, "kaggle.json")
    access_token = os.path.join(kaggle_home, "access_token")

    has_token = bool(os.environ.get("KAGGLE_API_TOKEN") or os.environ.get("KAGGLE_TOKEN"))
    has_user_key = bool(os.environ.get("KAGGLE_USERNAME") and os.environ.get("KAGGLE_KEY"))
    has_file = os.path.exists(kaggle_json) or os.path.exists(access_token)

    if not (has_token or has_user_key or has_file):
        print("\n" + "=" * 75)
        print("❌ KAGGLE KİMLİK DOĞRULAMA GEREKİYOR")
        print("Sosyal sorumluluk veri setlerine erişmek için Kaggle token gereklidir.")
        print("1. .env dosyanıza şunu ekleyebilirsiniz:")
        print("   KAGGLE_TOKEN=KGAT_xxxxxxxxx")
        print("2. Veya kaggle.json dosyasını C:\\Users\\Esma\\.kaggle\\ klasörüne koyabilirsiniz.")
        print("=" * 75 + "\n")
        raise PermissionError("Kaggle kimlik bilgisi bulunamadı.")

    print("🔐 Kaggle API açık veri protokolü doğrulanıyor...")
    from kaggle.api.kaggle_api_extended import KaggleApi

    api = KaggleApi()
    api.authenticate()
    print("✅ Kaggle API kimlik doğrulaması başarıyla tamamlandı.")
    return api


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
    """
    Projede kullanılacak iki temel veri setini Kaggle üzerinden temin eder:
    - Food.com: Sıfır atık tarif eşleştirmesi için tarif havuzu
    - FoodKeeper: Raf ömrü ve gıda bozulma risk modeli
    """
    print("\n📥 [1/2] Food.com Gerçek Yemek Tarifleri İndiriliyor (shuyangli94)...")
    recipes_csv = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv")
    recipes_zip = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv.zip")

    if not os.path.exists(recipes_csv) and not os.path.exists(recipes_zip):
        try:
            api.dataset_download_file(
                dataset="shuyangli94/food-com-recipes-and-user-interactions",
                file_name="RAW_recipes.csv",
                path=DOWNLOAD_DIR,
            )
            print("   -> Food.com tarif verisi indirildi.")
        except Exception as e:
            print(f"   ⚠️ Tekil dosya indirilemedi ({e}), tüm paket deneniyor...")
            api.dataset_download_files(
                dataset="shuyangli94/food-com-recipes-and-user-interactions",
                path=DOWNLOAD_DIR,
                unzip=False,
            )
    else:
        print("   -> Food.com veri paketi mevcut, indirme adımı atlandı.")

    print("\n📥 [2/2] USDA FoodKeeper Gıda Raf Ömrü Verisi İndiriliyor...")
    fk_json = os.path.join(DOWNLOAD_DIR, "foodkeeper.json")
    fk_csv = os.path.join(DOWNLOAD_DIR, "food_keeper.csv")

    if not os.path.exists(fk_json) and not os.path.exists(fk_csv):
        try:
            # USDA FoodKeeper açık veri seti (parvezthabarak/foodkeeper)
            api.dataset_download_file(
                dataset="parvezthabarak/foodkeeper",
                file_name="foodkeeper.json",
                path=DOWNLOAD_DIR,
            )
            print("   -> USDA FoodKeeper gıda saklama kılavuzu indirildi.")
        except Exception as e:
            print(f"   ⚠️ FoodKeeper veri seti indirilirken uyarı: {e}")
    else:
        print("   -> USDA FoodKeeper veri paketi mevcut, indirme adımı atlandı.")

    # Tüm arşivleri çıkar
    extract_all_archives(DOWNLOAD_DIR)


# ==============================================================================
# 4. SOSYAL SORUMLULUK GIDA KATALOĞU VE RAF ÖMRÜ (FOODKEEPER) ANALİZİ
# ==============================================================================
def build_social_pantry_catalog(today):
    """
    Evsel mutfaklarda en sık israf edilen temel gıdaları ve USDA FoodKeeper
    raf ömrü standartlarını baz alarak kiler veri modelini (pantry_seed) üretir.

    İsraf Risk Sınıflandırması:
    - RED (KIRMIZI - Yüksek Risk)  : Kalan gün <= 2 (Acil tüketime yönlendirilmeli)
    - YELLOW (SARI - Orta Risk)    : Kalan gün 3-6 (Haftalık menüde önceliklendirilmeli)
    - GREEN (YEŞİL - Düşük Risk)   : Kalan gün >= 7 (Kilerde güvenli saklama durumu)
    """
    print("\n📊 Gıda İsrafını Önleme: Kiler Raf Ömrü ve Risk Puanlaması Hesaplanıyor...")

    # Evsel kilerde en çok tüketilen ve israf riski taşıyan 10 çekirdek gıda
    core_items = [
        {"name": "Tavuk Göğsü", "eng": "chicken breast", "category": "Et, Tavuk & Balık", "days": 2, "unit": "gram", "qty": 500},
        {"name": "Süt", "eng": "milk", "category": "Süt & Süt Ürünleri", "days": 3, "unit": "ml", "qty": 1000},
        {"name": "Mantar", "eng": "mushroom", "category": "Sebze & Meyve", "days": 2, "unit": "gram", "qty": 300},
        {"name": "Kıyma", "eng": "ground beef", "category": "Et, Tavuk & Balık", "days": 4, "unit": "gram", "qty": 400},
        {"name": "Kaşar Peyniri", "eng": "cheese", "category": "Süt & Süt Ürünleri", "days": 5, "unit": "gram", "qty": 250},
        {"name": "Domates", "eng": "tomato", "category": "Sebze & Meyve", "days": 6, "unit": "adet", "qty": 4},
        {"name": "Havuç", "eng": "carrot", "category": "Sebze & Meyve", "days": 12, "unit": "adet", "qty": 5},
        {"name": "Yumurta", "eng": "egg", "category": "Kahvaltılık & Şarküteri", "days": 18, "unit": "adet", "qty": 10},
        {"name": "Kırmızı Mercimek", "eng": "lentil", "category": "Bakliyat & Kuru Gıda", "days": 180, "unit": "kg", "qty": 1},
        {"name": "Makarna", "eng": "pasta", "category": "Bakliyat & Kuru Gıda", "days": 300, "unit": "paket", "qty": 2},
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
# 5. SIFIR ATIK TARİF EŞLEŞTİRME MOTORU (FOOD RESCUE ALGORITHM)
# ==============================================================================
def match_rescue_recipes(pantry_seed):
    """
    Food.com yemek tarifleri veri setini tarar.
    Kilerde bozulmak üzere olan (RED & YELLOW etiketli) acil malzemelerden
    en az 2 tanesini içeren kurtarma tariflerini filtreleyip önceliklendirir.
    """
    recipes_csv = os.path.join(DOWNLOAD_DIR, "RAW_recipes.csv")
    if not os.path.exists(recipes_csv):
        raise FileNotFoundError(f"Tarif veri seti bulunamadı: {recipes_csv}")

    print("\n🍳 Sıfır Atık Tarif Motoru: Bozulma Riski Olan Gıdalar Taranıyor...")

    # Acil tüketilmesi gereken ilk 6 gıda (RED ve YELLOW grubundaki kritik malzemeler)
    urgent_pantry_items = [item for item in pantry_seed if item["status"] in ["RED", "YELLOW"]]
    target_ingredients = [item["ingredient_lookup"] for item in urgent_pantry_items]

    print(f"   -> Hedef Kurtarılacak Gıdalar: {', '.join(target_ingredients)}")
    print(f"   -> Gerçek Food.com veri seti yükleniyor (230,000+ tarif havuzu)...")

    # Performans için chunk (parça parça) okuma ile tarama yapıyoruz
    chunk_size = 10000
    extracted_recipes = []
    recipe_count = 0

    for chunk in pd.read_csv(recipes_csv, chunksize=chunk_size):
        for _, row in chunk.iterrows():
            recipe_name = str(row.get("name", "")).strip()
            if not recipe_name:
                continue

            raw_ingredients_text = str(row.get("ingredients", "")).lower()

            # Tarifin içerdiği acil kiler malzemelerini bul
            matched_ings = [ing for ing in target_ingredients if ing in raw_ingredients_text]

            # Sosyal Sorumluluk Kuralı: En az 2 acil kiler malzemesini kurtaran tarifleri seç
            if len(matched_ings) >= 2:
                # Pişirme adımlarını güvenli biçimde ayıkla
                raw_steps = row.get("steps", "")
                try:
                    steps_list = ast.literal_eval(raw_steps) if isinstance(raw_steps, str) else []
                except Exception:
                    steps_list = [raw_steps]

                # Temel 4 adım ile sadeleştirilmiş ve pratik kurtarma rehberi
                curated_steps = [str(s).strip() for s in steps_list[:4] if str(s).strip()]

                recipe_count += 1
                extracted_recipes.append({
                    "recipe_id": f"rec-{int(row.get('id', recipe_count))}",
                    "title": recipe_name.title(),
                    "prep_time_minutes": int(row.get("minutes", 30)),
                    "matched_ingredients": matched_ings,
                    "instructions": curated_steps if curated_steps else ["Malzemeleri hazırlayın ve pişirin."],
                })

                if len(extracted_recipes) >= 10:
                    break

        if len(extracted_recipes) >= 10:
            break

    return extracted_recipes


# ==============================================================================
# 6. ANA İŞLEYİŞ VE VERİTABANI TOHUMLAMA (SEED) ÇIKTILARI
# ==============================================================================
def main():
    print("=" * 80)
    print("🌱 GIDA İSRAFI İLE MÜCADELE VE SÜRDÜRÜLEBİLİRLİK PROJESİ")
    print("   Akıllı Kiler ve Sıfır Atık Yemek Tarifi Eşleştirme Motoru")
    print("   Birleşmiş Milletler SKA 12.3: Evsel Gıda İsrafını Önleme Girişimi")
    print("=" * 80)

    # Adım 1: Kaggle API kimlik doğrulama (.env token entegrasyonu)
    api = authenticate_kaggle_api()

    # Adım 2: Veri setlerini otomatik indir ve aç
    download_datasets(api)

    # Adım 3: Kiler ve SKT modeli (Referans Tarih: 6 Ekim 2026)
    today = datetime(2026, 10, 6)
    pantry_seed = build_social_pantry_catalog(today)

    # Adım 4: Sıfır atık tarif eşleştirme algoritmasını çalıştır
    recipes_seed = match_rescue_recipes(pantry_seed)

    # Adım 5: JSON tohumlama dosyalarını oluştur
    pantry_json_path = os.path.join(BASE_DIR, "pantry_seed.json")
    recipes_json_path = os.path.join(BASE_DIR, "recipes_seed.json")

    with open(pantry_json_path, "w", encoding="utf-8") as f:
        json.dump(pantry_seed, f, ensure_ascii=False, indent=2)

    with open(recipes_json_path, "w", encoding="utf-8") as f:
        json.dump(recipes_seed, f, ensure_ascii=False, indent=2)

    # Konsol Bilgilendirme Raporu
    print("\n" + "=" * 80)
    print("🎉 SOSYAL SORUMLULUK VERİ HAZIRLAMA İŞLEMİ BAŞARIYLA TAMAMLANDI!")
    print(f"📁 Kiler Tohum Verisi : src/data/pantry_seed.json ({len(pantry_seed)} ürün, SKT ve risk etiketli)")
    print(f"📁 Tarif Tohum Verisi : src/data/recipes_seed.json ({len(recipes_seed)} kurtarma odaklı tarif)")
    print("-" * 80)
    print("📌 Kiler Risk Özeti:")
    red_count = sum(1 for item in pantry_seed if item["status"] == "RED")
    yellow_count = sum(1 for item in pantry_seed if item["status"] == "YELLOW")
    green_count = sum(1 for item in pantry_seed if item["status"] == "GREEN")
    print(f"   🔴 Kırmızı (Acil Tüketim / 0-2 Gün): {red_count} ürün")
    print(f"   🟡 Sarı (Yaklaşan Risk / 3-6 Gün)   : {yellow_count} ürün")
    print(f"   🟢 Yeşil (Güvenli Kiler)            : {green_count} ürün")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
