const express = require('express');
const router = express.Router();
const recipeController = require('../controllers/recipeController');
const { authenticateToken } = require('../middlewares/authMiddleware');

// İsteğe bağlı token doğrulama middleware'i (Token varsa kullanıcıyı yakalar, yoksa misafir devam eder)
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'savebite_jwt_secret_key_2026';
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

// GÖREV 4: Açık Kaynak Dış Tarif / Kaggle Veri API Servisi Entegrasyonu
router.get('/search', recipeController.searchRecipes);

// GÖREV 5: Acil Malzemeleri Sorgulayan Sıfır Atık Tarif Algoritması & Kurtarma Listesi API Servisi
router.post('/rescue', optionalAuth, recipeController.getRescueRecipes);

module.exports = router;

