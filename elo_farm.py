#!/usr/bin/env python3
"""
OpenGuessr ELO Farm Botu
━━━━━━━━━━━━━━━━━━━━━━
2 hesap kullanır. Her tur:
  - Kazanan: sunucudan gelen koordinatların TAM AYNI'sını tahmin eder (5000 puan)
  - Kaybeden: (0, 0) gönderir (0 puan)
  → Kazanan her turda mükemmel skor → duel'i kazanır → ELO alır

Kurulum:
  pip install websockets msgpack

Kullanım:
  python3 elo_farm.py KAZANAN_JWT KAYBEDEN_JWT [--games 10]

JWT token'ı almak için:
  Chrome DevTools → Network → accounts.openguessr.com → register isteğinin payload'ındaki bearer
  VEYA: extension WS interceptor'ından konsol çıktısına bakın
"""

import asyncio
import websockets
import msgpack
import argparse
import sys
from datetime import datetime

WS_URL = "wss://accounts.openguessr.com/socket"
ROUND_AMOUNT = 5
ROUND_TIMEOUT = 90  # saniye — her round için max bekleme süresi

def pack(data):
    return msgpack.packb(data, use_bin_type=True)

def unpack(data):
    return msgpack.unpackb(data, raw=False)

def log(label, msg):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[{ts}] [{label:8s}] {msg}", flush=True)

CREATE_ROOM_MSG = {
    "type": "create_room",
    "initialStorage": {
        "roundAmount": ROUND_AMOUNT,
        "roundLength": 60,
        "teamAmount": 1,
        "style": "duel",
        "restriction": "standard",
        "map": "World",
        "matchmakingRoom": True,
        "divisionRoom": True,
    },
    "size": 2,
}


async def run_player(jwt_token, label, send_correct_guess, game_num, location_queue):
    """
    Tek bir oyuncu bağlantısını yönetir.

    send_correct_guess=True  → sunucunun koordinatlarını birebir gönderir (kazanır)
    send_correct_guess=False → (0,0) gönderir (kaybeder)

    location_queue: kazanan oyuncu için None, kaybeden için asyncio.Queue.
      Kaybeden, kazananın koordinatlarını beklemek yerine direkt (0,0) gönderir.
    """
    uri = WS_URL
    extra_headers = {
        "Origin": "https://openguessr.com",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    }

    try:
        async with websockets.connect(uri, max_size=None, additional_headers=extra_headers, open_timeout=30) as ws:
            # 1. Register
            await ws.send(pack({
                "type": "register",
                "id": None,
                "customData": {"bearer": jwt_token}
            }))

            msg = unpack(await ws.recv())
            if msg.get("type") != "registered":
                log(label, f"HATA: kayıt başarısız → {msg}")
                return False

            client_id = msg["id"]
            log(label, f"Kayıt OK — clientId={client_id}")

            # 2. Create matchmaking room
            await ws.send(pack(CREATE_ROOM_MSG))
            log(label, "Oda oluşturuldu, rakip bekleniyor…")

            round_num = 0
            opponent_joined = False
            game_started = False

            async for raw in ws:
                msg = unpack(raw)
                t = msg.get("type", "")

                # Odaya kabul edildi (2. oyuncu için gelir)
                if t == "join_accepted":
                    room_id = msg.get("roomId", "?")
                    host = msg.get("host", "?")
                    log(label, f"Odaya katıldı: roomId={room_id}, host={host}")
                    opponent_joined = True
                    continue

                # Rakip katıldı (1. oyuncu için gelir — players array-add-unique)
                if t == "client_joined" and not opponent_joined:
                    cid = msg.get("client", "?")
                    if cid != client_id:
                        opponent_joined = True
                        log(label, f"Rakip katıldı: clientId={cid}")
                    continue

                if t == "property_updated":
                    key = msg["update"]["key"]
                    op_data = msg["update"]["operation"].get("data", {})
                    value = op_data.get("value")

                    # players array-add-unique → rakip katıldı (1. oyuncu için)
                    if key == "players" and not opponent_joined:
                        if isinstance(value, dict) and value.get("clientId") != client_id:
                            opponent_joined = True
                            uname = value.get("username", "?")
                            elo = value.get("elo", "?")
                            log(label, f"Rakip katıldı: {uname} (ELO {elo})")

                    # Oyun başladı
                    elif key == "gameStarted" and value is True:
                        game_started = True
                        log(label, f"Oyun {game_num} başladı!")

                    # Yeni round — konum geldi
                    elif key == "location" and isinstance(value, list) and len(value) >= 2:
                        lat = float(value[0])
                        lon = float(value[1])
                        round_num += 1
                        log(label, f"Oyun {game_num} Tur {round_num}: konum={lat:.5f},{lon:.5f}")

                        if send_correct_guess:
                            # Mükemmel tahmin — tam koordinat
                            await ws.send(pack({
                                "type": "request",
                                "request": {"name": "addGuessMarker", "data": {"lat": lat, "lon": lon}}
                            }))
                            await ws.send(pack({
                                "type": "request",
                                "request": {"name": "confirmGuess", "data": None}
                            }))
                            log(label, f"Tur {round_num}: Mükemmel tahmin gönderildi ✓")
                        else:
                            # Kaybeden: 0.5s bekle (kazanan önce göndersin), sonra (0,0)
                            await asyncio.sleep(0.5)
                            await ws.send(pack({
                                "type": "request",
                                "request": {"name": "addGuessMarker", "data": {"lat": 0.0, "lon": 0.0}}
                            }))
                            await ws.send(pack({
                                "type": "request",
                                "request": {"name": "confirmGuess", "data": None}
                            }))
                            log(label, f"Tur {round_num}: Yanlış tahmin (0,0) gönderildi")

                        if round_num >= ROUND_AMOUNT:
                            log(label, f"Son tur tamamlandı. Bağlantı kapatılıyor…")
                            return True

                elif t == "error":
                    log(label, f"HATA: {msg}")
                    return False

    except websockets.exceptions.ConnectionClosedOK:
        log(label, "Bağlantı normal kapandı.")
        return True
    except Exception as e:
        log(label, f"BEKLENMEDIK HATA: {e}")
        return False

    return True


