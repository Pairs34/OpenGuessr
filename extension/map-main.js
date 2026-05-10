/**
 * map-main.js — MAIN world, document_start.
 *
 * Leaflet'in L.Map.prototype.initialize metodunu yamalar ve
 * #map containerına bağlanan harita örneğini yakalar.
 *
 * interceptor.js (ISOLATED world) 'og-pin' CustomEvent'ini fırlatır;
 * bu script onu alır ve Leaflet'e sentetik click eventi ateşler —
 * böylece Svelte bileşeni sanki kullanıcı o noktaya tıklamış gibi
 * tahmin pinini koyar.
 */
(function () {
    'use strict';

    let leafletMap = null;

    /* ── L.Map örneğini yakala ─────────────────────────────── */
    function patchLeaflet(L) {
        if (!L || !L.Map || !L.Map.prototype) return;
        if (L.Map.prototype.__og_patched) return;
        L.Map.prototype.__og_patched = true;

        const origInit = L.Map.prototype.initialize;
        L.Map.prototype.initialize = function (id, options) {
            origInit.call(this, id, options);
            try {
                const container = this.getContainer();
                if (container && container.id === 'map') {
                    leafletMap = this;
                }
            } catch (_) { /* getContainer henüz hazır değilse geç */ }
        };
    }

    /* ── window.L'yi izle (Leaflet henüz yüklenmemiş olabilir) */
    let _L = window.L;
    try {
        Object.defineProperty(window, 'L', {
            configurable: true,
            enumerable: true,
            get: () => _L,
            set: (val) => {
                _L = val;
                patchLeaflet(val);
            }
        });
    } catch (_) { /* defineProperty başarısız olursa polling'e düş */ }

    // Sayfa yüklendiğinde L zaten set edilmişse
    if (_L) patchLeaflet(_L);

    // Fallback: defineProperty çalışmadıysa polling ile kontrol et
    let pollCount = 0;
    const pollId = setInterval(() => {
        if (window.L && !window.L.Map.prototype.__og_patched) patchLeaflet(window.L);
        if (leafletMap || ++pollCount > 100) clearInterval(pollId);
    }, 100);

    /* ── ISOLATED world'den gelen pin isteğini dinle ──────── */
    window.addEventListener('og-pin', function (e) {
        if (!leafletMap || !_L) return;

        const { lat, lng } = e.detail;
        const latlng = _L.latLng(lat, lng);

        // moveend sonrası map state tamamen güncellenir;
        // animate:false ile setView senkron olduğundan moveend hemen tetiklenir.
        leafletMap.once('moveend', function () {
            const containerPoint = leafletMap.latLngToContainerPoint(latlng);
            const layerPoint     = leafletMap.latLngToLayerPoint(latlng);

            leafletMap.fire('click', {
                latlng,
                containerPoint,
                layerPoint,
                originalEvent: new MouseEvent('click', { bubbles: true })
            });
        });

        leafletMap.setView(latlng, 5, { animate: false });
    });
})();
