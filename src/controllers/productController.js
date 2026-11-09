const db = require('../db');
const { calculateExpirationStatus } = require('../modules/calculateExpiration');

/**
 * SKT ve Renk Kodu Hesaplayıcı (GÖREV 3 Kuralları)
 * - RED (Tehlikede): 0-2 gün kalmış veya geçmiş
 * - YELLOW (Yaklaşıyor): 3-7 gün kalmış
 * - GREEN (Taze): 7 günden fazla var
 */
function evaluateStatus(expirationDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(expirationDate);
  expDate.setHours(0, 0, 0, 0);

  const diffTime = expDate - today;
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status = 'GREEN';
  let statusColor = '#10B981'; // Yeşil
  let statusLabel = 'Taze (7+ Gün)';

  if (daysRemaining <= 2) {
    status = 'RED';
    statusColor = '#EF4444'; // Kırmızı
    statusLabel = daysRemaining <= 0 ? 'Süresi Doldu / Acil Kurtar' : 'Tehlikede (0-2 Gün)';
  } else if (daysRemaining <= 7) {
    status = 'YELLOW';
    statusColor = '#F59E0B'; // Sarı
    statusLabel = 'Yaklaşıyor (3-7 Gün)';
  }

  return {
    daysRemaining,
    status,
    statusColor,
    statusLabel,
    priorityScore: daysRemaining <= 2 ? 1 : (daysRemaining <= 7 ? 2 : 3)
  };
}

/**
 * GÖREV 2: Kullanıcının Kiler/Buzdolabı Ürünlerini Listele
 * GET /api/products
 */
async function getUserProducts(req, res) {
  try {
    const userId = req.user.id;

    // Kullanıcıya ait veya genel kiler ürünlerini getir
    const result = await db.query(
      `SELECT * FROM pantry_items 
       WHERE user_id = $1 OR user_id IS NULL 
       ORDER BY expiration_date ASC`,
      [userId]
    );

    // Her ürünün güncel tarih bazlı durumunu anlık hesapla
    const products = result.rows.map(item => {
      const evaluation = evaluateStatus(item.expiration_date);
      return {
        ...item,
        days_remaining: evaluation.daysRemaining,
        status: evaluation.status,
        statusColor: evaluation.statusColor,
        statusLabel: evaluation.statusLabel
      };
    });

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error('Ürün listeleme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürünler listelenirken sunucu hatası oluştu.',
      error: error.message
    });
  }
}

/**
 * GÖREV 2: Yeni Ürün Ekle
 * POST /api/products
 */
async function createProduct(req, res) {
  try {
    const userId = req.user.id;
    const {
      name,
      ingredient_lookup,
      category = 'Genel',
      quantity = 1,
      unit = 'adet',
      expiration_date
    } = req.body;

    if (!name || !expiration_date) {
      return res.status(400).json({
        success: false,
        message: 'Ürün adı ve son kullanma tarihi (expiration_date) zorunludur.'
      });
    }

    const evaluation = evaluateStatus(expiration_date);
    const lookup = (ingredient_lookup || name).toLowerCase().trim();
    const itemId = `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const insertResult = await db.query(
      `INSERT INTO pantry_items (
        id, name, ingredient_lookup, category, quantity, unit,
        expiration_date, days_remaining, status, priority_score, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        itemId,
        name.trim(),
        lookup,
        category,
        quantity,
        unit,
        expiration_date,
        evaluation.daysRemaining,
        evaluation.status,
        evaluation.priorityScore,
        userId
      ]
    );

    const createdProduct = {
      ...insertResult.rows[0],
      statusColor: evaluation.statusColor,
      statusLabel: evaluation.statusLabel
    };

    return res.status(201).json({
      success: true,
      message: 'Ürün başarıyla kilere eklendi.',
      data: createdProduct
    });
  } catch (error) {
    console.error('Ürün ekleme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün eklenirken sunucu hatası oluştu.',
      error: error.message
    });
  }
}

/**
 * GÖREV 2: Ürün Güncelle
 * PUT /api/products/:id
 */
