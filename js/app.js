// CC Arbeitsbericht – Oberfläche
import {
  $, $$, esc, uid, heute, jetztZeit, datumDe, zeitstempelDe, parseZahl, zahl, menge, euro,
  debounce, toast, lies, setze, blobZuDataUrl, dataUrlZuBlob, herunterladen,
} from './util.js';
import { db } from './db.js';
import { ladeEinstellungen, speichereEinstellungen, naechsteNummer, nummerNachziehen, LISTEN, STANDARD } from './settings.js';
import { Unterschrift } from './signature.js';
import { verkleinern } from './photos.js';
import { zeitMinuten, summeMinuten, positionen, summen, fahrtZeilen } from './abrechnung.js';
import { kmVorschlag } from './entfernung.js';
import { berichtPdf, rechnungsdaten, dateiname } from './pdf.js';
import {
  abgleichen, meta as abgleichMeta, verbunden, verbinden, verbindungLesen, trennen, merkeWeg,
  versandVormerken, wartendeVersandIds,
} from './abgleich.js';

export const VERSION = '1.6.1';

const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  kamera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  bild: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  stift: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
  senden: '<svg viewBox="0 0 24 24"><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></svg>',
  datei: '<svg viewBox="0 0 24 24"><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/></svg>',
  muell: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  schloss: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  haken: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  buero: '<svg viewBox="0 0 24 24"><path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 9h2M14 9h2M8 13h2M14 13h2"/></svg>',
  kunde: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  laden: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
};

const ansicht = () => $('#ansicht');
// Handy/Tablet mit Android oder iOS: „Foto aufnehmen“ öffnet die Kamera-App. Am Laptop (Lenovo) eigene Kamera-Ansicht.
const HANDY = /Android|iPhone|iPad/i.test(navigator.userAgent);

let einst;
let bericht = null;
let fotos = [];
let kunden = [];
let pdfVorrat = null;
let installHinweis = null;
const sekOffen = { abrechnung: false };

// ---------------------------------------------------------------- Start

start();

async function start() {
  window.addEventListener('error', (e) => toast('Fehler: ' + (e.message || e.error)));
  window.addEventListener('unhandledrejection', (e) => toast('Fehler: ' + (e.reason?.message || e.reason)));
  einst = await ladeEinstellungen();
  $('#zurueck').addEventListener('click', () => { location.hash = '#/'; });
  $('#zu-einstellungen').addEventListener('click', () => { location.hash = '#/einstellungen'; });
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && speichern.offen()) speichern.sofort();
    if (document.visibilityState === 'visible') abgleichPlanen(500);
  });
  window.addEventListener('online', () => abgleichPlanen(500));
  setInterval(() => abgleichPlanen(0), 3 * 60 * 1000);
  document.addEventListener('toggle', (e) => {
    if (e.target.matches?.('details[data-sek]')) sekOffen[e.target.dataset.sek] = e.target.open;
  }, true);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installHinweis = e;
    if (!location.hash || location.hash === '#/') zeigeListe();
  });
  swRegistrieren();
  await route();
  document.body.dataset.bereit = '1';
  abgleichPlanen(1000);
}

// ---------------------------------------------------------------- Abgleich mit den anderen Geräten

let abgleichTimer = null;

function abgleichPlanen(ms = 8000) {
  clearTimeout(abgleichTimer);
  abgleichTimer = setTimeout(abgleichJetzt, ms);
}

async function abgleichJetzt({ meldung = false } = {}) {
  clearTimeout(abgleichTimer);
  if (!(await verbunden())) return;
  if (bericht && speichern.offen()) await speichern.sofort();
  const zeigen = (text) => {
    const z = $('.abgleich-zeile');
    if (z) z.firstChild.textContent = 'Abgleich läuft: ' + text + ' ';
    if (meldung) toast('Abgleich läuft: ' + text, 60000);
  };
  if (meldung) toast('Abgleich läuft …', 60000);
  const r = await abgleichen({ offeneId: bericht?.id || null, berichtAendern, fortschritt: zeigen });
  if (r.einstellungen) einst = await ladeEinstellungen();
  if (r.berichte && await nummerNachziehen(einst, await db.alle('berichte'))) einst = await ladeEinstellungen();
  if (meldung) toast(r.fehler ? 'Abgleich hat nicht geklappt: ' + r.fehler : r.offline ? 'Kein Internet. Der Abgleich läuft, sobald du online bist.' : 'Abgeglichen.');
  const h = location.hash || '#/';
  const tippt = document.activeElement?.matches?.('input, textarea, select');
  if (h === '#/') { if (!tippt) zeigeListe(); } else if (h === '#/einstellungen') { if (!tippt) zeigeEinstellungen(); }
  else if (bericht && (r.berichte || r.gesendet)) berechnungen();
  if (!r.aus && !r.offline && !r.fehler) bueroNachholen();
}

// Bericht ändern, auch wenn er gerade offen ist (z. B. Quittung „Kopie gesendet“ vom PC)
async function berichtAendern(id, fn) {
  if (bericht && bericht.id === id) {
    fn(bericht);
    geaendert();
    await speichern.sofort();
    return;
  }
  const b = await db.get('berichte', id);
  if (!b) return;
  fn(b);
  b.geaendert = new Date().toISOString();
  await db.put('berichte', b);
}

async function route() {
  const h = location.hash || '#/';
  if (bericht && h !== '#/bericht/' + bericht.id) await berichtVerlassen();
  if (h.startsWith('#/bericht/')) return zeigeBericht(decodeURIComponent(h.slice(10)));
  if (h === '#/einstellungen') return zeigeEinstellungen();
  return zeigeListe();
}

function kopf(titel, zurueck) {
  $('#kopf-titel').textContent = titel;
  $('#zurueck').hidden = !zurueck;
  $('.kopf-logo').hidden = zurueck;
  $('#zu-einstellungen').hidden = location.hash === '#/einstellungen';
  $('#speicherstatus').textContent = '';
  document.title = titel + ' · CC Arbeitsbericht';
}

// ---------------------------------------------------------------- Dialoge

function dialog(html, einrichten, { gross = false } = {}) {
  const dlg = $('#dialog');
  dlg.className = gross ? 'gross' : '';
  dlg.innerHTML = html;
  return new Promise((fertig) => {
    let erledigt = false;
    const schliessen = (wert) => {
      if (erledigt) return;
      erledigt = true;
      dlg.oncancel = null;
      if (dlg.open) dlg.close();
      dlg.innerHTML = '';
      fertig(wert);
    };
    dlg.oncancel = (e) => { e.preventDefault(); schliessen(null); };
    dlg.showModal();
    einrichten?.(dlg, schliessen);
  });
}

function bestaetigen(text, ja = 'Ja', nein = 'Abbrechen', gefahr = false) {
  return dialog(`
    <div class="dlg">
      <p class="dlg-text">${esc(text)}</p>
      <div class="dlg-knoepfe">
        <button type="button" class="btn" data-k="nein">${esc(nein)}</button>
        <button type="button" class="btn ${gefahr ? 'gefahr-voll' : 'primaer'}" data-k="ja">${esc(ja)}</button>
      </div>
    </div>`, (dlg, schliessen) => {
    dlg.querySelector('[data-k="nein"]').onclick = () => schliessen(false);
    dlg.querySelector('[data-k="ja"]').onclick = () => schliessen(true);
  });
}

// Unterschriftenfeld im Vollbild. Ergebnis {name, png, w, h} oder null
function unterschriftHolen({ titel, oben = '', name = '', mitName = true, hinweis = '' }) {
  let pad;
  return dialog(`
    <div class="dlg dlg-sig">
      <h2>${esc(titel)}</h2>
      ${oben}
      ${hinweis ? `<p class="bestaetigung">${esc(hinweis)}</p>` : ''}
      <div class="sig-feld"><canvas aria-label="Unterschriftenfeld"></canvas><span class="sig-linie">Hier mit dem Finger unterschreiben</span></div>
      ${mitName ? `<label class="feld"><span>Name in Druckschrift</span><input name="name" value="${esc(name)}" autocapitalize="words" autocomplete="off"></label>` : ''}
      <div class="dlg-knoepfe">
        <button type="button" class="btn text" data-k="loeschen">Neu</button>
        <button type="button" class="btn" data-k="abbrechen">Abbrechen</button>
        <button type="button" class="btn primaer" data-k="ok">${ICON.haken} Bestätigen</button>
      </div>
    </div>`, (dlg, schliessen) => {
    pad = new Unterschrift(dlg.querySelector('canvas'));
    const linie = dlg.querySelector('.sig-linie');
    pad.beiAenderung = () => { linie.classList.toggle('weg', !pad.leer()); };
    dlg.querySelector('[data-k="loeschen"]').onclick = () => pad.loeschen();
    dlg.querySelector('[data-k="abbrechen"]').onclick = () => { pad.abbauen(); schliessen(null); };
    dlg.querySelector('[data-k="ok"]').onclick = () => {
      const n = mitName ? dlg.querySelector('[name="name"]').value.trim() : '';
      if (pad.leer()) return toast('Bitte im Feld unterschreiben.');
      if (mitName && !n) { dlg.querySelector('[name="name"]').focus(); return toast('Bitte den Namen in Druckschrift eintragen.'); }
      const bild = pad.png();
      pad.abbauen();
      schliessen({ name: n, ...bild });
    };
    window.__unterschriftPad = pad; // für den automatischen Test
  }, { gross: true });
}

// ---------------------------------------------------------------- Liste

async function zeigeListe() {
  kopf('Arbeitsberichte', false);
  const alle = (await db.alle('berichte')).sort((a, b) => `${b.datum}|${b.nr}`.localeCompare(`${a.datum}|${a.nr}`));
  const wartend = await wartendeVersandIds();
  const am = await abgleichMeta();
  const abgleichZeile = am.url
    ? `<p class="abgleich-zeile ${am.fehler ? 'fehler' : ''}">${am.fehler ? `Abgleich: ${esc(am.fehler)}` : am.zuletzt ? `Abgeglichen ${esc(zeitstempelDe(am.zuletzt))}` : 'Noch nicht abgeglichen'}${wartend.size ? ` · ${wartend.size} ${wartend.size > 1 ? 'Kopien warten' : 'Kopie wartet'} auf Internet` : ''}
        · <button type="button" class="link" data-aktion="abgleich">jetzt abgleichen</button></p>`
    : '';
  ansicht().innerHTML = `
    <section class="liste">
      <button type="button" class="btn primaer gross breit" data-aktion="neu">${ICON.plus} Neuer Arbeitsbericht</button>
      ${abgleichZeile}
      ${installHinweis ? `<button type="button" class="btn breit" data-aktion="installieren">${ICON.laden} App auf den Startbildschirm legen</button>` : ''}
      ${alle.length ? '<input type="search" class="suche" placeholder="Suchen: Kunde, Nummer, Anlage" aria-label="Suchen">' : ''}
      <ul class="karten">${alle.map((b) => karte(b, wartend)).join('')}</ul>
      ${alle.length ? '' : '<p class="leer">Noch keine Berichte.<br>Tippe auf „Neuer Arbeitsbericht“.</p>'}
    </section>`;
  ansicht().onclick = async (e) => {
    const b = e.target.closest('[data-aktion]');
    if (!b) return;
    if (b.dataset.aktion === 'neu') neuerBericht();
    if (b.dataset.aktion === 'abgleich') abgleichJetzt({ meldung: true });
    if (b.dataset.aktion === 'liste-loeschen') {
      const ber = alle.find((x) => x.id === b.dataset.id);
      if (ber && await berichtEntfernen(ber)) zeigeListe();
    }
    if (b.dataset.aktion === 'installieren' && installHinweis) {
      installHinweis.prompt();
      installHinweis = null;
      b.remove();
    }
  };
  ansicht().oninput = (e) => {
    if (!e.target.matches('.suche')) return;
    const q = e.target.value.trim().toLowerCase();
    $$('.karte').forEach((k) => { k.hidden = q && !k.dataset.text.includes(q); });
  };
  ansicht().onchange = null;
}

function statusInfo(b, wartend = new Set()) {
  const vk = b.versandKunde;
  if (vk?.status === 'fehler') return { text: 'Versand fehlgeschlagen', klasse: 'rot' };
  if (vk?.status === 'wartet') return wartend.has(b.id) ? { text: 'Kopie wartet auf Internet', klasse: 'orange' } : { text: 'Kopie geht vom PC raus', klasse: 'blau' };
  if (b.geteiltKunde && b.geteiltBuero) return { text: 'Kunde + Büro', klasse: 'gruen' };
  if (b.geteiltKunde) return { text: 'an Kunden geteilt', klasse: 'gruen' };
  if (b.status === 'unterschrieben' || b.geteiltBuero) return { text: 'Kopie an Kunde fehlt', klasse: 'rot' };
  if (b.status === 'unterschrieben') return { text: 'unterschrieben', klasse: 'blau' };
  return { text: 'Entwurf', klasse: 'grau' };
}

