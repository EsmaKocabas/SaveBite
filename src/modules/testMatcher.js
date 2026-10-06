const { matchAndRankRecipes } = require('./recipeMatcher');

const pantryItems = require('../data/pantry_seed.json');
const recipes = require('../data/recipes_seed.json');

console.log("Tarif eşleştirme algoritması test ediliyor...\n");

const rankedResults = matchAndRankRecipes(pantryItems, recipes);

console.log(`Toplam ${rankedResults.length} adet uygun kurtarma tarifi bulundu.\n`);

// En yüksek puanlı ilk 3 tarifi listele
rankedResults.slice(0, 3).forEach((r, idx) => {
  console.log(`[${idx + 1}] ${r.title}`);
  console.log(`    Kurtarma Skoru : ${r.rescueScore}`);
  console.log(`    Kurtarılan Malzemeler: ${r.rescuedItems.map(i => `${i.ingredient} (${i.status})`).join(', ')}`);
  console.log(`    Hazırlama Süresi: ${r.prepTimeMinutes} dakika`);
  console.log(`    İlk Adım: "${r.instructions[0]}"\n`);
});
