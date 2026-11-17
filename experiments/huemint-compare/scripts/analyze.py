# usage: python3 -I analyze.py <rawdir> <cc.json> <out.json>
import json, math, sys, glob, os, statistics as st
raw, ccpath, outpath = sys.argv[1:4]
def srgb(h):
    h=h.lstrip('#'); v=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return [x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in v]
def oklab_lin(r,g,b):
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b; m=0.2119034982*r+0.6806995451*g+0.1073969566*b; s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=[math.copysign(abs(x)**(1/3),x) for x in (l,m,s)]
    return (0.2104542553*l+0.7936177850*m-0.0040720468*s, 1.9779984951*l-2.4285922050*m+0.4505937099*s, 0.0259040371*l+0.7827717662*m-0.8086757660*s)
def oklab(h): return oklab_lin(*srgb(h))
def lch(h):
    L,a,b=oklab(h); return L, math.hypot(a,b), math.degrees(math.atan2(b,a))%360
# Machado 2009 deuteranopia, severity 1.0, applied in linear RGB
DEU=[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]]
def deutan(h):
    v=srgb(h); w=[max(0,min(1,sum(DEU[i][j]*v[j] for j in range(3)))) for i in range(3)]
    return oklab_lin(*w)
def de(a,b): return 100*math.dist(a,b)
def lum(h):
    r,g,b=srgb(h); return 0.2126*r+0.7152*g+0.0722*b
def wcag(a,b):
    x,y=sorted([lum(a),lum(b)]); return (y+0.05)/(x+0.05)
def hoff(a,b):  # signed hue offset b-a in (-180,180]
    d=(b-a+180)%360-180; return d
# CIE76 Lab ΔE (what Huemint's adjacency targets)
def lab76(h):
    r,g,b=srgb(h); X=(0.4124*r+0.3576*g+0.1805*b)/0.95047; Y=0.2126*r+0.7152*g+0.0722*b; Z=(0.0193*r+0.1192*g+0.9505*b)/1.08883
    f=lambda t: t**(1/3) if t>0.008856 else 7.787*t+16/116
    return (116*f(Y)-16, 500*(f(X)-f(Y)), 200*(f(Y)-f(Z)))
ADJ=[0,10,80,55,45,35, 10,0,90,65,45,45, 80,90,0,0,0,0, 55,65,0,0,35,65, 45,45,0,35,0,35, 35,45,0,65,35,0]
def fit(p):  # mean |ΔE76 - target| over connected pairs
    e=[abs(math.dist(lab76(p[i]),lab76(p[j]))-ADJ[i*6+j]) for i in range(6) for j in range(i+1,6) if ADJ[i*6+j]>0]
    return sum(e)/len(e)
def metrics(p):
    bg,card,text,pri,sec,thr=p
    L=[lch(x) for x in p]
    col=[pri,sec,thr]
    pairs=[(0,1),(0,2),(1,2)]
    return dict(
        bgL=L[0][0], bgC=L[0][1], textL=L[2][0], textC=L[2][1],
        priL=L[3][0], priC=L[3][1], secL=L[4][0], secC=L[4][1], thrL=L[5][0], thrC=L[5][1],
        secHueOff=hoff(L[3][2],L[4][2]) if L[3][1]>0.03 and L[4][1]>0.03 else None,
        thrHueOff=hoff(L[3][2],L[5][2]) if L[3][1]>0.03 and L[5][1]>0.03 else None,
        nColorful=sum(1 for x in L[3:] if x[1]>0.04),
        accentsAchromatic=sum(1 for x in L[4:] if x[1]<0.04),
        minDE=min(de(oklab(col[i]),oklab(col[j])) for i,j in pairs),
        minDEdeutan=min(de(deutan(col[i]),deutan(col[j])) for i,j in pairs),
        textBg=wcag(text,bg), priCard=wcag(pri,card), secCard=wcag(sec,card), thrCard=wcag(thr,card),
        Lspread=st.pstdev([x[0] for x in L[3:]]), Cspread=st.pstdev([x[1] for x in L[3:]]),
        fit=fit(p))
cc=json.load(open(ccpath))
data={}
for f in sorted(glob.glob(os.path.join(raw,'*-*.json'))):
    name=os.path.basename(f)[:-5]
    if name.startswith('t4'): continue
    src,mode=name.split('-')
    data.setdefault(src,{})['hm-'+mode]=[dict(palette=r['palette'],score=r['score'],**metrics(r['palette'])) for r in json.load(open(f))['results']]
for b,v in cc.items():
    data['b'+b]['cc-hop0']=[dict(palette=v[0]['palette'],**metrics(v[0]['palette']))]
    data['b'+b]['cc-riff']=[dict(palette=x['palette'],judge=x['judge'],**metrics(x['palette'])) for x in v]
json.dump(data,open(outpath,'w'))
# ---- summary tables
def agg(rows,k):
    xs=[r[k] for r in rows if r[k] is not None]
    return (st.median(xs) if xs else float('nan'))
keys=['bgL','bgC','textL','priC','secL','secC','thrL','thrC','nColorful','accentsAchromatic','minDE','minDEdeutan','textBg','secCard','thrCard','Lspread','Cspread','fit']
groups={'hm-transformer':[], 'hm-diffusion':[], 'cc-hop0':[], 'cc-riff':[]}
for src,d in data.items():
    if src=='free': continue
    for g in groups: groups[g]+=d.get(g,[])
groups['hm-free-transformer']=data['free']['hm-transformer']
print('median over 8 brands (free = unseeded)')
print('metric'.ljust(18)+''.join(g[:16].rjust(17) for g in groups))
for k in keys: print(k.ljust(18)+''.join(f'{agg(r,k):17.3f}' for r in groups.values()))
print('n'.ljust(18)+''.join(f'{len(r):17d}' for r in groups.values()))
def share(rows,pred): return sum(1 for r in rows if pred(r))/len(rows)
print('\nshares')
for lab,pred in [('bg pure white/near (L>0.97,C<.01)',lambda r:r['bgL']>0.97 and r['bgC']<0.01),
                 ('bg tinted C>=0.02',lambda r:r['bgC']>=0.02),('bg dark L<0.4',lambda r:r['bgL']<0.4),
                 ('text near-black L<0.3',lambda r:r['textL']<0.3),('>=1 achromatic accent',lambda r:r['accentsAchromatic']>=1),
                 ('min deutan dE<10',lambda r:r['minDEdeutan']<10),('text/bg <4.5',lambda r:r['textBg']<4.5),('sec/card <3',lambda r:r['secCard']<3)]:
    print(lab.ljust(38)+''.join(f'{share(r,pred):10.2f}' for r in groups.values()))
print('\nsecondary hue offset from primary (deg), colorful pairs only')
for g,r in groups.items():
    xs=[x['secHueOff'] for x in r if x['secHueOff'] is not None]
    if not xs: continue
    a=[abs(x) for x in xs]
    bins=[sum(1 for x in a if lo<=x<hi)/len(a) for lo,hi in [(0,15),(15,45),(45,75),(75,135),(135,181)]]
    print(g.ljust(22),f'n={len(xs):3d} median|off|={st.median(a):6.1f}  bins 0-15/15-45/45-75/75-135/135-180:',' '.join(f'{b:.2f}' for b in bins))
