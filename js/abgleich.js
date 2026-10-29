// Abgleich zwischen den Geräten über den Briefkasten in Volkans Google Drive (drive-briefkasten/Code.gs).
// Jedes Gerät legt Berichte, Fotos, Kunden und Einstellungen dort ab und holt die der anderen.
// Die neuere Fassung gewinnt (Feld geaendert). Ohne Netz passiert nichts, beim nächsten Mal geht es weiter.
// Kopien an Kunden gehen als Auftrag in den Ausgang; der HP verschickt sie und legt eine Quittung ab.

import { db } from './db.js';
import { blobZuDataUrl, dataUrlZuBlob } from './util.js';

const META = 'abgleich';                       // Schlüssel im Speicher „einstellungen“
const ALT = '2000-01-01T00:00:00.000Z';        // für Daten aus der Zeit vor dem Abgleich
const NUR_HIER = ['geraet', 'nrNaechste', 'nrJahr'];   // Einstellungen, die nur für dieses Gerät gelten
// Kleine Pakete: Google legt jede Datei einzeln an, große Pakete brechen ab
const PAKET_BYTES = 1024 * 1024;
const PAKET_DATEIEN = 20;
const HOLEN_JE_RUNDE = 15;

export async function meta() {
  return (await db.get('einstellungen', META)) || {};
}

async function metaSpeichern(m) {
  await db.put('einstellungen', m, META);
}

// Frisch lesen und ändern, damit ein laufender Abgleich nichts überschreibt, was die App inzwischen vorgemerkt hat
async function metaAendern(fn) {
  const m = await meta();
  fn(m);
  await metaSpeichern(m);
  return m;
}

export async function verbunden() {
  const m = await meta();
  return !!(m.url && m.schluessel);
}

// Verbindungsdatei vom Büro: {"format":"cc-arbeitsbericht-verbindung/1","url":"…","schluessel":"…"}
export function verbindungLesen(text) {
  const j = JSON.parse(String(text || '').trim());
  if (j.format !== 'cc-arbeitsbericht-verbindung/1' || !/^https:\/\/script\.google\.com\//.test(j.url || '') || !j.schluessel) {
    throw new Error('keine Verbindungsdatei dieser App');
  }
  return { url: j.url, schluessel: j.schluessel };
}

export async function verbinden({ url, schluessel }) {
  await anfrage({ url, schluessel }, 'liste');   // prüft Adresse und Schlüssel
  await metaAendern((m) => Object.assign(m, { url, schluessel, fehler: '' }));
}

export async function trennen() {
  await metaAendern((m) => { delete m.url; delete m.schluessel; delete m.zuletzt; delete m.fehler; });
}

// Gelöschtes merken, damit es auch auf den anderen Geräten verschwindet
export async function merkeWeg(namen) {
  const jetzt = new Date().toISOString();
  await metaAendern((m) => {
    m.weg = m.weg || {};
    for (const n of namen) m.weg[n] = jetzt;
  });
}

// Kopie an den Kunden vormerken. Geht raus, sobald das Gerät online ist.
export async function versandVormerken(eintrag) {
  await metaAendern((m) => {
    // je Bericht ein Eintrag pro Zweck (Kopie an den Kunden, Kopie ins Büro)
    m.ausgang = (m.ausgang || []).filter((x) => x.berichtId !== eintrag.berichtId || (x.zweck || '') !== (eintrag.zweck || ''));
    m.ausgang.push(eintrag);
  });
}

export async function wartendeVersandIds() {
  return new Set(((await meta()).ausgang || []).map((x) => x.berichtId));
}

