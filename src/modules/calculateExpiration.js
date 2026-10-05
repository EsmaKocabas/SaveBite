/**
 * ==============================================================================
 * 🌱 ESM-02: SKT Dinamik Risk ve Öncelik Hesaplama Modülü
 *    Gıda İsrafı ile Mücadele ve Akıllı Kiler Yönetim Sistemi
 *    BM SKA 12.3: Evsel Gıda İsrafını Önleme İlkelerine Göre Düzenlenmiştir.
 * ==============================================================================
 * 
 * Bu modül, kilerdeki ürünlerin son tüketim tarihlerini (SKT) anlık olarak analiz eder,
 * kalan gün sayısına göre bozulma risk seviyesini (RED, YELLOW, GREEN) ve
 * kullanıcı dostu Türkçe durum etiketini hesaplar.
 * 
 * Risk Seviyeleri:
 * - RED    (Kırmızı) : Kalan gün <= 2 (Acil Tüketim / Sıfır Atık Müdahalesi)
 * - YELLOW (Sarı)    : Kalan gün 3-6 (Haftalık Tüketim Planlaması)
 * - GREEN  (Yeşil)   : Kalan gün >= 7 (Güvenli Saklama Durumu)
 * 
 * @param {string | Date} expirationDate - Ürünün son kullanma tarihi (YYYY-MM-DD veya Date)
 * @returns {Object} { daysRemaining, status, priorityScore, labelTr }
 */
function calculateExpirationStatus(expirationDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expDate = new Date(expirationDate);
  expDate.setHours(0, 0, 0, 0);

  const diffTime = expDate - today;
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status = "GREEN";
  let labelTr = "Güvenli Kiler";

  if (daysRemaining <= 2) {
    status = "RED";
    labelTr = daysRemaining <= 0 ? "Süresi Doldu / Acil Kurtar" : "Acil Tüketim (0-2 Gün)";
  } else if (daysRemaining <= 6) {
    status = "YELLOW";
    labelTr = "Haftalık Risk (3-6 Gün)";
  }

  return {
    daysRemaining,
    status, // "RED" | "YELLOW" | "GREEN"
    priorityScore: daysRemaining, // Artan sıralama: düşük gün sayısı en tepede
    labelTr
  };
}

module.exports = { calculateExpirationStatus };
