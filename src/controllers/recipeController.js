const db = require('../db');
const { evaluateStatus } = require('./productController');

/**
 * GÖREV 4: Kaggle Tarif Verilerini Arama ve Listeleme Servisi
 * GET /api/recipes/search
 * 
 * Query Parametreleri:
 * - ingredient: Malzeme adına göre arama (ILIKE)
 * - q: Genel başlık veya malzeme araması (ILIKE)
 * - limit: Sayfa başı kayıt (varsayılan: 20)
 * - page: Sayfa numarası (varsayılan: 1)
 */
async function searchRecipes(req, res) {
  try {
    const { ingredient, q, limit = 20, page = 1 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = [];
    let params = [];
    let paramIndex = 1;

    // Belirli bir malzeme filtresi
    if (ingredient) {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM recipe_ingredients ri 
        WHERE ri.recipe_id = r.recipe_id 
        AND ri.ingredient_name ILIKE $${paramIndex}
      )`);
      params.push(`%${ingredient.trim()}%`);
      paramIndex++;
    }

    // Genel metin araması (başlık veya malzemeler dizisi)
    if (q) {
      whereClauses.push(`(
        r.title ILIKE $${paramIndex} OR
        array_to_string(r.matched_ingredients, ' ') ILIKE $${paramIndex}
      )`);
      params.push(`%${q.trim()}%`);
      paramIndex++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Toplam sayıyı bul
    const countQuery = `SELECT COUNT(*) FROM recipes r ${whereSql}`;
    const countResult = await db.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count, 10);

    // Verileri getir
    const dataQuery = `
      SELECT 
        r.recipe_id,
        r.title,
        r.prep_time_minutes,
        r.matched_ingredients,
        r.instructions,
        r.created_at,
        (
          SELECT json_agg(ri.ingredient_name)
          FROM recipe_ingredients ri
          WHERE ri.recipe_id = r.recipe_id
        ) as detailed_ingredients
      FROM recipes r
      ${whereSql}
      ORDER BY r.title ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataParams = [...params, limitNum, offset];
    const result = await db.query(dataQuery, dataParams);

    return res.status(200).json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      },
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Tarif arama hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Tarifler aranırken sunucu hatası oluştu.',
      error: error.message
    });
  }
}

/**
 * GÖREV 5: Acil Malzemeleri Sorgulayan Sıfır Atık Tarif Algoritması & Kurtarma Listesi
 * POST /api/recipes/rescue
 * 
 * 1. Kullanıcının kilerindeki RED ve YELLOW durumundaki gıdaları sorgular.
 * 2. Sıfır Atık Algoritması ile en yüksek gıda kurtarma potansiyeli olan tarifleri puanlar:
 *    - RED malzeme kurtarma: +50 Puan
 *    - YELLOW malzeme kurtarma: +20 Puan
 *    - GREEN malzeme kullanımı: +5 Puan
 *    - 2 veya daha fazla RED malzeme kurtaran tariflere +30 Bonus Puan
 * 3. Kurtarılabilecek gıda miktarlarını (gram / ml / adet) hesaplayarak döner.
 */
