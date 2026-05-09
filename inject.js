/**
 * Google Sokak Görünümü pano JSON'undan Google Maps bağlantısı üretir.
 * @param {string|object} input - JSON string'i veya parse edilmiş dizi.
 * @returns {{ url: string, lat: number, lng: number }}
 */
function extractMapsLink(input) {
    // String geldiyse parse et
    const data = typeof input === 'string' ? JSON.parse(input) : input;

    // data[1][4][0][1] -> [null, null, lat, lng]
    // (Sizin verdiğiniz örneklerde konum hep bu yolda)
    const coordArray = data[1][4][0][1];
    const lat = coordArray[2];
    const lng = coordArray[3];

    if (lat == null || lng == null) {
        throw new Error('Koordinatlar bulunamadı.');
    }

    const url = `https://www.google.com/maps?q=${lat},${lng}`;
    return { url, lat, lng };
}

// ----------------------------------------------------
// ÖRNEK KULLANIM (tarayıcı konsolu veya Node.js)
// ----------------------------------------------------
const jsonString = `[ ... ]`; // buraya JSON'u yapıştırın

try {
    const result = extractMapsLink(jsonString);
    console.log('🌍 Google Maps:', result.url);
    console.log('📍 Koordinatlar:', result.lat, result.lng);
} catch (e) {
    console.error('Hata:', e.message);
}