/**
 * autoplay.js — ISOLATED world, document_idle.
 *
 * Normal mod:
 *   interceptor → showLocation → onPinPlaced → Guess → Continue
 *
 * Duello modu:
 *   - toggleAutoPlay(true, 'duel') ile başlar
 *   - 500ms polling state machine
 *   - URL /multiplayer/duel (matchmaking) → / (oyun) → / (tekrar) akışını takip eder
 *   - LOBBY: multiplayerOverlay görünüyor → bekle
 *   - GUESSING: overlay kalktı + confirmButton var → pin at → Guess
 *   - RESULT: popupHolder görünüyor → Play again
 */
(function () {
    'use strict';

    let enabled      = false;
    let sessionIsDuel = false;   // toggle'dan gelen mod — URL'den bağımsız
    let cdInterval   = null;
    let continueScheduled = false;

    // Duello state machine
    let duelPollInterval = null;
    let duelState    = 'IDLE'; // IDLE | LOBBY | GUESSING | RESULT
    let overlayGoneTicks = 0;

    /* ── Yardımcılar ─────────────────────────────────────── */
    function rand(min, max) { return min + Math.random() * (max - min); }

    function humanDelay(minMs, maxMs) {
        let d = rand(minMs, maxMs);
        if (Math.random() < 0.15) d += rand(2000, 4000);
        return Math.round(d);
    }

    function getDelays() {
        const d = window.ogDelays;
        return d ? d : { gMin: 2500, gMax: 6000, cMin: 3000, cMax: 6500 };
    }

    function setStatus(text) {
        if (typeof window.setAutoStatus === 'function') window.setAutoStatus(text);
    }

    function countdown(totalMs, label, onDone) {
        clearInterval(cdInterval);
        const end = Date.now() + totalMs;
        cdInterval = setInterval(() => {
            const left = Math.max(0, end - Date.now());
            setStatus(`${label} ${(left / 1000).toFixed(1)}s`);
            if (left === 0) { clearInterval(cdInterval); onDone(); }
        }, 100);
    }

    /* ── DOM kontrolleri ─────────────────────────────────── */
    function isDuelOverlayVisible() {
        const el = document.querySelector('.multiplayerOverlay');
        if (!el) return false;
        const s = window.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0;
    }

    function isDuelResultVisible() {
        const popup = document.querySelector('.popupHolder');
        if (!popup) return false;
        const s = window.getComputedStyle(popup);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        return popup.querySelector('button.bottomButton') !== null;
    }

    function isResultVisible() {
        const btn = document.getElementById('nextRound');
        if (!btn) return false;
        return btn.offsetParent !== null && btn.offsetHeight > 0;
    }

    // Duello oyun tahtası aktif mi? (confirmButton DOM'da görünür)
    function isGameBoardActive() {
        const btn = document.getElementById('confirmButton');
        if (!btn) return false;
        return btn.offsetParent !== null;
    }

    /* ── iframe'den koordinat oku ────────────────────────── */
    function readCoordsFromIframe() {
        const iframe = document.getElementById('panorama-iframe');
        if (!iframe || !iframe.src) return null;
        try {
            const url = new URL(iframe.src);
            const loc = url.searchParams.get('location');
            if (!loc) return null;
            const [a, b] = loc.split(',');
            const lat = parseFloat(a);
            const lng = parseFloat(b);
            if (isNaN(lat) || isNaN(lng)) return null;
            if (lat === 0 && lng === 0) return null;
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
            return { lat, lng };
        } catch (_) { return null; }
    }

    /* ── Guess ───────────────────────────────────────────── */
    function scheduleGuess() {
        if (!enabled) return;
        clearInterval(cdInterval);
        continueScheduled = false;
        const { gMin, gMax } = getDelays();
        countdown(humanDelay(gMin, gMax), '🖱️ Guess:', () => {
            if (!enabled) return;
            const btn = document.getElementById('confirmButton');
            if (btn) { btn.click(); setStatus('⏳ Sonuç bekleniyor…'); }
        });
    }

    /* ── Duello: pin at → confirmActive bekle → Guess ──────── */
    function duelPlacePinAndGuess(lat, lng) {
        if (!enabled) return;
        setStatus('📍 Pin atılıyor…');
        window.dispatchEvent(new CustomEvent('og-pin', { detail: { lat, lng } }));

        let waitCount = 0;
        const wait = setInterval(() => {
            if (!enabled) { clearInterval(wait); return; }
            const btn = document.getElementById('confirmButton');
            if ((btn && btn.classList.contains('confirmActive')) || ++waitCount > 80) {
                clearInterval(wait);
                scheduleGuess();
            }
        }, 100);
    }

    /* ── Duello: Play again ───────────────────────────────── */
    function scheduleDuelPlayAgain() {
        if (!enabled || continueScheduled) return;
        continueScheduled = true;
        const { cMin, cMax } = getDelays();
        countdown(humanDelay(cMin, cMax), '🔄 Play again:', () => {
            if (!enabled) { continueScheduled = false; return; }
            const popup = document.querySelector('.popupHolder');
            const btn   = popup && popup.querySelector('button.bottomButton');
            if (btn) {
                btn.click();
                duelState = 'LOBBY';
                overlayGoneTicks = 0;
                setStatus('⏳ Yeni duello başlıyor…');
            }
            continueScheduled = false;
        });
    }

    /* ── Normal mod: Continue ─────────────────────────────── */
    function scheduleContinue() {
        if (!enabled || continueScheduled) return;
        continueScheduled = true;
        const { cMin, cMax } = getDelays();
        countdown(humanDelay(cMin, cMax), '▶️ Continue:', () => {
            if (!enabled) { continueScheduled = false; return; }
            const btn = document.getElementById('nextRound');
            if (btn && isResultVisible()) { btn.click(); setStatus('🗺️ Yeni tur bekleniyor…'); }
            continueScheduled = false;
        });
    }

    /* ── Normal mod: sonuç observer ─────────────────────── */
    const resultWatcher = new MutationObserver(() => {
        if (!enabled) return;
        if (isResultVisible() && !continueScheduled) {
            clearInterval(cdInterval);
            scheduleContinue();
        }
    });

    /* ── Duello poll: 500ms ──────────────────────────────── */
    function duelPoll() {
        if (!enabled) return;

        const overlayVisible = isDuelOverlayVisible();
        const resultVisible  = isDuelResultVisible();
        const boardActive    = isGameBoardActive();
        const coords         = readCoordsFromIframe();

        console.log('[OG-DUEL]', {
            url: location.pathname,
            state: duelState,
            overlayVisible,
            resultVisible,
            boardActive,
            overlayGoneTicks,
            coords: coords ? `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}` : null
        });

        // 1. Sonuç popup'ı → Play again
        if (resultVisible) {
            if (duelState !== 'RESULT') {
                duelState = 'RESULT';
                overlayGoneTicks = 0;
                clearInterval(cdInterval);
                continueScheduled = false;
                scheduleDuelPlayAgain();
            }
            return;
        }

        // 2. Overlay var → bekle (lobby veya "Starting..." countdown)
        if (overlayVisible) {
            overlayGoneTicks = 0;
            if (duelState !== 'LOBBY') {
                duelState = 'LOBBY';
                setStatus('⚔️ Rakip / Starting bekleniyor…');
            }
            return;
        }

        // 3. Pin zaten atıldı, guess bekleniyor
        if (duelState === 'GUESSING') return;

        // 4. Oyun tahtası henüz yüklenmedi (confirmButton yok)
        if (!boardActive) {
            setStatus('⚔️ Oyun yükleniyor…');
            return;
        }

        // 5. Overlay az önce kalktı — en az 2 tick bekle (1sn, flicker önlemi)
        overlayGoneTicks++;
        if (overlayGoneTicks < 2) {
            setStatus('⚔️ Oyun başlıyor…');
            return;
        }

        // 6. Koordinat bekleniyor
        if (!coords) {
            setStatus('⚔️ Koordinat bekleniyor…');
            return;
        }

        // 7. Her şey hazır → pin at
        overlayGoneTicks = 0;
        duelState = 'GUESSING';
        duelPlacePinAndGuess(coords.lat, coords.lng);
    }

    /* ── Public API ───────────────────────────────────────── */
    window.onPinPlaced = function (lat, lng) {
        if (!enabled || sessionIsDuel) return;
        scheduleGuess();
    };

    // mode: 'normal' | 'duel'
    window.toggleAutoPlay = function (state, mode) {
        enabled = state;
        sessionIsDuel = (mode === 'duel');

        clearInterval(cdInterval);
        clearInterval(duelPollInterval);
        continueScheduled = false;
        duelState = 'IDLE';
        overlayGoneTicks = 0;
        duelPollInterval = null;
        resultWatcher.disconnect();

        if (!enabled) { setStatus(''); return; }

        if (sessionIsDuel) {
            duelState = 'LOBBY';
            setStatus('⚔️ Duello modu — bekleniyor…');
            duelPollInterval = setInterval(duelPoll, 500);
        } else {
            setStatus('✅ Aktif — pin bekleniyor…');
            resultWatcher.observe(document.body, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['style', 'class']
            });
            if (isResultVisible()) scheduleContinue();
        }
    };

    window.isAutoPlayEnabled = function () { return enabled; };

})();
