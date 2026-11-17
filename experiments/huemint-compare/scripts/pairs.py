# usage: python3 -I pairs.py <metrics.json>  — per-pair separation, normal + deutan
import json,sys,statistics as st, importlib.util
spec=importlib.util.spec_from_file_location('a','/tmp/huemint-probe/scripts/analyze.py')
src=open('/tmp/huemint-probe/scripts/analyze.py').read().split('cc=json.load')[0]
ns={}; exec(src.replace('raw, ccpath, outpath = sys.argv[1:4]',''),ns)
d=json.load(open(sys.argv[1]))
for g in ['hm-transformer','hm-diffusion','cc-hop0','cc-riff']:
    rows=[r for s,v in d.items() if s!='free' for r in v.get(g,[])]
    out=[]
    for i,j,lab in [(3,4,'pri-sec'),(3,5,'pri-3rd'),(4,5,'sec-3rd')]:
        n=[ns['de'](ns['oklab'](r['palette'][i]),ns['oklab'](r['palette'][j])) for r in rows]
        dd=[ns['de'](ns['deutan'](r['palette'][i]),ns['deutan'](r['palette'][j])) for r in rows]
        dl=[abs(ns['lch'](r['palette'][i])[0]-ns['lch'](r['palette'][j])[0]) for r in rows]
        out.append(f'{lab}: dE {st.median(n):5.1f} deu {st.median(dd):5.1f} |dL| {st.median(dl):.3f}')
    print(g.ljust(15),' | '.join(out))
