/* ───────────────────────── utilidades ───────────────────────── */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (o) => JSON.parse(JSON.stringify(o));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (+fn(x) || 0), 0);
const round2 = (v) => Math.round((+v || 0) * 100) / 100;
const uniq = (arr) => Array.from(new Set(arr));
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function newId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── dinheiro ── */
const NF2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NF0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const money = (v) => NF2.format(+v || 0);
const money0 = (v) => NF0.format(Math.round(+v || 0));
function fmtNum(v, d = 0) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(v);
}
function moneyShort(v) {
  const a = Math.abs(+v || 0);
  const s = v < 0 ? '−' : '';
  if (a >= 1e6) return s + 'R$ ' + fmtNum(a / 1e6, 1) + ' mi';
  if (a >= 1e3) return s + 'R$ ' + fmtNum(a / 1e3, a >= 1e4 ? 0 : 1) + ' mil';
  return s + 'R$ ' + fmtNum(a, 0);
}
function signedMoney0(v) {
  const r = Math.round(+v || 0);
  if (r === 0) return money0(0);
  return (r > 0 ? '+' : '−') + money0(Math.abs(r)).replace('-', '');
}
/* "1.234,56" | "1234,5" | "1234.50" | "R$ 3.000" → número */
function parseMoney(str) {
  if (typeof str === 'number') return str;
  let s = String(str || '').replace(/[R$\s ]/g, '').trim();
  if (!s) return NaN;
  const neg = /^-|^−/.test(s);
  s = s.replace(/^[-−]/, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : (neg ? -n : n);
}
function moneyInputValue(v) {
  if (v === null || v === undefined || v === '' || isNaN(+v)) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(+v);
}
function pct(v, d = 0) {
  return fmtNum(v * 100, d) + '%';
}

/* ── datas (sempre 'AAAA-MM-DD', horário local) ── */
const pad = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toISODate(new Date());
const nowISO = () => new Date().toISOString();
const thisMonth = () => today().slice(0, 7);
function parseD(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function addDays(s, n) {
  const d = parseD(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function lastDayOf(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function addMonths(s, n) {
  const d = parseD(s);
  const day = d.getDate();
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  first.setDate(Math.min(day, last));
  return toISODate(first);
}
function monthAdd(m, n) {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(y, mm - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function dateInMonth(month, day) {
  return `${month}-${pad(Math.min(Math.max(1, +day || 1), lastDayOf(month)))}`;
}
const monthOf = (s) => (s ? String(s).slice(0, 7) : '');
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function monthLabel(m, mode = 'long') {
  const [y, mm] = m.split('-').map(Number);
  const n = MESES[mm - 1];
  if (mode === 'short') return n.slice(0, 3);
  if (mode === 'name') return cap(n);
  return `${cap(n)} de ${y}`;
}
const fmtDate = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const fmtDateShort = (s) => (s ? `${+s.slice(8, 10)} ${MESES[+s.slice(5, 7) - 1].slice(0, 3)}` : '—');
function relDay(s) {
  if (!s) return '—';
  const d = daysBetween(today(), s);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  if (d > 1 && d <= 6) return `em ${d} dias`;
  if (d < -1 && d >= -30) return `há ${-d} dias`;
  return fmtDateShort(s) + (s.slice(0, 4) !== today().slice(0, 4) ? ' ' + s.slice(0, 4) : '');
}
function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const day = toISODate(d);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diff = daysBetween(day, today());
  if (diff === 0) return `hoje, ${hm}`;
  if (diff === 1) return `ontem, ${hm}`;
  return fmtDate(day);
}
function weekdayLabel(s) {
  return cap(DIAS_SEM[parseD(s).getDay()]);
}

/* ── texto ── */
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
function digits(s) {
  return String(s || '').replace(/\D/g, '');
}
function waLink(phone) {
  let d = digits(phone);
  if (!d) return '';
  if (d.length <= 11) d = '55' + d;
  return 'https://wa.me/' + d;
}
function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^@/.test(s)) return 'https://instagram.com/' + s.slice(1);
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return 'https://' + s;
  return '';
}
function plural(n, one, many) {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

/* ── dias úteis (segunda a sexta; feriados não entram) ── */
function addDiasUteis(s, n) {
  let d = s;
  const fds = (x) => [0, 6].includes(parseD(x).getDay());
  if (n <= 0) {
    while (fds(d)) d = addDays(d, 1);
    return d;
  }
  let k = 0;
  while (k < n) {
    d = addDays(d, 1);
    if (!fds(d)) k++;
  }
  return d;
}
function primeiroNome(n) {
  return String(n || '').trim().split(/\s+/)[0] || '';
}

/* ── links que abrem outros apps já preenchidos ── */
function waMsgLink(phone, text) {
  const base = waLink(phone);
  if (!base) return '';
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
function gmailLink(to, subject, body) {
  return `https://mail.google.com/mail/?view=cm&fs=1${to ? '&to=' + encodeURIComponent(to) : ''}&su=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
}
/* evento de dia inteiro no Google Agenda */
function gcalLink(titulo, data, detalhes) {
  const d = (data || today()).replace(/-/g, '');
  const fim = addDays(data || today(), 1).replace(/-/g, '');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titulo || '')}&dates=${d}/${fim}&details=${encodeURIComponent(detalhes || '')}`;
}
