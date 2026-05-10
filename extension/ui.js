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
        #og-auto-row {
            display: flex;
            align-items: center;
            gap: 8px;
            border-top: 1px solid #1e2240;
            padding-top: 10px;
            margin-top: 2px;
        }
        #og-auto-toggle {
            appearance: none;
            width: 34px;
            height: 18px;
            background: #2a2a45;
            border-radius: 9px;
            position: relative;
            cursor: pointer;
            transition: background .2s;
            flex-shrink: 0;
            border: 1px solid #4285f4;
        }
        #og-auto-toggle:checked {
            background: #4285f4;
        }
        #og-auto-toggle::after {
            content: '';
            position: absolute;
            width: 12px; height: 12px;
            background: #fff;
            border-radius: 50%;
            top: 2px; left: 2px;
            transition: left .2s;
        }
        #og-auto-toggle:checked::after {
            left: 18px;
        }
        #og-auto-label {
            font-size: 12px;
            color: #9ab4f0;
            font-weight: 600;
            cursor: pointer;
            flex: 1;
        }
        #og-auto-status {
            font-size: 10px;
            color: #56d364;
            font-family: 'Consolas', monospace;
            min-height: 14px;
        }
        #og-delays {
            display: flex;
            flex-direction: column;
            gap: 6px;
            border-top: 1px solid #1e2240;
            padding-top: 10px;
        }
        .og-delay-row {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .og-delay-row label {
            font-size: 10px;
            color: #788;
            width: 82px;
            flex-shrink: 0;
        }
        .og-delay-input {
            width: 48px;
            background: #1a1a2e;
            border: 1px solid #2e3460;
            border-radius: 5px;
            color: #9ab4f0;
            font-size: 11px;
            padding: 3px 5px;
            text-align: center;
            user-select: text;
        }
        .og-delay-input:focus {
            outline: none;
            border-color: #4285f4;
        }
        .og-delay-sep {
            font-size: 10px;
            color: #555;
        }
        #og-mode-row {
            display: flex;
            gap: 6px;
            border-top: 1px solid #1e2240;
            padding-top: 10px;
        }
        .og-mode-btn {
            flex: 1;
            background: #1a1a2e;
            border: 1px solid #2e3460;
            border-radius: 7px;
            color: #788;
            font-size: 11px;
            font-weight: 600;
            padding: 5px 4px;
            cursor: pointer;
            transition: all .15s;
        }
        .og-mode-btn.active {
            background: #4285f4;
            border-color: #4285f4;
            color: #fff;
        }
        #og-panel-xp {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-top: 8px;
        }
        #og-xp-token {
            width: 100%;
            background: #1a1a2e;
            border: 1px solid #2e3460;
            border-radius: 5px;
            color: #9ab4f0;
            font-size: 10px;
            padding: 4px 6px;
            resize: vertical;
            min-height: 44px;
            font-family: 'Consolas', monospace;
            box-sizing: border-box;
            user-select: text;
        }
        #og-xp-token:focus { outline: none; border-color: #4285f4; }
        #og-xp-start {
            background: #56d364;
            color: #0f0f1a;
            border: none;
            border-radius: 7px;
            padding: 7px;
            font-weight: 700;
            font-size: 12px;
            cursor: pointer;
            transition: filter .15s;
        }
        #og-xp-start.running { background: #f66; color: #fff; }
        #og-xp-start:hover { filter: brightness(1.1); }
        #og-panel-elo {
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-top: 8px;
        }
        #og-elo-status {
            font-size: 10px;
            color: #56d364;
            font-family: 'Consolas', monospace;
            min-height: 14px;
        }
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
            <div id="og-mode-row">
                <button class="og-mode-btn active" data-mode="auto">🤖 Oto-Oyun</button>
                <button class="og-mode-btn" data-mode="duel">⚔️ Duello</button>
                <button class="og-mode-btn" data-mode="xp">⚡ XP Farm</button>
                <button class="og-mode-btn" data-mode="elo">🏆 ELO</button>
            </div>
            <div id="og-panel-auto">
                <div id="og-auto-row">
                    <input type="checkbox" id="og-auto-toggle">
                    <label id="og-auto-label" for="og-auto-toggle">Aktif</label>
                </div>
                <div id="og-delays">
                    <div class="og-delay-row">
                        <label>🖱️ Guess (sn)</label>
                        <input class="og-delay-input" id="og-g-min" type="number" min="0.5" max="30" step="0.5" value="2.5">
                        <span class="og-delay-sep">–</span>
                        <input class="og-delay-input" id="og-g-max" type="number" min="0.5" max="30" step="0.5" value="6.0">
                    </div>
                    <div class="og-delay-row">
                        <label>▶️ Continue (sn)</label>
                        <input class="og-delay-input" id="og-c-min" type="number" min="0.5" max="30" step="0.5" value="3.0">
                        <span class="og-delay-sep">–</span>
                        <input class="og-delay-input" id="og-c-max" type="number" min="0.5" max="30" step="0.5" value="6.5">
                    </div>
                </div>
            </div>
            <div id="og-panel-duel" style="display:none">
                <div id="og-duel-auto-row" style="display:flex;align-items:center;gap:8px;padding-top:8px;">
                    <input type="checkbox" id="og-duel-toggle">
                    <label id="og-duel-label" for="og-duel-toggle" style="font-size:12px;color:#9ab4f0;font-weight:600;cursor:pointer;flex:1">Otomatik Oyna</label>
                </div>
                <div style="font-size:10px;color:#788;margin-top:6px;line-height:1.5">
                    Duello odasına girilince pin atıp Guess'e basar, sonra Play again ile döngü devam eder.
                </div>
            </div>
            <div id="og-panel-xp">
                <div class="og-delay-row" style="flex-direction:column;align-items:flex-start;gap:3px;">
                    <label style="width:auto;color:#9ab4f0;font-size:11px;">Bearer Token</label>
                    <textarea id="og-xp-token" rows="2" placeholder="eyJhbGci…"></textarea>
                </div>
                <div class="og-delay-row">
                    <label>Kullanıcı ID</label>
                    <input class="og-delay-input" id="og-xp-userid" type="number" placeholder="2730639" style="width:90px;">
                </div>
                <div class="og-delay-row">
                    <label>Aralık (sn)</label>
                    <input class="og-delay-input" id="og-xp-interval" type="number" min="1" max="60" step="0.5" value="5">
                </div>
                <button id="og-xp-start">▶ Başlat</button>
            </div>
            <div id="og-panel-elo" style="display:none">
                <div style="display:flex;align-items:center;gap:8px;">
                    <input type="checkbox" id="og-elo-toggle">
                    <label for="og-elo-toggle" style="font-size:12px;color:#9ab4f0;font-weight:600;cursor:pointer;flex:1">WS ile Otomatik Kazan</label>
                </div>
                <div id="og-elo-status"></div>
                <div style="font-size:10px;color:#788;line-height:1.5;">
                    Duello odasına gir, her tur başında tam koordinatı WebSocket üzerinden otomatik gönderir. Rakibinin token'ına gerek yok.
                </div>
            </div>
            <div id="og-auto-status"></div>
        `;

        document.body.appendChild(card);

        document.getElementById('og-close').addEventListener('click', () => {
            card.style.display = 'none';
        });

        document.getElementById('og-auto-toggle').addEventListener('change', function () {
            if (typeof window.toggleAutoPlay === 'function') {
                window.toggleAutoPlay(this.checked);
                // Toggle açılırken zaten bir konum varsa hemen başlat
                if (this.checked && currentLat !== null) {
                    window.onPinPlaced(currentLat, currentLng);
                }
            }
            chrome.storage.local.set({ ogAutoEnabled: this.checked });
        });

        // Gecikme inputları — storage'a kaydet + window.ogDelays güncelle
        ['og-g-min','og-g-max','og-c-min','og-c-max'].forEach(id => {
            document.getElementById(id).addEventListener('change', saveDelays);
        });

        // Duello toggle
        document.getElementById('og-duel-toggle').addEventListener('change', function () {
            if (typeof window.toggleAutoPlay === 'function') window.toggleAutoPlay(this.checked, 'duel');
            chrome.storage.local.set({ ogDuelEnabled: this.checked });
        });

        // ELO Farm toggle
        document.getElementById('og-elo-toggle').addEventListener('change', function () {
            window.dispatchEvent(new CustomEvent('og-elofarm', { detail: { enabled: this.checked } }));
            chrome.storage.local.set({ ogEloEnabled: this.checked });
        });

        // ELO Farm durum güncellemesi (map-main.js MAIN world'den gelir)
        window.addEventListener('og-elofarm-status', function (e) {
            const el = document.getElementById('og-elo-status');
            if (el) el.textContent = e.detail.text;
            window.setAutoStatus(e.detail.text);
        });

        // Mod seçici
        function switchMode(mode) {
            card.querySelectorAll('.og-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            document.getElementById('og-panel-auto').style.display = mode === 'auto' ? '' : 'none';
            document.getElementById('og-panel-duel').style.display = mode === 'duel' ? '' : 'none';
            document.getElementById('og-panel-xp').style.display   = mode === 'xp'   ? '' : 'none';
            document.getElementById('og-panel-elo').style.display  = mode === 'elo'  ? '' : 'none';
            chrome.storage.local.set({ ogMode: mode });

            if (mode !== 'auto') {
                const t = document.getElementById('og-auto-toggle');
                if (t && t.checked) { t.checked = false; if (typeof window.toggleAutoPlay === 'function') window.toggleAutoPlay(false); }
            }
            if (mode !== 'duel') {
                const t = document.getElementById('og-duel-toggle');
                if (t && t.checked) { t.checked = false; if (typeof window.toggleAutoPlay === 'function') window.toggleAutoPlay(false); }
            }
            if (mode !== 'elo') {
                const t = document.getElementById('og-elo-toggle');
                if (t && t.checked) { t.checked = false; window.dispatchEvent(new CustomEvent('og-elofarm', { detail: { enabled: false } })); }
            }
            if (mode !== 'xp' && typeof window.isXPFarmRunning === 'function' && window.isXPFarmRunning()) {
                window.stopXPFarm();
                const s = document.getElementById('og-xp-start');
                if (s) { s.textContent = '▶ Başlat'; s.classList.remove('running'); }
            }
        }

        card.querySelectorAll('.og-mode-btn').forEach(btn => {
            btn.addEventListener('click', function () { switchMode(this.dataset.mode); });
        });

        // Duello URL'sindeyse otomatik ELO sekmesine geç ve toggle'ı aç
        if (location.pathname.includes('/duel') || location.href.includes('/duel')) {
            switchMode('elo');
            const t = document.getElementById('og-elo-toggle');
            if (t && !t.checked) {
                t.checked = true;
                window.dispatchEvent(new CustomEvent('og-elofarm', { detail: { enabled: true } }));
            }
        }

        // XP Farm başlat / durdur
        document.getElementById('og-xp-start').addEventListener('click', function () {
            if (typeof window.isXPFarmRunning === 'function' && window.isXPFarmRunning()) {
                window.stopXPFarm();
                this.textContent = '▶ Başlat';
                this.classList.remove('running');
            } else {
                const token    = (document.getElementById('og-xp-token').value || localStorage.getItem('bearer') || '').trim();
                const userId   = (document.getElementById('og-xp-userid').value || localStorage.getItem('id') || '').trim();
                const interval = parseFloat(document.getElementById('og-xp-interval').value) || 5;
                if (!token || !userId) { window.setAutoStatus('⚠️ Token ve Kullanıcı ID gerekli'); return; }
                saveXPSettings();
                this.textContent = '⏹ Durdur';
                this.classList.add('running');
                if (typeof window.startXPFarm === 'function') {
                    window.startXPFarm({ token, userId, intervalMs: interval * 1000, xpPerReq: 10000 });
                }
            }
        });

        ['og-xp-token','og-xp-userid','og-xp-interval'].forEach(id => {
            document.getElementById(id).addEventListener('change', saveXPSettings);
        });

        // Token alanına odaklanınca localStorage'dan taze token'ı çek
        document.getElementById('og-xp-token').addEventListener('focus', function () {
            const lsToken = localStorage.getItem('bearer');
            if (lsToken) this.value = lsToken;
        });

        // userId alanına odaklanınca localStorage'dan taze id'yi çek
        document.getElementById('og-xp-userid').addEventListener('focus', function () {
            const lsId = localStorage.getItem('id');
            if (lsId) this.value = lsId;
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

        // Kayıtlı konumu yükle
        chrome.storage.local.get('ogCardPos', function (data) {
            if (data.ogCardPos) {
                card.style.right  = 'auto';
                card.style.bottom = 'auto';
                card.style.top    = data.ogCardPos.top;
                card.style.left   = data.ogCardPos.left;
            }
        });
        loadFromStorage();
    }

    function saveXPSettings() {
        const token    = (document.getElementById('og-xp-token')    || {value:''}).value.trim();
        const userId   = (document.getElementById('og-xp-userid')   || {value:''}).value.trim();
        const interval = (document.getElementById('og-xp-interval') || {value:'5'}).value;
        chrome.storage.local.set({ ogXP: { token, userId, interval } });
    }

    /* ── Storage ──────────────────────────────────────── */
    function saveDelays() {
        const gMin = parseFloat(document.getElementById('og-g-min').value) || 2.5;
        const gMax = parseFloat(document.getElementById('og-g-max').value) || 6.0;
        const cMin = parseFloat(document.getElementById('og-c-min').value) || 3.0;
        const cMax = parseFloat(document.getElementById('og-c-max').value) || 6.5;
        window.ogDelays = { gMin: gMin * 1000, gMax: gMax * 1000, cMin: cMin * 1000, cMax: cMax * 1000 };
        chrome.storage.local.set({ ogDelays: { gMin, gMax, cMin, cMax } });
    }

    function loadFromStorage() {
        chrome.storage.local.get(['ogDelays', 'ogAutoEnabled', 'ogMode', 'ogXP'], function (data) {
            // Gecikmeleri yükle
            if (data.ogDelays) {
                const d = data.ogDelays;
                document.getElementById('og-g-min').value = d.gMin;
                document.getElementById('og-g-max').value = d.gMax;
                document.getElementById('og-c-min').value = d.cMin;
                document.getElementById('og-c-max').value = d.cMax;
            }
            saveDelays();

            // Mod — duello URL'sindeyse elo farm, değilse kaydedilen mod (elo kaydedilmişse sıfırla)
            const isDuelUrl = location.pathname.includes('/duel') || location.href.includes('/duel');
            const savedMode = data.ogMode === 'elo' ? 'auto' : (data.ogMode || 'auto');
            const mode = isDuelUrl ? 'elo' : savedMode;
            document.querySelectorAll('.og-mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
            document.getElementById('og-panel-auto').style.display = mode === 'auto' ? '' : 'none';
            document.getElementById('og-panel-duel').style.display = mode === 'duel' ? '' : 'none';
            document.getElementById('og-panel-xp').style.display   = mode === 'xp'   ? '' : 'none';
            document.getElementById('og-panel-elo').style.display  = mode === 'elo'  ? '' : 'none';

            // XP Farm ayarları
            if (data.ogXP) {
                const x = data.ogXP;
                if (x.interval) document.getElementById('og-xp-interval').value = x.interval;
            }

            // Bearer token ve userId'yi localStorage'dan otomatik oku
            const lsToken  = localStorage.getItem('bearer');
            const lsUserId = localStorage.getItem('id');
            const savedToken  = data.ogXP && data.ogXP.token;
            const savedUserId = data.ogXP && data.ogXP.userId;
            document.getElementById('og-xp-token').value  = lsToken  || savedToken  || '';
            document.getElementById('og-xp-userid').value = lsUserId || savedUserId || '';

            // Auto-play durumunu geri yükle
            if (data.ogAutoEnabled && mode === 'auto') {
                const toggle = document.getElementById('og-auto-toggle');
                toggle.checked = true;
                if (typeof window.toggleAutoPlay === 'function') {
                    window.toggleAutoPlay(true);
                    if (currentLat !== null) window.onPinPlaced(currentLat, currentLng);
                }
            }
            // Duello otomatik aktif
            if (mode === 'duel') {
                const t = document.getElementById('og-duel-toggle');
                if (t && !t.checked) {
                    t.checked = true;
                    if (typeof window.toggleAutoPlay === 'function') window.toggleAutoPlay(true, 'duel');
                }
            }
            // ELO Farm otomatik aktif (sadece duel URL'sinde)
            if (mode === 'elo' && isDuelUrl) {
                const t = document.getElementById('og-elo-toggle');
                if (t && !t.checked) {
                    t.checked = true;
                    window.dispatchEvent(new CustomEvent('og-elofarm', { detail: { enabled: true } }));
                }
            }
        });
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
            if (dragging) {
                dragging = false;
                // Konumu kaydet
                chrome.storage.local.set({
                    ogCardPos: {
                        top:  card.style.top,
                        left: card.style.left
                    }
                });
            }
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

        // Leaflet haritasına pin at (map-main.js - MAIN world)
        window.dispatchEvent(new CustomEvent('og-pin', { detail: { lat, lng } }));

        // Oto-oyun: pin düştüğünü bildir
        if (typeof window.onPinPlaced === 'function') window.onPinPlaced(lat, lng);

        // Kartı yeniden canlandır
        card.style.display = 'none';
        // eslint-disable-next-line no-unused-expressions
        card.offsetHeight;                    // reflow — animasyonu sıfırla
        card.style.display = 'flex';
    }

    /* ── Oto-oyun durum metni ─────────────────────────────── */
    window.setAutoStatus = function (text) {
        const el = document.getElementById('og-auto-status');
        if (el) el.textContent = text;
    };

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
