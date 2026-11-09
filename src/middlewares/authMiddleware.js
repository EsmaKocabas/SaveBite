const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'savebite_jwt_secret_key_2026';

/**
 * JWT Token Doğrulama Middleware'i
 * Korumalı API uç noktalarına yetkisiz erişimi engeller.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN"

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Yetkilendirme hatası: Giriş tokenı bulunamadı.'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Yetkilendirme hatası: Geçersiz veya süresi dolmuş token.'
      });
    }

    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };

