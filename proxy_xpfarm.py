"""
proxy_xpfarm.py
================
OpenGuessr add-experience endpoint'ine DataImpulse residential proxy üzerinden
çoklu thread + curl_cffi (Chrome TLS fingerprint impersonation) ile XP farm yapar.
"""

import json
import random
import sys
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

try:
    from curl_cffi import requests as cffi_requests
except ImportError:
    print("curl_cffi yüklü değil.  pip install curl_cffi")
    sys.exit(1)

from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

console = Console()
LOG_MAX = 18  # log panelinde görünecek max satır
log_lines: deque[Text] = deque(maxlen=LOG_MAX)
log_lock = threading.Lock()

# ─── KULLANICI AYARLARI ────────────────────────────────────────────────────
BEARER_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOm51bGwsInVzZXJJZCI6MjczMDYzOSwiaWF0IjoxNzc4MzI4ODc2LCJleHAiOjE3ODA5MjA4NzZ9.XgSAG0_stFWbVFpjChdihSedo-G9c_ftOBVKaRLRUZ4"
USER_ID      = "2730639"

THREADS      = 1
DELAY_MIN    = 4.0
DELAY_MAX    = 7.0
XP_PER_REQ   = 10000
TOTAL_REQS   = 0          # 0 = sınırsız
VERIFY_IP    = True       # Her istek öncesi exit IP'yi doğrula (api.ipify.org)
IP_CHECK_URL = "https://api.ipify.org?format=text"

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

# Her yeni session için rastgele sticky-session ID üretir → DataImpulse her
# yeni session'da farklı bir exit IP verir. Aynı sid ile tekrar bağlanırsan
# (kısa süre içinde) aynı IP'ye düşersin; farklı sid → farklı IP.
def build_proxy_url(sid: str | None = None) -> str:
    user = PROXY_USER
    if sid:
        user = f"{PROXY_USER}__sid.{sid}"
    return f"http://{user}:{PROXY_PASS}@{PROXY_HOST}:{PROXY_PORT}"

def new_sid() -> str:
    # 10 hex karakter; çakışma pratikte yok
    return f"{random.getrandbits(40):010x}"

PROXY_URL = build_proxy_url()
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
stats = {"ok": 0, "fail": 0, "xp": 0, "start": time.time(), "profile_xp": None}
stop_event = threading.Event()


def make_session(use_proxy: bool = True, sid: str | None = None) -> "cffi_requests.Session":
    s = cffi_requests.Session(impersonate=IMPERSONATE)
    if use_proxy:
        # sid verilmezse her session için yeni rastgele sid → yeni IP
        if sid is None:
            sid = new_sid()
        url = build_proxy_url(sid)
        s.proxies.update({"http": url, "https": url})
    return s


def fetch_profile_xp() -> int | None:
    headers = build_headers()
    try:
        with make_session(use_proxy=False) as s:
            r = s.get(PROFILE_URL.format(uid=USER_ID), headers=headers, timeout=25)
        if r.status_code == 200:
            return r.json().get("experience")
    except Exception:
        pass
    return None


def add_log(text: Text) -> None:
    with log_lock:
        log_lines.append(text)


def build_ui(initial_xp: int | None) -> Layout:
    with stats_lock:
        ok        = stats["ok"]
        fail      = stats["fail"]
        xp_earned = stats["xp"]
        profile   = stats["profile_xp"]
        elapsed   = time.time() - stats["start"]

    td = timedelta(seconds=int(elapsed))
    rate = ok / elapsed if elapsed > 0 else 0.0

    # ── Sol panel: istatistikler ──
    tbl = Table.grid(padding=(0, 2))
    tbl.add_column(style="bold cyan", justify="right")
    tbl.add_column(style="white")

    start_xp_str = f"{initial_xp:,}" if initial_xp is not None else "—"
    profile_str  = f"{profile:,}"    if profile   is not None else "—"
    gained_str   = (f"+{profile - initial_xp:,}" if (profile and initial_xp) else
                    f"+{xp_earned:,} (tahmini)")

    tbl.add_row("Proxy",       "[dim]Devre dışı[/dim]")
    tbl.add_row("Kullanıcı",   USER_ID)
    tbl.add_row("XP/istek",    f"{XP_PER_REQ:,}")
    tbl.add_row("Bekleme",     f"{DELAY_MIN}–{DELAY_MAX} sn")
    tbl.add_row("",            "")
    tbl.add_row("Başarılı",    f"[green]{ok}[/green]")
    tbl.add_row("Hatalı",      f"[red]{fail}[/red]" if fail else "0")
    tbl.add_row("",            "")
    tbl.add_row("Başlangıç XP", start_xp_str)
    tbl.add_row("Profil XP",   f"[bold yellow]{profile_str}[/bold yellow]")
    tbl.add_row("Kazanılan",   f"[bold green]{gained_str}[/bold green]")
    tbl.add_row("",            "")
    tbl.add_row("Hız",         f"{rate:.2f} istek/sn")
    tbl.add_row("Süre",        str(td))

    stats_panel = Panel(tbl, title="[bold]OpenGuessr XP Farm[/bold]",
                        border_style="cyan", padding=(1, 2))

    # ── Sağ panel: canlı log ──
    with log_lock:
        lines = list(log_lines)
    log_text = Text()
    for i, ln in enumerate(lines):
        if i:
            log_text.append("\n")
        log_text.append_text(ln)

    log_panel = Panel(log_text, title="[bold]İstek Geçmişi[/bold]",
                      border_style="blue", padding=(0, 1))

    layout = Layout()
    layout.split_row(
        Layout(stats_panel, name="stats", ratio=2),
        Layout(log_panel,   name="log",   ratio=3),
    )
    return layout