function karte(b, wartend) {
  const s = statusInfo(b, wartend);
  const text = [b.nr, b.kunde?.name, b.anlage?.bezeichnung, b.anlage?.typ, datumDe(b.datum)].join(' ').toLowerCase();
  return `<li class="karte" data-text="${esc(text)}"><a href="#/bericht/${encodeURIComponent(b.id)}">
    <div class="karte-zeile"><strong>${esc(b.kunde?.name || 'Ohne Kunde')}</strong><span class="badge ${s.klasse}">${s.text}</span></div>
    <div class="karte-unter">${esc(b.nr)} · ${esc(datumDe(b.datum))}${b.anlage?.bezeichnung ? ' · ' + esc(b.anlage.bezeichnung) : ''}</div>
  </a><button type="button" class="karte-weg" data-aktion="liste-loeschen" data-id="${esc(b.id)}" aria-label="Bericht ${esc(b.nr)} löschen">${ICON.muell}</button></li>`;
}

export function leererBericht(nr) {
  const jetzt = new Date().toISOString();
  return {
    id: uid(), v: 1, nr, status: 'entwurf', erstellt: jetzt, geaendert: jetzt,
    datum: heute(),
    kunde: { name: '', ansprechpartner: '', telefon: '', strasse: '', plzOrt: '', email: '' },
    einsatzort: '', kostenstelle: '',
    anlage: { bezeichnung: '', art: '', hersteller: '', typ: '', seriennr: '', kaeltemittel: '', fuellmenge: '' },
    auftragsart: [], auftragNr: '', monteur: einst.monteur, helfer: '',
    zeiten: [{ id: uid(), person: 'Monteur', art: 'Arbeit', von: '', bis: '', pause: '' }],
    fahrt: { anMin: '', abMin: '' },
    anfahrt: { katalogId: '', km: '' },
    arbeiten: '', material: [], kaeltemittel: [],
    dichtheit: { durchgefuehrt: 'nein', methode: '', ergebnis: '', massnahme: '' },
    pruefungen: [], messwerte: {},
    befund: '', offen: '', betriebsbereit: '', wartungEmpfohlen: '',
    zusatz: [], rechnungshinweis: '',
    unterschrift: null, monteurUnterschrift: null, geteiltKunde: null, geteiltBuero: null,
  };
}

async function neuerBericht() {
  const nr = await naechsteNummer(einst);
  const b = leererBericht(nr);
  await db.put('berichte', b);
  navigator.storage?.persist?.();
  location.hash = '#/bericht/' + encodeURIComponent(b.id);
}

// ---------------------------------------------------------------- Bericht bearbeiten

const speichern = debounce(speichernJetzt, 500);

async function speichernJetzt() {
  if (!bericht) return;
  await db.put('berichte', bericht);
  const s = $('#speicherstatus');
  if (s) s.textContent = 'gespeichert';
  abgleichPlanen();
}

function geaendert() {
  bericht.geaendert = new Date().toISOString();
  pdfVorrat = null;
  const s = $('#speicherstatus');
  if (s) s.textContent = '…';
  speichern();
}

const gesperrt = () => bericht.status !== 'entwurf';

async function ladeFotos() {
  fotos.forEach((f) => URL.revokeObjectURL(f.url));
  const liste = await db.nachIndex('fotos', 'bericht', bericht.id);
  fotos = liste.sort((a, b) => a.nr - b.nr).map((f) => ({ ...f, url: URL.createObjectURL(f.blob) }));
}

async function zeigeBericht(id) {
  if (!bericht || bericht.id !== id) {
    const b = await db.get('berichte', id);
    if (!b) { toast('Bericht nicht gefunden'); location.hash = '#/'; return; }
    bericht = b;
    pdfVorrat = null;
    await ladeFotos();
  }
  kunden = await db.alle('kunden');
  kopf(bericht.nr, true);
  renderBericht();
}

async function berichtVerlassen() {
  if (speichern.offen()) await speichern.sofort();
  await kundeMerken();
  fotos.forEach((f) => URL.revokeObjectURL(f.url));
  fotos = [];
  bericht = null;
  pdfVorrat = null;
}

// Felder ------------------------------------------------------------

function wert(pfad) {
  const v = lies(bericht, pfad);
  return v === null || v === undefined ? '' : v;
}

function feld(label, pfad, { typ = 'text', modus = '', ph = '', liste = '', attr = '', klasse = '' } = {}) {
  return `<label class="feld ${klasse}"><span>${esc(label)}</span><input type="${typ}" data-f="${pfad}" value="${esc(wert(pfad))}"
    ${modus ? `inputmode="${modus}"` : ''} ${ph ? `placeholder="${esc(ph)}"` : ''} ${liste ? `list="${liste}"` : ''} ${attr}></label>`;
}

function textfeld(label, pfad, { zeilen = 4, ph = '' } = {}) {
  return `<label class="feld"><span>${esc(label)}</span><textarea data-f="${pfad}" rows="${zeilen}" ${ph ? `placeholder="${esc(ph)}"` : ''}>${esc(wert(pfad))}</textarea></label>`;
}

function optionen(liste, aktuell, leer) {
  const o = leer !== undefined ? [`<option value="">${esc(leer)}</option>`] : [];
  for (const x of liste) {
    const [v, t] = Array.isArray(x) ? x : [x, x];
    o.push(`<option value="${esc(v)}" ${String(aktuell) === String(v) ? 'selected' : ''}>${esc(t)}</option>`);
  }
  return o.join('');
}

function auswahl(label, pfad, liste, { leer, render = '' } = {}) {
  return `<label class="feld"><span>${esc(label)}</span><select data-f="${pfad}" ${render ? `data-render="${render}"` : ''}>${optionen(liste, wert(pfad), leer)}</select></label>`;
}

function zeitFeld(label, pfad) {
  return `<div class="feld"><span>${esc(label)}</span><div class="mit-knopf">
    <input type="time" data-f="${pfad}" value="${esc(wert(pfad))}" aria-label="${esc(label)}">
    <button type="button" class="mini" data-aktion="jetzt" data-pfad="${pfad}">jetzt</button></div></div>`;
}

const katalogNach = (...typen) => (einst.katalog || []).filter((k) => typen.includes(k.typ));

// Sektionen ---------------------------------------------------------

