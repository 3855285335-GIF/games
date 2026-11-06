import numpy as np, sys, re
from PIL import Image
def read_hdr(path):
    f=open(path,'rb'); data=f.read(); f.close()
    i=data.index(b'\n\n')+2
    m=re.match(rb'([-+][YX]) (\d+) ([-+][YX]) (\d+)\n', data[i:])
    h=int(m.group(2)); w=int(m.group(4)); i+=m.end()
    img=np.zeros((h,w,4),np.uint8); pos=i
    for y in range(h):
        if data[pos]==2 and data[pos+1]==2:
            pos+=4
            for c in range(4):
                x=0
                while x<w:
                    n=data[pos]; pos+=1
                    if n>128:
                        n-=128; img[y,x:x+n,c]=data[pos]; pos+=1
                    else:
                        img[y,x:x+n,c]=np.frombuffer(data[pos:pos+n],np.uint8); pos+=n
                    x+=n
        else:
            img[y]=np.frombuffer(data[pos:pos+4*w],np.uint8).reshape(w,4); pos+=4*w
    e=img[...,3].astype(np.float32)
    sc=np.where(e>0, np.ldexp(1.0, (e-136).astype(np.int32)), 0)
    return img[...,:3].astype(np.float32)*sc[...,None]
if __name__=='__main__':
    for p in sys.argv[1:]:
        a=read_hdr(p)
        lum=0.2126*a[...,0]+0.7152*a[...,1]+0.0722*a[...,2]
        key=np.exp(np.mean(np.log(lum+1e-4)))
        b=a*(0.25/key); b=b/(1+b); b=np.clip(b**(1/2.2),0,1)
        im=Image.fromarray((b*255).astype(np.uint8)); im=im.resize((768,384))
        out=p.split('/')[-1].replace('.hdr','')+'.png'; im.save(out); print(out, a.shape, float(a.max()))
