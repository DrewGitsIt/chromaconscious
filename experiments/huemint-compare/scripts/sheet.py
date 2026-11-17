# usage: python3 -I sheet.py <metrics.json> <outdir>  — blind contact sheet, 8 tiles per engine per brand
import json,sys,random,html,os
d=json.load(open(sys.argv[1])); out=sys.argv[2]
rng=random.Random(20261116)
def tile(p,label):
    bg,card,text,pri,sec,thr=p
    return f'''<div class="t" data-id="{label}" tabindex="0" role="button" aria-pressed="false" style="background:{bg}"><div class="lab">{label}</div><div class="tick">✓ picked</div>
<div class="card" style="background:{card};color:{text}"><div class="h">Revenue</div><div class="n">$48,210</div>
<div class="bars"><i style="background:{pri};width:70%"></i><i style="background:{sec};width:45%"></i><i style="background:{thr};width:30%"></i></div>
<div class="row"><span class="btn" style="background:{pri};color:{card}">Save</span><span class="chip" style="background:{sec};color:{card}">New</span><span class="dot" style="background:{thr}"></span></div></div>
<div class="sw">{''.join(f'<b style="background:{c}" title="{c}"></b>' for c in p)}</div></div>'''
key={}; rows=[]
for src in [s for s in d if s!='free']:
    hm=sorted(d[src]['hm-transformer'],key=lambda r:-r['score'])[:6]+d[src]['hm-diffusion'][:2]
    cc=[d[src]['cc-riff'][i] for i in (0,1,3,6,10,20,35,49)]
    items=[('huemint',r['palette']) for r in hm]+[('chromaconscious',r['palette']) for r in cc]
    rng.shuffle(items)
    tiles=[]
    for k,(eng,p) in enumerate(items):
        lab=f'{src[1:]}-{k+1:02d}'; key[lab]=eng; tiles.append(tile(p,lab))
    rows.append(f'<h2>brand #{src[1:]} <span class="cnt" data-brand="{src[1:]}">0 picked</span></h2><div class="g" data-brand="{src[1:]}">{"".join(tiles)}</div>')
css='''body{font:13px system-ui;margin:16px;background:#888}h2{margin:18px 0 6px;font-size:14px}.g{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}
.t{padding:10px;border-radius:6px;position:relative}.lab{font:10px monospace;color:#000;background:#fff8;display:inline-block;padding:0 3px;margin-bottom:4px}
.card{border-radius:6px;padding:10px}.h{font-size:11px;opacity:.7}.n{font-size:18px;font-weight:700;margin:2px 0 6px}
.bars i{display:block;height:6px;border-radius:3px;margin:3px 0}.row{display:flex;gap:6px;align-items:center;margin-top:8px}
.btn,.chip{padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600}.dot{width:12px;height:12px;border-radius:50%}
.sw{display:flex;margin-top:6px}.sw b{flex:1;height:10px}'''
css+='''.t{cursor:pointer;outline:0 solid transparent;transition:outline-width .08s}.t:focus-visible{box-shadow:0 0 0 3px #fff}
.t.on{outline:5px solid #000;outline-offset:2px;box-shadow:0 0 0 9px #fff}.tick{display:none;position:absolute;top:6px;right:6px;background:#000;color:#fff;font:700 11px system-ui;padding:2px 6px;border-radius:3px}
.t.on .tick{display:block}.cnt{font-weight:400;font-size:12px;margin-left:8px}
.bar{position:sticky;top:0;z-index:5;background:#222;color:#fff;padding:8px 12px;margin:-16px -16px 8px;display:flex;gap:12px;align-items:center}
.bar button{font:600 13px system-ui;padding:6px 12px;border-radius:4px;border:0;cursor:pointer}#msg{font-size:12px;opacity:.85}
textarea#out{display:none;width:100%;height:120px;margin-top:8px;font:11px monospace}'''
js='''const KEY='huemint-blind-picks-v1';const picks=new Set(JSON.parse(localStorage.getItem(KEY)||'[]'));
const tiles=[...document.querySelectorAll('.t')];
function render(){tiles.forEach(t=>{const on=picks.has(t.dataset.id);t.classList.toggle('on',on);t.setAttribute('aria-pressed',on)});
document.querySelectorAll('.cnt').forEach(c=>{const n=tiles.filter(t=>t.closest('.g').dataset.brand===c.dataset.brand&&picks.has(t.dataset.id)).length;c.textContent=n+' picked'});
document.getElementById('total').textContent=picks.size+' tiles picked';localStorage.setItem(KEY,JSON.stringify([...picks]))}
function toggle(t){picks.has(t.dataset.id)?picks.delete(t.dataset.id):picks.add(t.dataset.id);render()}
tiles.forEach(t=>{t.onclick=()=>toggle(t);t.onkeydown=e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();toggle(t)}}});
function answers(){const by={};document.querySelectorAll('.g').forEach(g=>{by[g.dataset.brand]=[...g.querySelectorAll('.t')].map(t=>t.dataset.id).filter(id=>picks.has(id))});
return {sheet:'huemint-compare blind-sheet r1',exported:new Date().toISOString(),picked:by}}
document.getElementById('exp').onclick=async()=>{const txt=JSON.stringify(answers(),null,1);const o=document.getElementById('out');o.value=txt;o.style.display='block';
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));a.download='blind-picks.json';a.click();
let m='Downloaded blind-picks.json';try{await navigator.clipboard.writeText(txt);m+=' and copied to clipboard'}catch(e){m+=' (copy the text below if the clipboard failed)'}document.getElementById('msg').textContent=m};
document.getElementById('clr').onclick=()=>{if(confirm('Clear all picks?')){picks.clear();render()}};render();'''
bar='<div class="bar"><b>Click every tile you like (any number per brand)</b><span id="total"></span><button id="exp">Export answers</button><button id="clr">Clear</button><span id="msg"></span></div><textarea id="out" readonly></textarea>'
open(os.path.join(out,'blind-sheet.html'),'w').write(f'<!doctype html><meta charset=utf-8><title>blind sheet</title><style>{css}</style>{bar}{"".join(rows)}<script>{js}</script>')
json.dump(key,open(os.path.join(out,'blind-key.json'),'w'),indent=0)
print('tiles',len(key))
