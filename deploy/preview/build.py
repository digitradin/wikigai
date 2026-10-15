import re, shutil, os, pathlib
SRC='/home/claude/wk/frontend/public'; OUT='/home/claude/preview/site'
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT+'/assets/brand')
def fixpaths(s):
    return re.sub(r'(["\'(`])/assets/', r'\1assets/', s)
def fixjs(s):
    s=fixpaths(s)
    s=re.sub(r'location\.href\s*=\s*([^;]+);', lambda m: 'location.href = window.__WK_URL__('+m.group(1).strip()+');', s)
    s=s.replace("location.replace(params.get('review') === '1' ? '/ikigai' : '/ikigai/skills?flow=1');",
                "location.replace(window.__WK_URL__(params.get('review') === '1' ? '/ikigai' : '/ikigai/skills?flow=1'));")
    s=s.replace('new URLSearchParams(location.search)','new URLSearchParams(window.__WK_Q__ || location.search)')
    s=s.replace("const seg = location.pathname.replace(/\\/+$/, '').split('/')[2] || 'overview';",
                "const seg = window.__WK_PAGE__ ? window.__WK_PAGE__() : (location.pathname.replace(/\\/+$/, '').split('/')[2] || 'overview');")
    s=s.replace("function go(href) { history.pushState({}, '', href); render(true); }",
                "function go(href) { history.pushState({}, '', window.__WK_URL__ ? window.__WK_URL__(href) : href); render(true); }")
    return s
# assets
for f in ['app.js','survey.js','ikigai.js','support.js','site.js','survey-data.js','survey-bank-1.js','survey-bank-2.js','survey-data-2b.js','pay-eu.js']:
    open(f'{OUT}/assets/{f}','w').write(fixjs(open(f'{SRC}/assets/{f}').read()))
for f in ['app.css','brand.css','survey.css','ikigai.css','wk.css']:
    open(f'{OUT}/assets/{f}','w').write(fixpaths(open(f'{SRC}/assets/{f}').read()))
for f in ['wikigai-logo.png','favicon.png','stage1.jpg','stage2.jpg','stage3.jpg','wikigai-demo.gif']:
    shutil.copy(f'{SRC}/assets/brand/{f}', f'{OUT}/assets/brand/{f}')
shutil.copy('/home/claude/preview/preview.js', f'{OUT}/assets/preview.js')
# translations: runtime + every locale file
for src in pathlib.Path(f'{SRC}/assets/i18n').rglob('*.js'):
    dst = pathlib.Path(OUT) / src.relative_to(SRC)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(fixpaths(src.read_text()))
PRE='<script src="assets/preview.js"></script>\n'
def page(src, dst):
    s=open(src).read()
    s=fixjs(s)  # inline scripts too
    s=s.replace('<head>','<head>\n'+PRE,1)
    open(f'{OUT}/{dst}','w').write(s)
page(f'{SRC}/dashboard/index.html','dashboard.html')
page(f'{SRC}/survey.html','survey.html')
page(f'{SRC}/ikigai.html','ikigai.html')
page(f'{SRC}/support.html','support.html')
# main page = landing, without document wrappers (artifact adds its own skeleton)
s=fixjs(open(f'{SRC}/index.html').read())
head=re.search(r'<head>(.*?)</head>',s,re.S).group(1)
head=head.replace('<title>Wikigai — Discover your perfect path</title>','<title>Wikigai Preprod</title>')
head=re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>','',head)
head=re.sub(r'<link rel="stylesheet" href="https://cdnjs[^>]*>','',head)
bm=re.search(r'<body([^>]*)>(.*)</body>',s,re.S)
cls=re.search(r'class="([^"]*)"',bm.group(1)); cls=cls.group(1) if cls else ''
main=head.strip()+'\n'+PRE+f'<script>document.addEventListener("DOMContentLoaded",function(){{document.body.className+=" {cls}";}});</script>\n'+bm.group(2)
open(f'{OUT}/index.html','w').write(main)
print(sorted(str(p.relative_to(OUT)) for p in pathlib.Path(OUT).rglob('*') if p.is_file()))
