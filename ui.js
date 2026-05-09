/**
 * ui.js — ISOLATED world.
 * Sayfada sağ-alt köşede "Google Maps'te Aç" kartını gösterir.
 * showLocation(lat, lng) fonksiyonu interceptor.js tarafından çağrılır.
 * (Her iki dosya da aynı content-script scope'unda çalışır.)
 */
(function () {
    'use strict';

    let currentLat = null;
    let currentLng = null;

    /* ── Stil ──────────────────────────────────────────────── */
    const CSS = `
        #og-card {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            gap: 10px;
            background: #0f0f1a;
            border: 1px solid #4285f4;
            border-radius: 14px;
            padding: 14px 16px;
            min-width: 220px;
            box-shadow: 0 6px 28px rgba(66,133,244,0.35);
            font-family: 'Segoe UI', Arial, sans-serif;
            color: #fff;
            animation: og-in 0.3s cubic-bezier(.2,.8,.4,1) both;
            user-select: none;
        }
        @keyframes og-in {
            from { opacity: 0; transform: translateY(16px) scale(.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        #og-card.og-refresh {
            animation: none;
        }
        #og-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: grab;
        }
        #og-header:active {
            cursor: grabbing;
        }
        #og-title {
            font-size: 12px;
            color: #9ab4f0;
            font-weight: 600;
            letter-spacing: .4px;
            text-transform: uppercase;
        }
        #og-close {
            background: none;
            border: none;
            color: #666;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 0 2px;
            transition: color .15s;
        }
        #og-close:hover { color: #f44; }
        #og-coords {
            font-size: 11px;
            color: #788;
            font-family: 'Consolas', monospace;
        }
        #og-open {
            background: #4285f4;
            color: #fff;
            border: none;
            border-radius: 9px;
            padding: 9px 14px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 7px;
            transition: background .15s, transform .1s;
        }
        #og-open:hover  { background: #3367d6; transform: scale(1.02); }
        #og-open:active { transform: scale(.98); }
    `;

    /* ── DOM oluştur ───────────────────────────────────────── */
    function buildUI() {
        if (document.getElementById('og-card')) return;

        const style = document.createElement('style');
        style.textContent = CSS;
        document.head.appendChild(style);

        const card = document.createElement('div');
        card.id = 'og-card';

        card.innerHTML = `
            <div id="og-header">
                <span id="og-title">📍 Konum tespit edildi</span>
                <button id="og-close" title="Kapat">✕</button>
            </div>
            <div id="og-coords"></div>
            <button id="og-open">🗺️ Google Maps'te Aç</button>
        `;

        document.body.appendChild(card);

        document.getElementById('og-close').addEventListener('click', () => {
            card.style.display = 'none';
        });

        document.getElementById('og-open').addEventListener('click', () => {
            if (currentLat !== null && currentLng !== null) {
                window.open(
                    `https://www.google.com/maps?q=${currentLat},${currentLng}`,
                    '_blank',
                    'noopener'
                );
            }
        });

        makeDraggable(card);
    }

    /* ── Sürüklenebilir ────────────────────────────────────── */
    function makeDraggable(card) {
        const handle = card.querySelector('#og-header');
        let startX, startY, startLeft, startTop;
        let dragging = false;

        handle.addEventListener('mousedown', function (e) {
            // Kapat butonuna basılmışsa sürükleme başlatma
            if (e.target.closest('#og-close')) return;

            dragging = true;
            const rect = card.getBoundingClientRect();

            // bottom/right yerine top/left'e geç (sürükleme sırasında daha kolay)
            card.style.right  = 'auto';
            card.style.bottom = 'auto';
            card.style.left   = rect.left + 'px';
            card.style.top    = rect.top  + 'px';

            startX    = e.clientX;
            startY    = e.clientY;
            startLeft = rect.left;
            startTop  = rect.top;

            e.preventDefault();
        });

        document.addEventListener('mousemove', function (e) {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const newLeft = Math.max(0, Math.min(window.innerWidth  - card.offsetWidth,  startLeft + dx));
            const newTop  = Math.max(0, Math.min(window.innerHeight - card.offsetHeight, startTop  + dy));

            card.style.left = newLeft + 'px';
            card.style.top  = newTop  + 'px';
        });

        document.addEventListener('mouseup', function () {
            dragging = false;
        });
    }

    /* ── Koordinatları göster (interceptor.js tarafından çağrılır) ── */
    window.showLocation = function showLocation(lat, lng) {
        currentLat = lat;
        currentLng = lng;

        const card   = document.getElementById('og-card');
        const coords = document.getElementById('og-coords');
        if (!card || !coords) return;

        coords.textContent = `${lat.toFixed(7)},  ${lng.toFixed(7)}`;

        // Kartı yeniden canlandır
        card.style.display = 'none';
        // eslint-disable-next-line no-unused-expressions
        card.offsetHeight;                    // reflow — animasyonu sıfırla
        card.style.display = 'flex';
    }

    /* ── Başlat ────────────────────────────────────────────── */
    function init() {
        buildUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