async def farm_game(winner_jwt, loser_jwt, game_num):
    """Bir oyunu iki oyuncuyla eş zamanlı çalıştırır."""
    log("BOT", f"═══ Oyun {game_num} başlıyor ═══")

    # Kazanan önce bağlanır, 500ms sonra kaybeden — matchmaking eşleşmesi için
    winner_task = asyncio.create_task(
        run_player(winner_jwt, "KAZANAN", True, game_num, None)
    )
    await asyncio.sleep(0.5)
    loser_task = asyncio.create_task(
        run_player(loser_jwt, "KAYBEDEN", False, game_num, None)
    )

    results = await asyncio.gather(winner_task, loser_task, return_exceptions=True)
    success = all(r is True for r in results)
    log("BOT", f"Oyun {game_num} {'TAMAMLANDI ✓' if success else 'BAŞARISIZ ✗'}")
    return success


async def main(winner_jwt, loser_jwt, num_games, delay_between_games):
    log("BOT", f"ELO Farm başlatıldı: {num_games} oyun, aralarında {delay_between_games}s bekleme")
    log("BOT", "Ctrl+C ile durdurabilirsiniz.\n")

    success_count = 0
    for i in range(1, num_games + 1):
        ok = await farm_game(winner_jwt, loser_jwt, i)
        if ok:
            success_count += 1
        if i < num_games:
            log("BOT", f"{delay_between_games}s bekleniyor…\n")
            await asyncio.sleep(delay_between_games)

    log("BOT", f"\nBitti: {success_count}/{num_games} oyun tamamlandı.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="OpenGuessr ELO Farm Botu",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("winner_jwt", help="Kazanan hesabın JWT token'ı")
    parser.add_argument("loser_jwt", help="Kaybeden hesabın JWT token'ı")
    parser.add_argument("--games", type=int, default=5, help="Oyun sayısı (varsayılan: 5)")
    parser.add_argument("--delay", type=int, default=5, help="Oyunlar arası bekleme süresi saniye (varsayılan: 5)")

    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(1)

    args = parser.parse_args()
    asyncio.run(main(args.winner_jwt, args.loser_jwt, args.games, args.delay))
