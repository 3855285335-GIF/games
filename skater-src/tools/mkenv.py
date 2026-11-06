# 把 Poly Haven（CC0）的 .hdr 全景做成游戏用的背景和光照：python3 mkenv.py 全景.hdr day 0.8（在 tools 文件夹里运行）
# 白天：potsdamer_platz_1k.hdr（github.com/pmndrs/drei-assets 里有）；黄昏：venice_sunset_1k.hdr（three.js 仓库 examples/textures/equirectangular）
import numpy as np, sys, base64, struct
from PIL import Image
from rgbe import read_hdr
IN=np.array([[0.59719,0.35458,0.04823],[0.07600,0.90834,0.01566],[0.02840,0.13383,0.83777]])
OUT=np.array([[1.60475,-0.53108,-0.07367],[-0.10208,1.10813,-0.00605],[-0.00327,-0.07276,1.07602]])
def aces(c, exp):
    c=c*(exp/0.6)
    c=c@IN.T
    a=c*(c+0.0245786)-0.000090537; b=c*(0.983729*c+0.4329510)+0.238081
    c=a/b; c=c@OUT.T
    return np.clip(c,0,1)
def srgb(c): return np.where(c<=0.0031308, c*12.92, 1.055*np.power(np.maximum(c,0),1/2.4)-0.055)
def half_b64(a):
    h=a.astype(np.float16)
    return base64.b64encode(h.tobytes()).decode()
src, name, exp = sys.argv[1], sys.argv[2], float(sys.argv[3])
a=read_hdr(src)            # (H,W,3) linear
H,W,_=a.shape
# 背景：ACES 色调映射后存 JPEG（和游戏里同样的曝光，画面上不会一亮一暗）
img=srgb(aces(a,exp))
from PIL import ImageFilter
# 远处像相机景深一样稍微虚一点（Touchgrind 的远景也是虚的），顺便盖住照片分辨率不够的问题；地面那一半（离得近）虚得少一点
im=Image.fromarray((img*255+0.5).astype(np.uint8))
top=im.crop((0,0,W,H//2+H//16)).filter(ImageFilter.GaussianBlur(2.2)); bot=im.filter(ImageFilter.GaussianBlur(1.2))
bot.paste(top,(0,0)); bot.save('../assets/bg_%s.jpg'%name, quality=88, optimize=True, progressive=True)
# 光照：缩成 128×64 的半精度浮点（RGBA），给环境光和反射用
def down(a, w, h):
    f=a.shape[1]//w
    return a.reshape(h, a.shape[0]//h, w, f, 3).mean(axis=(1,3))
s=down(a,128,64)[::-1]; rgba=np.concatenate([s, np.ones((64,128,1))],axis=2)  # 上下翻：DataTexture 第一行在下面
open('../assets/env_%s.txt'%name,'w').write(half_b64(rgba.astype(np.float32)))
# 太阳方向：天空里最亮的地方（阴天就是最亮的那片云）
lum=0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
up=lum[:H//2]; y,x=np.unravel_index(np.argmax(up), up.shape)
phi=(x+0.5)/W*2*np.pi; th=(y+0.5)/H*np.pi
print(name, 'max', float(a.max()), 'sun elev deg', 90-th*180/np.pi, 'u', (x+0.5)/W, 'median lum', float(np.median(lum)), 'sky median', float(np.median(up)), 'ground median', float(np.median(lum[H//2:])))
