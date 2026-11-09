const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middlewares/authMiddleware');

// GÖREV 1: Kullanıcı Kayıt
router.post('/register', authController.register);

// GÖREV 1: Kullanıcı Giriş
router.post('/login', authController.login);

// Giriş Yapan Kullanıcı Profil Bilgisi
router.get('/me', authenticateToken, authController.getProfile);

module.exports = router;