const SEK = {
  kunde: {
    titel: 'Kunde',
    info: () => bericht.kunde.name,
    html: () => `
      ${kunden.length ? `<label class="feld"><span>Kunde aus der Liste wählen</span><select data-aktion="kunde-waehlen">${optionen(
        [...kunden].sort((x, y) => x.name.localeCompare(y.name, 'de')).map((k) => [k.id, [k.name, k.plzOrt].filter(Boolean).join(' · ')]),
        kundeZuName(bericht.kunde.name)?.id || '', `${kunden.length} Kunden …`)}</select></label>` : ''}
      ${feld('Firma / Name', 'kunde.name', { ph: 'z. B. Schanzenbäckerei', liste: 'dl-kunden', attr: 'autocapitalize="words" autocomplete="off"' })}
      <div class="reihe2">${feld('Ansprechpartner', 'kunde.ansprechpartner', { attr: 'autocapitalize="words"' })}${feld('Telefon', 'kunde.telefon', { typ: 'tel' })}</div>
      ${feld('Straße, Nr.', 'kunde.strasse', { attr: 'autocapitalize="words"' })}
      ${feld('PLZ Ort', 'kunde.plzOrt', { attr: 'autocapitalize="words"' })}
      ${feld('E-Mail für den Bericht', 'kunde.email', { typ: 'email', attr: 'autocapitalize="off"' })}
      ${(() => {
        const st = kundeZuName(bericht.kunde.name)?.standorte || [];
        return st.length ? `<label class="feld"><span>Filiale / Kostenstelle wählen</span><select data-aktion="standort-waehlen">${optionen(
          st.map((s, i) => [String(i), [s.name, s.kostenstelle && `KSt ${s.kostenstelle}`].filter(Boolean).join(' · ')]), '', `${st.length} bekannt …`)}</select></label>` : '';
      })()}
      ${feld('Einsatzort / Filiale, falls abweichend', 'einsatzort', { ph: 'z. B. Filiale Brooktorkai 22, Raum' })}
      ${feld('Kostenstelle (nur wenn der Kunde eine vorgibt)', 'kostenstelle')}`,
  },
  anlage: {
    titel: 'Anlage / Gerät',
    info: () => bericht.anlage.bezeichnung || bericht.anlage.typ,
    html: () => {
      const k = kundeZuName(bericht.kunde.name);
      const bekannt = k?.anlagen?.length
        ? `<label class="feld"><span>Bekannte Anlage von ${esc(k.name)}</span><select data-aktion="anlage-waehlen">${optionen(
          k.anlagen.map((a, i) => [String(i), [a.bezeichnung, a.typ, a.seriennr && `SN ${a.seriennr}`].filter(Boolean).join(' · ')]), '', 'Übernehmen …')}</select></label>`
        : '';
      return `${bekannt}
        ${feld('Bezeichnung', 'anlage.bezeichnung', { ph: 'z. B. TK-Zelle Lager' })}
        ${feld('Art', 'anlage.art', { liste: 'dl-anlagenart' })}
        <div class="reihe2">${feld('Hersteller', 'anlage.hersteller')}${feld('Typ / Modell', 'anlage.typ')}</div>
        ${feld('Seriennummer', 'anlage.seriennr', { attr: 'autocapitalize="characters"' })}
        <div class="reihe2">${feld('Kältemittel', 'anlage.kaeltemittel', { liste: 'dl-km', attr: 'autocapitalize="characters"' })}${feld('Füllmenge kg (nur fürs Büro)', 'anlage.fuellmenge', { modus: 'decimal' })}</div>
        <p class="hinweis-klein">Tipp: Typenschild unten bei „Fotos“ mit aufnehmen.</p>`;
    },
  },
  einsatz: {
    titel: 'Einsatz',
    info: () => datumDe(bericht.datum),
    html: () => `
      <div class="reihe2">${feld('Datum', 'datum', { typ: 'date' })}${feld('Auftrag / Angebot Nr.', 'auftragNr')}</div>
      <div class="feld"><span>Art des Einsatzes</span><div class="chips">${LISTEN.auftragsart.map((a) =>
        `<button type="button" class="chip ${bericht.auftragsart.includes(a) ? 'an' : ''}" data-aktion="art" data-wert="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
      <div class="reihe2">${feld('Monteur', 'monteur')}${feld('Helfer', 'helfer', { ph: 'falls dabei' })}</div>`,
  },
  zeiten: {
    titel: 'Arbeitszeiten & Anfahrt',
    info: () => { const m = summeMinuten(bericht, Number(einst.takt) || 0); return m ? `${zahl(m / 60)} Std.` : ''; },
    html: () => {
      if (!bericht.fahrt) bericht.fahrt = { anMin: '', abMin: '' };
      const an = katalogNach('anfahrt', 'km');
      const gewaehlt = (einst.katalog || []).find((k) => k.id === bericht.anfahrt.katalogId);
      const istKm = gewaehlt?.typ === 'km';
      const kunde = kundeZuName(bericht.kunde?.name);
      const zuletzt = kunde?.anfahrtKatalogId ? (einst.katalog || []).find((k) => k.id === kunde.anfahrtKatalogId) : null;
      const kurz = (k) => k.bezeichnung.replace(/^Fahrzeugkosten\s+/i, '') + (k.preis === null || k.preis === undefined ? '' : ` ${zahl(k.preis, 2)} €${k.typ === 'km' ? '/km' : ''}`);
      return `
        ${bericht.zeiten.map((z, i) => `
          <div class="zeile" data-i="${i}">
            <div class="${z.art === 'Fahrt' ? 'reihe3' : 'reihe2'}">
              ${auswahl('Person', `zeiten.${i}.person`, LISTEN.personen)}
              ${z.art === 'Fahrt' ? auswahl('Art', `zeiten.${i}.art`, ['Arbeit', 'Fahrt']) : ''}
              ${feld('Pause min', `zeiten.${i}.pause`, { modus: 'numeric', ph: '0' })}
            </div>
            <div class="reihe2">${zeitFeld('Von', `zeiten.${i}.von`)}${zeitFeld('Bis', `zeiten.${i}.bis`)}</div>
            <div class="zeile-fuss"><span class="stunden" data-std="${i}"></span>
              <button type="button" class="mini gefahr" data-aktion="weg" data-liste="zeiten" data-i="${i}">entfernen</button></div>
          </div>`).join('')}
        <div class="knopfreihe">
          <button type="button" class="btn klein" data-aktion="neu" data-liste="zeiten">${ICON.plus} Zeitzeile</button>
          <button type="button" class="btn klein" data-aktion="zweite-person" data-person="2. Monteur">${ICON.plus} 2. Monteur, gleiche Zeiten</button>
          <button type="button" class="btn klein" data-aktion="zweite-person" data-person="Helfer">${ICON.plus} Helfer, gleiche Zeiten</button>
        </div>
        <p class="hinweis-klein">Jede Person bekommt eigene Zeilen. So steht im Bericht, wie viele vor Ort waren, und jede Stunde wird abgerechnet.</p>
        <h3 class="unter">Fahrtzeit</h3>
        <div class="reihe2">
          ${feld('Anfahrt min', 'fahrt.anMin', { modus: 'numeric', ph: 'z. B. 30' })}
          ${feld('Abfahrt min', 'fahrt.abMin', { modus: 'numeric', ph: 'z. B. 30' })}
        </div>
        <p class="hinweis-klein" id="fahrt-info"></p>
        <p class="summe" id="zeit-summe"></p>
        <div class="feld"><span>Anfahrt abrechnen</span><div class="chips klein">
          ${an.map((k) => `<button type="button" class="chip ${bericht.anfahrt.katalogId === k.id ? 'an' : ''}" data-aktion="anfahrt-wahl" data-wert="${esc(k.id)}">${esc(kurz(k))}</button>`).join('')}
          <button type="button" class="chip ${bericht.anfahrt.katalogId ? '' : 'an'}" data-aktion="anfahrt-wahl" data-wert="">keine</button>
        </div></div>
        ${zuletzt ? `<p class="hinweis-klein">Zuletzt bei diesem Kunden: ${esc(kurz(zuletzt))}${bericht.anfahrt.katalogId === zuletzt.id ? ' (übernommen)' : ''}.</p>` : ''}
        ${istKm ? `${feld('Gefahrene km (hin und zurück)', 'anfahrt.km', { modus: 'decimal' })}<p class="hinweis-klein" id="km-info"></p>` : ''}`;
    },
    nachRender: () => kmVorschlagAnzeigen(),
  },
  arbeiten: {
    titel: 'Ausgeführte Arbeiten',
    info: () => { const n = String(bericht.arbeiten || '').split('\n').filter((z) => z.trim()).length; return n ? `${n} ${n === 1 ? 'Punkt' : 'Punkte'}` : ''; },
    html: () => `
      ${textfeld('Eine Zeile pro Arbeitsschritt', 'arbeiten', { zeilen: 7, ph: 'z. B.\nVerflüssiger gereinigt\nLüftermotor getauscht\nAnlage auf Funktion geprüft' })}
      <p class="hinweis-klein">Antippen fügt eine Zeile an. Diktieren geht über das Mikrofon der Tastatur.</p>
      <div class="chips klein">${(einst.bausteine || []).map((t) =>
        `<button type="button" class="chip" data-aktion="baustein" data-wert="${esc(t)}">${esc(t)}</button>`).join('')}</div>`,
  },
  pruefung: {
    titel: 'Prüfungen & Messwerte',
    info: () => {
      const p = (bericht.pruefungen || []).length;
      const m = LISTEN.messwerte.filter((g) => ['vorher', 'nachher'].some((k) => String(bericht.messwerte?.[g.id]?.[k] ?? '').trim())).length;
      return [p ? `${p} geprüft` : '', m ? `${m} Messw.` : ''].filter(Boolean).join(' · ');
    },
    html: () => `
      <div class="feld"><span>Geprüft (antippen zum Abhaken)</span><div class="chips klein">${(einst.pruefliste || []).map((t) =>
        `<button type="button" class="chip ${(bericht.pruefungen || []).includes(t) ? 'an' : ''}" data-aktion="pruef" data-wert="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
      <div class="trenner"></div>
      <p class="hinweis-klein">Messwerte vorher / nachher. Leere Felder erscheinen nicht im Bericht.</p>
      ${LISTEN.messwerte.map((g) => `
        <div class="zeile">
          <div class="mess-titel">${esc(g.name)} (${esc(g.einheit)})</div>
          <div class="reihe2">
            ${feld('vorher', `messwerte.${g.id}.vorher`, { modus: g.neg ? 'text' : 'decimal' })}
            ${feld('nachher', `messwerte.${g.id}.nachher`, { modus: g.neg ? 'text' : 'decimal' })}
          </div>
        </div>`).join('')}`,
  },
  material: {
    titel: 'Material',
    info: () => { const n = bericht.material.filter((m) => m.bezeichnung).length; return n ? `${n} Pos.` : ''; },
    html: () => `
      ${bericht.material.map((m, i) => `
        <div class="zeile">
          ${feld('Artikel', `material.${i}.bezeichnung`)}
          <div class="reihe3">
            ${feld('Menge', `material.${i}.menge`, { modus: 'decimal' })}
            ${feld('Einheit', `material.${i}.einheit`, { liste: 'dl-einheiten' })}
            ${feld('€ netto (intern)', `material.${i}.preis`, { modus: 'decimal', ph: 'VK' })}
          </div>
          <div class="zeile-fuss"><span></span><button type="button" class="mini gefahr" data-aktion="weg" data-liste="material" data-i="${i}">entfernen</button></div>
        </div>`).join('')}
      <div class="knopfreihe">
        <button type="button" class="btn klein" data-aktion="neu" data-liste="material">${ICON.plus} Material</button>
        <select data-aktion="katalog" data-liste="material" aria-label="Aus Katalog">${optionen(katalogNach('material').map((k) => [k.id, k.bezeichnung]), '', '+ aus Katalog …')}</select>
      </div>
      <p class="hinweis-klein">Der Preis erscheint nicht im Bericht für den Kunden, nur im Rechnungsvorschlag.</p>`,
  },
  kaeltemittel: {
    titel: 'Kältemittel & Dichtheitskontrolle',
    info: () => [bericht.kaeltemittel.length ? `${bericht.kaeltemittel.length} Vorg.` : '', bericht.dichtheit.durchgefuehrt === 'ja' ? 'DK' : ''].filter(Boolean).join(' · '),
    html: () => {
      const d = bericht.dichtheit;
      return `
        ${bericht.kaeltemittel.map((k, i) => `
          <div class="zeile">
            <div class="reihe2">${auswahl('Vorgang', `kaeltemittel.${i}.vorgang`, LISTEN.kmVorgang)}${feld('Kältemittel', `kaeltemittel.${i}.typ`, { liste: 'dl-km', attr: 'autocapitalize="characters"' })}</div>
            <div class="reihe3">
              ${feld('Menge kg', `kaeltemittel.${i}.menge`, { modus: 'decimal' })}
              ${auswahl('Zustand', `kaeltemittel.${i}.zustand`, LISTEN.kmZustand)}
              ${feld('€/kg (intern)', `kaeltemittel.${i}.preis`, { modus: 'decimal' })}
            </div>
            ${feld('Flaschen-Nr.', `kaeltemittel.${i}.flasche`)}
            <div class="zeile-fuss"><span></span><button type="button" class="mini gefahr" data-aktion="weg" data-liste="kaeltemittel" data-i="${i}">entfernen</button></div>
          </div>`).join('')}
        <button type="button" class="btn klein" data-aktion="neu" data-liste="kaeltemittel">${ICON.plus} Kältemittel-Vorgang</button>
        <div class="trenner"></div>
        ${auswahl('Dichtheitskontrolle durchgeführt?', 'dichtheit.durchgefuehrt', [['nein', 'nein'], ['ja', 'ja']], { render: 'kaeltemittel' })}
        ${d.durchgefuehrt === 'ja' ? `
          ${feld('Methode', 'dichtheit.methode', { liste: 'dl-methode' })}
          ${auswahl('Ergebnis', 'dichtheit.ergebnis', [['dicht', 'dicht'], ['undicht', 'undicht']], { leer: 'bitte wählen' })}
          ${textfeld('Leckstelle / Maßnahme', 'dichtheit.massnahme', { zeilen: 2 })}` : ''}
        <p class="hinweis-klein">Kommt mit Monteur und Zertifikat-Nr. in den Bericht. Fürs Büro: Claude trägt es in die Anlagen-Akte ein.</p>`;
    },
  },
  befund: {
    titel: 'Befund & Hinweise',
    info: () => '',
    html: () => `
      ${textfeld('Befund und Hinweise an den Kunden', 'befund', { zeilen: 3, ph: 'z. B. Türdichtung rissig, Tausch empfohlen' })}
      ${textfeld('Offen / Folgetermin', 'offen', { zeilen: 2 })}
      ${feld('Nächste Wartung empfohlen bis', 'wartungEmpfohlen', { typ: 'date' })}
      <p class="hinweis-klein">Steht im Bericht für den Kunden. Das Büro-Fenster erinnert rechtzeitig daran.</p>
      ${auswahl('Anlage bei Abschluss betriebsbereit?', 'betriebsbereit', ['ja', 'nein', 'eingeschränkt'], { leer: 'keine Angabe' })}`,
  },
  fotos: {
    titel: 'Fotos',
    info: () => (fotos.length ? `${fotos.length}` : ''),
    html: () => `
      <div class="knopfreihe">
        ${HANDY ? `<label class="btn">${ICON.kamera} Foto aufnehmen<input type="file" accept="image/*" capture="environment" data-aktion="foto" hidden></label>`
          : `<button type="button" class="btn" data-aktion="kamera">${ICON.kamera} Foto aufnehmen</button>`}
        <label class="btn">${ICON.bild} Aus Galerie<input type="file" accept="image/*" multiple data-aktion="foto" hidden></label>
      </div>
      <div class="fotos">${fotos.map((f, i) => `
        <figure class="foto">
          <img src="${f.url}" alt="Foto ${i + 1}">
          <input data-foto="${f.id}" value="${esc(f.titel)}" placeholder="Foto ${i + 1}: Beschreibung" aria-label="Beschreibung Foto ${i + 1}">
          <button type="button" class="weg" data-aktion="foto-weg" data-id="${f.id}" aria-label="Foto löschen">✕</button>
        </figure>`).join('')}</div>`,
  },
  abrechnung: {
    titel: 'Abrechnung (intern)',
    info: () => { const s = summen(positionen(bericht, einst), einst.ust); return s.netto ? euro(s.netto) : ''; },
    html: () => `
      <p class="hinweis-klein">Nur für dich und das Büro, steht nicht im Bericht für den Kunden. Preise netto aus dem Katalog (Einstellungen). Die Rechnung entsteht in FastBill, die Nummer vergibt FastBill.</p>
      <div id="abr-tabelle"></div>
      <h3 class="unter">Zusatzpositionen</h3>
      ${bericht.zusatz.map((z, i) => `
        <div class="zeile">
          ${feld('Bezeichnung', `zusatz.${i}.bezeichnung`)}
          <div class="reihe3">
            ${feld('Menge', `zusatz.${i}.menge`, { modus: 'decimal' })}
            ${feld('Einheit', `zusatz.${i}.einheit`, { liste: 'dl-einheiten' })}
            ${feld('€ netto', `zusatz.${i}.preis`, { modus: 'decimal' })}
          </div>
          <div class="zeile-fuss"><span></span><button type="button" class="mini gefahr" data-aktion="weg" data-liste="zusatz" data-i="${i}">entfernen</button></div>
        </div>`).join('')}
      <div class="knopfreihe">
        <button type="button" class="btn klein" data-aktion="neu" data-liste="zusatz">${ICON.plus} Position</button>
        <select data-aktion="katalog" data-liste="zusatz" aria-label="Aus Katalog">${optionen((einst.katalog || []).map((k) => [k.id, k.bezeichnung]), '', '+ aus Katalog …')}</select>
      </div>
      ${textfeld('Hinweis für die Rechnung', 'rechnungshinweis', { zeilen: 2, ph: 'z. B. Rechnung an Hausverwaltung, Kostenstelle' })}`,
  },
  unterschrift: {
    titel: 'Unterschrift',
    info: () => (bericht.unterschrift ? '✓' : 'offen'),
    ohneSperre: true,
    html: () => {
      const u = bericht.unterschrift;
      return `
        ${u ? `<div class="sig-anzeige"><img src="${u.png}" alt="Unterschrift Kunde"><div>${esc(u.name)} · ${esc(zeitstempelDe(u.zeit))}</div></div>`
          : `<p>Noch nicht unterschrieben.</p><button type="button" class="btn primaer breit" data-aktion="unterschreiben">${ICON.stift} Kunde unterschreiben lassen</button>`}
        ${gesperrt() ? `<button type="button" class="btn text" data-aktion="entsperren">${ICON.schloss} Bericht wieder bearbeiten</button>` : ''}`;
    },
  },
};

const REIHENFOLGE = ['kunde', 'anlage', 'einsatz', 'zeiten', 'arbeiten', 'pruefung', 'material', 'kaeltemittel', 'befund', 'fotos', 'abrechnung', 'unterschrift'];

function sektion(id) {
  const s = SEK[id];
  const offen = sekOffen[id] !== false;
  const sperre = gesperrt() && !s.ohneSperre;
  return `<details class="karte-sek" data-sek="${id}" id="sek-${id}" ${offen ? 'open' : ''}>
    <summary><span>${esc(s.titel)}</span><span class="sek-info" id="info-${id}">${esc(s.info() || '')}</span></summary>
    <fieldset class="inhalt" ${sperre ? 'disabled' : ''}>${s.html()}</fieldset>
  </details>`;
}

function datalists() {
  const dl = (id, werte) => `<datalist id="${id}">${werte.map((w) => `<option value="${esc(w)}"></option>`).join('')}</datalist>`;
  return dl('dl-kunden', kunden.map((k) => k.name)) + dl('dl-anlagenart', LISTEN.anlagenart) + dl('dl-km', LISTEN.kaeltemittel)
    + dl('dl-einheiten', LISTEN.einheiten) + dl('dl-methode', LISTEN.dichtMethode);
}

function renderBericht() {
  const g = gesperrt();
  ansicht().innerHTML = `
    <form class="bericht" autocomplete="off" onsubmit="return false">
      ${g ? `<div class="sperre">${ICON.schloss}<span>Unterschrieben am ${esc(zeitstempelDe(bericht.unterschrift?.zeit))}. Der Bericht ist gesperrt.</span></div>` : ''}
      ${REIHENFOLGE.map(sektion).join('')}
      <div class="gefahr-zone"><button type="button" class="btn text gefahr" data-aktion="loeschen">${ICON.muell} Bericht löschen</button></div>
    </form>
    <nav class="aktionsleiste">
      <button type="button" class="btn" data-aktion="pdf">${ICON.datei}<span>PDF ansehen</span></button>
      <button type="button" class="btn ${g ? '' : 'primaer'}" data-aktion="unterschreiben" ${g ? 'disabled' : ''}>${ICON.stift}<span>Unterschrift</span></button>
      <button type="button" class="btn ${g ? 'primaer' : ''}" data-aktion="senden">${ICON.senden}<span>Senden</span></button>
    </nav>
    ${datalists()}`;
  ansicht().oninput = beiEingabe;
  ansicht().onchange = beiAenderung;
  ansicht().onclick = beiKlick;
  berechnungen();
  for (const id of REIHENFOLGE) SEK[id].nachRender?.();
}

function neuSektion(id) {
  const el = $(`#sek-${id} > .inhalt`);
  if (el) el.innerHTML = SEK[id].html();
  berechnungen();
  if (el) SEK[id].nachRender?.();
}

// km-Vorschlag Lager → Kunde ins km-Feld, wenn „gefahrene km“ abgerechnet wird und das Feld leer ist
let kmLauf = 0;
async function kmVorschlagAnzeigen() {
  const info = $('#km-info');
  if (!info || !bericht) return;
  const kunde = kundeZuName(bericht.kunde?.name);
  const adresse = [bericht.kunde?.strasse, bericht.kunde?.plzOrt].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  if (!adresse) { info.textContent = 'Für einen km-Vorschlag Straße und PLZ Ort beim Kunden eintragen.'; return; }
  const ziel = kunde || { ...bericht.kunde };
  const lauf = ++kmLauf;
  info.textContent = Number.isFinite(ziel.entfernungKm) ? '' : 'Entfernung Lager → Kunde wird berechnet …';
  let v;
  try {
    v = await kmVorschlag(ziel, einst, { speichern: () => speichereEinstellungen(einst) });
  } catch (e) {
    if (lauf !== kmLauf) return;
    info.textContent = `Kein km-Vorschlag: ${e.message || e}. Bitte selbst eintragen.`;
    return;
  }
  if (lauf !== kmLauf || !$('#km-info')) return;
  if (!v) { info.textContent = navigator.onLine ? '' : 'Kein Netz: km bitte selbst eintragen, Vorschlag kommt beim nächsten Mal.'; return; }
  if (v.quelle === 'berechnet' && kunde) { kunde.geaendert = new Date().toISOString(); await db.put('kunden', kunde); }
  const text = `Vorschlag ${v.km} km: 2 × ${zahl(v.einfach, 1)} km Lager → Kunde (OpenStreetMap, Straßenstrecke).`;
  const feldKm = $('[data-f="anfahrt.km"]');
  if (!String(bericht.anfahrt.km || '').trim()) {
    bericht.anfahrt.km = String(v.km);
    if (feldKm) feldKm.value = bericht.anfahrt.km;
    geaendert();
    berechnungen();
    info.textContent = `${text} Übernommen, du kannst den Wert überschreiben.`;
  } else {
    info.textContent = text;
  }
}

function berechnungen() {
  if (!bericht) return;
  const takt = Number(einst.takt) || 0;
  bericht.zeiten.forEach((z, i) => {
    const el = $(`[data-std="${i}"]`);
    if (el) {
      const m = zeitMinuten(z, takt);
      el.textContent = m ? `${zahl(m / 60)} Std.` : (z.von && z.bis ? 'Zeiten prüfen' : '');
    }
  });
  const gesamt = $('#zeit-summe');
  if (gesamt) {
    const m = summeMinuten(bericht, takt);
    const fahrt = summeMinuten(bericht, takt, (z) => z.fahrt || z.art === 'Fahrt');
    gesamt.textContent = m ? `Gesamt ${zahl(m / 60)} Std.${fahrt ? ` (davon Fahrt ${zahl(fahrt / 60)})` : ''}${takt ? ` · ${takt}-Min.-Takt` : ''}` : '';
  }
  const fi = $('#fahrt-info');
  if (fi) {
    const f = fahrtZeilen(bericht);
    const erste = f.filter((z) => (z.person || 'Monteur') === (f[0]?.person || 'Monteur'));
    const an = erste.find((z) => z.art === 'Anfahrt');
    const ab = erste.find((z) => z.art === 'Abfahrt');
    const teile = [];
    if (an) teile.push(an.von ? `losgefahren ${an.von}, beim Kunden ${an.bis}` : 'Anfahrt: erst Arbeitsbeginn eintragen');
    if (ab) teile.push(ab.von ? `Rückfahrt ${ab.von} bis ${ab.bis}` : 'Abfahrt: erst Arbeitsende eintragen');
    const personen = new Set(f.map((z) => z.person || 'Monteur')).size;
    if (teile.length && personen > 1) teile.push(`gilt für ${personen} Personen`);
    fi.textContent = teile.length ? teile.join(' · ') + '. Fahrtzeit zählt als Arbeitszeit.' : 'Nur Minuten eintragen. Die App rechnet daraus, wann es losging und wann du zurück warst.';
  }
  const abr = $('#abr-tabelle');
  if (abr) abr.innerHTML = abrechnungTabelle();
  for (const id of REIHENFOLGE) {
    const el = $(`#info-${id}`);
    if (el) el.textContent = SEK[id].info() || '';
  }
}

function abrechnungTabelle() {
  const pos = positionen(bericht, einst);
  if (!pos.length) return '<p class="hinweis-klein">Noch keine Positionen. Zeiten, Anfahrt und Material füllen den Vorschlag.</p>';
  const s = summen(pos, einst.ust);
  return `<table class="abr">
    <thead><tr><th>Position</th><th class="r">Menge</th><th class="r">EP</th><th class="r">GP</th></tr></thead>
    <tbody>${pos.map((p) => `<tr><td>${esc(p.bezeichnung)}<br><small>${esc(p.herkunft)}</small></td>
      <td class="r">${menge(p.menge)} ${esc(p.einheit)}</td>
      <td class="r">${p.preis === null || p.preis === undefined ? '<span class="offen">[offen]</span>' : euro(p.preis)}</td>
      <td class="r">${p.preis === null || p.preis === undefined ? '' : euro(Math.round(p.menge * p.preis * 100) / 100)}</td></tr>`).join('')}</tbody>
    <tfoot>
      <tr><td colspan="3">Netto</td><td class="r">${euro(s.netto)}</td></tr>
      <tr><td colspan="3">USt ${zahl(s.ustSatz, 0)} %</td><td class="r">${euro(s.ust)}</td></tr>
      <tr><td colspan="3">Brutto</td><td class="r">${euro(s.brutto)}</td></tr>
    </tfoot></table>
    ${s.offen ? `<p class="offen">${s.offen} Preis${s.offen > 1 ? 'e' : ''} offen. Im Büro oder in FastBill ergänzen.</p>` : ''}`;
}

// Ereignisse --------------------------------------------------------

function beiEingabe(e) {
  const t = e.target;
  if (t.dataset.f) {
    setze(bericht, t.dataset.f, t.value);
    geaendert();
    berechnungen();
    if (t.dataset.f === 'kunde.name' && (!e.inputType || e.inputType === 'insertReplacementText')) kundeErkennen();
  } else if (t.dataset.foto) {
    const f = fotos.find((x) => x.id === t.dataset.foto);
    if (f) {
      f.titel = t.value;
      pdfVorrat = null;
      fotoSpeichern(f);
    }
  }
}

const fotoSpeichern = debounce((f) => {
  f.geaendert = new Date().toISOString();
  const { url, ...rec } = f;
  db.put('fotos', rec);
}, 400);

async function beiAenderung(e) {
  const t = e.target;
  const a = t.dataset.aktion;
  if (a === 'foto') return fotosHinzu(t);
  if (a === 'katalog') {
    const k = (einst.katalog || []).find((x) => x.id === t.value);
    t.value = '';
    if (!k) return;
    const liste = t.dataset.liste;
    bericht[liste].push({ bezeichnung: k.bezeichnung, menge: '1', einheit: k.einheit, preis: k.preis === null ? '' : zahl(k.preis, 2) });
    geaendert();
    neuSektion(liste);
    return;
  }
  if (a === 'standort-waehlen') {
    const s = kundeZuName(bericht.kunde.name)?.standorte?.[Number(t.value)];
    if (s) {
      const teile = [s.name, s.strasse, s.plzOrt].map((x) => String(x || '').trim()).filter(Boolean);
      bericht.einsatzort = teile.filter((x, i) => !teile.slice(0, i).some((y) => y.includes(x))).join(', ');
      bericht.kostenstelle = s.kostenstelle || '';
      bericht.fastbillKst = s.fastbillKst || '';   // für die Rechnung in FastBill, steht nicht im Bericht
      geaendert();
      neuSektion('kunde');
      toast('Filiale übernommen');
    }
    return;
  }
  if (a === 'kunde-waehlen') {
    const k = kunden.find((x) => x.id === t.value);
    if (k) {
      bericht.kunde = { ...bericht.kunde, name: k.name };
      for (const f of ['ansprechpartner', 'telefon', 'strasse', 'plzOrt', 'email']) bericht.kunde[f] = k[f] || '';
      anfahrtVomKunden(k);
      geaendert();
      neuSektion('kunde');
      neuSektion('anlage');
      neuSektion('zeiten');
      toast('Kundendaten übernommen');
    }
    return;
  }
  if (a === 'anlage-waehlen') {
    const k = kundeZuName(bericht.kunde.name);
    const an = k?.anlagen?.[Number(t.value)];
    if (an) {
      bericht.anlage = { ...bericht.anlage, ...an };
      geaendert();
      neuSektion('anlage');
      toast('Anlagendaten übernommen');
    }
    return;
  }
  if (t.dataset.f === 'kunde.name') kundeErkennen();
  if (t.dataset.render) neuSektion(t.dataset.render);
}

async function beiKlick(e) {
  const b = e.target.closest('[data-aktion]');
  if (!b || b.tagName === 'SELECT' || b.tagName === 'INPUT') return;
  const a = b.dataset.aktion;
  if (a === 'art') {
    const w = b.dataset.wert;
    const i = bericht.auftragsart.indexOf(w);
    if (i >= 0) bericht.auftragsart.splice(i, 1); else bericht.auftragsart.push(w);
    b.classList.toggle('an', i < 0);
    geaendert();
    berechnungen();
  } else if (a === 'pruef') {
    const w = b.dataset.wert;
    if (!Array.isArray(bericht.pruefungen)) bericht.pruefungen = [];
    const i = bericht.pruefungen.indexOf(w);
    if (i >= 0) bericht.pruefungen.splice(i, 1); else bericht.pruefungen.push(w);
    b.classList.toggle('an', i < 0);
    geaendert();
    berechnungen();
  } else if (a === 'anfahrt-wahl') {
    bericht.anfahrt.katalogId = b.dataset.wert || '';
    geaendert();
    neuSektion('zeiten');
  } else if (a === 'zweite-person') {
    const ziel = b.dataset.person;
    if (bericht.zeiten.some((z) => z.person === ziel)) return toast(`Für „${ziel}“ gibt es schon Zeiten.`);
    const vorlage = bericht.zeiten.filter((z) => (z.person || 'Monteur') === 'Monteur' && (z.von || z.bis));
    if (!vorlage.length) return toast('Erst die Zeiten des Monteurs eintragen.');
    for (const z of vorlage) bericht.zeiten.push({ ...z, id: uid(), person: ziel });
    geaendert();
    neuSektion('zeiten');
    berechnungen();
    toast(`Zeiten für „${ziel}“ übernommen. Bei Bedarf anpassen.`);
  } else if (a === 'baustein') {
    const ta = $('[data-f="arbeiten"]');
    const alt = String(bericht.arbeiten || '').replace(/\s+$/, '');
    bericht.arbeiten = (alt ? alt + '\n' : '') + b.dataset.wert;
    ta.value = bericht.arbeiten;
    geaendert();
    berechnungen();
  } else if (a === 'jetzt') {
    setze(bericht, b.dataset.pfad, jetztZeit());
    const inp = $(`[data-f="${b.dataset.pfad}"]`);
    if (inp) inp.value = jetztZeit();
    geaendert();
    berechnungen();
  } else if (a === 'neu') {
    neueZeile(b.dataset.liste);
  } else if (a === 'weg') {
    bericht[b.dataset.liste].splice(Number(b.dataset.i), 1);
    geaendert();
    neuSektion(b.dataset.liste);
  } else if (a === 'kamera') {
    await kameraFotos();
  } else if (a === 'foto-weg') {
    if (await bestaetigen('Dieses Foto löschen?', 'Löschen', 'Behalten', true)) await fotoLoeschen(b.dataset.id);
  } else if (a === 'unterschreiben') {
    await unterschreiben();
  } else if (a === 'entsperren') {
    if (await bestaetigen('Bericht wieder bearbeiten? Die Unterschrift des Kunden wird dabei entfernt und muss neu geleistet werden.', 'Bearbeiten', 'Abbrechen', true)) {
      bericht.unterschrift = null;
      bericht.monteurUnterschrift = null;
      bericht.status = 'entwurf';
      geaendert();
      await speichern.sofort();
      renderBericht();
    }
  } else if (a === 'pdf') {
    await pdfAnsehen();
  } else if (a === 'senden') {
    await senden();
  } else if (a === 'loeschen') {
    await berichtLoeschen();
  }
}

function neueZeile(liste) {
  if (liste === 'zeiten') {
    const letzte = bericht.zeiten[bericht.zeiten.length - 1];
    bericht.zeiten.push({ id: uid(), person: letzte?.person || 'Monteur', art: 'Arbeit', von: letzte?.bis || '', bis: '', pause: '' });
  } else if (liste === 'material') {
    bericht.material.push({ bezeichnung: '', menge: '1', einheit: 'Stk.', preis: '' });
  } else if (liste === 'kaeltemittel') {
    bericht.kaeltemittel.push({ vorgang: 'Nachgefüllt', typ: bericht.anlage.kaeltemittel || '', menge: '', zustand: 'neu', flasche: '', preis: '' });
  } else if (liste === 'zusatz') {
    bericht.zusatz.push({ bezeichnung: '', menge: '1', einheit: 'pausch.', preis: '' });
  }
  geaendert();
  neuSektion(liste);
  const felder = $$(`#sek-${liste} .zeile`);
  felder[felder.length - 1]?.querySelector('input')?.focus();
}

// Kunden ------------------------------------------------------------

function kundeZuName(name) {
  const n = String(name || '').trim().toLowerCase();
  return n ? kunden.find((k) => k.name.trim().toLowerCase() === n) : null;
}

function kundeErkennen() {
  const k = kundeZuName(bericht.kunde.name);
  if (!k) return;
  let neu = false;
  for (const f of ['ansprechpartner', 'telefon', 'strasse', 'plzOrt', 'email']) {
    if (!bericht.kunde[f] && k[f]) { bericht.kunde[f] = k[f]; neu = true; }
  }
  $$('[data-f^="kunde."]').forEach((i) => { if (i !== document.activeElement) i.value = wert(i.dataset.f); });
  if (anfahrtVomKunden(k)) neu = true;
  neuSektion('anlage');
  neuSektion('zeiten');
  if (neu) { geaendert(); toast('Kundendaten übernommen'); }
}

// Anfahrt so vorschlagen, wie sie beim Kunden zuletzt abgerechnet wurde (Volkan 29.10.2026: „kommt auf den Kunden an“)
function anfahrtVomKunden(k) {
  if (!k?.anfahrtKatalogId || bericht.anfahrt.katalogId) return false;
  if (!(einst.katalog || []).some((x) => x.id === k.anfahrtKatalogId)) return false;
  bericht.anfahrt.katalogId = k.anfahrtKatalogId;
  return true;
}

async function kundeMerken() {
  if (!bericht) return;
  const k = bericht.kunde;
  const name = String(k.name || '').trim();
  if (name.length < 2) return;
  const bekannt = kundeZuName(name);
  const vorher = bekannt ? JSON.stringify(bekannt) : '';
  const eintrag = bekannt || { id: uid(), name, anlagen: [] };
  eintrag.name = name;
  for (const f of ['ansprechpartner', 'telefon', 'strasse', 'plzOrt', 'email']) eintrag[f] = k[f] || eintrag[f] || '';
  const a = bericht.anlage;
  if (a.bezeichnung || a.typ || a.seriennr) {
    const schl = (x) => (String(x.seriennr || '').trim()
      ? 'sn:' + x.seriennr.trim().toLowerCase()
      : 'bz:' + String(x.bezeichnung || '').trim().toLowerCase() + '|' + String(x.typ || '').trim().toLowerCase());
    const i = eintrag.anlagen.findIndex((x) => schl(x) === schl(a));
    if (i >= 0) eintrag.anlagen[i] = { ...a }; else eintrag.anlagen.push({ ...a });
  }
  const ort = String(bericht.einsatzort || '').trim();
  const kst = String(bericht.kostenstelle || '').trim();
  if (ort || kst) {
    eintrag.standorte = eintrag.standorte || [];
    const i = eintrag.standorte.findIndex((s) => String(s.name || '').trim().toLowerCase() === ort.toLowerCase() && String(s.kostenstelle || '') === kst);
    if (i < 0) eintrag.standorte.push({ name: ort, kostenstelle: kst });
  }
  if (bericht.anfahrt?.katalogId) eintrag.anfahrtKatalogId = bericht.anfahrt.katalogId;   // so wird beim Kunden abgerechnet
  eintrag.zuletzt = bericht.datum;
  if (JSON.stringify(eintrag) !== vorher) eintrag.geaendert = new Date().toISOString();
  await db.put('kunden', eintrag);
  kunden = await db.alle('kunden');
}

// Fotos -------------------------------------------------------------

async function fotosHinzu(input) {
  const dateien = [...(input.files || [])];
  input.value = '';
  await fotosSpeichern(dateien);
}

async function fotosSpeichern(dateien) {
  if (!dateien.length) return;
  if (dateien.length > 1) toast(`${dateien.length} Fotos werden verarbeitet …`);
  for (const d of dateien) {
    try {
      const { blob, w, h } = await verkleinern(d);
      const jetzt = new Date().toISOString();
      const rec = { id: uid(), berichtId: bericht.id, blob, w, h, titel: '', nr: (fotos[fotos.length - 1]?.nr || 0) + 1, erstellt: jetzt, geaendert: jetzt };
      await db.put('fotos', rec);
      fotos.push({ ...rec, url: URL.createObjectURL(blob) });
    } catch (err) {
      toast('Foto konnte nicht gelesen werden: ' + err.message);
    }
  }
  geaendert();
  neuSektion('fotos');
}

// Kamera im Browser (Laptop): Vorschau, Auslöser, Kamera wechseln. Mehrere Fotos nacheinander möglich.
async function kameraFotos() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Dieser Browser kann die Kamera nicht öffnen. Bitte „Aus Galerie“ nehmen.');
  let strom = null;
  let geraete = [];
  let nr = 0;
  const neu = [];
  const starten = async (video) => {
    strom?.getTracks().forEach((t) => t.stop());
    const wahl = geraete[nr]?.deviceId;
    strom = await navigator.mediaDevices.getUserMedia({
      video: wahl ? { deviceId: { exact: wahl }, width: { ideal: 1920 } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      audio: false,
    });
    video.srcObject = strom;
    await video.play().catch(() => {});
  };
  await dialog(`
    <div class="dlg dlg-kamera">
      <h2>Foto aufnehmen</h2>
      <div class="kamera-feld"><video playsinline muted></video></div>
      <p class="hinweis-klein" data-k="info">Kamera wird geöffnet …</p>
      <div class="dlg-knoepfe">
        <button type="button" class="btn" data-k="wechseln" hidden>Kamera wechseln</button>
        <button type="button" class="btn" data-k="fertig">Fertig</button>
        <button type="button" class="btn primaer" data-k="ausloesen">${ICON.kamera} Auslösen</button>
      </div>
    </div>`, async (dlg, schliessen) => {
    const video = dlg.querySelector('video');
    const info = dlg.querySelector('[data-k="info"]');
    const ende = () => { strom?.getTracks().forEach((t) => t.stop()); schliessen(true); };
    dlg.querySelector('[data-k="fertig"]').onclick = ende;
    dlg.oncancel = (e) => { e.preventDefault(); ende(); };
    try {
      await starten(video);
      geraete = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
      const aktiv = strom.getVideoTracks()[0]?.getSettings().deviceId;
      nr = Math.max(0, geraete.findIndex((d) => d.deviceId === aktiv));
      dlg.querySelector('[data-k="wechseln"]').hidden = geraete.length < 2;
      info.textContent = 'Typenschild nicht vergessen.';
    } catch (e) {
      info.textContent = e.name === 'NotAllowedError'
        ? 'Kamera nicht erlaubt. Oben in der Adresszeile auf das Kamera-Symbol klicken und „Zulassen“ wählen.'
        : 'Kamera lässt sich nicht öffnen: ' + (e.message || e.name);
      return;
    }
    dlg.querySelector('[data-k="wechseln"]').onclick = async () => {
      nr = (nr + 1) % geraete.length;
      try { await starten(video); } catch (e) { toast('Kamera lässt sich nicht wechseln: ' + (e.message || e.name)); }
    };
    dlg.querySelector('[data-k="ausloesen"]').onclick = async () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) return toast('Foto konnte nicht aufgenommen werden.');
      neu.push(blob);
      info.textContent = `${neu.length} Foto${neu.length > 1 ? 's' : ''} aufgenommen. Weiter fotografieren oder „Fertig“.`;
      video.classList.add('blitz');
      setTimeout(() => video.classList.remove('blitz'), 150);
    };
  }, { gross: true });
  await fotosSpeichern(neu);
}

