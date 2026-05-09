/**
 * autoplay.js — ISOLATED world, document_idle.
 *
 * Otomatik oyun döngüsü:
 *   1. Pin düştü  → rastgele 1.2-3.8s bekle → Guess'e bas
 *   2. Sonuç ekranı görününce (kim tıklamış olursa) → rastgele 1.8-4.2s → Continue
 *   3. Yeni tur iframe src değişir → pin → 1'e dön
 *
 * İnsancıl randomizasyon:
 *   - Her gecikme bağımsız rastgele aralıkta
 *   - %15 ihtimalle +2-4s ekstra "dağıldım" gecikmesi
 *   - Countdown UI'de görünür
 */
(function () {
    'use strict';

    let enabled      = false;
    let guessTimer   = null;
    let cdInterval   = null;
    let continueScheduled = false;   // aynı sonuç ekranı için iki kez basma

    /* ── Yardımcılar ─────────────────────────────────────── */
    function rand(min, max) { return min + Math.random() * (max - min); }

    function humanDelay(minMs, maxMs) {
        // window.ogDelays varsa onu kullan (ui.js'ten gelir)
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

    /* ── Sonuç ekranı izleyici (sürekli çalışır) ─────────── */
    function isResultVisible() {
        const btn = document.getElementById('nextRound');
        if (!btn) return false;
        // Buton görünür ve boyutu var mı?
        return btn.offsetParent !== null && btn.offsetHeight > 0;
    }

    function scheduleContinue() {
        if (!enabled || continueScheduled) return;
        continueScheduled = true;

        const { cMin, cMax } = getDelays();
        const delay = humanDelay(cMin, cMax);
        countdown(delay, '▶️ Continue:', () => {
            if (!enabled) { continueScheduled = false; return; }
            const btn = document.getElementById('nextRound');
            if (btn && isResultVisible()) {
                btn.click();
                setStatus('🗺️ Yeni tur bekleniyor…');
            }
            continueScheduled = false;
        });
    }

    // DOM değişimlerini dinleyen kalıcı observer
    const resultWatcher = new MutationObserver(() => {
        if (!enabled) return;
        if (isResultVisible() && !continueScheduled) {
            // Guess zaten basılmış (manuel ya da auto), Continue zamanla
            clearTimeout(guessTimer);
            clearInterval(cdInterval);
            scheduleContinue();
        }
    });

    /* ── Guess ───────────────────────────────────────────── */
    function scheduleGuess() {
        if (!enabled) return;
        // Sonuç ekranı zaten açıksa direkt Continue'ya geç
        if (isResultVisible()) { scheduleContinue(); return; }

        clearTimeout(guessTimer);
        clearInterval(cdInterval);
        continueScheduled = false;

        const { gMin, gMax } = getDelays();
        const delay = humanDelay(gMin, gMax);
        countdown(delay, '🖱️ Guess:', () => {
            if (!enabled) return;
            if (isResultVisible()) { scheduleContinue(); return; }
            const btn = document.getElementById('confirmButton');
            if (btn) {
                btn.click();
                setStatus('⏳ Sonuç bekleniyor…');
            } else {
                setStatus('⚠️ Guess butonu bulunamadı');
            }
        });
    }

    /* ── Public API ──────────────────────────────────────── */
    window.onPinPlaced = function () {
        if (!enabled) return;
        scheduleGuess();
    };

    window.toggleAutoPlay = function (state) {
        enabled = state;
        if (!enabled) {
            clearTimeout(guessTimer);
            clearInterval(cdInterval);
            continueScheduled = false;
            setStatus('');
            resultWatcher.disconnect();
        } else {
            setStatus('✅ Aktif — pin bekleniyor…');
            // Kalıcı result observer'ı başlat
            resultWatcher.observe(document.body, {
                childList: true, subtree: true,
                attributes: true, attributeFilter: ['style', 'class']
            });
            // Zaten sonuç ekranı açıksa hemen yakala
            if (isResultVisible()) scheduleContinue();
        }
    };

    window.isAutoPlayEnabled = function () { return enabled; };

})();

