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

        function eloStatus(text) {
            window.dispatchEvent(new CustomEvent('og-elofarm-status', { detail: { text } }));
        }

        window.addEventListener('og-elofarm', function (e) {
            eloEnabled    = !!(e.detail && e.detail.enabled);
            eloGuessing   = false;
            eloPendingLat = null;
            eloPendingLon = null;
            eloTimerReady = false;
            eloRound      = 0;
            eloStatus(eloEnabled ? '⚔️ WS dinleniyor…' : '');
        });

        async function sendEloGuess(wsSend, lat, lon) {
            if (eloGuessing) return;   // yarış koşulunu önle
            eloGuessing = true;        // delay öncesinde işaretle
            // İnsansı bekleme: 6–10sn arası random (kullanıcı düşünüyormuş gibi)
            const _thinkMs = 6000 + Math.random() * 4000;
            eloStatus(`🤔 Düşünüyor… (${(_thinkMs / 1000).toFixed(1)}s)`);
            await new Promise(res => setTimeout(res, _thinkMs));
            if (!eloEnabled) return;
            eloRound++;

            // ~1km random offset — inandırıcılık için (uniform daire dağılımı)
            const _angle = Math.random() * 2 * Math.PI;
            const _dist  = Math.sqrt(Math.random()) * 1000; // 0–1000m
            const gLat = lat + (_dist * Math.cos(_angle)) / 111320;
            const gLon = lon + (_dist * Math.sin(_angle)) / (111320 * Math.cos(lat * Math.PI / 180));

            eloStatus(`⏳ Tur ${eloRound}: ${gLat.toFixed(4)},${gLon.toFixed(4)} (~${Math.round(_dist)}m)`);

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
                    // Sonuç overlay'ini otomatik kapat (Continue / bottomButton)
                    if (eloEnabled) {
                        let _tries = 0;
                        const _poll = setInterval(() => {
                            if (!eloEnabled || _tries++ > 20) { clearInterval(_poll); return; }
                            const _sels = ['.popupHolder button.bottomButton', '#nextRound', 'button.bottomButton'];
                            for (const _sel of _sels) {
                                const _btn = document.querySelector(_sel);
                                if (_btn && _btn.offsetParent !== null) {
                                    _btn.click();
                                    eloStatus('▶ Continue tıklandı');
                                    clearInterval(_poll);
                                    return;
                                }
                            }
                        }, 500);
                    }
                }

                if (key === 'gameEnded' && value === true) {
                    eloStatus(`🏆 Oyun bitti (${eloRound} tur)`);
                    eloRound      = 0;
                    eloGuessing   = false;
                    eloPendingLat = null;
                    eloPendingLon = null;
                    eloTimerReady = false;
                }
            } catch (_) { /* decode hatası → sessizce geç */ }
        }

        function toB64(data) {
            try {
                if (typeof data === 'string')      return btoa(unescape(encodeURIComponent(data)));
                if (data instanceof ArrayBuffer)   return btoa(String.fromCharCode(...new Uint8Array(data)));
                if (data instanceof Blob) {
                    const reader = new FileReader();
                    reader.onload = () => console.log('[OG-WS ←]', btoa(String.fromCharCode(...new Uint8Array(reader.result))));
                    reader.readAsArrayBuffer(data);
                    return null;
                }
            } catch (_) {}
            return null;
        }

        window.WebSocket = function (url, protocols) {
            const ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

            if (typeof url === 'string' && url.includes('accounts.openguessr.com')) {
                const origSend = ws.send.bind(ws);
                ws.send = function (data) {
                    const b64 = toB64(data);
                    if (b64) console.log('[OG-WS →]', b64);
                    return origSend(data);
                };

                ws.addEventListener('message', function (e) {
                    const b64 = toB64(e.data);
                    if (b64) console.log('[OG-WS ←]', b64);

                    if (eloEnabled) {
                        eloWs = ws;
                        handleEloMsg(e.data, origSend);
                    }
                });

                // Bağlantı kapanırsa referansı temizle
                ws.addEventListener('close', function () {
                    if (eloWs === ws) eloWs = null;
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
