// Arbeitsbericht als PDF im Stil der Rechnung (Vorlagen/rechnung-frigostil.html):
// Schreibmaschinenschrift Courier Prime, Logo rechts mit Spruch, ganz leichte Linien.
// Freiwillige Felder erscheinen nur, wenn etwas eingetragen ist.

import { datumDe, zeitstempelDe, zahl, menge, slug, blobZuDataUrl, parseZahl } from './util.js';
import { zeitMinuten, summeMinuten, personal, personalText } from './abrechnung.js';
import { LISTEN } from './settings.js';

const BLAU = [0, 113, 188];
const SCHWARZ = [0, 0, 0];
const GRAU = [102, 102, 102];
const LINIE = [181, 181, 181];   // Überschriften, Tabellenkopf
const STRICH = [212, 212, 212];  // Spaltenstriche, kaum sichtbar
const FOTO = [244, 244, 244];

const L = 12;            // linker Rand mm (wie Rechnung)
const R = 194;           // rechte Kante mm
const B = R - L;
const UNTEN = 262;       // letzte Textzeile vor der Fußzeile
const PT = 0.3528;       // 1 pt in mm
const SCHRIFT = 'CourierPrime';

// Zeichen, die Courier Prime kann (normal und fett, geprüft 20.10.2026). Alles andere wird ersetzt.
const IM_FONT = [
  [0x20, 0x7E], [0xA0, 0x137], [0x139, 0x148], [0x14A, 0x17E], [0x192, 0x192], [0x218, 0x21B],
  [0x2011, 0x2011], [0x2013, 0x2014], [0x2018, 0x201A], [0x201C, 0x201E], [0x2020, 0x2022], [0x2026, 0x2026],
  [0x2030, 0x2030], [0x2032, 0x2033], [0x2039, 0x203A], [0x20AC, 0x20AC], [0x2122, 0x2122], [0x2212, 0x2212],
  [0x2248, 0x2248], [0x2260, 0x2260], [0x2264, 0x2265],
];
const ERSATZ = new Map([[0x2082, '2'], [0x2190, '<-'], [0x2192, '->'], [0x2191, '^'], [0x2193, 'v'], [0x09, ' ']]);
const WEG = (cp) => (cp >= 0x200B && cp <= 0x200D) || cp === 0xFE0F;

function imFont(cp) {
  return cp === 10 || IM_FONT.some(([a, b]) => cp >= a && cp <= b);
}

