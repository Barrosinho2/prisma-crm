// Navega clicando no menu (rápido e devagar) e verifica se alguma página fica em branco.
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs'
import { spawn } from 'node:child_process'
import { criarFalso } from './supabase-falso.mjs'
const PORTA = 4183, BASE = `http://localhost:${PORTA}`
const f = criarFalso()
const sv = spawn('node_modules/.bin/vite', ['preview', '--port', String(PORTA), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname })
await new Promise(r => setTimeout(r, 2500))
const b = await chromium.launch()
const resultado = []
async function rodar(vp, nome, atraso, extra = {}) {
  const ctx = await b.newContext({ viewport: vp, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', ...extra })
  await ctx.route(/supabase\.co/, r => f.tratar(r))
  const p = await ctx.newPage()
  const erros = []; p.on('pageerror', e => erros.push(e.message))
  await p.goto(BASE)
  await p.getByLabel('E-mail').fill(f.email); await p.getByLabel('Senha', { exact: true }).fill(f.senha)
  await p.getByRole('button', { name: 'Entrar' }).click()
  await p.getByText('Disponível para gastar').first().waitFor({ timeout: 15000 })
  const rotas = ['/transacoes', '/contas', '/cartoes', '/a-pagar', '/orcamentos', '/metas', '/calendario', '/relatorios', '/configuracoes', '/']
  let brancos = 0
  for (let volta = 0; volta < 3; volta++) for (const r of rotas) {
    if (vp.width >= 1024) await p.locator(`aside a[href="${r}"]`).click()
    else await p.evaluate(r => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')) }, r)
    await p.waitForTimeout(atraso)
  }
  for (const r of rotas) {
    if (vp.width >= 1024) await p.locator(`aside a[href="${r}"]`).click()
    else await p.evaluate(r => { history.pushState({}, '', r); dispatchEvent(new PopStateEvent('popstate')) }, r)
    await p.waitForTimeout(1500)
    const txt = (await p.locator('main').innerText().catch(() => '')).trim()
    const op = await p.evaluate(() => { const d = document.querySelector('main > div'); return d ? getComputedStyle(d).opacity : 'sem' })
    if (txt.length < 20 || op === '0') { brancos++; resultado.push(`${nome} ${r}: EM BRANCO (texto ${txt.length}, opacidade ${op})`) }
  }
  resultado.push(`${nome} atraso ${atraso}ms: ${brancos} páginas em branco; erros: ${erros.slice(0, 3).join(' | ') || 'nenhum'}`)
  await ctx.close()
}
await rodar({ width: 1440, height: 900 }, 'desktop', 40)
await rodar({ width: 1440, height: 900 }, 'desktop', 400)
await rodar({ width: 390, height: 844 }, 'celular', 60, { isMobile: true, hasTouch: true })
console.log(resultado.join('\n'))
await b.close(); sv.kill()
