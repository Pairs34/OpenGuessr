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
            gap: 12px;
            background: #0f0f1a;
            border: 1px solid #4285f4;
            border-radius: 16px;
            padding: 16px 18px;
            min-width: 260px;
            box-shadow: 0 8px 32px rgba(66,133,244,0.38);
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
            font-size: 13px;
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
            font-size: 20px;
            line-height: 1;
            padding: 0 2px;
            transition: color .15s;
        }
        #og-close:hover { color: #f44; }
        #og-coords {
            font-size: 12px;
            color: #788;
            font-family: 'Consolas', monospace;
        }
        #og-open {
            background: #4285f4;
            color: #fff;
            border: none;
            border-radius: 10px;
            padding: 10px 16px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
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
            font-size: 13px;
            color: #9ab4f0;
            font-weight: 600;
            cursor: pointer;
            flex: 1;
        }
        #og-auto-status {
            font-size: 11px;
            color: #56d364;
            font-family: 'Consolas', monospace;
            min-height: 15px;
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
            font-size: 11px;
            color: #788;
            width: 90px;
            flex-shrink: 0;
        }
        .og-delay-input {
            width: 52px;
            background: #1a1a2e;
            border: 1px solid #2e3460;
            border-radius: 6px;
            color: #9ab4f0;
            font-size: 12px;
            padding: 4px 6px;
            text-align: center;
            user-select: text;
        }
        .og-delay-input:focus {
            outline: none;
            border-color: #4285f4;
        }
        .og-delay-sep {
            font-size: 12px;
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
            border-radius: 8px;
            color: #788;
            font-size: 12px;
            font-weight: 600;
            padding: 6px 5px;
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
            border-radius: 6px;
            color: #9ab4f0;
            font-size: 11px;
            padding: 5px 7px;
            resize: vertical;
            min-height: 48px;
            font-family: 'Consolas', monospace;
            box-sizing: border-box;
            user-select: text;
        }
        #og-xp-token:focus { outline: none; border-color: #4285f4; }
        #og-xp-start {
            background: #56d364;
            color: #0f0f1a;
            border: none;
            border-radius: 8px;
            padding: 9px;
            font-weight: 700;
            font-size: 13px;
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
            font-size: 11px;
            color: #56d364;
            font-family: 'Consolas', monospace;
            min-height: 15px;
        }
        /* ── Maç geçmişi log ───────────────────────────────── */
        #og-elo-log {
            display: flex;
            flex-direction: column;
            gap: 4px;
            border-top: 1px solid #1e2240;
            padding-top: 8px;
            max-height: 200px;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: #2e3460 transparent;
        }
        #og-elo-log:empty { display: none; }
        .og-log-card {
            border-left: 3px solid #444;
            border-radius: 6px;
            background: #13132a;
            padding: 5px 8px;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .og-log-card.win       { border-left-color: #56d364; }
        .og-log-card.lose      { border-left-color: #f66; }
        .og-log-card.sacrifice { border-left-color: #f99; }
        .og-log-top {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
        }
        .og-log-top .og-log-num  { color: #788; min-width: 24px; }
        .og-log-top .og-log-icon { font-size: 12px; }
        .og-log-top .og-log-vs   { color: #ccd; flex: 1; overflow: hidden; text-overflow: ellipsis; }
        .og-log-top .og-log-elo  { color: #56d364; margin-left: auto; white-space: nowrap; }
        .og-log-top .og-log-elo.neg { color: #f66; }
        .og-log-top .og-log-elo.sac { color: #f99; }
        .og-log-bottom {
            display: flex;
            gap: 6px;
            font-size: 10px;
            color: #788;
            font-family: 'Consolas', monospace;
        }
        .og-log-bottom .og-log-score { flex: 1; }
        .og-log-bottom .og-log-cur   { color: #9ab4f0; }
        /* ── Dual-range slider (sapma) ─────────────────────── */
        #og-radius-slider-wrap {
            position: relative;
            width: 100%;
            height: 22px;
        }
        #og-radius-track-bg {
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 4px;
            background: #2a2a45;
            border-radius: 2px;
            transform: translateY(-50%);
        }
        #og-radius-track-fill {
            position: absolute;
            top: 50%;
            height: 4px;
            background: #4285f4;
            border-radius: 2px;
            transform: translateY(-50%);
        }
        #og-radius-slider-wrap input[type="range"] {
            position: absolute;
            width: 100%;
            height: 4px;
            top: 50%;
            transform: translateY(-50%);
            -webkit-appearance: none;
            appearance: none;
            background: transparent;
            pointer-events: none;
            margin: 0;
            padding: 0;
        }
        #og-radius-slider-wrap input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #4285f4;
            cursor: pointer;
            pointer-events: all;
            border: 2px solid #0f0f1a;
            box-shadow: 0 0 0 2px rgba(66,133,244,0.5);
            transition: transform .1s, background .1s;
        }
        #og-radius-slider-wrap input[type="range"]::-webkit-slider-thumb:hover {
            background: #5a97ff;
            transform: scale(1.15);
        }
        #og-radius-slider-wrap input[type="range"]::-webkit-slider-thumb:active {
            transform: scale(1.3);
        }
        #og-radius-display {
            font-size: 11px;
            color: #9ab4f0;
            font-family: 'Consolas', monospace;
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
            <div id="og-panel-xp">
                <div class="og-delay-row" style="flex-direction:column;align-items:flex-start;gap:3px;">
                    <label style="width:auto;color:#9ab4f0;font-size:12px;">Bearer Token</label>
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
                    <label for="og-elo-toggle" style="font-size:13px;color:#9ab4f0;font-weight:600;cursor:pointer;flex:1">WS ile Otomatik Kazan</label>
                </div>
                <div class="og-delay-row">
                    <label>🤔 Düşünme (sn)</label>
                    <input class="og-delay-input" id="og-elo-think-min" type="number" min="0" max="120" step="0.5" value="6.0">
                    <span class="og-delay-sep">–</span>
                    <input class="og-delay-input" id="og-elo-think-max" type="number" min="0" max="120" step="0.5" value="10.0">
                </div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:11px;color:#788;">🎯 Sapma (km)</span>
                        <span id="og-radius-display" class="og-radius-display"></span>
                    </div>
                    <div id="og-radius-slider-wrap">
                        <div id="og-radius-track-bg"></div>
                        <div id="og-radius-track-fill"></div>
                        <input type="range" id="og-elo-radius-min" min="0" max="1000" step="1" value="100">
                        <input type="range" id="og-elo-radius-max" min="0" max="1000" step="1" value="500">
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;border-top:1px solid #1e2240;padding-top:8px;">
                    <input type="checkbox" id="og-elo-sacrifice" style="accent-color:#f66;">
                    <label for="og-elo-sacrifice" style="font-size:13px;color:#f99;font-weight:600;cursor:pointer;flex:1">Her 3. maçı kurban et 💀</label>
                </div>
                <div class="og-delay-row" style="border-top:1px solid #1e2240;padding-top:8px;">
                    <label style="color:#f99;">💀 Tur kurban (0–4)</label>
                    <input class="og-delay-input" id="og-elo-sacrifice-round" type="number" min="0" max="4" step="1" value="1" style="width:40px;">
                    <span style="font-size:11px;color:#788;">/ 5 tur kaybeder</span>
                </div>
                <div id="og-elo-status"></div>
                <div id="og-elo-log"></div>
                <div style="font-size:11px;color:#788;line-height:1.6;">
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

        // Duello toggle kaldırıldı — ELO modu zaten /duel URL'sinde otomatik aktif olur.

        // ELO Farm toggle
        document.getElementById('og-elo-toggle').addEventListener('change', function () {
            dispatchEloSettings(this.checked);
            chrome.storage.local.set({ ogEloEnabled: this.checked });
        });

        // ELO düşünme süresi inputları
        ['og-elo-think-min','og-elo-think-max'].forEach(id => {
            document.getElementById(id).addEventListener('change', saveEloThink);
        });
        // ELO kurban modu checkbox
        document.getElementById('og-elo-sacrifice').addEventListener('change', function () {
            chrome.storage.local.set({ ogEloSacrifice: this.checked });
            dispatchEloSettings();
        });

        // Tur kurban sayısı
        document.getElementById('og-elo-sacrifice-round').addEventListener('change', function () {
            let v = parseInt(this.value);
            if (!isFinite(v) || v < 0) v = 0;
            if (v > 4) v = 4;
            this.value = v;
            chrome.storage.local.set({ ogEloSacrificeRound: v });
            dispatchEloSettings();
        });

        // ELO sapma slider'ları
        ['og-elo-radius-min','og-elo-radius-max'].forEach(id => {
            document.getElementById(id).addEventListener('input', function () {
                const minEl = document.getElementById('og-elo-radius-min');
                const maxEl = document.getElementById('og-elo-radius-max');
                // Min, max'ı geçemesin
                if (parseInt(minEl.value) > parseInt(maxEl.value)) {
                    if (id === 'og-elo-radius-min') minEl.value = maxEl.value;
                    else maxEl.value = minEl.value;
                }
                updateRadiusSlider();
                saveEloRadius();
            });
        });

        // ELO Farm durum güncellemesi (map-main.js MAIN world'den gelir)
        window.addEventListener('og-elofarm-status', function (e) {
            const el = document.getElementById('og-elo-status');
            if (el) el.textContent = e.detail.text;
        });

        // Maç sonucu (map-main.js MAIN world'den gelir)
        window.addEventListener('og-elofarm-result', function (e) {
            const d = e.detail;
            const log = document.getElementById('og-elo-log');
            if (log) {
                log.insertBefore(buildLogCard(d), log.firstChild);
                while (log.children.length > 15) log.removeChild(log.lastChild);
            }
            // Storage'a kaydet — tüm detail nesnesini sakla
            chrome.storage.local.get('ogEloLog', function (data) {
                const history = Array.isArray(data.ogEloLog) ? data.ogEloLog : [];
                history.unshift(d);
                if (history.length > 15) history.length = 15;
                chrome.storage.local.set({ ogEloLog: history });
            });
        });

        function buildLogCard(d) {
            const isSac = !!d.isSacrifice;
            const won   = !!d.won;
            const cls   = isSac ? 'sacrifice' : (won ? 'win' : 'lose');

            // Üst satır: #N • ikon • vs isim • elo değişim
            const icon = isSac ? '💀' : (won ? '✅' : '❌');
            const vsText = isSac
                ? 'KURBAN MAÇI'
                : (d.opponentName ? `vs ${d.opponentName}` : 'vs ???');
            const eloRaw  = (d.eloChange  || '').replace(/[^\d+\-]/g, '').trim();
            const eloText = d.eloChange
                ? d.eloChange.replace(/elo/i, '').trim()
                : '';
            const eloNeg  = eloRaw.startsWith('-');

            // Alt satır: puan bilgisi + toplam elo
            const scoreParts = [];
            if (d.myPts)   scoreParts.push(`Sen: ${d.myPts}`);
            if (d.oppPts)  scoreParts.push(`Rakip: ${d.oppPts}`);
            const scoreText = scoreParts.join('  |  ');
            const curText   = d.currentElo ? `ELO: ${d.currentElo}` : '';

            const card = document.createElement('div');
            card.className = `og-log-card ${cls}`;
            card.innerHTML = `
                <div class="og-log-top">
                    <span class="og-log-num">#${d.gameNum != null ? d.gameNum : '?'}</span>
                    <span class="og-log-icon">${icon}</span>
                    <span class="og-log-vs">${vsText}</span>
                    ${eloText ? `<span class="og-log-elo${isSac ? ' sac' : eloNeg ? ' neg' : ''}">${eloText}</span>` : ''}
                </div>
                ${(scoreText || curText) ? `
                <div class="og-log-bottom">
                    ${scoreText ? `<span class="og-log-score">${scoreText}</span>` : ''}
                    ${curText   ? `<span class="og-log-cur">${curText}</span>` : ''}
                </div>` : ''}
            `;
            return card;
        }

        // Mod seçici
        function switchMode(mode) {
            card.querySelectorAll('.og-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            document.getElementById('og-panel-auto').style.display = mode === 'auto' ? '' : 'none';
            document.getElementById('og-panel-xp').style.display   = mode === 'xp'   ? '' : 'none';
            document.getElementById('og-panel-elo').style.display  = mode === 'elo'  ? '' : 'none';
            chrome.storage.local.set({ ogMode: mode });

            if (mode !== 'auto') {
                const t = document.getElementById('og-auto-toggle');
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

    function saveEloThink() {
        let tMin = parseFloat(document.getElementById('og-elo-think-min').value);
        let tMax = parseFloat(document.getElementById('og-elo-think-max').value);
        if (!isFinite(tMin) || tMin < 0) tMin = 6.0;
        if (!isFinite(tMax) || tMax < 0) tMax = 10.0;
        if (tMax < tMin) tMax = tMin;
        chrome.storage.local.set({ ogEloThink: { min: tMin, max: tMax } });
        dispatchEloSettings();
    }

    function saveEloRadius() {
        let rMin = parseFloat(document.getElementById('og-elo-radius-min').value);
        let rMax = parseFloat(document.getElementById('og-elo-radius-max').value);
        if (!isFinite(rMin) || rMin < 0) rMin = 100;
        if (!isFinite(rMax) || rMax < 0) rMax = 500;
        if (rMax < rMin) rMax = rMin;
        chrome.storage.local.set({ ogEloRadius: { min: rMin, max: rMax } });
        dispatchEloSettings();
    }

    function updateRadiusSlider() {
        const minEl  = document.getElementById('og-elo-radius-min');
        const maxEl  = document.getElementById('og-elo-radius-max');
        const fill   = document.getElementById('og-radius-track-fill');
        const disp   = document.getElementById('og-radius-display');
        if (!minEl || !maxEl || !fill || !disp) return;
        const sliderMax = parseInt(minEl.max);
        const minVal    = parseInt(minEl.value);
        const maxVal    = parseInt(maxEl.value);
        const pctLeft   = (minVal / sliderMax) * 100;
        const pctRight  = 100 - (maxVal / sliderMax) * 100;
        fill.style.left  = pctLeft  + '%';
        fill.style.right = pctRight + '%';
        disp.textContent = minVal.toLocaleString('tr-TR') + ' – ' + maxVal.toLocaleString('tr-TR') + ' km';
        // Min baş tıklanabilir kalsın: min değer max'a yakınsaırsa min'i üste al
        minEl.style.zIndex = (minVal >= maxVal - parseInt(minEl.step)) ? '2' : '1';
        maxEl.style.zIndex = (minVal >= maxVal - parseInt(minEl.step)) ? '1' : '2';
    }

    // Ayarları MAIN world'e CustomEvent ile ilet (window.* cross-world'de çalışmaz)
    function dispatchEloSettings(enabled) {
        const tMin = parseFloat(document.getElementById('og-elo-think-min').value) || 6.0;
        const tMax = parseFloat(document.getElementById('og-elo-think-max').value) || 10.0;
        const rMin = parseFloat(document.getElementById('og-elo-radius-min').value) || 100;
        const rMax = parseFloat(document.getElementById('og-elo-radius-max').value) || 500;
        const srEl = document.getElementById('og-elo-sacrifice-round');
        const detail = {
            thinkMinMs:      Math.max(0, tMin) * 1000,
            thinkMaxMs:      Math.max(0, tMax) * 1000,
            radiusMinM:      Math.max(0, rMin) * 1000,
            radiusMaxM:      Math.max(0, rMax) * 1000,
            sacrificeEvery3: !!(document.getElementById('og-elo-sacrifice') || {}).checked,
            sacrificeRound:  srEl ? Math.min(4, Math.max(0, parseInt(srEl.value) || 0)) : 0,
        };
        if (enabled !== undefined) {
            detail.enabled = enabled;
            window.dispatchEvent(new CustomEvent('og-elofarm', { detail }));
        } else {
            window.dispatchEvent(new CustomEvent('og-elofarm-settings', { detail }));
        }
    }

    function loadFromStorage() {
        chrome.storage.local.get(['ogDelays', 'ogAutoEnabled', 'ogMode', 'ogXP', 'ogEloThink', 'ogEloRadius', 'ogEloSacrifice', 'ogEloSacrificeRound', 'ogEloLog'], function (data) {
            // Gecikmeleri yükle
            if (data.ogDelays) {
                const d = data.ogDelays;
                document.getElementById('og-g-min').value = d.gMin;
                document.getElementById('og-g-max').value = d.gMax;
                document.getElementById('og-c-min').value = d.cMin;
                document.getElementById('og-c-max').value = d.cMax;
            }
            saveDelays();

            // ELO düşünme süresi
            if (data.ogEloThink) {
                if (typeof data.ogEloThink.min === 'number') document.getElementById('og-elo-think-min').value = data.ogEloThink.min;
                if (typeof data.ogEloThink.max === 'number') document.getElementById('og-elo-think-max').value = data.ogEloThink.max;
            }

            // ELO sapma aralığı (metre)
            if (data.ogEloRadius) {
                // Yeni format: { min, max }
                // Eski metre değeriyse (>1000) km'ye çevir, yeni km değeriyse direkt yükle
                if (typeof data.ogEloRadius.min === 'number') {
                    const v = data.ogEloRadius.min;
                    document.getElementById('og-elo-radius-min').value = Math.min(v > 1000 ? Math.round(v / 1000) : v, 1000);
                }
                if (typeof data.ogEloRadius.max === 'number') {
                    const v = data.ogEloRadius.max;
                    document.getElementById('og-elo-radius-max').value = Math.min(v > 1000 ? Math.round(v / 1000) : v, 1000);
                }
                // Eski format: tek sayı ise her iki alana uygula
            } else if (typeof data.ogEloRadius === 'number') {
                const v = data.ogEloRadius;
                const km = Math.min(v > 1000 ? Math.round(v / 1000) : v, 1000);
                document.getElementById('og-elo-radius-min').value = km;
                document.getElementById('og-elo-radius-max').value = km;
            }
            updateRadiusSlider();
            // ELO kurban modu
            if (data.ogEloSacrifice !== undefined) {
                const el = document.getElementById('og-elo-sacrifice');
                if (el) el.checked = !!data.ogEloSacrifice;
            }
            // Tur kurban sayısı
            if (data.ogEloSacrificeRound !== undefined) {
                const el = document.getElementById('og-elo-sacrifice-round');
                if (el) el.value = Math.min(4, Math.max(0, parseInt(data.ogEloSacrificeRound) || 0));
            }
            // Maç geçmişi log'unu yükle
            if (Array.isArray(data.ogEloLog) && data.ogEloLog.length) {
                const log = document.getElementById('og-elo-log');
                if (log) {
                    data.ogEloLog.forEach(function (entry) {
                        // Yeni format: tüm detail nesnesi saklanıyor
                        // Eski format: { line, cls, title } — geriye dönük uyumluluk
                        if (entry && typeof entry.gameNum !== 'undefined') {
                            log.appendChild(buildLogCard(entry));
                        } else if (entry && entry.line) {
                            const row = document.createElement('div');
                            row.className = `og-log-card ${entry.cls || ''}`;
                            row.innerHTML = `<div class="og-log-top"><span class="og-log-vs">${entry.line}</span></div>`;
                            log.appendChild(row);
                        }
                    });
                }
            }
            // Kaydedilen ayarları MAIN world'e ilet (window.* cross-world'de çalışmaz)
            dispatchEloSettings();

            // Mod — duello URL'sindeyse elo farm, değilse kaydedilen mod (elo kaydedilmişse sıfırla)
            const isDuelUrl = location.pathname.includes('/duel') || location.href.includes('/duel');
            const savedMode = (data.ogMode === 'elo' || data.ogMode === 'duel') ? 'auto' : (data.ogMode || 'auto');
            const mode = isDuelUrl ? 'elo' : savedMode;
            document.querySelectorAll('.og-mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
            document.getElementById('og-panel-auto').style.display = mode === 'auto' ? '' : 'none';
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
            // Duello otomatik aktif — KALDIRILDI
            // ELO Farm otomatik aktif (sadece duel URL'sinde)
            if (mode === 'elo' && isDuelUrl) {
                const t = document.getElementById('og-elo-toggle');
                if (t && !t.checked) {
                    t.checked = true;
                    dispatchEloSettings(true);
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