def worker(worker_id: int, initial_xp: int | None):
    headers = build_headers()
    payload = json.dumps({"id": str(USER_ID), "experience": XP_PER_REQ})
    consecutive_cf = 0
    last_ip = None

    while not stop_event.is_set():
        session = make_session(use_proxy=False)
        try:
            if VERIFY_IP:
                try:
                    ip = session.get(IP_CHECK_URL, timeout=15).text.strip()
                except Exception as e:
                    ip = f"?({e.__class__.__name__})"
                ip_tag = "yeni" if ip != last_ip else "[yellow]AYNI[/yellow]"
                last_ip = ip
            else:
                ip, ip_tag = "—", ""

            r = session.put(API_URL, headers=headers, data=payload, timeout=30)
            sc = r.status_code

            with stats_lock:
                if sc == 200:
                    stats["ok"] += 1
                    stats["xp"] += XP_PER_REQ
                else:
                    stats["fail"] += 1
                total = stats["ok"] + stats["fail"]

            ts = time.strftime("%H:%M:%S")

            if sc == 200:
                consecutive_cf = 0
                add_log(Text.from_markup(
                    f"[dim]{ts}[/dim]  [green]✓[/green]  [bold]+{XP_PER_REQ:,} XP[/bold]"
                    f"  [dim]{ip}[/dim]  [cyan]{ip_tag}[/cyan]"
                ))
                if total % 10 == 0:
                    pxp = fetch_profile_xp()
                    if pxp is not None:
                        with stats_lock:
                            stats["profile_xp"] = pxp
                        add_log(Text.from_markup(
                            f"[dim]{ts}[/dim]  [yellow]↻[/yellow]  "
                            f"Profil XP güncellendi: [bold yellow]{pxp:,}[/bold yellow]"
                        ))
            elif sc in (401, 403):
                txt = r.text
                if "Just a moment" in txt or "<html" in txt.lower():
                    consecutive_cf += 1
                    add_log(Text.from_markup(
                        f"[dim]{ts}[/dim]  [yellow]⚠[/yellow]  "
                        f"Cloudflare engeli — yeni IP ({consecutive_cf})"
                    ))
                    time.sleep(min(consecutive_cf, 5))
                    continue
                else:
                    add_log(Text.from_markup(
                        f"[dim]{ts}[/dim]  [red]✗[/red]  Token geçersiz (HTTP {sc}) — durduruluyor"
                    ))
                    stop_event.set()
                    return
            elif sc == 429:
                add_log(Text.from_markup(
                    f"[dim]{ts}[/dim]  [yellow]⏳[/yellow]  Rate limit — 5 sn bekleniyor"
                ))
                time.sleep(5)
            else:
                add_log(Text.from_markup(
                    f"[dim]{ts}[/dim]  [red]⚠[/red]  HTTP {sc}: {r.text[:80]}"
                ))

            if TOTAL_REQS and total >= TOTAL_REQS:
                stop_event.set()
                return

        except Exception as e:
            with stats_lock:
                stats["fail"] += 1
            ts = time.strftime("%H:%M:%S")
            add_log(Text.from_markup(
                f"[dim]{ts}[/dim]  [red]![/red]  {e.__class__.__name__}: {e}"
            ))
            time.sleep(2)
            continue
        finally:
            try: session.close()
            except Exception: pass

        time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))


def main():
    if not BEARER_TOKEN or not USER_ID:
        console.print("[red]BEARER_TOKEN ve USER_ID değerlerini doldurun.[/red]")
        sys.exit(1)

    console.print("[cyan]Başlangıç XP'i alınıyor...[/cyan]", end=" ")
    initial_xp = fetch_profile_xp()
    if initial_xp is not None:
        with stats_lock:
            stats["profile_xp"] = initial_xp
        console.print(f"[bold green]{initial_xp:,}[/bold green]")
    else:
        console.print("[yellow]alınamadı[/yellow]")

    try:
        with Live(build_ui(initial_xp), console=console, refresh_per_second=2,
                  screen=False) as live:

            def _refresh():
                while not stop_event.is_set():
                    live.update(build_ui(initial_xp))
                    time.sleep(0.5)

            refresh_thread = threading.Thread(target=_refresh, daemon=True)
            refresh_thread.start()

            try:
                with ThreadPoolExecutor(max_workers=THREADS) as pool:
                    for i in range(THREADS):
                        pool.submit(worker, i + 1, initial_xp)
                    while not stop_event.is_set():
                        time.sleep(0.5)
            except KeyboardInterrupt:
                stop_event.set()

    finally:
        with stats_lock:
            ok   = stats["ok"]
            fail = stats["fail"]
            xp   = stats["xp"]
            elapsed = time.time() - stats["start"]

        final_xp = fetch_profile_xp()

        console.rule("[bold cyan]Sonuç[/bold cyan]")
        console.print(f" Başarılı       : [green]{ok}[/green]")
        console.print(f" Hatalı         : [red]{fail}[/red]")
        console.print(f" Kazanılan XP   : [bold]+{xp:,}[/bold]")
        console.print(f" Süre           : {timedelta(seconds=int(elapsed))}")
        if elapsed > 0 and ok > 0:
            console.print(f" Hız (ort.)     : {ok/elapsed:.2f} istek/sn")
        if final_xp is not None:
            console.print(f" Profil XP (son): [bold yellow]{final_xp:,}[/bold yellow]")
            if initial_xp is not None:
                console.print(f" Gerçek artış   : [bold green]+{final_xp - initial_xp:,}[/bold green]")
        console.rule()


if __name__ == "__main__":
    main()
