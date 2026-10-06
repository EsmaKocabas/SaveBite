/**
 * Kalan gün sayısına göre ürünün risk durumunu (RED, YELLOW, GREEN) hesaplar.
 * 
 * - RED    : <= 2 gün (Acil tüketim)
 * - YELLOW : 3-6 gün  (Haftalık planlama)
 * - GREEN  : >= 7 gün (Güvenli)
 * 
 * @param {string | Date} expirationDate - Ürünün son kullanma tarihi
 * @returns {{ daysRemaining: number, status: string, priorityScore: number, labelTr: string }}
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
    status,
    priorityScore: daysRemaining,
    labelTr
  };
}

module.exports = { calculateExpirationStatus };