async function fotoLoeschen(id) {
  const i = fotos.findIndex((f) => f.id === id);
  if (i < 0) return;
  URL.revokeObjectURL(fotos[i].url);
  fotos.splice(i, 1);
  await db.weg('fotos', id);
  await merkeWeg(['f_' + id]);
  geaendert();
  neuSektion('fotos');
}

// Unterschrift ------------------------------------------------------

function zusammenfassung() {
  const takt = Number(einst.takt) || 0;
  const m = summeMinuten(bericht, takt);
  const arbeiten = String(bericht.arbeiten || '').split('\n').map((z) => z.trim()).filter(Boolean);
  const mat = bericht.material.filter((x) => x.bezeichnung);
  const km = bericht.kaeltemittel.filter((x) => x.typ || x.menge);
  const a = bericht.anlage;
  const zeilen = [
    ['Datum', datumDe(bericht.datum)],
    ['Anlage', [a.bezeichnung, a.hersteller, a.typ].filter(Boolean).join(' · ')],
    ['Arbeitszeit', m ? `${zahl(m / 60)} Std.` : ''],
    ['Arbeiten', arbeiten.length ? `<ol>${arbeiten.map((z) => `<li>${esc(z)}</li>`).join('')}</ol>` : '', true],
    ['Material', mat.length ? `<ul>${mat.map((x) => `<li>${esc(menge(parseZahl(x.menge) ?? 1))} ${esc(x.einheit)} ${esc(x.bezeichnung)}</li>`).join('')}</ul>` : '', true],
    ['Kältemittel', km.map((x) => `${menge(parseZahl(x.menge))} kg ${x.typ} ${String(x.vorgang || '').toLowerCase()}`).join(', ')],
    ['Dichtheit', bericht.dichtheit.durchgefuehrt === 'ja' ? `geprüft${bericht.dichtheit.ergebnis ? ', ' + bericht.dichtheit.ergebnis : ''}` : ''],
  ].filter((z) => z[1]);
  return `<div class="zusammenfassung"><dl>${zeilen.map(([k, v, html]) => `<dt>${k}</dt><dd>${html ? v : esc(v)}</dd>`).join('')}</dl></div>`;
}