async function updateProduct(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      name,
      ingredient_lookup,
      category,
      quantity,
      unit,
      expiration_date
    } = req.body;

    // Ürünün varlığını kontrol et
    const existing = await db.query('SELECT * FROM pantry_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Güncellenecek ürün bulunamadı.'
      });
    }

    const currentItem = existing.rows[0];
    const newExpDate = expiration_date || currentItem.expiration_date;
    const evaluation = evaluateStatus(newExpDate);

    const updatedName = name !== undefined ? name.trim() : currentItem.name;
    const updatedLookup = ingredient_lookup !== undefined
      ? ingredient_lookup.toLowerCase().trim()
      : (name ? name.toLowerCase().trim() : currentItem.ingredient_lookup);
    const updatedCategory = category !== undefined ? category : currentItem.category;
    const updatedQty = quantity !== undefined ? quantity : currentItem.quantity;
    const updatedUnit = unit !== undefined ? unit : currentItem.unit;

    const updateResult = await db.query(
      `UPDATE pantry_items
       SET name = $1,
           ingredient_lookup = $2,
           category = $3,
           quantity = $4,
           unit = $5,
           expiration_date = $6,
           days_remaining = $7,
           status = $8,
           priority_score = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10
       RETURNING *`,
      [
        updatedName,
        updatedLookup,
        updatedCategory,
        updatedQty,
        updatedUnit,
        newExpDate,
        evaluation.daysRemaining,
        evaluation.status,
        evaluation.priorityScore,
        id
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Ürün başarıyla güncellendi.',
      data: {
        ...updateResult.rows[0],
        statusColor: evaluation.statusColor,
        statusLabel: evaluation.statusLabel
      }
    });
  } catch (error) {
    console.error('Ürün güncelleme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün güncellenirken sunucu hatası oluştu.',
      error: error.message
    });
  }
}

/**
 * GÖREV 2: Ürün Sil
 * DELETE /api/products/:id
 */
async function deleteProduct(req, res) {
  try {
    const { id } = req.params;

    const deleteResult = await db.query(
      'DELETE FROM pantry_items WHERE id = $1 RETURNING id',
      [id]
    );

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Silinecek ürün bulunamadı.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Ürün kilerden başarıyla silindi.',
      deletedId: id
    });
  } catch (error) {
    console.error('Ürün silme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Ürün silinirken sunucu hatası oluştu.',
      error: error.message
    });
  }
}

/**
 * GÖREV 3: Gıdaların SKT ve Kırmızı/Sarı/Yeşil Durumunu Dönen API Uç Noktası
 * GET /api/products/status
 * 
 * Dinamik olarak kalan günleri hesaplar ve renk durum kodları ekler:
 * - RED    : <= 2 gün veya geçmiş (Tehlikede / Acil)
 * - YELLOW : 3-7 gün (Yaklaşıyor)
 * - GREEN  : > 7 gün (Taze)
 */
async function getProductStatus(req, res) {
  try {
    const userId = req.user ? req.user.id : null;
    const { status: filterStatus } = req.query; // Opsiyonel: ?status=RED veya ?status=YELLOW

    let queryText = 'SELECT * FROM pantry_items';
    const params = [];

    if (userId) {
      queryText += ' WHERE user_id = $1 OR user_id IS NULL';
      params.push(userId);
    }

    queryText += ' ORDER BY expiration_date ASC';

    const result = await db.query(queryText, params);

    let redCount = 0;
    let yellowCount = 0;
    let greenCount = 0;

    const evaluatedProducts = result.rows.map(item => {
      const evaluation = evaluateStatus(item.expiration_date);

      if (evaluation.status === 'RED') redCount++;
      else if (evaluation.status === 'YELLOW') yellowCount++;
      else greenCount++;

      return {
        id: item.id,
        name: item.name,
        ingredient_lookup: item.ingredient_lookup,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        expiration_date: item.expiration_date,
        days_remaining: evaluation.daysRemaining,
        status: evaluation.status,
        status_color: evaluation.statusColor,
        status_label: evaluation.statusLabel,
        priority_score: evaluation.priorityScore
      };
    });

    // İsteğe bağlı filtreleme
    const filteredProducts = filterStatus
      ? evaluatedProducts.filter(p => p.status.toUpperCase() === filterStatus.toUpperCase())
      : evaluatedProducts;

    return res.status(200).json({
      success: true,
      summary: {
        total: evaluatedProducts.length,
        red_critical: redCount,
        yellow_warning: yellowCount,
        green_safe: greenCount
      },
      data: filteredProducts
    });
  } catch (error) {
    console.error('SKT durum listeleme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Gıda SKT durumları hesaplanırken hata oluştu.',
      error: error.message
    });
  }
}

module.exports = {
  getUserProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStatus,
  evaluateStatus
};

