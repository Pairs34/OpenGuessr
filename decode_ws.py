import base64, struct, json, sys

def decode_msgpack(data):
    pos = [0]
    def read(n):
        r = data[pos[0]:pos[0]+n]; pos[0] += n; return r
    def decode():
        b = data[pos[0]]; pos[0] += 1
        if b <= 0x7f: return b
        if b >= 0xe0: return b - 256
        if 0xa0 <= b <= 0xbf: n=b&0x1f; return read(n).decode('utf-8','replace')
        if 0x90 <= b <= 0x9f: n=b&0x0f; return [decode() for _ in range(n)]
        if 0x80 <= b <= 0x8f: n=b&0x0f; return {decode():decode() for _ in range(n)}
        if b==0xc0: return None
        if b==0xc2: return False
        if b==0xc3: return True
        if b==0xcb: return struct.unpack('>d',read(8))[0]
        if b==0xcc: return struct.unpack('>B',read(1))[0]
        if b==0xcd: return struct.unpack('>H',read(2))[0]
        if b==0xce: return struct.unpack('>I',read(4))[0]
        if b==0xcf: return struct.unpack('>Q',read(8))[0]
        if b==0xd0: return struct.unpack('>b',read(1))[0]
        if b==0xd1: return struct.unpack('>h',read(2))[0]
        if b==0xd2: return struct.unpack('>i',read(4))[0]
        if b==0xd9: n=struct.unpack('>B',read(1))[0]; return read(n).decode('utf-8','replace')
        if b==0xda: n=struct.unpack('>H',read(2))[0]; return read(n).decode('utf-8','replace')
        if b==0xdc: n=struct.unpack('>H',read(2))[0]; return [decode() for _ in range(n)]
        if b==0xdd: n=struct.unpack('>I',read(4))[0]; return [decode() for _ in range(n)]
        if b==0xde: n=struct.unpack('>H',read(2))[0]; return {decode():decode() for _ in range(n)}
        return f'?{b:02x}?'
    return decode()

fname = sys.argv[1] if len(sys.argv) > 1 else 'helpers/duello/5roundswebsocket.txt'

with open(fname) as f:
    lines = f.readlines()

locations = []
final_scores = {}
round_num = 0

for line in lines:
    line = line.strip()
    b64 = None
    if '[OG-WS' in line:
        # "... [OG-WS ←] BASE64" veya "[OG-WS ←] BASE64"
        parts = line.split('] ')
        b64 = parts[-1].strip()
    if not b64:
        continue
    try:
        data = base64.b64decode(b64)
        msg = decode_msgpack(data)
        if not isinstance(msg, dict):
            continue
        t = msg.get('type', '')

        if t == 'registered':
            print(f"[KAYIT] clientId={msg.get('id')}, token={msg.get('sessionToken')}")

        elif t == 'join_accepted':
            print(f"[ODA] roomId={msg.get('roomId')}, host={msg.get('host')}")

        elif t == 'property_updated':
            key = msg.get('update', {}).get('key', '')
            op  = msg.get('update', {}).get('operation', {})
            op_data = op.get('data', {})
            value = op_data.get('value')

            if key == 'location' and isinstance(value, list) and len(value) >= 2:
                round_num += 1
                lat, lon = float(value[0]), float(value[1])
                locations.append((lat, lon))
                print(f"[TUR {round_num}] Konum: lat={lat:.6f}, lon={lon:.6f}")

            elif key == 'players' and isinstance(op_data.get('type'), str):
                upd_val = op_data.get('updateValue')
                otype   = op_data.get('type', '')
                if 'update' in otype and isinstance(upd_val, dict):
                    cid   = upd_val.get('clientId', '?')
                    score = upd_val.get('score', 0)
                    uname = upd_val.get('username', '?')
                    elo   = upd_val.get('elo', 0)
                    final_scores[cid] = {'username': uname, 'score': score, 'elo': elo}
                    print(f"[SKOR] {uname} ({cid}): skor={score}, elo={elo}")

            elif key == 'gameStarted' and value is True:
                print("[OYUN] Oyun başladı")

            elif key == 'currentRound':
                print(f"[ROUND] Mevcut tur -> {value}")

            elif key == 'showResult' and value is True:
                print("[SONUÇ] Tur sonuçları gösteriliyor")

    except Exception:
        pass

print("\n" + "="*50)
print(f"Toplam konum: {len(locations)}")
for i, (lat, lon) in enumerate(locations, 1):
    print(f"  Tur {i}: lat={lat:.6f}, lon={lon:.6f}")
print("\nFinal skorlar:")
for cid, info in final_scores.items():
    print(f"  {info['username']} ({cid}): skor={info['score']}, elo={info['elo']}")