async function unterschreiben() {
  if (speichern.offen()) await speichern.sofort();
  if (!String(bericht.kunde.name || '').trim()) {
    sekOffen.kunde = true;
    $('#sek-kunde').open = true;
    $('[data-f="kunde.name"]')?.focus();
    return toast('Bitte zuerst den Kunden eintragen.');
  }
  const leer = !String(bericht.arbeiten || '').trim() && !summeMinuten(bericht, 0);
  if (leer && !(await bestaetigen('Es sind weder Arbeiten noch Zeiten eingetragen. Trotzdem unterschreiben lassen?', 'Weiter', 'Zurück'))) return;
  const u = await unterschriftHolen({
    titel: 'Unterschrift Kunde',
    oben: zusammenfassung(),
    name: bericht.kunde.ansprechpartner || '',
    hinweis: einst.bestaetigung,
  });
  if (!u) return;
  bericht.unterschrift = { ...u, zeit: new Date().toISOString() };
  bericht.monteurUnterschrift = einst.monteurUnterschrift || null;
  bericht.status = 'unterschrieben';
  geaendert();
  await speichern.sofort();
  await kundeMerken();
  renderBericht();
  if (await bueroKopieVormerken()) abgleichJetzt();
  if (await bestaetigen('Unterschrieben. Jetzt die Kopie per Mail an den Kunden senden?', 'Kopie senden', 'Später')) {
    await kundeSenden();
  } else {
    toast('Nicht vergessen: Kopie an den Kunden über „Senden“.');
  }
}

