// Kleine Helfer für die ganze App

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const zwei = (n) => String(n).padStart(2, '0');

export function heute(d = new Date()) {
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

export function jetztZeit(d = new Date()) {
  return `${zwei(d.getHours())}:${zwei(d.getMinutes())}`;
}

export function datumDe(iso) {
  if (!iso) return '';
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
}

export function zeitstempelDe(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}, ${zwei(d.getHours())}:${zwei(d.getMinutes())} Uhr`;
}

// "1,5" und "1.5" werden zu 1.5; leer oder ungültig wird null
export function parseZahl(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, '').replace(/,/g, '.');
  if (s === '') return null;
  // "1.500.50" (aus "1.500,50"): nur der letzte Punkt ist das Komma
  const letzter = s.lastIndexOf('.');
  if (letzter !== s.indexOf('.')) s = s.slice(0, letzter).replace(/\./g, '') + s.slice(letzter);
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function zahl(n, stellen = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

// Menge ohne unnötige Nullen: 1 → "1", 2,5 → "2,5", 1,25 → "1,25"
export function menge(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function euro(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return zahl(n, 2) + ' €';
}

export function minutenAus(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Minuten seit Mitternacht zurück in "HH:MM", auch bei negativen Werten oder über 24 h
export function hhmm(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Dauer in Minuten zwischen zwei Uhrzeiten, auch über Mitternacht
export function dauer(von, bis) {
  const a = minutenAus(von);
  const b = minutenAus(bis);
  if (a === null || b === null) return null;
  return b >= a ? b - a : b + 1440 - a;
}

// Auf den Abrechnungstakt aufrunden (angefangene Schritte zählen voll)
export function aufrunden(min, takt) {
  if (!takt || takt <= 0) return min;
  return Math.ceil(min / takt - 1e-9) * takt;
}

export function slug(s, max = 40) {
  const ersatz = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', ı: 'i', ş: 's', ğ: 'g', ç: 'c', é: 'e', è: 'e', á: 'a', à: 'a' };
  return String(s || '')
    .toLowerCase()
    .replace(/[äöüßışğçéèáà]/g, (c) => ersatz[c])
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  d.sofort = (...args) => { clearTimeout(t); t = null; return fn(...args); };
  d.offen = () => t !== null && t !== undefined;
  return d;
}

let toastTimer;
export function toast(text, ms = 3500) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('sichtbar');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('sichtbar'), ms);
}

// Wert in verschachteltem Objekt lesen/schreiben: pfad "kunde.name" oder "zeiten.0.von"
export function lies(obj, pfad) {
  return pfad.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setze(obj, pfad, wert) {
  const teile = pfad.split('.');
  let o = obj;
  for (let i = 0; i < teile.length - 1; i++) {
    const k = teile[i];
    if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(teile[i + 1]) ? [] : {};
    o = o[k];
  }
  o[teile[teile.length - 1]] = wert;
}

export function blobZuDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

export async function dataUrlZuBlob(url) {
  const r = await fetch(url);
  return r.blob();
}

export function herunterladen(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
