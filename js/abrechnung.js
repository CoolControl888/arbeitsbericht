// Zeiten rechnen und den Rechnungsvorschlag bauen. Die Rechnung selbst entsteht in FastBill.

import { dauer, aufrunden, parseZahl, minutenAus, hhmm } from './util.js';

// Minuten einer Zeitzeile nach Pause, auf den Takt aufgerundet.
// Fahrtzeilen (aus fahrtZeilen) bringen ihre Minuten schon mit.
export function zeitMinuten(z, takt) {
  if (z.minuten !== undefined) return aufrunden(z.minuten, takt);
  const roh = dauer(z.von, z.bis);
  if (roh === null) return 0;
  const netto = roh - (parseZahl(z.pause) || 0);
  if (netto <= 0) return 0;
  return aufrunden(netto, takt);
}

// An- und Abfahrt: Volkan trägt nur Minuten ein (bericht.fahrt.anMin / abMin). Die App rechnet daraus,
// wann es losging (Arbeitsbeginn minus Anfahrt) und wann die Rückfahrt endete (Arbeitsende plus Abfahrt).
// Jede Person mit Zeiten im Bericht bekommt beide Fahrten, denn alle fahren mit (Volkan 29.10.2026).
export function fahrtZeilen(bericht) {
  const f = bericht.fahrt || {};
  const an = parseZahl(f.anMin) || 0;
  const ab = parseZahl(f.abMin) || 0;
  if (an <= 0 && ab <= 0) return [];
  const zeiten = (bericht.zeiten || []).filter((z) => (z.von || z.bis) && z.art !== 'Fahrt');
  const personen = [...new Set(zeiten.map((z) => z.person || 'Monteur'))];
  if (!personen.length) personen.push('Monteur');
  const zeilen = [];
  for (const p of personen) {
    const eigene = zeiten.filter((z) => (z.person || 'Monteur') === p);
    const starts = eigene.map((z) => minutenAus(z.von)).filter((m) => m !== null);
    const enden = eigene.map((z) => minutenAus(z.bis)).filter((m) => m !== null);
    const beginn = starts.length ? Math.min(...starts) : null;
    const ende = enden.length ? Math.max(...enden) : null;
    if (an > 0) zeilen.push({ id: `fahrt-an-${p}`, person: p, art: 'Anfahrt', von: beginn === null ? '' : hhmm(beginn - an), bis: beginn === null ? '' : hhmm(beginn), pause: '', minuten: an, fahrt: true });
    if (ab > 0) zeilen.push({ id: `fahrt-ab-${p}`, person: p, art: 'Abfahrt', von: ende === null ? '' : hhmm(ende), bis: ende === null ? '' : hhmm(ende + ab), pause: '', minuten: ab, fahrt: true });
  }
  return zeilen;
}

// Alle Zeilen für Bericht und Abrechnung: eingetragene Zeiten plus errechnete Fahrten
export function alleZeilen(bericht) {
  return [...(bericht.zeiten || []), ...fahrtZeilen(bericht)];
}

// Für den Bericht je Person geordnet: Anfahrt, Arbeitszeiten, Abfahrt
export function zeilenGeordnet(bericht) {
  const alle = alleZeilen(bericht).filter((z) => z.von || z.bis);
  const personen = [...new Set(alle.map((z) => z.person || 'Monteur'))];
  const rang = (z) => (z.art === 'Anfahrt' ? 0 : z.art === 'Abfahrt' ? 2 : 1);
  return personen.flatMap((p) => alle.filter((z) => (z.person || 'Monteur') === p).sort((a, b) => rang(a) - rang(b)));
}

export function summeMinuten(bericht, takt, filter = () => true) {
  return alleZeilen(bericht).filter(filter).reduce((s, z) => s + zeitMinuten(z, takt), 0);
}

const istHelfer = (z) => String(z.person || '').includes('Helfer');

// Wie viele Monteure / Helfer laut Zeiten vor Ort waren (jede Person hat eigene Zeilen)
export function personal(bericht) {
  const z = alleZeilen(bericht).filter((x) => x.von || x.bis);
  const monteure = new Set(z.filter((x) => !istHelfer(x)).map((x) => x.person || 'Monteur')).size;
  const helfer = new Set(z.filter(istHelfer).map((x) => x.person)).size;
  return { monteure, helfer };
}