async function anfrage(v, aktion, daten = {}) {
  const r = await fetch(v.url, {
    method: 'POST',
    body: JSON.stringify({ schluessel: v.schluessel, aktion, ...daten }),   // text/plain: ohne Vorab-Anfrage
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`Briefkasten antwortet nicht (${r.status})`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.fehler || 'Briefkasten meldet einen Fehler');
  return j;
}

// Alles, was dieses Gerät hat: name → geaendert
async function lokalerStand(m) {
  const stand = {};
  for (const b of await db.alle('berichte')) stand['b_' + b.id] = b.geaendert || ALT;
  for (const f of await db.alle('fotos')) stand['f_' + f.id] = f.geaendert || f.erstellt || ALT;
  for (const k of await db.alle('kunden')) stand['k_' + k.id] = k.geaendert || ALT;
  const e = await db.get('einstellungen', 'einstellungen');
  if (e) stand.e_einstellungen = e.geaendert || ALT;
  for (const [n, g] of Object.entries(m.weg || {})) if (!stand[n] || g > stand[n]) stand[n] = g;
  return stand;
}

async function inhaltFuer(name, g, m) {
  if (m.weg?.[name] === g) return { geloescht: true };
  const [art, id] = [name.slice(0, 1), name.slice(2)];
  if (art === 'b') return { daten: await db.get('berichte', id) };
  if (art === 'k') return { daten: await db.get('kunden', id) };
  if (art === 'f') {
    const f = await db.get('fotos', id);
    if (!f) return null;
    const { blob, ...rest } = f;
    return { daten: { ...rest, daten: await blobZuDataUrl(blob) } };
  }
  if (art === 'e') {
    const e = { ...(await db.get('einstellungen', 'einstellungen')) };
    for (const k of NUR_HIER) delete e[k];
    return { daten: e };
  }
  return null;
}

async function uebernehmen(name, g, inhalt) {
  const [art, id] = [name.slice(0, 1), name.slice(2)];
  if (inhalt.geloescht) {
    if (art === 'b') await db.weg('berichte', id);
    if (art === 'f') await db.weg('fotos', id);
    if (art === 'k') await db.weg('kunden', id);
    await metaAendern((m) => { m.weg = m.weg || {}; m.weg[name] = g; });
    return;
  }
  const d = inhalt.daten;
  await metaAendern((m) => { if (m.weg?.[name]) delete m.weg[name]; });
  if (art === 'b') await db.put('berichte', { ...d, geaendert: g });
  if (art === 'k') await db.put('kunden', { ...d, geaendert: g });
  if (art === 'f') {
    const { daten, ...rest } = d;
    await db.put('fotos', { ...rest, geaendert: g, blob: await dataUrlZuBlob(daten) });
  }
  if (art === 'e') {
    const hier = (await db.get('einstellungen', 'einstellungen')) || {};
    const neu = { ...d, geaendert: g };
    for (const k of NUR_HIER) if (k in hier) neu[k] = hier[k];
    await db.put('einstellungen', neu, 'einstellungen');
  }
}

let laeuft = null;

// Ein Durchgang. offeneId: Bericht, der gerade bearbeitet wird (wird nicht überschrieben).
// berichtAendern(id, fn): ändert einen Bericht so, dass ein offener Bericht im Speicher mitzieht.
export function abgleichen(opt = {}) {
  if (!laeuft) laeuft = durchgang(opt).finally(() => { laeuft = null; });
  return laeuft;
}

async function durchgang({ offeneId = null, berichtAendern = null, fortschritt = () => {} } = {}) {
  const m = await meta();
  if (!m.url || !m.schluessel) return { aus: true };
  if (!navigator.onLine) return { offline: true };
  const v = { url: m.url, schluessel: m.schluessel };
  const ergebnis = { geholt: 0, gesendet: 0, einstellungen: false, berichte: false };
  try {
    // 1. Vorgemerkte Kopien an Kunden in den Ausgang
    for (const a of m.ausgang || []) {
      const { pdfDataUrl, ...rest } = a;
      await anfrage(v, 'versand', { ...rest, pdf: pdfDataUrl.split(',')[1] });
      await metaAendern((x) => {
        x.ausgang = (x.ausgang || []).filter((e) => !(e.berichtId === a.berichtId && e.angefordert === a.angefordert));
      });
      ergebnis.gesendet++;
    }

    // 2. Stand vergleichen
    const fern = await anfrage(v, 'liste');
    const hier = await lokalerStand(m);
    const holen = Object.keys(fern.stand).filter((n) => fern.stand[n] > (hier[n] || '') && n !== 'b_' + offeneId);
    const ablegen = Object.keys(hier).filter((n) => hier[n] > (fern.stand[n] || ''));

    // 3. Neueres von den anderen Geräten holen
    for (let i = 0; i < holen.length; i += HOLEN_JE_RUNDE) {
      fortschritt(`Hole ${i + 1}–${Math.min(i + HOLEN_JE_RUNDE, holen.length)} von ${holen.length} …`);
      const teil = holen.slice(i, i + HOLEN_JE_RUNDE);
      const { dateien } = await anfrage(v, 'holen', { namen: teil });
      for (const n of teil) {
        if (!dateien[n]) continue;
        await uebernehmen(n, fern.stand[n], JSON.parse(dateien[n]));
        ergebnis.geholt++;
        if (n === 'e_einstellungen') ergebnis.einstellungen = true;
        if (n.startsWith('b_')) ergebnis.berichte = true;
      }
    }

    // 4. Eigenes ablegen, in Paketen
    let paket = [];
    let groesse = 0;
    let fertig = 0;
    const senden = async () => {
      if (!paket.length) return;
      fortschritt(`Lade ${fertig + 1}–${fertig + paket.length} von ${ablegen.length} hoch …`);
      await anfrage(v, 'ablegen', { dateien: paket });
      fertig += paket.length;
      paket = [];
      groesse = 0;
    };
    for (const n of ablegen) {
      const inhalt = await inhaltFuer(n, hier[n], m);
      if (!inhalt) continue;
      const text = JSON.stringify(inhalt);
      if (paket.length >= PAKET_DATEIEN || groesse + text.length > PAKET_BYTES) await senden();
      paket.push({ name: n, g: hier[n], inhalt: text });
      groesse += text.length;
    }
    await senden();

    // 5. Quittungen vom HP: Kopie an den Kunden ist raus (oder fehlgeschlagen)
    for (const q of fern.quittungen || []) {
      const b = await db.get('berichte', q.berichtId);
      if (q.zweck === 'buero') {   // Kopie ins Büro ist am PC abgelegt
        if (b && q.status === 'gesendet' && b.geteiltBuero !== q.gesendet) {
          const f = (x) => { x.geteiltBuero = q.gesendet; };
          if (berichtAendern) await berichtAendern(q.berichtId, f);
          else { f(b); b.geaendert = new Date().toISOString(); await db.put('berichte', b); }
          ergebnis.berichte = true;
        }
        continue;
      }
      const vk = b?.versandKunde;
      if (!vk || vk.angefordert !== q.angefordert || vk.status === q.status) continue;
      const aendern = (x) => {
        x.versandKunde = { ...x.versandKunde, status: q.status, gesendet: q.gesendet || '', fehler: q.fehler || '' };
        if (q.status === 'gesendet') x.geteiltKunde = q.gesendet;
      };
      if (berichtAendern) await berichtAendern(q.berichtId, aendern);
      else { aendern(b); b.geaendert = new Date().toISOString(); await db.put('berichte', b); }
      ergebnis.berichte = true;
    }

    await metaAendern((x) => { x.zuletzt = new Date().toISOString(); x.fehler = ''; });
  } catch (e) {
    const fehler = navigator.onLine ? String(e.message || e) : '';
    await metaAendern((x) => { x.fehler = fehler; });
    ergebnis.fehler = fehler;
  }
  return ergebnis;
}
