/**
 * ==============================================================================
 * 🌱 Sıfır Atık Gıda Kurtarma & Tarif Eşleştirme Algoritması
 *    Gıda İsrafı ile Mücadele ve Akıllı Kiler Yönetim Sistemi
 *    BM SKA 12.3: Bozulma riski yüksek gıdaları önceliklendirerek israfı önler.
 * ==============================================================================
 * 
 * Bu algoritma, evsel kiler envanterinde yer alan ve son tüketim tarihi yaklaşan
 * gıdaların bozulma risklerini (RED, YELLOW, GREEN) analiz ederek, yemek tarifleri
 * havuzundaki en uygun "Gıda Kurtarma" tariflerini puanlar ve önceliklendirir.
 */

/**
 * Puanlama Ağırlıkları
 * Kırmızı etiketli acil bir gıdayı kurtarmak en yüksek önceliğe sahiptir.
 */
const SCORE_WEIGHTS = {
  RED: 50,      // Acil Tüketim (0-2 gün) -> Yüksek Kurtarma Değeri
  YELLOW: 20,   // Haftalık Risk (3-6 gün) -> Orta Kurtarma Değeri
  GREEN: 5      // Güvenli Kiler (7+ gün)  -> Düşük Kurtarma Değeri
};

/**
 * Kiler envanterindeki riskli gıdalarla tarifleri eşleştirip kurtarma puanına göre sıralar.
 * 
 * @param {Array} pantryItems - Kilerdeki gıdaların listesi (status, ingredient_lookup içeren nesneler)
 * @param {Array} recipes - Tarif veri tabanı (matched_ingredients veya ingredients dizisi içeren tarifler)
 * @returns {Array} Puanlanmış, kurtarılan malzeme detayları eklenmiş ve azalan puana göre sıralı tarifler
 */
function matchAndRankRecipes(pantryItems, recipes) {
  // 1. Kilerdeki malzemeleri hızlı erişim için haritaya (Map) alalım
  // ingredient_lookup küçük harfe dönüştürülerek normalize edilir
  const pantryMap = new Map();
  pantryItems.forEach(item => {
    const key = (item.ingredient_lookup || item.name).toLowerCase().trim();
    pantryMap.set(key, {
      name: item.name,
      status: item.status,
      daysRemaining: item.days_remaining
    });
  });

  // 2. Her tarif için kurtarma analizi yap
  const scoredRecipes = recipes.map(recipe => {
    let rescueScore = 0;
    const rescuedItems = [];
    const missingIngredients = [];

    // Tarifin malzeme listesini normalize et
    const ingredients = recipe.matched_ingredients || recipe.ingredients || [];

    ingredients.forEach(rawIng => {
      const ingLower = rawIng.toLowerCase().trim();
      
      // Kilerde bu malzeme var mı kontrol et (kısmi eşleşme desteğiyle)
      let matchedPantryItem = null;
      for (const [pantryKey, pantryVal] of pantryMap.entries()) {
        if (ingLower.includes(pantryKey) || pantryKey.includes(ingLower)) {
          matchedPantryItem = pantryVal;
          break;
        }
      }

      if (matchedPantryItem) {
        const weight = SCORE_WEIGHTS[matchedPantryItem.status] || 0;
        rescueScore += weight;
        rescuedItems.push({
          ingredient: matchedPantryItem.name,
          status: matchedPantryItem.status,
          daysRemaining: matchedPantryItem.daysRemaining,
          scoreContribution: weight
        });
      } else {
        missingIngredients.push(rawIng);
      }
    });

    // Kurtarılan kırmızı ve sarı malzeme sayıları
    const redCount = rescuedItems.filter(i => i.status === 'RED').length;
    const yellowCount = rescuedItems.filter(i => i.status === 'YELLOW').length;

    // Bonus: Eğer bir tarif aynı anda birden fazla acil (RED) gıdayı kurtarıyorsa ekstra çarpan
    if (redCount >= 2) {
      rescueScore += 30; // Çift Acil Kurtarma Bonusu
    }

    return {
      recipeId: recipe.recipe_id || recipe.id,
      title: recipe.title,
      prepTimeMinutes: recipe.prep_time_minutes,
      instructions: recipe.instructions,
      rescueScore,
      totalRescuedCount: rescuedItems.length,
      redCount,
      yellowCount,
      rescuedItems,
      missingIngredients
    };
  });

  // 3. Sadece en az 1 malzeme kurtaranları al ve rescueScore'a göre azalan (en yüksek puan en üstte) sırala
  return scoredRecipes
    .filter(r => r.totalRescuedCount > 0)
    .sort((a, b) => b.rescueScore - a.rescueScore);
}

module.exports = { matchAndRankRecipes, SCORE_WEIGHTS };