async function getRescueRecipes(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    const { maxResults = 10, includeYellowOnly = false } = req.body;

    // 1. Kullanıcının kiler ürünlerini çek
    let pantryQuery = 'SELECT * FROM pantry_items';
    const pantryParams = [];
    if (userId) {
      pantryQuery += ' WHERE user_id = $1 OR user_id IS NULL';
      pantryParams.push(userId);
    }
    const pantryResult = await db.query(pantryQuery, pantryParams);

    if (pantryResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Kilerinizde kurtarılacak ürün bulunamadı.',
        rescuedItemsSummary: [],
        recipes: []
      });
    }

    // 2. Kiler ürünlerini güncel tarihe göre anlık risk durumuna göre değerlendir
    const evaluatedPantry = pantryResult.rows.map(item => {
      const evalStatus = evaluateStatus(item.expiration_date);
      return {
        ...item,
        days_remaining: evalStatus.daysRemaining,
        status: evalStatus.status,
        statusColor: evalStatus.statusColor,
        statusLabel: evalStatus.statusLabel
      };
    });

    // Acil tüketilmesi gereken (RED & YELLOW) ürünleri filtrele
    const urgentItems = evaluatedPantry.filter(i => 
      includeYellowOnly 
        ? (i.status === 'YELLOW') 
        : (i.status === 'RED' || i.status === 'YELLOW')
    );

    if (urgentItems.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Harika haber! Şu an bozulma riski olan (Kırmızı veya Sarı) acil ürününüz bulunmuyor.',
        summary: {
          totalPantryItems: evaluatedPantry.length,
          redCount: 0,
          yellowCount: 0
        },
        recipes: []
      });
    }

    // 3. Veritabanındaki tüm Kaggle tariflerini çek
    const recipesResult = await db.query(`
      SELECT 
        r.recipe_id,
        r.title,
        r.prep_time_minutes,
        r.matched_ingredients,
        r.instructions
      FROM recipes r
    `);
    const allRecipes = recipesResult.rows;

    // 4. Kiler ürün haritası oluştur (hızlı eşleştirme için)
    const pantryMap = new Map();
    evaluatedPantry.forEach(item => {
      const key = (item.ingredient_lookup || item.name).toLowerCase().trim();
      pantryMap.set(key, {
        id: item.id,
        name: item.name,
        status: item.status,
        daysRemaining: item.days_remaining,
        quantity: parseFloat(item.quantity) || 1,
        unit: item.unit
      });
    });

    const SCORE_WEIGHTS = {
      RED: 50,
      YELLOW: 20,
      GREEN: 5
    };

    // 5. Sıfır Atık Algoritmasını çalıştır ve tarifleri puanla
    const scoredRecipes = allRecipes.map(recipe => {
      let rescueScore = 0;
      const rescuedItems = [];
      const missingIngredients = [];

      const recipeIngredients = recipe.matched_ingredients || [];

      recipeIngredients.forEach(rawIng => {
        const ingLower = rawIng.toLowerCase().trim();
        let matchedPantry = null;

        for (const [pantryKey, pantryVal] of pantryMap.entries()) {
          if (ingLower.includes(pantryKey) || pantryKey.includes(ingLower)) {
            matchedPantry = pantryVal;
            break;
          }
        }

        if (matchedPantry) {
          const weight = SCORE_WEIGHTS[matchedPantry.status] || 0;
          rescueScore += weight;
          rescuedItems.push({
            pantryItemId: matchedPantry.id,
            ingredient: matchedPantry.name,
            status: matchedPantry.status,
            daysRemaining: matchedPantry.daysRemaining,
            rescuedQuantity: matchedPantry.quantity,
            unit: matchedPantry.unit,
            scoreContribution: weight
          });
        } else {
          missingIngredients.push(rawIng);
        }
      });

      const redCount = rescuedItems.filter(i => i.status === 'RED').length;
      const yellowCount = rescuedItems.filter(i => i.status === 'YELLOW').length;

      // 2 veya daha fazla acil (RED) malzeme kurtarılıyorsa +30 Bonus Puan
      if (redCount >= 2) {
        rescueScore += 30;
      }

      // Toplam kurtarılan tahmini miktar özeti
      let totalGram = 0;
      let totalAdet = 0;
      let totalMl = 0;

      rescuedItems.forEach(item => {
        const u = (item.unit || '').toLowerCase();
        if (u.includes('gram') || u.includes('gr') || u.includes('g')) {
          totalGram += item.rescuedQuantity;
        } else if (u.includes('adet') || u.includes('tane')) {
          totalAdet += item.rescuedQuantity;
        } else if (u.includes('ml') || u.includes('litre') || u.includes('lt')) {
          totalMl += item.rescuedQuantity;
        }
      });

      return {
        recipeId: recipe.recipe_id,
        title: recipe.title,
        prepTimeMinutes: recipe.prep_time_minutes,
        rescueScore,
        redCount,
        yellowCount,
        totalRescuedCount: rescuedItems.length,
        rescuedAmountsSummary: {
          gram: totalGram,
          adet: totalAdet,
          ml: totalMl,
          humanReadable: [
            totalGram > 0 ? `${totalGram} gram` : null,
            totalMl > 0 ? `${totalMl} ml` : null,
            totalAdet > 0 ? `${totalAdet} adet` : null
          ].filter(Boolean).join(' + ') || `${rescuedItems.length} malzeme`
        },
        rescuedItems,
        missingIngredients,
        instructions: recipe.instructions
      };
    });

    // En az 1 acil (RED veya YELLOW) malzeme kurtaranları seç ve puana göre sırala
    const rankedRecipes = scoredRecipes
      .filter(r => (r.redCount > 0 || r.yellowCount > 0))
      .sort((a, b) => b.rescueScore - a.rescueScore)
      .slice(0, parseInt(maxResults, 10) || 10);

    return res.status(200).json({
      success: true,
      engine: 'SaveBite Zero-Waste Recipe Engine v1.0',
      urgentPantrySummary: {
        totalUrgentItems: urgentItems.length,
        redCriticalItems: urgentItems.filter(i => i.status === 'RED').map(i => ({
          name: i.name,
          quantity: `${i.quantity} ${i.unit}`,
          daysRemaining: i.days_remaining
        })),
        yellowWarningItems: urgentItems.filter(i => i.status === 'YELLOW').map(i => ({
          name: i.name,
          quantity: `${i.quantity} ${i.unit}`,
          daysRemaining: i.days_remaining
        }))
      },
      matchCount: rankedRecipes.length,
      recipes: rankedRecipes
    });
  } catch (error) {
    console.error('Sıfır atık tarif eşleştirme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Sıfır atık tarif algoritması çalıştırılırken sunucu hatası oluştu.',
      error: error.message
    });
  }
}

module.exports = {
  searchRecipes,
  getRescueRecipes
};