// PDF und Senden ----------------------------------------------------

// Unterschriebener Bericht geht automatisch als PDF ins Büro (Drive-Briefkasten → PC legt ihn in Serviceberichte ab),
// „Ins Büro“ muss Volkan nicht mehr antippen (Volkan 29.10.2026). Die Rechnungsdaten rechnet das Büro-Fenster selbst.
// b: Bericht (Standard: der offene). still: ohne Hinweise auf dem Bildschirm (Nachholen im Hintergrund).
async function bueroKopieVormerken(b = bericht, { still = false } = {}) {
  if (!(await verbunden())) return false;
  let p;
  const fertig = still ? () => {} : warten('PDF fürs Büro wird erstellt …');
  try { p = b === bericht ? await pdfHolen() : await pdfFuer(b); }
  catch (e) { if (!still) toast('PDF fürs Büro ging nicht: ' + (e.message || e)); return false; }
  finally { fertig(); }
  const angefordert = new Date().toISOString();
  await versandVormerken({
    berichtId: b.id, nr: b.nr, an: 'buero', zweck: 'buero', betreff: `Arbeitsbericht ${b.nr}`, text: '',
    pdfName: p.name, pdfDataUrl: await blobZuDataUrl(p.blob), angefordert, geraet: einst.geraet || '',
  });
  // am Bericht merken (gleicht sich mit ab), damit das Nachholen die Kopie nicht ein zweites Mal anfordert
  await berichtAendern(b.id, (x) => { x.bueroAngefordert = angefordert; });
  return true;
}

// Unterschriebene Berichte, die noch nie im Büro waren (vor Version 1.5.4 unterschrieben, oder die Büro-Kopie
// ging damals schief), gehen nach jedem Abgleich von allein nach (Volkan 30.10.2026: „automatisch synchro“).
// Jedes Gerät holt nur die Berichte mit seiner eigenen Nummer nach, damit Handy und Lenovo nicht beide dasselbe PDF schicken.
let nachholenLaeuft = false;
const nachholenVersucht = new Set();   // je Sitzung ein Versuch pro Bericht, sonst Dauerschleife bei einem kaputten Bericht

async function bueroNachholen() {
  if (nachholenLaeuft || !navigator.onLine || !(await verbunden())) return;
  nachholenLaeuft = true;
  try {
    const wartend = await wartendeVersandIds();
    const offen = (await db.alle('berichte')).filter((b) => b.status === 'unterschrieben' && !b.geteiltBuero
      && !b.bueroAngefordert && !wartend.has(b.id) && !nachholenVersucht.has(b.id) && eigeneNummer(b.nr));
    let n = 0;
    for (const b of offen) {
      nachholenVersucht.add(b.id);
      if (await bueroKopieVormerken(b, { still: true })) n++;
    }
    if (n) {
      toast(n === 1 ? `Bericht ${offen[0].nr} geht nachträglich ins Büro.` : `${n} Berichte gehen nachträglich ins Büro.`);
      abgleichPlanen(500);
    }
  } finally { nachholenLaeuft = false; }
}

// Nummer dieses Geräts? Handy AB-2026-005, Lenovo AB-2026-L003 (Kürzel aus den Einstellungen)
function eigeneNummer(nr) {
  const k = String(einst.geraet || '').trim().toUpperCase();
  const p = (einst.nrPraefix || 'AB').replace(/[^A-Za-z0-9]/g, '\\$&');
  return new RegExp(`^${p}-\\d{4}-${k}\\d+$`).test(nr || '');
}

// PDF eines Berichts, der nicht gerade offen ist (mit seinen Fotos aus dem Speicher)
async function pdfFuer(b) {
  const liste = (await db.nachIndex('fotos', 'bericht', b.id)).sort((x, y) => x.nr - y.nr);
  return { blob: await berichtPdf(b, liste, einst), name: dateiname(b) };
}

async function pdfHolen() {
  if (pdfVorrat && pdfVorrat.stand === bericht.geaendert) return pdfVorrat;
  if (speichern.offen()) await speichern.sofort();
  const blob = await berichtPdf(bericht, fotos, einst);
  pdfVorrat = { stand: bericht.geaendert, blob, name: dateiname(bericht) };
  return pdfVorrat;
}

function warten(text) {
  const dlg = $('#dialog');
  dlg.className = '';
  dlg.innerHTML = `<div class="dlg warten"><div class="kreisel"></div><p>${esc(text)}</p></div>`;
  if (!dlg.open) dlg.showModal();
  return () => { if (dlg.open) dlg.close(); dlg.innerHTML = ''; };
}

async function pdfAnsehen() {
  const fertig = warten('PDF wird erstellt …');
  let p;
  try { p = await pdfHolen(); } finally { fertig(); }
  if (/Android/i.test(navigator.userAgent)) {
    herunterladen(p.blob, p.name);
    toast('PDF gespeichert. Zum Ansehen die Download-Meldung antippen.');
  } else if (!window.open(URL.createObjectURL(p.blob), '_blank')) {
    herunterladen(p.blob, p.name);
  }
}

function vorlage(text) {
  return String(text || '')
    .replaceAll('{nr}', bericht.nr)
    .replaceAll('{datum}', datumDe(bericht.datum))
    .replaceAll('{kunde}', bericht.kunde.name || '');
}

async function teilen(dateien, titel, text) {
  if (navigator.canShare && navigator.canShare({ files: dateien })) {
    try {
      await navigator.share({ files: dateien, title: titel, text });
      return 'geteilt';
    } catch (e) {
      if (e.name === 'AbortError') return 'abgebrochen';
      throw e;
    }
  }
  for (const d of dateien) herunterladen(d, d.name);
  return 'heruntergeladen';
}

async function senden() {
  if (!gesperrt() && !(await bestaetigen('Der Bericht ist noch nicht unterschrieben. Trotzdem senden?', 'Trotzdem senden', 'Abbrechen'))) return;
  const fertig = warten('PDF wird erstellt …');
  let p;
  try { p = await pdfHolen(); } finally { fertig(); }
  const mail = bericht.kunde.email;
  const s = summen(positionen(bericht, einst), einst.ust);
  const ueberPc = await verbunden();
  const vorgemerkt = bericht.versandKunde?.status === 'wartet';
  const kundeInfo = bericht.geteiltKunde ? ' · schon geschickt' : vorgemerkt ? ' · ist vorgemerkt' : ' · Pflicht';
  const wahl = await dialog(`
    <div class="dlg">
      <h2>Senden</h2>
      <div class="wahl">
        <button type="button" class="btn ${bericht.geteiltKunde || vorgemerkt ? '' : 'primaer'}" data-k="kunde">${ICON.kunde}<span>Kopie per Mail an den Kunden${bericht.geteiltKunde ? ' ✓' : ''}<small>${mail ? esc(mail) : 'E-Mail-Adresse wird abgefragt'} · nur PDF${kundeInfo}${ueberPc ? ' · geht vom PC über info@ raus, auch wenn du gerade offline bist' : ''}</small></span></button>
        ${ueberPc ? `<button type="button" class="btn" data-k="kunde-selbst">${ICON.senden}<span>Kopie selbst mit der Mail-App senden<small>Teilen-Menü wie bisher</small></span></button>` : ''}
        <button type="button" class="btn" data-k="buero">${ICON.buero}<span>Ins Büro<small>PDF + Rechnungsdaten · in Drive ablegen oder an info@ mailen</small></span></button>
        <button type="button" class="btn" data-k="laden">${ICON.laden}<span>PDF auf dem Handy speichern<small>${esc(p.name)}</small></span></button>
      </div>
      <div class="dlg-knoepfe"><button type="button" class="btn" data-k="zu">Schließen</button></div>
    </div>`, (dlg, schliessen) => {
    dlg.querySelectorAll('[data-k]').forEach((k) => { k.onclick = () => schliessen(k.dataset.k); });
  });
  if (!wahl || wahl === 'zu') return;
  const pdfDatei = new File([p.blob], p.name, { type: 'application/pdf' });

  if (wahl === 'kunde' || wahl === 'kunde-selbst') {
    await kundeSenden(p, { selbst: wahl === 'kunde-selbst' });
  } else if (wahl === 'buero') {
    if (!bericht.geteiltKunde && bericht.versandKunde?.status !== 'wartet' && await bestaetigen('Der Kunde hat noch keine Kopie. Zuerst die Kopie per Mail an den Kunden senden?', 'Erst an den Kunden', 'Nur ins Büro')) {
      await kundeSenden(p);
    }
    const pos = positionen(bericht, einst);
    const daten = rechnungsdaten(bericht, einst, pos, s);
    const txt = new File([JSON.stringify(daten, null, 2)], dateiname(bericht, 'rechnungsdaten', 'txt'), { type: 'text/plain' });
    const text = [
      `Arbeitsbericht ${bericht.nr} vom ${datumDe(bericht.datum)}`,
      `Kunde: ${bericht.kunde.name || '-'}`,
      `Rechnungsvorschlag: ${euro(s.netto)} netto${s.offen ? `, ${s.offen} Preis(e) offen` : ''}`,
      'Anhang: PDF und Rechnungsdaten (für Claude).',
    ].join('\n');
    const r = await teilen([pdfDatei, txt], `Arbeitsbericht ${bericht.nr} – ${bericht.kunde.name || ''} (Büro)`, text);
    if (r === 'geteilt' || r === 'heruntergeladen') {
      bericht.geteiltBuero = new Date().toISOString();
      await speichernJetzt();
      toast(r === 'geteilt' ? 'Ans Büro weitergegeben.' : 'Dateien heruntergeladen.');
    }
  } else if (wahl === 'laden') {
    herunterladen(p.blob, p.name);
  }
  berechnungen();
}

