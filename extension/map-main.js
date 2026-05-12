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

    /* ── Minimal MessagePack encode/decode ────────────────────────────────
     * OpenGuessr'ın kullandığı türleri destekler:
     * null, bool, int, float64, string, array, map (object)
     * ─────────────────────────────────────────────────────────────────── */
    const _mp = (function () {
        const te = new TextEncoder();
        const td = new TextDecoder();

        function decode(buffer) {
            const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
            let p = 0;
            const r  = () => b[p++];
            const u16 = () => (r() << 8) | r();
            const u32 = () => ((r() * 16777216) + (r() << 16) + (r() << 8) + r());
            const f32 = () => { const dv = new DataView(b.buffer, b.byteOffset + p, 4); p += 4; return dv.getFloat32(0, false); };
            const f64 = () => { const dv = new DataView(b.buffer, b.byteOffset + p, 8); p += 8; return dv.getFloat64(0, false); };
            const str = n => { const s = td.decode(b.subarray(p, p + n)); p += n; return s; };

            function val() {
                const c = r();
                if (c < 0x80) return c;
                if ((c & 0xf0) === 0x80) { const n = c & 0xf; const o = {}; for (let i = 0; i < n; i++) { const k = val(); o[k] = val(); } return o; }
                if ((c & 0xf0) === 0x90) { const n = c & 0xf; const a = []; for (let i = 0; i < n; i++) a.push(val()); return a; }
                if ((c & 0xe0) === 0xa0) return str(c & 0x1f);
                if (c >= 0xe0) return c - 256;
                switch (c) {
                    case 0xc0: return null;
                    case 0xc2: return false;
                    case 0xc3: return true;
                    case 0xca: return f32();
                    case 0xcb: return f64();
                    case 0xcc: return r();
                    case 0xcd: return u16();
                    case 0xce: return u32();
                    case 0xd0: { const v = r(); return v > 127 ? v - 256 : v; }
                    case 0xd1: { const v = u16(); return v > 32767 ? v - 65536 : v; }
                    case 0xd2: { const v = u32(); return v > 2147483647 ? v - 4294967296 : v; }
                    case 0xd9: return str(r());
                    case 0xda: return str(u16());
                    case 0xdb: return str(u32());
                    case 0xdc: { const n = u16(); const a = []; for (let i = 0; i < n; i++) a.push(val()); return a; }
                    case 0xdd: { const n = u32(); const a = []; for (let i = 0; i < n; i++) a.push(val()); return a; }
                    case 0xde: { const n = u16(); const o = {}; for (let i = 0; i < n; i++) { const k = val(); o[k] = val(); } return o; }
                    case 0xdf: { const n = u32(); const o = {}; for (let i = 0; i < n; i++) { const k = val(); o[k] = val(); } return o; }
                    default: return null;
                }
            }
            return val();
        }

        function encode(v) {
            const parts = [];
            const w = b => parts.push(b instanceof Uint8Array ? b : new Uint8Array(b));
            function enc(v) {
                if (v === null || v === undefined) { w([0xc0]); return; }
                if (v === false) { w([0xc2]); return; }
                if (v === true)  { w([0xc3]); return; }
                if (typeof v === 'number') {
                    if (Number.isInteger(v)) {
                        if (v >= 0   && v < 128)        { w([v]); return; }
                        if (v >= -32 && v < 0)          { w([v + 256]); return; }
                        if (v >= 0   && v < 256)        { w([0xcc, v]); return; }
                        if (v >= 0   && v < 65536)      { w([0xcd, v >> 8, v & 0xff]); return; }
                        if (v >= 0)                     { w([0xce, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]); return; }
                        if (v >= -128)                  { w([0xd0, v & 0xff]); return; }
                        if (v >= -32768)                { w([0xd1, (v >> 8) & 0xff, v & 0xff]); return; }
                        w([0xd2, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]); return;
                    }
                    const ab = new ArrayBuffer(8);
                    new DataView(ab).setFloat64(0, v, false);
                    w([0xcb]); w(new Uint8Array(ab)); return;
                }
                if (typeof v === 'string') {
                    const bytes = te.encode(v);
                    const n = bytes.length;
                    if (n < 32)     w([0xa0 | n]);
                    else if (n < 256) w([0xd9, n]);
                    else              w([0xda, n >> 8, n & 0xff]);
                    w(bytes); return;
                }
                if (Array.isArray(v)) {
                    const n = v.length;
                    if (n < 16)  w([0x90 | n]);
                    else         w([0xdc, n >> 8, n & 0xff]);
                    v.forEach(enc); return;
                }
                if (typeof v === 'object') {
                    const keys = Object.keys(v);
                    const n = keys.length;
                    if (n < 16)  w([0x80 | n]);
                    else         w([0xde, n >> 8, n & 0xff]);
                    keys.forEach(k => { enc(k); enc(v[k]); }); return;
                }
            }
            enc(v);
            const total = parts.reduce((s, p) => s + p.length, 0);
            const out = new Uint8Array(total);
            let off = 0;
            parts.forEach(p => { out.set(p, off); off += p.length; });
            return out.buffer;
        }

        return { encode, decode };
    })();

    /* ── WebSocket Interceptor + ELO Farm ─────────────────────────────────
     * wss://accounts.openguessr.com/socket üzerindeki frame'leri loglar.
     * ELO Farm modu aktifken: property_updated location gelince tam
     * koordinatı addGuessMarker + confirmGuess olarak otomatik gönderir.
     *
     * Etkinleştirmek:
     *   window.dispatchEvent(new CustomEvent('og-elofarm', {detail:{enabled:true}}))
     *
     * JWT loglamak için konsol filtresi: [OG-WS →]
     * ─────────────────────────────────────────────────────────────────── */
    (function hookWebSocket() {
        const OrigWS = window.WebSocket;
        if (!OrigWS) return;

        // ELO Farm state
        let eloEnabled    = false;
        let eloWs         = null;   // aktif duel WebSocket referansı
        let eloGuessing   = false;  // bu tur için guess gönderildi mi
        let eloRound      = 0;
        let eloPendingLat = null;   // timerStart'ı bekleyen lokasyon
        let eloPendingLon = null;
        let eloTimerReady = false;  // countdownActive:false geldi mi
        let eloNavigating = false;  // Exit→PlayAgain akışı sürüyor mu (çift tetiklenmeyi önler)
        let eloGameId     = 0;      // her yeni oyun/tur sıfırlanır; sendEloGuess stale kontrolü için
        let eloGameCount            = 0;      // tamamlanan oyun sayısı; her 3. oyunu kurban için
        let eloLastGameWasSacrifice = false;  // son oyun kurban mıydı? (scrapeGameResult için)

        // Ayarlar (ui.js ISOLATED world'den CustomEvent ile gelir, window.* cross-world çalışmaz)
        let eloSettings = {
            thinkMinMs:      6000,
            thinkMaxMs:      10000,
            radiusMinM:      500,
            radiusMaxM:      2000,
            sacrificeEvery3: false,
        };

        function applyEloSettings(detail) {
            if (!detail) return;
            if (typeof detail.thinkMinMs      === 'number')  eloSettings.thinkMinMs      = detail.thinkMinMs;
            if (typeof detail.thinkMaxMs      === 'number')  eloSettings.thinkMaxMs      = detail.thinkMaxMs;
            if (typeof detail.radiusMinM      === 'number')  eloSettings.radiusMinM      = detail.radiusMinM;
            if (typeof detail.radiusMaxM      === 'number')  eloSettings.radiusMaxM      = detail.radiusMaxM;
            if (typeof detail.sacrificeEvery3 === 'boolean') eloSettings.sacrificeEvery3 = detail.sacrificeEvery3;
        }

        function eloStatus(text) {
            window.dispatchEvent(new CustomEvent('og-elofarm-status', { detail: { text } }));
        }

        // Kazanma ekranı + Play again popup'ından maç sonucunu DOM'dan okur ve ui.js'e iletir.
        function scrapeGameResult() {
            const result = {
                gameNum:      eloGameCount,          // gameEnded'da zaten artırıldı
                isSacrifice:  eloLastGameWasSacrifice,
                won:          null,
                opponentName: null,
                myPts:        null,
                oppPts:       null,
                eloChange:    null,
                currentElo:   null,
            };

            // ── Kazanma/kaybetme overlay (multiplayerOverlay) ──────────────
            const titleEl = document.querySelector('.multiplayerTitle');
            if (titleEl) result.won = /won/i.test(titleEl.textContent);

            const allEntries = document.querySelectorAll('.multiplayerOverlayEntry');
            allEntries.forEach(function (entry) {
                const nameEl  = entry.querySelector('.usernameSpan');
                const scoreEl = entry.querySelector('.multiplayerEntryPlayerScore');
                if (entry.classList.contains('yourMultiplayerOverlay')) {
                    if (scoreEl) result.myPts = scoreEl.textContent.trim();
                } else {
                    if (nameEl)  result.opponentName = nameEl.textContent.trim();
                    if (scoreEl) result.oppPts = scoreEl.textContent.trim();
                }
            });

            // ── Play again popup (duelResultFlex) ──────────────────────────
            const socialHeader = document.querySelector('#socialHeader');
            if (socialHeader && result.won === null)
                result.won = /victory/i.test(socialHeader.textContent);

            const resultBoxes = document.querySelectorAll('.duelResultFlex .resultBox h2.resultText');
            resultBoxes.forEach(function (b) {
                if (/elo/i.test(b.textContent) && result.eloChange === null)
                    result.eloChange = b.textContent.trim();
            });

            const eloValEl = document.querySelector('.eloValue');
            if (eloValEl) result.currentElo = eloValEl.textContent.trim();

            window.dispatchEvent(new CustomEvent('og-elofarm-result', { detail: result }));
        }

        // Görünür ve metni eşleşen butonu bul.
        // Önce ucuz offsetParent kontrolü yapar; null gelirse (fixed/sticky için)
        // ancak o zaman getBoundingClientRect'e başvurur — layout reflow minimize.
        function findVisibleButton(textRegex, extraSelector) {
            const sel = extraSelector || 'button';
            const btns = document.querySelectorAll(sel);
            for (const b of btns) {
                if (b.disabled) continue;
                const t = (b.textContent || '').trim();
                if (!textRegex.test(t)) continue;
                // offsetParent: null → ya display:none ya da fixed/sticky
                if (b.offsetParent !== null) return b;
                // fixed/sticky pozisyonlu elemanlar için fallback
                const r = b.getBoundingClientRect();
                if (r.width > 0 || r.height > 0) return b;
            }
            return null;
        }

        // Oyun bitince: önce "Exit" butonuna bas, ardından açılan popuphoulder'daki "Play again"'e bas.
        // Eğer "Play again" popup'ı zaten açıksa (showResult handler geç kaldıysa) direkt tıkla.
        async function clickExitThenPlayAgain() {
            // 0) Play again zaten görünüyor mu? (gameEnded öncesinde popup açılmış olabilir)
            const earlyPlayAgain = findVisibleButton(/play\s*again/i, 'button.bottomButton, button.standardButton, button');
            if (earlyPlayAgain) {
                scrapeGameResult();
                earlyPlayAgain.click();
                eloStatus('🔁 Play again tıklandı (direkt)');
                eloNavigating = false;
                return;
            }

            // 1) Exit butonunu bekle ve tıkla (en fazla 20sn)
            let exitClicked = false;
            for (let i = 0; i < 80 && eloEnabled; i++) {
                // Exit butonunu ara (.roundEndButton öncelikli, fallback tüm butonlar)
                const exitBtn = findVisibleButton(/^\s*exit\s*$/i, 'button.roundEndButton, button.standardButton, button');
                if (exitBtn) {
                    exitBtn.click();
                    eloStatus('🚪 Exit tıklandı');
                    exitClicked = true;
                    break;
                }
                // Beklerken Play again çıktı mı? (race condition fallback)
                const racePA = findVisibleButton(/play\s*again/i, 'button.bottomButton, button.standardButton, button');
                if (racePA) {
                    scrapeGameResult();
                    racePA.click();
                    eloStatus('🔁 Play again tıklandı (race fallback)');
                    eloNavigating = false;
                    return;
                }
                await new Promise(r => setTimeout(r, 250));
            }
            if (!exitClicked) {
                eloStatus('⚠️ Exit butonu bulunamadı');
                eloNavigating = false;
                return;
            }

            // 2) Play again butonunu bekle ve tıkla — popupHolder içindeki buton (en fazla 30sn)
            for (let i = 0; i < 120 && eloEnabled; i++) {
                const again = findVisibleButton(/play\s*again/i, 'button.bottomButton, button.standardButton, button');
                if (again) {
                    scrapeGameResult();
                    again.click();
                    eloStatus('🔁 Play again tıklandı');
                    eloNavigating = false;
                    return;
                }
                await new Promise(r => setTimeout(r, 250));
            }
            eloStatus('⚠️ Play again butonu bulunamadı');
            eloNavigating = false;
        }

        /* ── DOM Watcher ───────────────────────────────────────────────────
         * Her 1sn'de bir sayfayı tarayarak WS mesajları gelmese bile
         * Exit / Play again / Waiting ekranlarını yakalar ve uygun aksiyonu alır.
         * Bu sayede rakip tur ortasında çıksa veya WS mesajı kaçsa bile döngü devam eder.
         * ─────────────────────────────────────────────────────────────────── */
        function startEloDomWatcher() {
            setInterval(() => {
                if (!eloEnabled) return;

                // ── Matchmaking bekleme ekranı ──────────────────────────────
                // h2.multiplayer-matchmaking-status "Waiting for players..."
                const matchmakingH2 = document.querySelector('h2.multiplayer-matchmaking-status');
                if (matchmakingH2 && matchmakingH2.offsetParent !== null) {
                    eloStatus('⏳ Rakip bekleniyor…');
                    // Tur state'ini sıfırla — yeni oyun başlamak üzere (sendEloGuess iptal)
                    eloGameId++;
                    eloGuessing   = false;
                    eloPendingLat = null;
                    eloPendingLon = null;
                    eloTimerReady = false;
                    eloNavigating = false;
                    return;
                }

                // ── Play again popup'ı ──────────────────────────────────────
                // .popupHolder içindeki "Play again" butonunu doğrudan ara.
                // offsetParent yerine getBoundingClientRect — fixed popup'lar için güvenli.
                if (!eloNavigating) {
                    const pa = findVisibleButton(/play\s*again/i, '.popupHolder button');
                    if (pa) {
                        eloNavigating = true;
                        scrapeGameResult();
                        pa.click();
                        eloStatus('🔁 Play again tıklandı (DOM watcher)');
                        return;
                    }
                }

                // ── Exit butonu (tur-sonu / oyun-sonu overlay) ──────────────
                // Rakip tur ortasında çıkarsa veya gameEnded WS mesajı kaçarsa
                if (!eloNavigating) {
                    const exitBtn = findVisibleButton(/^\s*exit\s*$/i, 'button.roundEndButton, button.standardButton');
                    if (exitBtn) {
                        // Tur state'ini sıfırla — güvenli tahmin iptal
                        eloGuessing   = false;
                        eloPendingLat = null;
                        eloPendingLon = null;
                        eloTimerReady = false;
                        eloNavigating = true;
                        eloStatus('🏁 Oyun bitti — Exit tıklandı (DOM watcher)');
                        eloRound = 0;
                        clickExitThenPlayAgain();
                    }
                }

            }, 1000);
        }
        startEloDomWatcher();

        window.addEventListener('og-elofarm', function (e) {
            eloEnabled    = !!(e.detail && e.detail.enabled);
            applyEloSettings(e.detail);
            eloGuessing   = false;
            eloPendingLat = null;
            eloPendingLon = null;
            eloTimerReady = false;
            eloNavigating = false;
            eloGameId++;  // tüm bekleyen async işlemleri iptal et
            eloRound      = 0;
            eloGameCount  = 0;  // toggle açıldığında sayacı sıfırla
            if (eloEnabled) {
                const isMatchmaking = location.pathname.includes('/multiplayer/duel');
                eloStatus(isMatchmaking ? '⏳ Rakip bekleniyor…' : '⚔️ WS dinleniyor…');
            } else {
                eloStatus('');
            }
        });

        // ui.js'den sadece ayar güncellemesi (enabled değişmedi)
        window.addEventListener('og-elofarm-settings', function (e) {
            applyEloSettings(e.detail);
        });

        async function sendEloGuess(wsSend, lat, lon) {
            if (eloGuessing) return;   // yarış koşulunu önle
            eloGuessing = true;        // delay öncesinde işaretle
            const _myGameId = ++eloGameId; // bu çağrıya ait snapshot — stale kontrolü için
            // İnsansı bekleme — UI'dan ayarlanabilir (varsayılan 6–10sn)
            const _thinkMin = Math.max(0, eloSettings.thinkMinMs);
            const _thinkMax = Math.max(_thinkMin, eloSettings.thinkMaxMs);
            const _thinkMs  = _thinkMin + Math.random() * (_thinkMax - _thinkMin);
            // Geri sayım: her 250ms'de status güncelle
            const _deadline = Date.now() + _thinkMs;
            eloStatus(`🤔 Düşünüyor… ${(_thinkMs / 1000).toFixed(1)}s`);
            const _tickId = setInterval(() => {
                // Oyun bitti ya da iptal edildiyse interval'i durdur
                if (!eloEnabled || eloGameId !== _myGameId) { clearInterval(_tickId); return; }
                const _left = Math.max(0, (_deadline - Date.now()) / 1000);
                eloStatus(`🤔 Düşünüyor… ${_left.toFixed(1)}s`);
                if (_left <= 0) clearInterval(_tickId);
            }, 250);
            await new Promise(res => setTimeout(res, _thinkMs));
            clearInterval(_tickId);
            // Oyun bitti veya yeni tur başladıysa bu tahmin iptal
            if (!eloEnabled || eloGameId !== _myGameId) {
                eloGuessing = false;
                return;
            }
            eloRound++;

            // Her 3. oyunu kurban et: tamamen rastgele uzak koordinat gönder
            let gLat, gLon;
            if (eloSettings.sacrificeEvery3 && (eloGameCount % 3 === 2)) {
                gLat = (Math.random() * 140) - 70;
                gLon = (Math.random() * 360) - 180;
                eloStatus(`💀 Tur ${eloRound}: Kurban modu — Oyun #${eloGameCount + 1}`);
            } else {
                // Sapma yarıçapı — UI'dan ayarlanabilir (min–max aralığından random, uniform daire dağılımı)
                const _rMin    = Math.max(0, eloSettings.radiusMinM);
                const _rMax    = Math.max(_rMin, eloSettings.radiusMaxM);
                const _radiusM = _rMin + Math.random() * (_rMax - _rMin);
                const _angle = Math.random() * 2 * Math.PI;
                const _dist  = Math.sqrt(Math.random()) * _radiusM;
                gLat = lat + (_dist * Math.cos(_angle)) / 111320;
                gLon = lon + (_dist * Math.sin(_angle)) / (111320 * Math.cos(lat * Math.PI / 180));
                eloStatus(`⏳ Tur ${eloRound}: ${gLat.toFixed(4)},${gLon.toFixed(4)} (~${Math.round(_dist)}m)`);
            }

            // Görsel pini offset konumuna taşı (Leaflet click → Svelte app günceller)
            window.dispatchEvent(new CustomEvent('og-pin', { detail: { lat: gLat, lng: gLon } }));

            await new Promise(res => setTimeout(res, 200 + Math.random() * 200));
            wsSend(_mp.encode({ type: 'request', request: { name: 'addGuessMarker', data: { lat: gLat, lon: gLon } } }));
            await new Promise(res => setTimeout(res, 150 + Math.random() * 250));
            wsSend(_mp.encode({ type: 'request', request: { name: 'confirmGuess', data: null } }));

            eloStatus(`✅ Tur ${eloRound}: Tahmin gönderildi`);
            eloPendingLat = null;
            eloPendingLon = null;
            eloTimerReady = false;
        }

        async function handleEloMsg(raw, wsSend) {
            let buf;
            try {
                if (raw instanceof Blob)        buf = await raw.arrayBuffer();
                else if (raw instanceof ArrayBuffer) buf = raw;
                else return;

                const msg = _mp.decode(buf);
                if (!msg || msg.type !== 'property_updated') return;

                const key   = msg.update && msg.update.key;
                const opData = msg.update && msg.update.operation && msg.update.operation.data;
                const value  = opData && opData.value;

                // 1) Lokasyonu kaydet ama henüz gönderme (timer başlamadan gönderme)
                if (key === 'location' && Array.isArray(value) && value.length >= 2) {
                    const lat = parseFloat(value[0]);
                    const lon = parseFloat(value[1]);
                    if (!isNaN(lat) && !isNaN(lon)) {
                        eloPendingLat = lat;
                        eloPendingLon = lon;
                        eloGuessing   = false; // yeni tur
                        eloTimerReady = false;
                        eloGameId++;           // önceki bekleyen sendEloGuess varsa iptal et
                        eloStatus(`📍 Lokasyon alındı, timer bekleniyor…`);
                    }
                }

                // 2) Countdown bitti → tahmin göndermeye hazır
                if (key === 'countdownActive' && value === false) {
                    eloTimerReady = true;
                    // Eğer lokasyon zaten geldiyse hemen gönder
                    if (eloPendingLat !== null && eloPendingLon !== null && !eloGuessing) {
                        sendEloGuess(wsSend, eloPendingLat, eloPendingLon);
                    }
                }

                // 3) timerStart (timestamp gelirse) → yedek tetikleyici
                if (key === 'timerStart' && value && typeof value === 'object' && value.timestamp) {
                    eloTimerReady = true;
                    if (eloPendingLat !== null && eloPendingLon !== null && !eloGuessing) {
                        sendEloGuess(wsSend, eloPendingLat, eloPendingLon);
                    }
                }

                if (key === 'showResult' && value === true) {
                    eloGuessing = false; // bir sonraki tur için hazır
                    // Tur-arası sonuç overlay'ini kapat — sadece Continue/Next butonlarına bas,
                    // "Play again" butonunu ATLA (o gameEnded handler'ı tarafından işlenir).
                    if (eloEnabled) {
                        let _tries = 0;
                        const _poll = setInterval(() => {
                            if (!eloEnabled || _tries++ > 20) { clearInterval(_poll); return; }
                            const _sels = ['.popupHolder button.bottomButton', '#nextRound', 'button.bottomButton'];
                            for (const _sel of _sels) {
                                const _btn = document.querySelector(_sel);
                                if (!_btn || _btn.offsetParent === null) continue;
                                // Son tur popup'ındaki "Play again" butonunu burada tıklama
                                if (/play\s*again/i.test(_btn.textContent)) continue;
                                _btn.click();
                                eloStatus('▶ Continue tıklandı');
                                clearInterval(_poll);
                                return;
                            }
                        }, 500);
                    }
                }

                if (key === 'gameEnded' && value === true) {
                    eloLastGameWasSacrifice = eloSettings.sacrificeEvery3 && (eloGameCount % 3 === 2);
                    eloGameCount++;  // oyun tamamlandı — sayacı artır
                    eloStatus(`🏆 Oyun bitti (${eloRound} tur, toplam: ${eloGameCount}) — Exit aranıyor…`);
                    eloRound      = 0;
                    eloGuessing   = false;
                    eloPendingLat = null;
                    eloPendingLon = null;
                    eloTimerReady = false;
                    eloGameId++;  // devam eden sendEloGuess varsa iptal et

                    // Önce Exit → ardından Play again otomasyonu
                    // DOM watcher zaten tetiklemediyse buradan başlat
                    if (eloEnabled && !eloNavigating) {
                        eloNavigating = true;
                        clickExitThenPlayAgain();
                    }
                }
            } catch (_) { /* decode hatası → sessizce geç */ }
        }

        // WS frame'ini base64'e çevirir — yalnızca manuel debug için kullanılır.
        // Her mesajda çağrılmaz; büyük buffer'larda stack overflow'u önlemek için chunk'lı.
        function toB64(data) {
            try {
                if (typeof data === 'string')    return btoa(unescape(encodeURIComponent(data)));
                if (data instanceof ArrayBuffer) {
                    const bytes = new Uint8Array(data);
                    let bin = '';
                    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
                    return btoa(bin);
                }
            } catch (_) {}
            return null;
        }

        window.WebSocket = function (url, protocols) {
            const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

            if (typeof url === 'string' && url.includes('accounts.openguessr.com')) {
                const origSend = ws.send.bind(ws);
                // send hook — sadece yönlendirme, loglama yok (main thread'i bloke etmesin)
                ws.send = function (data) {
                    return origSend(data);
                };

                ws.addEventListener('message', function (e) {
                    if (eloEnabled) {
                        eloWs = ws;
                        handleEloMsg(e.data, origSend);
                    }
                });

                // Bağlantı kapanırsa state'i sıfırla
                ws.addEventListener('close', function () {
                    if (eloWs !== ws) return;
                    eloWs = null;
                    if (!eloEnabled) return;
                    // Devam eden sendEloGuess varsa iptal et
                    eloGameId++;
                    eloGuessing   = false;
                    eloPendingLat = null;
                    eloPendingLon = null;
                    eloTimerReady = false;
                    // Matchmaking sayfasına geçildi mi?
                    if (location.pathname.includes('/multiplayer/duel')) {
                        eloStatus('⏳ Rakip bekleniyor…');
                        eloNavigating = false;
                    } else if (!eloNavigating) {
                        // Oyun içinde bağlantı koptu — DOM watcher popup'ı yakalayacak
                        eloStatus('⚡ Bağlantı kesildi — ekran bekleniyor…');
                    }
                });

                eloWs = ws;
            }

            return ws;
        };

        Object.keys(OrigWS).forEach(k => {
            try { window.WebSocket[k] = OrigWS[k]; } catch (_) {}
        });
        window.WebSocket.prototype = OrigWS.prototype;
    })();

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
