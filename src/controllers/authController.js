const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'savebite_jwt_secret_key_2026';

/**
 * GÖREV 1: Kullanıcı Kayıt (Register)
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen ad-soyad, e-posta ve şifre alanlarını eksiksiz doldurun.'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Şifreniz en az 6 karakter olmalıdır.'
      });
    }

    // E-posta adresi önceden kayıtlı mı kontrolü
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Bu e-posta adresi ile zaten bir hesap mevcut.'
      });
    }

    // Şifreyi bcryptjs ile hashle
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Kullanıcıyı users tablosuna ekle
    const insertResult = await db.query(
      `INSERT INTO users (full_name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, created_at`,
      [full_name.trim(), email.trim().toLowerCase(), hashedPassword]
    );

    const newUser = insertResult.rows[0];

    // JWT token üret
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, full_name: newUser.full_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Kullanıcı kaydı başarıyla oluşturuldu.',
      token,
      user: {
        id: newUser.id,
        full_name: newUser.full_name,
        email: newUser.email,
        created_at: newUser.created_at
      }
    });
  } catch (error) {
    console.error('Kayıt işlemi hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası: Kayıt işlemi gerçekleştirilemedi.',
      error: error.message
    });
  }
}

/**
 * GÖREV 1: Kullanıcı Giriş (Login)
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Lütfen e-posta ve şifrenizi girin.'
      });
    }

    // Kullanıcıyı e-posta ile sorgula
    const userResult = await db.query(
      'SELECT id, full_name, email, password FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Hatalı e-posta veya şifre girdiniz.'
      });
    }

    const user = userResult.rows[0];

    // Şifre kontrolü
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Hatalı e-posta veya şifre girdiniz.'
      });
    }

    // JWT token üret
    const token = jwt.sign(
      { id: user.id, email: user.email, full_name: user.full_name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Giriş başarılı.',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Giriş işlemi hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Sunucu hatası: Giriş yapılamadı.',
      error: error.message
    });
  }
}

/**
 * Giriş Yapan Kullanıcı Profil Bilgisi
 * GET /api/auth/me
 */
async function getProfile(req, res) {
  try {
    const userId = req.user.id;
    const userResult = await db.query(
      'SELECT id, full_name, email, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Kullanıcı bulunamadı.'
      });
    }

    return res.status(200).json({
      success: true,
      user: userResult.rows[0]
    });
  } catch (error) {
    console.error('Profil getirme hatası:', error);
    return res.status(500).json({
      success: false,
      message: 'Profil bilgisi alınırken hata oluştu.',
      error: error.message
    });
  }
}

module.exports = {
  register,
  login,
  getProfile
};

