/**
 * Risk durumuna göre kurtarma puanı ağırlıkları.
 */
const SCORE_WEIGHTS = {
  RED: 50,
  YELLOW: 20,
  GREEN: 5
};

/**
 * Kilerdeki malzemeler ile tarifleri eşleştirip kurtarma puanına göre sıralar.
 * 
 * @param {Array} pantryItems - Kiler ürünleri listesi
 * @param {Array} recipes - Tarif listesi
 * @returns {Array} Puanlanmış ve sıralanmış tarifler
 */
function matchAndRankRecipes(pantryItems, recipes) {
  const pantryMap = new Map();
  pantryItems.forEach(item => {
    const key = (item.ingredient_lookup || item.name).toLowerCase().trim();
    pantryMap.set(key, {
      name: item.name,
      status: item.status,
      daysRemaining: item.days_remaining
    });
  });

  const scoredRecipes = recipes.map(recipe => {
    let rescueScore = 0;
    const rescuedItems = [];
    const missingIngredients = [];

    const ingredients = recipe.matched_ingredients || recipe.ingredients || [];

    ingredients.forEach(rawIng => {
      const ingLower = rawIng.toLowerCase().trim();
      
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

    const redCount = rescuedItems.filter(i => i.status === 'RED').length;
    const yellowCount = rescuedItems.filter(i => i.status === 'YELLOW').length;

    // Birden fazla acil malzeme varsa ekstra puan
    if (redCount >= 2) {
      rescueScore += 30;
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

  return scoredRecipes
    .filter(r => r.totalRescuedCount > 0)
    .sort((a, b) => b.rescueScore - a.rescueScore);
}

module.exports = { matchAndRankRecipes, SCORE_WEIGHTS };