export function pdfText(s) {
  const t = String(s ?? '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Extended_Pictographic}/gu, '');
  let aus = '';
  for (const ch of t) {
    const cp = ch.codePointAt(0);
    if (WEG(cp)) continue;
    aus += imFont(cp) ? ch : (ERSATZ.get(cp) ?? '?');
  }
  return aus;
}

let vorrat = null;

async function binaer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} nicht geladen (${r.status})`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function laden(basis) {
  if (!vorrat) {
    vorrat = Promise.all([
      binaer(new URL('fonts/CourierPrime-Regular.ttf', basis)),
      binaer(new URL('fonts/CourierPrime-Bold.ttf', basis)),
      fetch(new URL('img/logo.png', basis)).then((r) => r.blob()).then(blobZuDataUrl),
    ]).then(([regular, bold, logo]) => ({ regular, bold, logo }))
      .catch((e) => { vorrat = null; throw e; });
  }
  return vorrat;
}

export function dateiname(bericht, art = 'arbeitsbericht', endung = 'pdf') {
  const kunde = slug(bericht.kunde?.name, 30) || 'kunde';
  return `${bericht.datum}_${art}_${slug(bericht.nr)}_${kunde}.${endung}`;
}

class Satz {
  constructor(doc) {
    this.doc = doc;
    this.y = 0;
  }

  schrift(groesse, fett = false, farbe = SCHWARZ) {
    this.doc.setFont(SCHRIFT, fett ? 'bold' : 'normal');
    this.doc.setFontSize(groesse);
    this.doc.setTextColor(...farbe);
  }

  zeilenhoehe(groesse, faktor = 1.35) {
    return groesse * PT * faktor;
  }

  neueSeite() {
    this.doc.addPage();
    this.y = 18;
  }

  platz(h) {
    if (this.y + h > UNTEN) this.neueSeite();
  }

  linie(x1, y1, x2, y2, farbe, breite = 0.14) {
    this.doc.setDrawColor(...farbe);
    this.doc.setLineWidth(breite);
    this.doc.line(x1, y1, x2, y2);
  }

  // Gesperrte Überschrift mit hellgrauer Linie darunter
  // danach: Platz in mm, den der folgende Block braucht (Überschrift nie allein am Seitenende)
  ueberschrift(t, danach = 18) {
    this.platz(10 + Math.min(danach, 150));
    this.y += 6;
    this.schrift(9.5, true);
    this.doc.text(pdfText(t.toUpperCase()), L, this.y, { charSpace: 0.9 });
    this.y += 1.4;
    this.linie(L, this.y, R, this.y, LINIE);
    this.y += 1.6;
  }

  absatz(t, { groesse = 9, fett = false, farbe = SCHWARZ, x = L, breite = B, abstand = 1 } = {}) {
    if (!String(t ?? '').trim()) return;
    this.schrift(groesse, fett, farbe);
    const lh = this.zeilenhoehe(groesse);
    for (const z of this.doc.splitTextToSize(pdfText(t), breite)) {
      this.platz(lh);
      this.doc.text(z, x, this.y + lh * 0.78);
      this.y += lh;
    }
    this.y += abstand;
  }

  // Frigo-Stil: "Bezeichnung   : Wert"
  angaben(zeilen) {
    const groesse = 9;
    const lh = this.zeilenhoehe(groesse);
    const lw = 40;
    for (const [label, wert] of zeilen) {
      this.schrift(groesse);
      const teile = this.doc.splitTextToSize(pdfText(wert), B - lw - 4);
      this.platz(lh * Math.min(2, teile.length));
      this.doc.text(pdfText(label), L, this.y + lh * 0.78);
      teile.forEach((z, k) => {
        this.platz(lh);
        this.doc.text((k === 0 ? ': ' : '  ') + z, L + lw, this.y + lh * 0.78);
        this.y += lh;
      });
    }
    this.y += 1;
  }

  liste(eintraege, marke = (i) => `${i + 1}.`) {
    const groesse = 9;
    const lh = this.zeilenhoehe(groesse);
    eintraege.forEach((e, i) => {
      this.schrift(groesse);
      const zeilen = this.doc.splitTextToSize(pdfText(e), B - 8);
      this.platz(lh * Math.min(2, zeilen.length));
      this.doc.text(marke(i), L + 1, this.y + lh * 0.78);
      for (const z of zeilen) {
        this.platz(lh);
        this.doc.text(z, L + 8, this.y + lh * 0.78);
        this.y += lh;
      }
      this.y += 0.4;
    });
  }

  // Befund: Text mit blauem Strich links
  hinweis(t) {
    if (!String(t ?? '').trim()) return;
    const groesse = 9;
    const lh = this.zeilenhoehe(groesse);
    this.schrift(groesse);
    const zeilen = this.doc.splitTextToSize(pdfText(t), B - 6);
    let i = 0;
    while (i < zeilen.length) {
      this.platz(lh + 2);
      const frei = Math.max(1, Math.floor((UNTEN - this.y - 2) / lh));
      const stueck = zeilen.slice(i, i + frei);
      const h = stueck.length * lh + 2;
      this.doc.setFillColor(...BLAU);
      this.doc.rect(L, this.y, 0.7, h, 'F');
      this.schrift(groesse);
      stueck.forEach((z, k) => this.doc.text(z, L + 4, this.y + 1 + lh * k + lh * 0.78));
      this.y += h;
      i += stueck.length;
    }
    this.y += 1;
  }

  // spalten: [{titel, breite, rechts}] · zeilen: Arrays von Texten · summe: letzte Zeile fett mit gestrichelter Linie
  tabelle(spalten, zeilen, { summe = false } = {}) {
    const groesse = 8.5;
    const lh = this.zeilenhoehe(groesse, 1.3);
    const pad = 1;
    const striche = (y1, y2) => {
      let x = L;
      spalten.forEach((s, i) => {
        if (i > 0) this.linie(x, y1, x, y2, STRICH, 0.1);
        x += s.breite;
      });
    };
    const kopfZeichnen = () => {
      const h = lh + pad * 2;
      this.schrift(groesse, true);
      let x = L;
      for (const s of spalten) {
        const tx = s.rechts ? x + s.breite - pad : x + pad;
        this.doc.text(pdfText(s.titel), tx, this.y + pad + lh * 0.78, { align: s.rechts ? 'right' : 'left' });
        x += s.breite;
      }
      striche(this.y, this.y + h);
      this.y += h;
      this.linie(L, this.y, R, this.y, LINIE);
    };
    // Kurze Tabellen nicht zerreißen: passt sie auf eine neue Seite, aber nicht mehr hierher, gleich umbrechen
    this.platz((lh + pad * 2) * 2);
    kopfZeichnen();
    zeilen.forEach((zeile, zi) => {
      const fett = summe && zi === zeilen.length - 1;
      const zellen = zeile.map((t, i) => {
        this.schrift(groesse, fett);
        return this.doc.splitTextToSize(pdfText(t), spalten[i].breite - pad * 2);
      });
      const n = Math.max(1, ...zellen.map((z) => z.length));
      const h = n * lh + pad * 0.8;
      if (this.y + h > UNTEN) {
        this.neueSeite();
        kopfZeichnen();
      }
      if (fett) {
        this.doc.setLineDashPattern([0.8, 0.6], 0);
        this.linie(L, this.y + 0.2, R, this.y + 0.2, LINIE);
        this.doc.setLineDashPattern([], 0);
      } else {
        striche(this.y, this.y + h);
      }
      let x = L;
      zellen.forEach((z, i) => {
        const s = spalten[i];
        this.schrift(groesse, fett);
        z.forEach((txt, k) => {
          const tx = s.rechts ? x + s.breite - pad : x + pad;
          this.doc.text(txt, tx, this.y + pad * 0.6 + lh * k + lh * 0.78, { align: s.rechts ? 'right' : 'left' });
        });
        x += s.breite;
      });
      this.y += h;
    });
    this.y += 1.5;
  }
}

// Kopf wie bei der Rechnung: Spruch + Logo rechts oben, Anschrift links, Kasten ARBEITSBERICHT rechts
function kopfErsteSeite(doc, s, einst, logo, bericht) {
  const lw = 42;
  const lh = lw * 269 / 900;
  doc.addImage(logo, 'PNG', R - lw, 26, lw, lh, 'logo', 'FAST');
  const spruch = String(einst.spruch ?? '').trim();
  if (spruch) {
    s.schrift(10, true, BLAU);
    doc.text(pdfText(spruch), R - lw - 4, 26 + lh - 0.3, { align: 'right' });
  }

  const k = bericht.kunde || {};
  s.schrift(8);
  doc.text('Cool Control, Pollhorner Hauptdeich 8b, 21107 Hamburg', 19, 65);
  s.schrift(12.5);
  const anschrift = [k.name, k.strasse, k.plzOrt].map((x) => String(x || '').trim()).filter(Boolean);
  let y = 72;
  for (const z of anschrift) {
    for (const t of doc.splitTextToSize(pdfText(z), 95)) { doc.text(t, 19, y); y += 5.7; }
  }

  const x0 = 120;
  s.schrift(11, true);
  doc.text('ARBEITSBERICHT', x0, 62, { charSpace: 1.3 });
  s.linie(x0, 63.6, R, 63.6, SCHWARZ, 0.25);
  s.schrift(8);
  doc.text('Nummer', x0, 67);
  s.schrift(12);
  doc.text(pdfText(bericht.nr), x0, 72);
  s.linie(x0, 73.8, R, 73.8, SCHWARZ, 0.25);
  const rechts = [['Datum:', datumDe(bericht.datum)]];
  if (String(k.ansprechpartner || '').trim()) rechts.push(['Ansprechpartner:', k.ansprechpartner]);
  if (String(bericht.auftragNr || '').trim()) rechts.push(['Ihre Auftr.-Nr.:', bericht.auftragNr]);
  s.schrift(9);
  rechts.forEach(([a, b], i) => {
    doc.text(a, x0, 80 + i * 4.2);
    doc.text(pdfText(b), R, 80 + i * 4.2, { align: 'right' });
  });
  s.y = Math.max(y, 80 + rechts.length * 4.2) + 10;
}

function rahmenAlleSeiten(doc, s, einst, bericht) {
  const n = doc.getNumberOfPages();
  const fuss = [einst.fuss1, einst.fuss2, einst.fuss3]
    .flatMap((t) => String(t || '').split('\n')).map((t) => t.trim()).filter(Boolean);
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    if (i > 1) {
      s.schrift(7.5, false, GRAU);
      doc.text(pdfText(`Arbeitsbericht ${bericht.nr} · Seite ${i} von ${n}`), R, 10, { align: 'right' });
    }
    s.schrift(8);
    fuss.forEach((z, j) => doc.text(pdfText(z), L, 273 + j * 3.9));
  }
}

function zeilenText(t) {
  return String(t || '').split('\n').map((z) => z.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean);
}

// Nur der Kunde unterschreibt; Name in Druckbuchstaben darunter
function unterschrift(doc, s, einst, bericht) {
  s.ueberschrift('Bestätigung');
  s.absatz(einst.bestaetigung, { groesse: 9 });
  const u = bericht.unterschrift;
  const hoehe = 20;
  const breite = 95;
  s.platz(hoehe + 16);
  const oben = s.y + 2;
  if (u?.png) {
    const v = u.w / u.h;
    let h = hoehe - 2;
    let w = h * v;
    if (w > breite) { w = breite; h = w / v; }
    doc.addImage(u.png, 'PNG', L + 2, oben + (hoehe - h) - 1, w, h, undefined, 'FAST');
  }
  s.linie(L, oben + hoehe, L + breite, oben + hoehe, SCHWARZ, 0.15);
  s.schrift(8);
  doc.text(pdfText(['Unterschrift Kunde', u?.zeit ? zeitstempelDe(u.zeit) : ''].filter(Boolean).join(' · ')), L, oben + hoehe + 3.8);
  let y = oben + hoehe + 3.8;
  if (String(u?.name || '').trim()) {
    s.schrift(10);
    doc.text(pdfText(u.name.toLocaleUpperCase('de-DE')), L, y + 5.2, { charSpace: 0.5 });
    s.schrift(7.5, false, GRAU);
    doc.text('Name in Druckbuchstaben', L, y + 9);
    y += 9;
  }
  s.y = y + 4;
}

async function fotodoku(doc, s, fotos) {
  if (!fotos.length) return;
  s.neueSeite();
  s.ueberschrift('Fotodokumentation');
  const spalt = 5;
  const bw = (B - spalt) / 2;
  const bh = 62;
  let spalte = 0;
  for (let i = 0; i < fotos.length; i++) {
    const f = fotos[i];
    if (spalte === 0) s.platz(bh + 10);
    const x = L + spalte * (bw + spalt);
    const v = f.w / f.h;
    let w = bw;
    let h = w / v;
    if (h > bh) { h = bh; w = h * v; }
    const daten = await blobZuDataUrl(f.blob);
    doc.setFillColor(...FOTO);
    doc.rect(x, s.y, bw, bh, 'F');
    doc.addImage(daten, 'JPEG', x + (bw - w) / 2, s.y + (bh - h) / 2, w, h, undefined, 'FAST');
    doc.setDrawColor(...STRICH);
    doc.setLineWidth(0.1);
    doc.rect(x, s.y, bw, bh, 'S');
    s.schrift(8);
    const titel = `Foto ${i + 1}${f.titel ? ': ' + f.titel : ''}`;
    doc.splitTextToSize(pdfText(titel), bw).slice(0, 2).forEach((z, k) => doc.text(z, x, s.y + bh + 4 + k * 3.6));
    spalte++;
    if (spalte === 2 || i === fotos.length - 1) {
      s.y += bh + 12;
      spalte = 0;
    }
  }
}

const voll = (x) => String(x ?? '').trim() !== '';

// fotos: [{blob, w, h, titel}] in Reihenfolge
export async function berichtPdf(bericht, fotos, einst, basis = document.baseURI) {
  const { jsPDF } = window.jspdf;
  const res = await laden(basis);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('CourierPrime-Regular.ttf', res.regular);
  doc.addFont('CourierPrime-Regular.ttf', SCHRIFT, 'normal');
  doc.addFileToVFS('CourierPrime-Bold.ttf', res.bold);
  doc.addFont('CourierPrime-Bold.ttf', SCHRIFT, 'bold');
  doc.setFont(SCHRIFT, 'normal');
  doc.setDocumentProperties({
    title: pdfText(`Arbeitsbericht ${bericht.nr}`),
    subject: pdfText(`Arbeitsbericht ${bericht.nr} vom ${datumDe(bericht.datum)}, ${bericht.kunde?.name || ''}`),
    author: 'Cool Control',
    creator: 'CC Arbeitsbericht-App',
  });

  const s = new Satz(doc);
  kopfErsteSeite(doc, s, einst, res.logo, bericht);

  // Angaben zum Einsatz: nur was eingetragen ist
  const a = bericht.anlage || {};
  const angaben = [];
  if ((bericht.auftragsart || []).length) angaben.push(['Einsatz', bericht.auftragsart.join(', ')]);
  if (voll(bericht.einsatzort)) angaben.push(['Einsatzort', bericht.einsatzort]);
  if (voll(bericht.kostenstelle)) angaben.push(['Kostenstelle', bericht.kostenstelle]);
  const geraet = [
    [a.bezeichnung, voll(a.art) && a.art !== a.bezeichnung ? `(${a.art})` : ''].filter(voll).join(' '),
    [a.hersteller, a.typ].filter(voll).join(' '),
  ].filter(voll).join(', ');
  if (geraet) angaben.push(['Anlage / Gerät', geraet]);
  if (voll(a.seriennr)) angaben.push(['Serien-Nr.', a.seriennr]);
  if (voll(a.kaeltemittel)) angaben.push(['Kältemittel', a.kaeltemittel]);
  const vorOrt = personalText(personal(bericht));
  if (vorOrt) angaben.push(['Personal vor Ort', vorOrt]);
  if (angaben.length) s.angaben(angaben);

  const arbeiten = zeilenText(bericht.arbeiten);
  if (arbeiten.length) {
    s.ueberschrift('Ausgeführte Arbeiten');
    s.liste(arbeiten);
  }

  const pruefungen = (bericht.pruefungen || []).filter(voll);
  if (pruefungen.length) {
    s.ueberschrift('Durchgeführte Prüfungen');
    s.liste(pruefungen, () => '[x]');
  }

  const mw = bericht.messwerte || {};
  const messzeilen = LISTEN.messwerte
    .map((g) => [g.name, String(mw[g.id]?.vorher ?? '').trim(), String(mw[g.id]?.nachher ?? '').trim(), g.einheit])
    .filter(([, v, n]) => v || n);
  if (messzeilen.length) {
    s.ueberschrift('Messwerte', (messzeilen.length + 1) * 6);
    s.tabelle([
      { titel: 'Messgröße', breite: 82 },
      { titel: 'vorher', breite: 34, rechts: true },
      { titel: 'nachher', breite: 34, rechts: true },
      { titel: 'Einheit', breite: B - 150 },
    ], messzeilen);
  }

  const takt = Number(einst.takt) || 0;
  const zeiten = (bericht.zeiten || []).filter((z) => z.von || z.bis);
  if (zeiten.length) {
    s.ueberschrift('Arbeitszeiten', (zeiten.length + 2) * 6);
    const zeilen = zeiten.map((z) => [
      z.person || 'Monteur',
      z.art || 'Arbeit',
      z.von || '',
      z.bis || '',
      parseZahl(z.pause) ? `${menge(parseZahl(z.pause))} min` : '',
      zahl(zeitMinuten(z, takt) / 60, 2),
    ]);
    zeilen.push(['Gesamt', '', '', '', '', zahl(summeMinuten(bericht, takt) / 60, 2)]);
    s.tabelle([
      { titel: 'Person', breite: 38 },
      { titel: 'Art', breite: 34 },
      { titel: 'Von', breite: 28 },
      { titel: 'Bis', breite: 28 },
      { titel: 'Pause', breite: 32 },
      { titel: 'Std.', breite: B - 160, rechts: true },
    ], zeilen, { summe: true });
  }
  const hinweise = [];
  if (zeiten.length && takt > 0) hinweise.push(`Arbeits- und Fahrzeiten werden im ${takt}-Minuten-Takt erfasst und nach Stunden abgerechnet.`);
  const an = bericht.anfahrt || {};
  const anKat = (einst.katalog || []).find((x) => x.id === an.katalogId);
  if (anKat) hinweise.push(`Anfahrt: ${anKat.typ === 'km' ? `${menge(parseZahl(an.km) || 0)} km gefahren` : anKat.bezeichnung}.`);
  if (hinweise.length) s.absatz(hinweise.join(' '), { groesse: 8 });

  const material = (bericht.material || []).filter((m) => voll(m.bezeichnung));
  if (material.length) {
    s.ueberschrift('Material', (material.length + 1) * 6);
    s.tabelle([
      { titel: 'Menge', breite: 20, rechts: true },
      { titel: 'Einheit', breite: 24 },
      { titel: 'Artikel', breite: B - 44 },
    ], material.map((m) => [menge(parseZahl(m.menge) ?? 1), m.einheit || '', m.bezeichnung]));
  }

  const km = (bericht.kaeltemittel || []).filter((x) => voll(x.typ) || voll(x.menge));
  const d = bericht.dichtheit || {};
  if (km.length || d.durchgefuehrt === 'ja') {
    s.ueberschrift('Kältemittel und Dichtheitskontrolle', (km.length + 1) * 6 + (d.durchgefuehrt === 'ja' ? 20 : 0));
    if (km.length) {
      s.tabelle([
        { titel: 'Vorgang', breite: 62 },
        { titel: 'Kältemittel', breite: 30 },
        { titel: 'Menge kg', breite: 24, rechts: true },
        { titel: 'Zustand', breite: 28 },
        { titel: 'Flaschen-Nr.', breite: B - 144 },
      ], km.map((x) => [x.vorgang || '', x.typ || '', voll(x.menge) ? menge(parseZahl(x.menge)) : '', x.zustand || '', x.flasche || '']));
    }
    if (d.durchgefuehrt === 'ja') {
      const zeilen = [['Dichtheitskontrolle', `durchgeführt am ${datumDe(bericht.datum)}`]];
      if (voll(d.methode)) zeilen.push(['Methode', d.methode]);
      if (voll(d.ergebnis)) zeilen.push(['Ergebnis', d.ergebnis]);
      if (voll(d.massnahme)) zeilen.push(['Leckstelle / Maßnahme', d.massnahme]);
      s.angaben(zeilen);
    }
    if (voll(einst.zertifikat)) s.absatz(`F-Gase-Personenzertifikat ${einst.zertifikat}`, { groesse: 8 });
  }

  if (voll(bericht.befund)) {
    s.ueberschrift('Befund und Hinweise');
    s.hinweis(bericht.befund);
  }
  if (voll(bericht.offen) || bericht.betriebsbereit) {
    s.ueberschrift('Offen / Folgetermin');
    s.absatz(bericht.offen, { abstand: 0 });
    if (bericht.betriebsbereit) s.absatz(`Anlage bei Abschluss betriebsbereit: ${bericht.betriebsbereit}`);
  }

  unterschrift(doc, s, einst, bericht);
  await fotodoku(doc, s, fotos);
  rahmenAlleSeiten(doc, s, einst, bericht);
  return doc.output('blob');
}

// Maschinenlesbare Daten fürs Büro (Claude legt daraus Arbeitsbericht, Anlagen-Akte und Rechnungsentwurf an)
export function rechnungsdaten(bericht, einst, pos, sum) {
  const takt = Number(einst.takt) || 0;
  const { unterschrift, monteurUnterschrift, ...rest } = bericht;
  return {
    format: 'cc-arbeitsbericht/1',
    hinweis: 'Vorschlag aus der Arbeitsbericht-App. Die Rechnung entsteht in FastBill, die Rechnungsnummer vergibt FastBill.',
    erzeugt: new Date().toISOString(),
    bericht: {
      ...rest,
      zeiten: (bericht.zeiten || []).map((z) => ({ ...z, minutenAbgerechnet: zeitMinuten(z, takt) })),
      unterschrift: unterschrift ? { name: unterschrift.name, zeit: unterschrift.zeit } : null,
    },
    abrechnung: {
      taktMinuten: takt,
      positionen: pos,
      ...sum,
      rechnungshinweis: bericht.rechnungshinweis || '',
    },
  };
}