// Kopie des Berichts per Mail an den Kunden: fragt die Adresse ab, wenn sie fehlt, und merkt sich den Versand
async function kundeSenden(p = null, { selbst = false } = {}) {
  let mail = String(bericht.kunde.email || '').trim();
  if (!mail) {
    mail = await dialog(`
      <div class="dlg">
        <h2>Kopie an den Kunden</h2>
        <label class="feld"><span>E-Mail-Adresse des Kunden</span><input type="email" inputmode="email" autocomplete="off" data-k="mail"></label>
        <div class="dlg-knoepfe"><button type="button" class="btn" data-k="nein">Abbrechen</button><button type="button" class="btn primaer" data-k="ja">Weiter</button></div>
      </div>`, (dlg, schliessen) => {
      const feld = dlg.querySelector('[data-k="mail"]');
      setTimeout(() => feld.focus(), 50);
      dlg.querySelector('[data-k="nein"]').onclick = () => schliessen('');
      dlg.querySelector('[data-k="ja"]').onclick = () => {
        const w = feld.value.trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(w)) { feld.focus(); return toast('Bitte eine gültige E-Mail-Adresse eintragen.'); }
        schliessen(w);
      };
    });
    if (!mail) return toast('Kopie an den Kunden noch offen.');
    bericht.kunde.email = mail;
    geaendert();
    await speichern.sofort();
    await kundeMerken();
  }
  if (!p) {
    const fertig = warten('PDF wird erstellt …');
    try { p = await pdfHolen(); } finally { fertig(); }
  }
  if (!selbst && await verbunden()) {
    // Vormerken: der Abgleich bringt die Kopie in den Ausgang, der PC verschickt sie von info@coolcontrol.online
    const angefordert = new Date().toISOString();
    await versandVormerken({
      berichtId: bericht.id, nr: bericht.nr, an: mail, betreff: vorlage(einst.mailBetreff), text: vorlage(einst.mailText),
      pdfName: p.name, pdfDataUrl: await blobZuDataUrl(p.blob), angefordert, geraet: einst.geraet || '',
    });
    bericht.versandKunde = { an: mail, angefordert, status: 'wartet' };
    geaendert();
    await speichern.sofort();
    toast(navigator.onLine ? `Kopie an ${mail} geht raus. Der PC schickt sie von info@coolcontrol.online.` : `Kopie an ${mail} ist vorgemerkt und geht raus, sobald du online bist.`, 5000);
    abgleichJetzt();
    berechnungen();
    return;
  }
  const pdfDatei = new File([p.blob], p.name, { type: 'application/pdf' });
  try { await navigator.clipboard.writeText(mail); } catch { /* egal */ }
  const r = await teilen([pdfDatei], vorlage(einst.mailBetreff), vorlage(einst.mailText));
  if (r === 'geteilt') {
    bericht.geteiltKunde = new Date().toISOString();
    await speichernJetzt();
    toast('Mail-App geöffnet. Adresse liegt in der Zwischenablage: ins Feld „An“ einfügen und absenden.');
  } else if (r === 'heruntergeladen') {
    location.href = `mailto:${encodeURIComponent(mail)}?subject=${encodeURIComponent(vorlage(einst.mailBetreff))}&body=${encodeURIComponent(vorlage(einst.mailText))}`;
    toast('PDF heruntergeladen. Bitte an die Mail anhängen.');
  }
  berechnungen();
}

// Fragt nach und löscht Bericht + Fotos. true, wenn gelöscht.
async function berichtEntfernen(b) {
  const text = b.status === 'unterschrieben' || b.unterschrift
    ? `Bericht ${b.nr} (${b.kunde?.name || 'ohne Kunde'}) ist schon unterschrieben. Wirklich löschen? Fotos und Unterschrift gehen verloren.`
    : `Bericht ${b.nr} (${b.kunde?.name || 'ohne Kunde'}) mit allen Fotos löschen?`;
  if (!(await bestaetigen(text, 'Löschen', 'Behalten', true))) return false;
  try {
    const weg = ['b_' + b.id];
    for (const f of await db.alle('fotos')) if (f.berichtId === b.id) { await db.weg('fotos', f.id); weg.push('f_' + f.id); }
    await db.weg('berichte', b.id);
    await merkeWeg(weg);
  } catch (e) {
    toast('Löschen hat nicht geklappt: ' + (e.message || e));
    return false;
  }
  toast('Bericht gelöscht');
  return true;
}

async function berichtLoeschen() {
  if (!(await berichtEntfernen(bericht))) return;
  fotos.forEach((f) => URL.revokeObjectURL(f.url));
  fotos = [];
  bericht = null;
  location.hash = '#/';
}

// ---------------------------------------------------------------- Einstellungen

// Felder, die nur für dieses Gerät gelten, ändern den Stand für den Abgleich nicht
const GERAET_FELDER = new Set(['geraet', 'nrNaechste']);
let einstZuletzt = '';

const einstSpeichern = debounce(async () => {
  await speichereEinstellungen(einst, { mitZeit: !GERAET_FELDER.has(einstZuletzt) });
  abgleichPlanen();
  const s = $('#speicherstatus');
  if (s) s.textContent = 'gespeichert';
}, 400);

function efeld(label, pfad, { typ = 'text', modus = '', ph = '' } = {}) {
  let v = lies(einst, pfad);
  if (pfad.endsWith('.preis') && typeof v === 'number') v = zahl(v, 2);
  return `<label class="feld"><span>${esc(label)}</span><input type="${typ}" data-e="${pfad}" value="${esc(v ?? '')}" ${modus ? `inputmode="${modus}"` : ''} ${ph ? `placeholder="${esc(ph)}"` : ''}></label>`;
}

function etext(label, pfad, zeilen = 3) {
  return `<label class="feld"><span>${esc(label)}</span><textarea data-e="${pfad}" rows="${zeilen}">${esc(lies(einst, pfad) ?? '')}</textarea></label>`;
}

async function zeigeEinstellungen() {
  kopf('Einstellungen', true);
  kunden = await db.alle('kunden');
  const dauerhaft = await navigator.storage?.persisted?.();
  const platz = await navigator.storage?.estimate?.();
  const am = await abgleichMeta();
  const geraete = [['', 'Handy (Nummern AB-…-001)'], ['L', 'Lenovo (AB-…-L001)'], ['T', 'Tablet (AB-…-T001)']];
  if (einst.geraet && !geraete.some(([k]) => k === einst.geraet)) geraete.push([einst.geraet, `Kürzel ${einst.geraet}`]);
  const typen = [['lohn', 'Lohn Monteur'], ['helfer', 'Lohn Helfer'], ['anfahrt', 'Anfahrt pauschal'], ['km', 'Anfahrt je km'], ['material', 'Material / Pauschale']];
  ansicht().innerHTML = `
    <form class="einstellungen" autocomplete="off" onsubmit="return false">
      <details class="karte-sek" open><summary><span>Monteur</span></summary><div class="inhalt">
        ${efeld('Name im Bericht', 'monteur')}
        ${efeld('F-Gase-Personenzertifikat', 'zertifikat')}
      </div></details>

      <details class="karte-sek"><summary><span>Berichtsnummern</span><span class="sek-info">${esc(einst.nrPraefix)}-${esc(einst.nrJahr || new Date().getFullYear())}-…</span></summary><div class="inhalt">
        <div class="reihe2">${efeld('Kürzel', 'nrPraefix')}${efeld('Nächste Nummer', 'nrNaechste', { modus: 'numeric' })}</div>
        <p class="hinweis-klein">Eigene Nummer für den Arbeitsbericht. Rechnungsnummern vergibt nur FastBill.</p>
      </div></details>

      <details class="karte-sek"><summary><span>Abrechnung und Preise</span></summary><div class="inhalt">
        <div class="reihe2">
          <label class="feld"><span>Zeittakt</span><select data-e="takt">${optionen([[0, 'minutengenau'], [5, '5 Minuten'], [10, '10 Minuten'], [15, '15 Minuten'], [30, '30 Minuten']], einst.takt)}</select></label>
          ${efeld('USt %', 'ust', { modus: 'decimal' })}
        </div>
        <p class="hinweis-klein">Angefangene Takte werden aufgerundet. Startwerte aus Firma/firma.md (Stand 10/2026), bitte prüfen.</p>
        ${efeld('Lager / Start der Anfahrt (für den km-Vorschlag)', 'lager', { ph: 'Straße Nr., PLZ Ort' })}
        <p class="hinweis-klein">Wird „gefahrene km“ abgerechnet, rechnet die App die Straßenstrecke Lager → Kunde (OpenStreetMap) und trägt hin und zurück als Vorschlag ein. Braucht einmal Internet je Kunde.</p>
        <h3 class="unter">Positionskatalog (netto)</h3>
        ${(einst.katalog || []).map((k, i) => `
          <div class="zeile">
            ${efeld('Bezeichnung', `katalog.${i}.bezeichnung`)}
            <div class="reihe3">
              ${efeld('Einheit', `katalog.${i}.einheit`)}
              ${efeld('€ netto', `katalog.${i}.preis`, { modus: 'decimal', ph: 'offen' })}
              <label class="feld"><span>Art</span><select data-e="katalog.${i}.typ">${optionen(typen, k.typ)}</select></label>
            </div>
            <div class="zeile-fuss"><span></span><button type="button" class="mini gefahr" data-aktion="kat-weg" data-i="${i}">entfernen</button></div>
          </div>`).join('')}
        <button type="button" class="btn klein" data-aktion="kat-neu">${ICON.plus} Position</button>
      </div></details>

      <details class="karte-sek"><summary><span>Textbausteine „Ausgeführte Arbeiten“</span></summary><div class="inhalt">
        <label class="feld"><span>Ein Baustein pro Zeile</span><textarea data-e="bausteineText" rows="8">${esc((einst.bausteine || []).join('\n'))}</textarea></label>
        <label class="feld"><span>Prüf-Checkliste, ein Punkt pro Zeile</span><textarea data-e="prueflisteText" rows="8">${esc((einst.pruefliste || []).join('\n'))}</textarea></label>
      </div></details>

      <details class="karte-sek"><summary><span>PDF: Briefkopf, Fußzeile, Bestätigung</span></summary><div class="inhalt">
        ${etext('Spruch links neben dem Logo (leer lassen = weglassen)', 'spruch', 1)}
        ${etext('Fußzeile Zeile 1', 'fuss1', 1)}
        ${etext('Fußzeile Zeile 2 (z. B. Bank, leer lassen = weglassen)', 'fuss2', 1)}
        ${etext('Fußzeile Zeile 3', 'fuss3', 1)}
        ${etext('Text über der Unterschrift', 'bestaetigung', 2)}
      </div></details>

      <details class="karte-sek"><summary><span>Mail an den Kunden</span></summary><div class="inhalt">
        ${efeld('Betreff', 'mailBetreff')}
        ${etext('Text', 'mailText', 8)}
        <p class="hinweis-klein">Platzhalter: {nr}, {datum}, {kunde}</p>
      </div></details>

      <details class="karte-sek"><summary><span>Kunden und Anlagen</span><span class="sek-info">${kunden.length}</span></summary><div class="inhalt">
        <p class="hinweis-klein">Die App merkt sich Kunden und Anlagen aus deinen Berichten. Eine Liste aus dem Büro kannst du hier einspielen${am.url ? ', aber nur auf einem Gerät. Die anderen bekommen sie über den Abgleich' : ''}.</p>
        <ul class="kundenliste">${kunden.sort((a, b) => a.name.localeCompare(b.name)).map((k) => `
          <li><span><strong>${esc(k.name)}</strong><small>${esc([k.plzOrt, k.anlagen?.length ? `${k.anlagen.length} Anlage(n)` : ''].filter(Boolean).join(' · '))}</small></span>
          <button type="button" class="mini gefahr" data-aktion="kunde-weg" data-id="${esc(k.id)}">entfernen</button></li>`).join('')}</ul>
        <label class="btn klein">${ICON.laden} Kundenliste einspielen (.json)<input type="file" accept=".json,.txt,application/json,text/plain" data-aktion="kunden-import" hidden></label>
      </div></details>

      <details class="karte-sek"><summary><span>Abgleich zwischen den Geräten</span><span class="sek-info">${am.url ? (am.fehler ? 'Fehler' : 'an') : 'aus'}</span></summary><div class="inhalt">
        <label class="feld"><span>Welches Gerät ist das?</span><select data-e="geraet">${optionen(geraete, einst.geraet || '')}</select></label>
        <p class="hinweis-klein">Jedes Gerät zählt seine Berichtsnummern selbst. Das Kürzel sorgt dafür, dass keine Nummer doppelt vorkommt.</p>
        ${am.url ? `
          <p>Verbunden mit deinem Google Drive (Ordner „Arbeitsbericht-Abgleich“). ${am.zuletzt ? `Zuletzt abgeglichen: ${esc(zeitstempelDe(am.zuletzt))}.` : ''}</p>
          ${am.fehler ? `<p class="offen">Letzter Versuch: ${esc(am.fehler)}</p>` : ''}
          <p class="hinweis-klein">Berichte, Fotos, Kunden und Einstellungen gleichen sich mit den anderen Geräten ab, sobald Internet da ist. Kopien an Kunden verschickt der PC von info@coolcontrol.online.</p>
          <div class="knopfreihe">
            <button type="button" class="btn klein" data-aktion="abgleich">Jetzt abgleichen</button>
            <button type="button" class="btn klein" data-aktion="trennen">Verbindung trennen</button>
          </div>` : `
          <p>Handy, Lenovo und Tablet bekommen denselben Stand über dein Google Drive. Dafür einmal die Verbindungsdatei einspielen. Sie liegt in Drive im Ordner „Arbeitsbericht-Abgleich“.</p>
          <label class="btn klein">${ICON.laden} Verbindungsdatei einspielen<input type="file" accept=".json,.txt,application/json,text/plain" data-aktion="verbindung-datei" hidden></label>
          <label class="feld"><span>oder den Inhalt hier einfügen</span><textarea data-verbindung rows="3" placeholder='{"format":"cc-arbeitsbericht-verbindung/1", …}'></textarea></label>
          <button type="button" class="btn klein" data-aktion="verbinden">Verbinden</button>`}
      </div></details>

      <details class="karte-sek"><summary><span>Daten und Sicherung</span></summary><div class="inhalt">
        <p>${am.url ? 'Berichte, Fotos und Unterschriften liegen auf diesem Gerät und in deinem Google Drive.' : 'Alle Berichte, Fotos und Unterschriften liegen nur auf diesem Gerät, bis du sie teilst.'}</p>
        <p class="hinweis-klein">Speicher: ${platz ? `${zahl((platz.usage || 0) / 1048576, 1)} MB belegt` : 'unbekannt'} ·
          ${dauerhaft ? 'dauerhaft gespeichert ✓' : 'Android darf die Daten bei Platzmangel löschen'}</p>
        ${dauerhaft ? '' : '<button type="button" class="btn klein" data-aktion="persist">Dauerhaft speichern anfordern</button>'}
        <div class="knopfreihe">
          <button type="button" class="btn klein" data-aktion="sicherung">${ICON.laden} Sicherung herunterladen</button>
          <label class="btn klein">Sicherung einspielen<input type="file" accept=".json,application/json" data-aktion="einspielen" hidden></label>
        </div>
        <p class="hinweis-klein">Empfehlung: einmal pro Woche sichern und die Datei in Google Drive ablegen.</p>
        <p class="hinweis-klein">App-Version ${VERSION} · <button type="button" class="link" data-aktion="update">nach Update suchen</button></p>
      </div></details>
    </form>`;

  ansicht().oninput = (e) => {
    const t = e.target;
    if (!t.dataset.e) return;
    const p = t.dataset.e;
    let v = t.value;
    if (p === 'bausteineText') {
      einst.bausteine = v.split('\n').map((z) => z.trim()).filter(Boolean);
    } else if (p === 'prueflisteText') {
      einst.pruefliste = v.split('\n').map((z) => z.trim()).filter(Boolean);
    } else {
      if (p.endsWith('.preis')) v = parseZahl(v);
      else if (p === 'nrNaechste') v = Math.max(1, parseInt(v, 10) || 1);
      else if (p === 'takt') v = Number(v);
      else if (p === 'ust') v = parseZahl(v) ?? 0;
      if (p === 'lager') einst.lagerKoord = null;   // Adresse neu, Koordinaten neu holen
      setze(einst, p, v);
    }
    einstZuletzt = p;
    $('#speicherstatus').textContent = '…';
    einstSpeichern();
  };
  ansicht().onchange = async (e) => {
    const t = e.target;
    const a = t.dataset.aktion;
    if (a === 'kunden-import') await kundenImport(t);
    if (a === 'einspielen') await sicherungEinspielen(t);
    if (a === 'verbindung-datei') {
      const datei = t.files?.[0];
      t.value = '';
      if (datei) await verbindungHerstellen(await datei.text());
    }
  };
  ansicht().onclick = async (e) => {
    const b = e.target.closest('[data-aktion]');
    if (!b || b.tagName === 'INPUT') return;
    const a = b.dataset.aktion;
    if (a === 'monteur-sig') {
      const u = await unterschriftHolen({ titel: 'Meine Unterschrift', mitName: false });
      if (u) { einst.monteurUnterschrift = { png: u.png, w: u.w, h: u.h }; await speichereEinstellungen(einst); zeigeEinstellungen(); }
    } else if (a === 'monteur-sig-weg') {
      einst.monteurUnterschrift = null; await speichereEinstellungen(einst); zeigeEinstellungen();
    } else if (a === 'kat-neu') {
      einst.katalog.push({ id: uid(), typ: 'material', bezeichnung: '', einheit: 'pausch.', preis: null });
      await speichereEinstellungen(einst); await zeigeEinstellungen(); oeffne('Abrechnung');
    } else if (a === 'kat-weg') {
      einst.katalog.splice(Number(b.dataset.i), 1);
      await speichereEinstellungen(einst); await zeigeEinstellungen(); oeffne('Abrechnung');
    } else if (a === 'kunde-weg') {
      if (await bestaetigen('Diesen Kunden aus der Vorschlagsliste entfernen? Berichte bleiben erhalten.', 'Entfernen', 'Abbrechen', true)) {
        await db.weg('kunden', b.dataset.id); await merkeWeg(['k_' + b.dataset.id]); await zeigeEinstellungen(); oeffne('Kunden');
      }
    } else if (a === 'persist') {
      const ok = await navigator.storage?.persist?.();
      toast(ok ? 'Daten werden dauerhaft gespeichert.' : 'Android hat abgelehnt. App auf den Startbildschirm legen und erneut versuchen.');
      zeigeEinstellungen();
    } else if (a === 'sicherung') {
      await sicherungHerunterladen();
    } else if (a === 'verbinden') {
      await verbindungHerstellen($('[data-verbindung]')?.value || '');
    } else if (a === 'abgleich') {
      await abgleichJetzt({ meldung: true });
    } else if (a === 'trennen') {
      if (await bestaetigen('Abgleich auf diesem Gerät ausschalten? Die Daten bleiben hier und in Drive erhalten.', 'Ausschalten', 'Abbrechen', true)) {
        await trennen();
        await zeigeEinstellungen();
        oeffne('Abgleich');
      }
    } else if (a === 'update') {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) { await reg.update(); toast(reg.installing || reg.waiting ? 'Update wird geladen …' : 'Du hast die neueste Version.'); }
    }
  };
}

