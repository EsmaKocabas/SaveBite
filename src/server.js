const app = require('./app');
const db = require('./db');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` SaveBite API Sunucusu Calisiyor!`);
  console.log(` Port: http://localhost:${PORT}`);
  console.log(` Rotalar:`);
  console.log(`   - Auth:     POST /api/auth/register, POST /api/auth/login`);
  console.log(`   - Urunler:  /api/products, GET /api/products/status`);
  console.log(`   - Tarifler: GET /api/recipes/search, POST /api/recipes/rescue`);
  console.log(`===============================================`);
});

