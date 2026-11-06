# 用真实录音拼出起跳、落地、接板的声音（2026-11-07 用户说音效要"真的：木头啪板、轮子砸地"）
# 原始录音：Kenney「Impact Sounds」，CC0 公共领域（tools/sfx_src/Kenney_License.txt），取自
#   https://github.com/series-ai/jam-ready-assets/tree/HEAD/kenney-impact-sounds
# 不是滑板的录音：是鞋底踩水泥、木板砸地、木头敲击、金属轻碰、闷响这些真实录音，按滑板发声的部位叠起来：
#   起跳 = 板尾砸水泥的"啪"（鞋跟踩水泥的脆响）+ 板子木头的身子（木板砸地）+ 一点木头的共振
#   落地 = 四个轮子砸地的闷响（前后轮差十几毫秒）+ 水泥上的接触声 + 板子木头 + 支架的金属声
#   接板 = 木头轻敲 + 鞋踩木板
# 用法：python3 tools/mksfx.py  → 生成 assets/sfx_*.mp3（打包时直接打进网页）
import os, subprocess, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, resample_poly

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'sfx_src')
OUT = os.path.join(HERE, '..', 'assets')
SR = 48000

def load(name):
    with tempfile.NamedTemporaryFile(suffix='.wav') as t:
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(SRC, name + '.ogg'), '-ac', '1', '-ar', str(SR), t.name], check=True)
        sr, x = wavfile.read(t.name)
    x = x.astype(np.float64) / 32768.0
    a = np.abs(x); i0 = int(np.argmax(a > a.max() * 0.02)) # 从声音真正开始的地方算起
    return x[max(0, i0 - 24):]

def hp(x, f): return sosfilt(butter(2, f, 'highpass', fs=SR, output='sos'), x)
def lp(x, f): return sosfilt(butter(2, f, 'lowpass', fs=SR, output='sos'), x)
def pitch(x, r):  # r > 1 音调变高（变短）
    up, down = int(round(r * 100)), 100
    return resample_poly(x, down, up)

def mix(n, parts):
    y = np.zeros(int(n * SR))
    for x, at, g in parts:
        i = int(at * SR); m = min(len(x), len(y) - i)
        if m > 0: y[i:i + m] += g * x[:m]
    return y

def finish(y, fade):
    k = int(fade * SR); y[-k:] *= np.linspace(1, 0, k) ** 2
    y = y / (np.abs(y).max() + 1e-9) * 0.93
    return y

def save(name, y):
    with tempfile.NamedTemporaryFile(suffix='.wav') as t:
        wavfile.write(t.name, SR, (y * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', t.name, '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(OUT, name + '.mp3')], check=True)
    print(name, f'{len(y) / SR * 1000:.0f} ms', os.path.getsize(os.path.join(OUT, name + '.mp3')), 'bytes')

def bright(x, f=1500, g=3.0): return x + g * hp(x, f)  # 高频提一点（原始录音偏闷，真板子起跳的"啪"高频很足）

# 起跳 3 个版本
for i, (c, p, wd) in enumerate([('footstep_concrete_001', 'impactPlank_medium_004', 'impactWood_light_002'),
                                 ('footstep_concrete_002', 'impactPlank_medium_000', 'impactWood_light_000'),
                                 ('footstep_concrete_001', 'impactPlank_medium_002', 'impactWood_light_004')]):
    crack = bright(hp(pitch(load(c), 1.7 + 0.15 * i), 500), 1500, 3.0)  # 板尾砸到水泥：又硬又脆（板尾比鞋跟小、硬，音调高一些）
    body = hp(load(p), 250)                       # 板子的木头身子
    ring = pitch(load(wd), 1.6 + 0.12 * i)        # 七层枫木的共振（音调提高一点，更像薄板）
    y = mix(0.32, [(crack, 0, 1.0), (body, 0.0015, 0.3), (ring, 0.001, 0.22)])
    save(f'sfx_pop{i + 1}', finish(y, 0.08))
# 落地 3 个版本：后轮先着地，前轮晚十几毫秒
for i, (s1, s2, c, p, m) in enumerate([('impactSoft_medium_000', 'impactSoft_medium_002', 'footstep_concrete_000', 'impactPlank_medium_002', 'impactMetal_light_001'),
                                       ('impactSoft_medium_002', 'impactSoft_medium_003', 'footstep_concrete_004', 'impactPlank_medium_004', 'impactMetal_light_004'),
                                       ('impactSoft_medium_003', 'impactSoft_medium_000', 'footstep_concrete_001', 'impactPlank_medium_000', 'impactMetal_light_002')]):
    dt = 0.011 + 0.006 * i
    wheel1, wheel2 = load(s1), pitch(load(s2), 1.08)  # 轮子砸地的闷响
    contact = bright(hp(pitch(load(c), 1.3), 250), 1500, 2.5)  # 轮子拍在水泥上
    deck = hp(load(p), 150)                           # 板子木头
    truck = hp(load(m), 1500)                         # 支架的金属声（很轻）
    # 手机喇叭放不出 200 Hz 以下的声音：闷响只占一部分，拍地和木头的中频要够，不然手机上听着发虚
    y = mix(0.45, [(wheel1, 0, 0.3), (contact, 0, 1.0), (deck, 0.002, 0.6), (truck, 0.003, 0.2),
                   (wheel2, dt, 0.26), (contact * 0.8, dt, 0.8), (deck, dt + 0.002, 0.35), (truck, dt + 0.002, 0.15)])
    save(f'sfx_land{i + 1}', finish(y, 0.12))
# 接板 3 个版本：脚踩回板上（木头上闷闷的一下；鞋踩木地板的录音太低，手机喇叭放不出来，改用木头轻敲）
for i, (f, st) in enumerate([('impactWood_light_000', 'footstep_wood_000'), ('impactWood_light_002', 'footstep_wood_002'), ('impactWood_light_004', 'footstep_wood_004')]):
    y = mix(0.16, [(pitch(load(f), 1.15), 0, 0.8), (load(st), 0, 0.5)])
    save(f'sfx_catch{i + 1}', finish(y, 0.04))