export function personalText({ monteure, helfer }) {
  return [monteure ? `${monteure} ${monteure === 1 ? 'Monteur' : 'Monteure'}` : '', helfer ? `${helfer} ${helfer === 1 ? 'Helfer' : 'Helfer'}` : '']
    .filter(Boolean).join(', ');
}

export function positionen(bericht, einst) {
  const kat = (id) => (einst.katalog || []).find((k) => k.id === id);
  const pos = [];
  const takt = Number(einst.takt) || 0;

  const minMonteur = summeMinuten(bericht, takt, (z) => !istHelfer(z));
  if (minMonteur > 0) {
    const k = kat('lohn') || { bezeichnung: 'Arbeitszeit', einheit: 'Std.', preis: null };
    const n = personal(bericht).monteure;
    pos.push({ bezeichnung: k.bezeichnung + (n > 1 ? ` (${n} Monteure)` : ''), menge: minMonteur / 60, einheit: k.einheit, preis: k.preis, herkunft: 'Zeiten' });
  }
  const minHelfer = summeMinuten(bericht, takt, istHelfer);
  if (minHelfer > 0) {
    const k = kat('helfer') || { bezeichnung: 'Helfer', einheit: 'Std.', preis: null };
    const n = personal(bericht).helfer;
    pos.push({ bezeichnung: k.bezeichnung + (n > 1 ? ` (${n} Helfer)` : ''), menge: minHelfer / 60, einheit: k.einheit, preis: k.preis, herkunft: 'Zeiten' });
  }

  const an = bericht.anfahrt || {};
  if (an.katalogId) {
    const k = kat(an.katalogId);
    if (k) {
      const m = k.typ === 'km' ? parseZahl(an.km) : 1;
      if (m) pos.push({ bezeichnung: k.bezeichnung, menge: m, einheit: k.einheit, preis: k.preis, herkunft: 'Anfahrt' });
    }
  }

  for (const m of bericht.material || []) {
    if (!String(m.bezeichnung || '').trim()) continue;
    pos.push({
      bezeichnung: m.bezeichnung.trim(),
      menge: parseZahl(m.menge) ?? 1,
      einheit: m.einheit || 'Stk.',
      preis: parseZahl(m.preis),
      herkunft: 'Material',
    });
  }

  // Gefülltes Kältemittel je Sorte zusammenfassen (abgesaugtes wird nicht berechnet)
  const kg = new Map();
  for (const k of bericht.kaeltemittel || []) {
    if (!['Nachgefüllt', 'Erstfüllung'].includes(k.vorgang)) continue;
    const menge = parseZahl(k.menge);
    if (!menge) continue;
    const typ = (k.typ || '').trim() || '[Typ offen]';
    const alt = kg.get(typ) || { menge: 0, preis: null };
    alt.menge += menge;
    const p = parseZahl(k.preis);
    if (p !== null) alt.preis = p;
    kg.set(typ, alt);
  }
  for (const [typ, v] of kg) {
    pos.push({ bezeichnung: `Kältemittel ${typ}`, menge: v.menge, einheit: 'kg', preis: v.preis, herkunft: 'Kältemittel' });
  }

  for (const z of bericht.zusatz || []) {
    if (!String(z.bezeichnung || '').trim()) continue;
    pos.push({
      bezeichnung: z.bezeichnung.trim(),
      menge: parseZahl(z.menge) ?? 1,
      einheit: z.einheit || 'pausch.',
      preis: parseZahl(z.preis),
      herkunft: 'Zusatz',
    });
  }
  return pos;
}

export function summen(pos, ustSatz) {
  const r2 = (n) => Math.round(n * 100) / 100;
  let netto = 0;
  let offen = 0;
  for (const p of pos) {
    if (p.preis === null || p.preis === undefined) { offen++; continue; }
    netto += r2(p.menge * p.preis);
  }
  netto = r2(netto);
  const satz = Number(ustSatz) || 0;
  const ust = r2(netto * satz / 100);
  return { netto, ustSatz: satz, ust, brutto: r2(netto + ust), offen };
}
