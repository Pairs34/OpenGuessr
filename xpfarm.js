/**
 * xpfarm.js — ISOLATED world, document_idle.
 *
 * add-experience endpoint'ine direkt istek atarak XP kazanır.
 * Her başarılı istekten sonra kazanılan XP ve tahmini toplam gösterilir.
 * Her 10 istekte bir gerçek profil XP'si çekilerek senkronize edilir.
 */
(function () {
    'use strict';

    let running   = false;
    let timerId   = null;
    let isPending = false;
    let sessionXP = 0;
    let baseXP    = 0;
    let reqCount  = 0;

    function setStatus(text) {
        if (typeof window.setAutoStatus === 'function') window.setAutoStatus(text);
    }

    async function fetchProfile(userId) {
        try {
            const res = await fetch(
                `https://accounts.openguessr.com/accounts/profile/${userId}`,
                {
                    headers: {
                        'accept': '*/*',
                        'content-type': 'application/json',
                        'origin': 'https://openguessr.com',
                        'referer': 'https://openguessr.com/'
                    }
                }
            );
            if (res.ok) {
                const data = await res.json();
                return data.experience || 0;
            }
        } catch (_) {}
        return null;
    }

    async function sendXP(cfg) {
        if (isPending || !running) return;
        isPending = true;
        try {
            const res = await fetch(
                'https://accounts.openguessr.com/accounts/update/add-experience',
                {
                    method: 'PUT',
                    headers: {
                        'accept': '*/*',
                        'authorization': `Bearer ${cfg.token}`,
                        'content-type': 'application/json',
                        'origin': 'https://openguessr.com',
                        'referer': 'https://openguessr.com/'
                    },
                    body: JSON.stringify({ id: String(cfg.userId), experience: cfg.xpPerReq })
                }
            );

            if (res.ok) {
                sessionXP += cfg.xpPerReq;
                reqCount++;

                // Her 10 istekte bir gerçek XP değerini çek
                if (reqCount % 10 === 0) {
                    const real = await fetchProfile(cfg.userId);
                    if (real !== null) {
                        baseXP    = real;
                        sessionXP = 0; // sıfırla — baseXP artık güncel
                    }
                }

                const estimated = baseXP + sessionXP;
                setStatus(
                    `⚡ +${sessionXP.toLocaleString()} XP kazanıldı` +
                    (baseXP > 0 ? ` | Toplam ~${estimated.toLocaleString()}` : '')
                );
            } else if (res.status === 401 || res.status === 403) {
                setStatus('❌ Token geçersiz veya süresi dolmuş');
                window.stopXPFarm();
                const btn = document.getElementById('og-xp-start');
                if (btn) { btn.textContent = '▶ Başlat'; btn.classList.remove('running'); }
            } else {
                setStatus(`⚠️ HTTP ${res.status}`);
            }
        } catch (e) {
            setStatus(`❌ ${e.message}`);
        } finally {
            isPending = false;
        }
    }

    window.startXPFarm = async function (cfg) {
        if (running) return;
        running   = true;
        sessionXP = 0;
        reqCount  = 0;
        isPending = false;
        baseXP    = 0;

        setStatus('🔍 Mevcut XP alınıyor…');
        const xp = await fetchProfile(cfg.userId);
        if (xp !== null) baseXP = xp;
        setStatus(`📊 Başlangıç: ${baseXP.toLocaleString()} XP — başlıyor…`);

        await sendXP(cfg);
        timerId = setInterval(() => sendXP(cfg), cfg.intervalMs);
    };

    window.stopXPFarm = function () {
        running = false;
        clearInterval(timerId);
        timerId   = null;
        isPending = false;
        sessionXP = 0;
        setStatus('');
    };

    window.isXPFarmRunning = function () { return running; };

})();
