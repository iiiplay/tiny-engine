"""產生 demo 用的音效與背景音樂（純 Python 標準庫，沒有第三方素材）
輸出：
  demo/assets/sfx/coin.wav  hit.wav  bump.wav  win.wav
  demo/assets/bgm.wav        （4 秒循環）
"""
import math
import os
import random
import struct
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
SFX = os.path.join(ASSETS, 'sfx')
os.makedirs(SFX, exist_ok=True)

RATE = 22050


def write_wav(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples)
        w.writeframes(frames)
    print('  %-28s %5.1f KB' % (os.path.relpath(path, ASSETS), os.path.getsize(path) / 1024))


def tone(freq, dur, kind='square', vol=0.35, sweep_to=None, decay=True):
    n = int(RATE * dur)
    out = []
    for i in range(n):
        t = i / RATE
        f = freq if sweep_to is None else freq + (sweep_to - freq) * (i / n)
        ph = (t * f) % 1.0
        if kind == 'square':
            v = 1.0 if ph < 0.5 else -1.0
        elif kind == 'triangle':
            v = 4 * abs(ph - 0.5) - 1
        elif kind == 'saw':
            v = 2 * ph - 1
        else:
            v = math.sin(2 * math.pi * ph)
        env = (1 - i / n) if decay else 1.0
        out.append(v * vol * env)
    return out


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, v in enumerate(t):
            out[i] += v
    return [max(-0.98, min(0.98, v)) for v in out]


def noise(dur, vol=0.3, cutoff=0.35):
    n = int(RATE * dur)
    out, prev = [], 0.0
    for i in range(n):
        s = random.uniform(-1, 1)
        prev = prev * (1 - cutoff) + s * cutoff      # 簡易低通
        out.append(prev * vol * (1 - i / n))
    return out


print('產生音效：')
# 金幣：兩個上行短音
write_wav(os.path.join(SFX, 'coin.wav'),
          mix(tone(920, 0.07, 'square', 0.32), [0] * int(RATE * 0.05) + tone(1380, 0.09, 'square', 0.28)))
# 命中：低頻 + 噪音
write_wav(os.path.join(SFX, 'hit.wav'), mix(tone(200, 0.1, 'square', 0.3, 80), noise(0.09, 0.25)))
# 撞到：低沉
write_wav(os.path.join(SFX, 'bump.wav'), mix(tone(150, 0.16, 'triangle', 0.35, 70), noise(0.1, 0.12, 0.15)))
# 過關：三連上行
win = tone(660, 0.12, 'square', 0.26)
win += [0] * int(RATE * 0.02) + tone(880, 0.12, 'square', 0.26)
win += [0] * int(RATE * 0.02) + tone(1180, 0.3, 'square', 0.3)
write_wav(os.path.join(SFX, 'win.wav'), win)

# 背景音樂：4 秒循環（低音鋪底 + 琶音）
print('產生背景音樂：')
BAR = 2.0
total = int(RATE * BAR * 2)
bgm = [0.0] * total
notes = [220, 277, 330, 440]
for i, f in enumerate(notes):
    seg = tone(f, BAR / 4, 'triangle', 0.1)
    start = int(RATE * (BAR / 4) * i)
    for j, v in enumerate(seg):
        if start + j < total:
            bgm[start + j] += v
for i, f in enumerate([196, 247, 294, 392]):
    seg = tone(f, BAR / 4, 'triangle', 0.1)
    start = int(RATE * (BAR + (BAR / 4) * i))
    for j, v in enumerate(seg):
        if start + j < total:
            bgm[start + j] += v
# 低音
for i in range(4):
    seg = tone([110, 98][i // 2], BAR / 2, 'sine', 0.16, None, False)
    start = int(RATE * (BAR / 2) * i)
    for j, v in enumerate(seg):
        if start + j < total:
            bgm[start + j] += v
# 頭尾淡入淡出（循環不爆音）
fade = int(RATE * 0.05)
for i in range(fade):
    bgm[i] *= i / fade
    bgm[total - 1 - i] *= i / fade
bgm = [max(-0.9, min(0.9, v)) for v in bgm]
write_wav(os.path.join(ASSETS, 'bgm.wav'), bgm)
print('完成')
