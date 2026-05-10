/**
 * interceptor.js — ISOLATED world, document_idle.
 *
 * #panorama-iframe src değişimlerini izler.
 * src içindeki "location=lat,lng" parametresinden koordinatları çıkarır.
 *
 * SvelteKit roundlar arasında iframe'i DOM'dan kaldırıp yeniden ekler,
 * bu yüzden bodyObserver kalıcı çalışır — disconnect etmez.
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
            if (lat === 0 && lng === 0) return null;
            return { lat, lng };
        } catch (_) {
            return null;
        }
    }

    let debounceTimer = null;

    function onSrcChange(src) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const coords = parseCoordsFromSrc(src);
            if (!coords) return;
            if (typeof window.showLocation === 'function') {
                window.showLocation(coords.lat, coords.lng);
            }
        }, 250);
    }

    // Aktif izlenen iframe referansı
    let currentIframe = null;
    let iframeObserver = null;

    function attachToIframe(iframe) {
        if (currentIframe === iframe) return; // zaten bağlı
        currentIframe = iframe;

        // Önceki observer'ı temizle
        if (iframeObserver) { iframeObserver.disconnect(); iframeObserver = null; }

        // Mevcut src'yi hemen oku
        onSrcChange(iframe.src || '');

        // src değişimlerini izle
        iframeObserver = new MutationObserver(() => onSrcChange(iframe.src || ''));
        iframeObserver.observe(iframe, { attributes: true, attributeFilter: ['src'] });
    }

    // Kalıcı body observer — iframe eklenince/değişince yakala
    const bodyObserver = new MutationObserver(() => {
        const el = document.getElementById(IFRAME_ID);
        if (el) {
            attachToIframe(el);
        } else if (currentIframe && !document.contains(currentIframe)) {
            // iframe DOM'dan kalktı — referansı sıfırla
            if (iframeObserver) { iframeObserver.disconnect(); iframeObserver = null; }
            currentIframe = null;
        }
    });

    function init() {
        const iframe = document.getElementById(IFRAME_ID);
        if (iframe) attachToIframe(iframe);

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
