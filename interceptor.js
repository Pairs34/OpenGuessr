/**
 * interceptor.js — ISOLATED world, document_start.
 *
 * #panorama-iframe src değişimlerini MutationObserver ile izler.
 * src içindeki "location=lat,lng" parametresinden koordinatları
 * çıkarır ve doğrudan showLocation() çağırır (ui.js ile ortak scope).
 *
 * Neden bu yaklaşım?
 *   GetMetadata isteği openguessr.com'un kendi fetch'iyle değil,
 *   Google Maps <iframe>'inin içinden yapılıyor. O iframe'e erişemeyiz.
 *   Ama koordinatlar zaten iframe src'de "location=lat,lng" olarak geliyor.
 */
(function () {
    'use strict';

    const IFRAME_ID = 'panorama-iframe';

    function parseCoordsFromSrc(src) {
        try {
            const url = new URL(src);
            const loc = url.searchParams.get('location');
            if (!loc) return null;
            const parts = loc.split(',');
            if (parts.length < 2) return null;
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            if (isNaN(lat) || isNaN(lng)) return null;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
            // Svelte placeholder'ı — gerçek konum değil
            if (lat === 0 && lng === 0) return null;
            return { lat, lng };
        } catch (_) {
            return null;
        }
    }

    let debounceTimer = null;

    function onSrcChange(src) {
        // Svelte src'yi hızlıca birkaç kez değiştirebilir; son değeri bekle
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const coords = parseCoordsFromSrc(src);
            if (!coords) return;

            // UI kartını güncelle (ui.js - ISOLATED world)
            window.showLocation(coords.lat, coords.lng);

            // Leaflet haritasına pin at (map-main.js - MAIN world)
            window.dispatchEvent(new CustomEvent('og-pin', {
                detail: { lat: coords.lat, lng: coords.lng }
            }));
        }, 250);
    }

    function handleIframe(iframe) {
        // İlk yüklemede src'yi oku
        onSrcChange(iframe.src || '');

        // Sonraki tur değişimlerini izle
        const observer = new MutationObserver(() => {
            onSrcChange(iframe.src || '');
        });

        observer.observe(iframe, { attributes: true, attributeFilter: ['src'] });
    }

    function init() {
        const iframe = document.getElementById(IFRAME_ID);
        if (iframe) {
            handleIframe(iframe);
            return;
        }

        // iframe henüz DOM'da yoksa bekle
        const bodyObserver = new MutationObserver(() => {
            const el = document.getElementById(IFRAME_ID);
            if (el) {
                bodyObserver.disconnect();
                handleIframe(el);
            }
        });

        bodyObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
