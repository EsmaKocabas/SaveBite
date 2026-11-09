const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const recipeRoutes = require('./routes/recipeRoutes');

const app = express();

// Temel Middleware'ler
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Statik Dosyalar (Arayuz Paneli: public/index.html)
app.use(express.static(path.join(__dirname, '../public')));

// API Bilgilendirme ve Sağlık Kontrolü Uç Noktası
app.get('/api', (req, res) => {
  res.status(200).json({
    project: 'SaveBite API',
    description: 'Gıda İsrafı ile Mücadele ve Sıfır Atık Tarif Motoru',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth (register, login, me)',
      products: '/api/products (CRUD & /status)',
      recipes: '/api/recipes (/search, /rescue)'
    }
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// MVC Rotalarının Kaydı
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/recipes', recipeRoutes);

// 404 Bulunamadı Yakalayıcısı
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `İstenen uç nokta bulunamadı: ${req.method} ${req.originalUrl}`
  });
});

// Global Hata Yakalama Middleware'i
app.use((err, req, res, next) => {
  console.error('Sunucu Hatası:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Sunucu içi bilinmeyen bir hata oluştu.'
  });
});

module.exports = app;

