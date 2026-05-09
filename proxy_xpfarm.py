"""
proxy_xpfarm.py
================
OpenGuessr add-experience endpoint'ine DataImpulse residential proxy üzerinden
çoklu thread + curl_cffi (Chrome TLS fingerprint impersonation) ile XP farm yapar.

Kurulum:
    pip install curl_cffi

Postman'le aynı header setini birebir gönderir; Cloudflare'i geçer.
"""

import json
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    print("❌ curl_cffi yüklü değil.  pip install curl_cffi")
    sys.exit(1)

# ─── KULLANICI AYARLARI ────────────────────────────────────────────────────
BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOm51bGwsInVzZXJJZCI6MjczMDYzOSwiaWF0IjoxNzc4MzI4ODc2LCJleHAiOjE3ODA5MjA4NzZ9.XgSAG0_stFWbVFpjChdihSedo-G9c_ftOBVKaRLRUZ4"
USER_ID      = "2730639"

THREADS      = 12
DELAY_MIN    = 1.0
DELAY_MAX    = 2.5
XP_PER_REQ   = 7500
TOTAL_REQS   = 0          # 0 = sınırsız

# curl_cffi impersonation profili. chrome120/124/131 hepsi olur; Postman'in geçtiği
# header setiyle birlikte chrome131 güvenli seçim.
IMPERSONATE  = "chrome131"

# ─── DATAIMPULSE PROXY ─────────────────────────────────────────────────────
PROXY_HOST = "gw.dataimpulse.com"
PROXY_PORT = 823
# DataImpulse session/targeting: __cr.<COUNTRY>  veya  __sid.<id> gibi ekleri user'a ekleyin
# Örn: country=TR  →  f813aec369301b2ce7b8__cr.tr
PROXY_USER = "f813aec369301b2ce7b8__cr.tr"
PROXY_PASS = "12b990779269baa4"

PROXY_URL = f"http://{PROXY_USER}:{PROXY_PASS}@{PROXY_HOST}:{PROXY_PORT}"
PROXIES   = {"http": PROXY_URL, "https": PROXY_URL}

# ─── ENDPOINT ──────────────────────────────────────────────────────────────
API_URL     = "https://accounts.openguessr.com/accounts/update/add-experience"
PROFILE_URL = "https://accounts.openguessr.com/accounts/profile/{uid}"

# Postman'in gönderdiği header seti — birebir
def build_headers() -> dict:
    return {
        "accept":             "*/*",
        "accept-language":    "tr,en-US;q=0.9,en;q=0.8",
        "authorization":      f"Bearer {BEARER_TOKEN}",
        "content-type":       "application/json",
        "origin":             "https://openguessr.com",
        "priority":           "u=1, i",
        "referer":            "https://openguessr.com/",
        "sec-ch-ua":          '"Not=A?Brand";v="8", "Chromium";v="143", "Samsung Browser";v="30.0"',
        "sec-ch-ua-mobile":   "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest":     "empty",
        "sec-fetch-mode":     "cors",
        "sec-fetch-site":     "same-site",
        "user-agent":         "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                              "AppleWebKit/537.36 (KHTML, like Gecko) "
                              "SamsungBrowser/30.0 Chrome/143.0.0.0 Safari/537.36",
    }

# ─── İSTATİSTİK ────────────────────────────────────────────────────────────
stats_lock = threading.Lock()
stats = {"ok": 0, "fail": 0, "xp": 0, "start": time.time()}
stop_event = threading.Event()


def make_session(use_proxy: bool = True) -> "cffi_requests.Session":
    s = cffi_requests.Session(impersonate=IMPERSONATE)
    if use_proxy:
        s.proxies.update(PROXIES)
    return s


def fetch_profile_xp(use_proxy: bool = False) -> int | None:
    headers = build_headers()
    try:
        with make_session(use_proxy=use_proxy) as s:
            r = s.get(PROFILE_URL.format(uid=USER_ID), headers=headers, timeout=25)
        if r.status_code == 200:
            return r.json().get("experience")
        print(f"   profile HTTP {r.status_code}: {r.text[:120]}")
    except Exception as e:
        print(f"   profile error: {e.__class__.__name__}: {e}")
    return None


def preflight(use_proxy: bool) -> tuple[bool, int]:
    headers = build_headers()
    payload = json.dumps({"id": str(USER_ID), "experience": 1})
    try:
        with make_session(use_proxy=use_proxy) as s:
            r = s.put(API_URL, headers=headers, data=payload, timeout=25)
    except Exception as e:
        print(f"⚠ Preflight network hatası ({'proxy' if use_proxy else 'direct'}): "
              f"{e.__class__.__name__}: {e}")
        return False, 0
    body = r.text[:160].replace("\n", " ")
    label = "proxyli" if use_proxy else "proxysiz"
    print(f"🔎 Preflight ({label}) PUT → HTTP {r.status_code}  {body}")
    return r.status_code == 200, r.status_code