async function verbindungHerstellen(text) {
  let v;
  try { v = verbindungLesen(text); } catch (e) { return toast('Das ist keine Verbindungsdatei: ' + e.message); }
  const fertig = warten('Verbinde mit Google Drive …');
  try {
    await verbinden(v);
  } catch (e) {
    return toast('Verbindung klappt nicht: ' + (e.message || e));
  } finally { fertig(); }
  toast('Verbunden. Der erste Abgleich läuft …');
  await abgleichJetzt({ meldung: true });
  await zeigeEinstellungen();
  oeffne('Abgleich');
}

function oeffne(titelAnfang) {
  $$('.einstellungen details').forEach((d) => { if (d.querySelector('summary').textContent.trim().startsWith(titelAnfang)) d.open = true; });
}

async function kundenImport(input) {
  const datei = input.files?.[0];
  input.value = '';
  if (!datei) return;
  let liste;
  try {
    const j = JSON.parse(await datei.text());
    liste = Array.isArray(j) ? j : j.kunden;
    if (!Array.isArray(liste)) throw new Error('keine Kundenliste');
  } catch (e) { return toast('Datei nicht lesbar: ' + e.message); }
  kunden = await db.alle('kunden');
  let n = 0;
  for (const k of liste) {
    const name = String(k.name || '').trim();
    if (!name) continue;
    const alt = kundeZuName(name) || { id: uid(), name, anlagen: [] };
    const neu = { ...alt, ...Object.fromEntries(Object.entries(k).filter(([, v]) => v !== '' && v !== null && v !== undefined)), id: alt.id, name };
    neu.standorte = [...(alt.standorte || [])];
    for (const s of k.standorte || []) {
      const key = (x) => `${String(x.name || '').trim().toLowerCase()}|${x.kostenstelle || ''}`;
      if (!neu.standorte.some((x) => key(x) === key(s))) neu.standorte.push(s);
    }
    neu.geaendert = new Date().toISOString();
    neu.anlagen = [...(alt.anlagen || [])];
    for (const a of k.anlagen || []) {
      const i = neu.anlagen.findIndex((x) => (a.seriennr && x.seriennr === a.seriennr) || (!a.seriennr && x.bezeichnung === a.bezeichnung));
      if (i >= 0) neu.anlagen[i] = { ...neu.anlagen[i], ...a }; else neu.anlagen.push(a);
    }
    await db.put('kunden', neu);
    kunden = await db.alle('kunden');
    n++;
  }
  toast(`${n} Kunden eingespielt`);
  await zeigeEinstellungen();
  oeffne('Kunden');
}

async function sicherungHerunterladen() {
  const fertig = warten('Sicherung wird erstellt …');
  try {
    const berichte = await db.alle('berichte');
    const kundenAlle = await db.alle('kunden');
    const fotosAlle = [];
    for (const f of await db.alle('fotos')) {
      const { blob, ...rest } = f;
      fotosAlle.push({ ...rest, daten: await blobZuDataUrl(blob) });
    }
    const inhalt = { format: 'cc-arbeitsbericht-sicherung/1', erstellt: new Date().toISOString(), version: VERSION, einstellungen: einst, berichte, kunden: kundenAlle, fotos: fotosAlle };
    herunterladen(new Blob([JSON.stringify(inhalt)], { type: 'application/json' }), `${heute()}_sicherung-arbeitsberichte.json`);
  } finally { fertig(); }
}

async function sicherungEinspielen(input) {
  const datei = input.files?.[0];
  input.value = '';
  if (!datei) return;
  let s;
  try {
    s = JSON.parse(await datei.text());
    if (s.format !== 'cc-arbeitsbericht-sicherung/1') throw new Error('keine Sicherung dieser App');
  } catch (e) { return toast('Datei nicht lesbar: ' + e.message); }
  const frage = `Sicherung vom ${zeitstempelDe(s.erstellt)} einspielen? ${s.berichte.length} Berichte, ${s.fotos.length} Fotos, ${s.kunden.length} Kunden. Gleiche Berichte werden überschrieben, alle anderen bleiben.`;
  if (!(await bestaetigen(frage, 'Einspielen', 'Abbrechen'))) return;
  const fertig = warten('Sicherung wird eingespielt …');
  try {
    for (const b of s.berichte) await db.put('berichte', b);
    for (const k of s.kunden) await db.put('kunden', k);
    for (const f of s.fotos) {
      const { daten, ...rest } = f;
      await db.put('fotos', { ...rest, blob: await dataUrlZuBlob(daten) });
    }
    if (s.einstellungen) {
      einst = { ...structuredClone(STANDARD), ...s.einstellungen };
      await speichereEinstellungen(einst);
    }
  } finally { fertig(); }
  toast('Sicherung eingespielt');
  zeigeEinstellungen();
}

// ---------------------------------------------------------------- Service Worker (offline + Updates)

function swRegistrieren() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const pruefen = (w) => {
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) updateHinweis(w);
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) updateHinweis(reg.waiting);
    reg.addEventListener('updatefound', () => pruefen(reg.installing));
  }).catch(() => { /* ohne Offline-Modus weiter */ });
  // Beim allerersten Start übernimmt der Service Worker nur die Seite, kein Neuladen nötig
  const hatteController = !!navigator.serviceWorker.controller;
  let neu = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neu || !hatteController) return;
    neu = true;
    location.reload();
  });
}

function updateHinweis(worker) {
  if ($('.update-banner')) return;
  const el = document.createElement('div');
  el.className = 'update-banner';
  el.innerHTML = '<span>Neue Version der App ist da.</span><button type="button" class="btn klein primaer">Jetzt laden</button>';
  el.querySelector('button').onclick = async () => {
    if (bericht && speichern.offen()) await speichern.sofort();
    worker.postMessage('skipWaiting');
  };
  document.body.appendChild(el);
}
