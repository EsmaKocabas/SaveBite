const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken } = require('../middlewares/authMiddleware');

// GÖREV 3: Gıdaların SKT ve Kırmızı/Sarı/Yeşil Durumunu Dönen API Uç Noktası
// (Önemli: /:id rotasından önce tanımlanmalıdır)
router.get('/status', authenticateToken, productController.getProductStatus);

// GÖREV 2: Ürünleri CRUD API'si
router.get('/', authenticateToken, productController.getUserProducts);
router.post('/', authenticateToken, productController.createProduct);
router.put('/:id', authenticateToken, productController.updateProduct);
router.delete('/:id', authenticateToken, productController.deleteProduct);

module.exports = router;