def worker(worker_id: int):
    headers = build_headers()
    payload = json.dumps({"id": str(USER_ID), "experience": XP_PER_REQ})
    session = make_session(use_proxy=True)
    consecutive_cf = 0

    while not stop_event.is_set():
        try:
            r = session.put(API_URL, headers=headers, data=payload, timeout=30)
            sc = r.status_code

            with stats_lock:
                if sc == 200:
                    stats["ok"] += 1
                    stats["xp"] += XP_PER_REQ
                else:
                    stats["fail"] += 1
                total = stats["ok"] + stats["fail"]

            if sc == 200:
                consecutive_cf = 0
            elif sc in (401, 403):
                txt = r.text
                if "Just a moment" in txt or "<html" in txt.lower():
                    consecutive_cf += 1
                    print(f"[T{worker_id}] ⚠ Cloudflare challenge — IP rotate ({consecutive_cf})")
                    try: session.close()
                    except Exception: pass
                    session = make_session(use_proxy=True)
                    time.sleep(min(consecutive_cf, 5))
                    continue
                else:
                    print(f"[T{worker_id}] ❌ Token reddedildi (HTTP {sc}): {txt[:160]}")
                    stop_event.set()
                    return
            elif sc == 429:
                print(f"[T{worker_id}] ⚠ 429 rate limit — 5 sn")
                time.sleep(5)
            else:
                print(f"[T{worker_id}] ⚠ HTTP {sc}: {r.text[:120]}")

            if TOTAL_REQS and total >= TOTAL_REQS:
                stop_event.set()
                return

        except Exception as e:
            with stats_lock:
                stats["fail"] += 1
            print(f"[T{worker_id}] ⚠ {e.__class__.__name__}: {e}")
            try: session.close()
            except Exception: pass
            session = make_session(use_proxy=True)
            time.sleep(2)
            continue

        time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def reporter():
    last_ok = 0
    while not stop_event.is_set():
        time.sleep(5)
        with stats_lock:
            ok = stats["ok"]; fail = stats["fail"]; xp = stats["xp"]
            elapsed = time.time() - stats["start"]
        rps = (ok - last_ok) / 5.0
        last_ok = ok
        print(f"[STAT] ✓ {ok:5d}  ✗ {fail:4d}  | XP +{xp:>10,}  "
              f"| {rps:4.1f} ok/sn  | uptime {elapsed:6.0f}sn")


def main():
    if not BEARER_TOKEN or not USER_ID:
        print("❌ BEARER_TOKEN ve USER_ID değerlerini doldurun.")
        sys.exit(1)

    print("─" * 60)
    print(f" Proxy        : {PROXY_HOST}:{PROXY_PORT}  (residential)")
    print(f" Impersonate  : {IMPERSONATE}")
    print(f" User         : {USER_ID}")
    print(f" Worker       : {THREADS} thread  | XP/req: {XP_PER_REQ:,}  "
          f"| delay {DELAY_MIN}-{DELAY_MAX}s")
    print("─" * 60)

    # 1) Direct preflight (senin IP'n)
    ok_direct, sc_direct = preflight(use_proxy=False)
    # 2) Proxy preflight
    ok_proxy,  sc_proxy  = preflight(use_proxy=True)

    if not ok_proxy:
        print("❌ Proxy üzerinden çalışmıyor. Çıkılıyor.")
        if ok_direct:
            print("ℹ Direct çalışıyor — sorun Cloudflare'in DataImpulse residential "
                  "IP'lerini block etmesi. DataImpulse panelinde farklı bir target "
                  "country/sticky session deneyin.")
        sys.exit(1)
    print("✓ Proxy üzerinden Cloudflare aşıldı, başlıyoruz.")

    initial_xp = fetch_profile_xp(use_proxy=False)
    if initial_xp is not None:
        print(f"📊 Başlangıç XP: {initial_xp:,}")

    rep = threading.Thread(target=reporter, daemon=True)
    rep.start()

    try:
        with ThreadPoolExecutor(max_workers=THREADS) as pool:
            for i in range(THREADS):
                pool.submit(worker, i + 1)
            try:
                while not stop_event.is_set():
                    time.sleep(0.5)
            except KeyboardInterrupt:
                print("\n⏹ Durduruluyor…")
                stop_event.set()
    finally:
        with stats_lock:
            ok = stats["ok"]; fail = stats["fail"]; xp = stats["xp"]
            elapsed = time.time() - stats["start"]
        print("─" * 60)
        print(f" Toplam başarılı : {ok}")
        print(f" Toplam hata     : {fail}")
        print(f" Kazanılan XP    : {xp:,}")
        print(f" Süre            : {elapsed:.1f} sn")
        if elapsed > 0 and ok > 0:
            print(f" Ortalama        : {ok/elapsed:.2f} ok/sn  ({xp/elapsed:,.0f} XP/sn)")

        final_xp = fetch_profile_xp(use_proxy=False)
        if final_xp is not None:
            print(f" Profil XP (son) : {final_xp:,}")
            if initial_xp is not None:
                print(f" Gerçek artış    : +{final_xp - initial_xp:,}")
        print("─" * 60)


if __name__ == "__main__":
    main()
