#!/usr/bin/env python3
"""Monta o Prisma CRM.

  python3 build.py           → dist/index.html  (artifact do Claude: um arquivo só, CSS e JS embutidos)
  python3 build.py vercel    → public/          (site para a Vercel: login dos sócios + Supabase em tempo real)
"""
import json, pathlib, re, shutil, sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
ALVO = sys.argv[1] if len(sys.argv) > 1 else 'claude'
assert ALVO in ('claude', 'vercel'), f'alvo desconhecido: {ALVO}'

css = (SRC / 'styles.css').read_text()
shell = (SRC / 'shell.html').read_text()
js_files = sorted((SRC / 'js').glob('*.js'))
js = '\n'.join(f'/* ── {p.name} ── */\n' + p.read_text() for p in js_files)
symbols = dict(re.findall(r'<symbol id="i-([\w-]+)" viewBox="0 0 24 24">(.*?)</symbol>', shell, re.S))
shell = re.sub(r'<svg width="0" height="0".*?</svg>\n', '', shell, count=1, flags=re.S)
def _inline(m):
    attrs, name = m.group(1), m.group(2)
    return f'<svg{attrs} viewBox="0 0 24 24">{symbols[name]}</svg>'
shell = re.sub(r'<svg([^>]*)><use href="#i-([\w-]+)"></use></svg>', _inline, shell)
assert '<use' not in shell, 'sobrou <use> no HTML'
js = 'const ICONS = ' + json.dumps(symbols, ensure_ascii=False) + ';\n' + js
assert '<use' not in js.replace('ICONS', ''), 'sobrou <use> no JS'

FONTES = '''<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">'''

if ALVO == 'claude':
    OUT = ROOT / 'dist' / 'index.html'
    html = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prisma CRM</title>
<meta name="description" content="CRM da Prisma Systems: funil de leads, clientes, projetos, caixa e agenda dos sócios.">
{FONTES}
<style>
{css}
</style>
</head>
<body>
{shell}
<script>
(function () {{
'use strict';
{js}
}})();
</script>
</body>
</html>
'''
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html)
    (ROOT / 'dist' / 'app.check.js').write_text("(function(){'use strict';\n" + js + "\n})();\n")
    print(f'ok: {OUT} ({len(html)/1024:.1f} KiB, {len(js_files)} arquivos JS)')
    sys.exit(0)

# ── Vercel ──
V = SRC / 'vercel'
conf = json.loads((V / 'config.json').read_text())
sbjs_nome = f"supabase-{conf['supabaseJs']}.js"
sbjs_origem = ROOT / 'vendor' / sbjs_nome
assert sbjs_origem.exists(), f'falta {sbjs_origem}'
OUT = ROOT / 'public'
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / 'vendor').mkdir(parents=True)
shutil.copy(sbjs_origem, OUT / 'vendor' / sbjs_nome)
for nome in ('favicon.svg', 'manifest.webmanifest', 'icone-192.png', 'icone-512.png', 'apple-touch-icon.png'):
    shutil.copy(V / nome, OUT / nome)
runtime = (V / 'runtime.js').read_text()
auth_css = (V / 'auth.css').read_text()
cfg_js = json.dumps({'url': conf['url'], 'key': conf['key']})
html = f'''<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Prisma CRM</title>
<meta name="description" content="CRM da Prisma Systems: funil de leads, clientes, projetos, caixa e agenda dos sócios.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#050816">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="apple-mobile-web-app-title" content="Prisma CRM">
{FONTES}
<style>
{css}
{auth_css}
</style>
</head>
<body class="auth-on">
<div id="auth" class="auth"></div>
{shell}
<script src="/vendor/{sbjs_nome}"></script>
<script>window.PRISMA_CFG = {cfg_js};</script>
<script>
window.__prismaBoot = function () {{
'use strict';
{js}
}};
</script>
<script>
{runtime}
</script>
</body>
</html>
'''
(OUT / 'index.html').write_text(html)
(ROOT / 'dist').mkdir(exist_ok=True)
(ROOT / 'dist' / 'vercel.check.js').write_text("(function(){'use strict';\n" + js + "\n})();\n" + runtime)
print(f'ok: {OUT}/index.html ({len(html)/1024:.1f} KiB) + vendor/{sbjs_nome}')
