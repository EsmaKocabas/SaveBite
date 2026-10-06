/**
 * ==============================================================================
 * 🌱 Sıfır Atık Algoritmasını Doğrulama Test Scripti
 *    Kaggle Kiler ve Tarif Verileri ile Eşleştirme Testi
 * ==============================================================================
 */

const path = require('path');
const { matchAndRankRecipes } = require('./recipeMatcher');

const pantryItems = require('../data/pantry_seed.json');
const recipes = require('../data/recipes_seed.json');

console.log("================================================================================");
console.log("🔍 Sıfır Atık Gıda Kurtarma & Tarif Algoritması Doğrulanıyor...");
console.log("   BM SKA 12.3: Bozulma Riski Yüksek Malzemeler Önceliklendiriliyor...");
console.log("================================================================================\n");

const rankedResults = matchAndRankRecipes(pantryItems, recipes);

console.log(`✅ Toplam ${rankedResults.length} adet uygun kurtarma tarifi başarıyla bulundu ve puanlandı.\n`);

// En yüksek skorlu ilk 3 tarifi yazdır
rankedResults.slice(0, 3).forEach((r, idx) => {
  console.log(`🏆 [${idx + 1}] ${r.title}`);
  console.log(`   🌟 Kurtarma Skoru : ${r.rescueScore} Puan | Kurtarılan Toplam: ${r.totalRescuedCount} Malzeme`);
  console.log(`   🔴 Kırmızı Gıda   : ${r.redCount} adet | 🟡 Sarı Gıda: ${r.yellowCount} adet`);
  console.log(`   🥗 Kurtarılanlar  : ${r.rescuedItems.map(i => `${i.ingredient} (${i.status})`).join(', ')}`);
  console.log(`   ⏱️ Hazırlama Süresi: ${r.prepTimeMinutes} dakika`);
  console.log(`   📋 İlk Adım      : "${r.instructions[0]}"\n`);
});
