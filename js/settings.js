// Einstellungen mit Startwerten. Preise und Positionen stammen aus Firma/firma.md
// (Standardpositionen netto, Stand 10/2026, "vor Verwendung prüfen"). In der App änderbar.

import { db } from './db.js';

export const STANDARD = {
  monteur: 'Kerem Volkan Giris',
  zertifikat: 'Kat. I, Nr. 007 0021 2021 1',
  nrPraefix: 'AB',
  geraet: '',        // Kürzel dieses Geräts in der Nummer (Handy leer, Lenovo L, Tablet T), nur hier gespeichert
  nrJahr: null,
  nrNaechste: 1,
  takt: 15,
  ust: 19,
  lager: 'Pollhorner Hauptdeich 8b, 21107 Hamburg',   // Start der Anfahrt für den km-Vorschlag (Betriebsstätte, Firma/firma.md)
  lagerKoord: null,
  spruch: 'Ihr Projekt. Unser Anspruch.',
  fuss1: 'Cool Control, Pollhorner Hauptdeich 8b, 21107 Hamburg',
  fuss2: 'Hamburger Sparkasse IBAN:DE34200505501504610070 BIC:HASPDEHHXXX',
  fuss3: 'St.-Nr. 46/072/03011    USt-ID:DE318347447    Finanzamt Hamburg-Harburg',
  bestaetigung: 'Ich bestätige die in diesem Arbeitsbericht aufgeführten Arbeiten, Zeiten und Materialien.',
  mailBetreff: 'Arbeitsbericht {nr} vom {datum}',
  mailText:
    'Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie den Arbeitsbericht {nr} zu unserem Einsatz am {datum}. ' +
    'Die Rechnung erhalten Sie separat.\n\nMit freundlichen Grüßen\nKerem Volkan Giris\n' +
    'Cool Control · Kälte- und Klimatechnik\ninfo@coolcontrol.online',
  monteurUnterschrift: null,
  bausteine: [
    'Anlage in Betrieb auf Funktion geprüft',
    'Betriebsdrücke und Temperaturen gemessen und protokolliert',
    'Verflüssiger mit Reiniger und Druckluft gereinigt',
    'Wärmetauscher gereinigt, Lamellen freigelegt',
    'Tauwasserablauf geprüft, gereinigt und durchgespült',
    'Türdichtungen auf Dichtheit und Beschädigung geprüft',
    'Regler, Sollwerte und Fühler geprüft und eingestellt',
    'Elektrische Anschlüsse geprüft und nachgezogen',
    'Dichtheitskontrolle mit elektronischem Lecksuchgerät durchgeführt',
    'Systematische Fehlersuche an Kältekreis und Elektrik',
    'Kältemittel nach Herstellervorgabe nachgefüllt',
    'Anlage wieder in Betrieb genommen, Probelauf durchgeführt',
  ],
  // Prüf-Checkliste zum Abhaken; im Bericht stehen nur die abgehakten Punkte
  pruefliste: [
    'Verdichter: Laufgeräusch, Schwingungen, Befestigung',
    'Verflüssiger: Verschmutzung, Lüfter, Lamellen',
    'Verdampfer: Vereisung, Lüfter, Abtauung',
    'Tauwasserablauf und Tropfwanne',
    'Türdichtungen und Türschließer',
    'Regler, Sollwerte und Fühler',
    'Elektrische Anschlüsse und Schütze',
    'Rohrleitungen, Isolierung und Befestigungen',
    'Schauglas und Kältemittelfüllung',
    'Sicherheitseinrichtungen (Pressostate)',
  ],
  katalog: [
    { id: 'lohn', typ: 'lohn', bezeichnung: 'Arbeitszeit Servicetechniker + Fahrtzeit', einheit: 'Std.', preis: 91 },
    { id: 'helfer', typ: 'helfer', bezeichnung: 'Montagehelfer Servicetechniker 2', einheit: 'Std.', preis: 59 },
    { id: 'ab1', typ: 'anfahrt', bezeichnung: 'Fahrzeugkosten Hamburg AB', einheit: 'pausch.', preis: 120 },
    { id: 'ib', typ: 'anfahrt', bezeichnung: 'Fahrzeugkosten Hamburg IB', einheit: 'pausch.', preis: 79 },
    { id: 'km', typ: 'km', bezeichnung: 'gefahrene km', einheit: 'km', preis: 1.7 },
    { id: 'klein', typ: 'material', bezeichnung: 'Kleinmaterial / Material zur elektrischen Verdrahtung', einheit: 'pausch.', preis: 19.9 },
    { id: 'n2', typ: 'material', bezeichnung: 'Stickstoffeinsatz, Druckprobe', einheit: 'pausch.', preis: 80 },
    { id: 'loet', typ: 'material', bezeichnung: 'Materialien Schweißen/Löten', einheit: 'pausch.', preis: 78.5 },
    { id: 'entsorgung', typ: 'material', bezeichnung: 'Entsorgung Altgerät', einheit: 'Stk.', preis: 79 },
    { id: 'versand', typ: 'material', bezeichnung: 'Verpackung und Versand Ersatzteile', einheit: 'pausch.', preis: 17.5 },
  ],
};

export const LISTEN = {
  // Personen in den Zeiten: jede Person eigene Zeilen, damit klar ist, wie viele vor Ort waren
  personen: ['Monteur', '2. Monteur', '3. Monteur', 'Helfer', '2. Helfer'],
  // Messwerte vorher/nachher; neg: Eingabe mit Minuszeichen (Temperaturen)
  messwerte: [
    { id: 'hd', name: 'Hochdruck (Verflüssigung)', einheit: 'bar' },
    { id: 'nd', name: 'Niederdruck (Verdampfung)', einheit: 'bar', neg: true },
    { id: 'ueh', name: 'Überhitzung', einheit: 'K' },
    { id: 'uek', name: 'Unterkühlung', einheit: 'K' },
    { id: 'hg', name: 'Heißgastemperatur', einheit: '°C' },
    { id: 'strom', name: 'Stromaufnahme Verdichter', einheit: 'A' },
    { id: 'kuehl', name: 'Kühlstellentemperatur', einheit: '°C', neg: true },
    { id: 'umg', name: 'Umgebungstemperatur', einheit: '°C', neg: true },
  ],
  auftragsart: [
    'Wartung',
    'Störung / Reparatur',
    'Dichtheitskontrolle (F-Gase)',
    'Kältemittel füllen / absaugen',
    'Inbetriebnahme',
    'Montage Kühlzelle / Kühlraum',
    'Montage Verbundanlage / Verflüssigungssatz',
    'Montage Split-Klimagerät',
    'Montage Lüftung',
    'Aufmaß / Planung / Ortstermin',
  ],
  anlagenart: [
    'Kühlzelle', 'TK-Zelle', 'Kühlhaus', 'Verbundanlage', 'Verflüssigungssatz', 'Kühlmöbel / Vitrine',
    'Getränkekühler', 'Eiswürfelbereiter', 'Split-Klimagerät', 'VRF-Klima', 'Kaltwassersatz', 'Lüftungsanlage',
  ],
  kaeltemittel: [
    'R454C', 'R455A', 'R290', 'R600a', 'R744', 'R404A', 'R449A', 'R448A', 'R452A', 'R507A', 'R134a',
    'R513A', 'R1234ze', 'R407C', 'R410A', 'R32',
  ],
  kmVorgang: ['Nachgefüllt', 'Erstfüllung', 'Abgesaugt (zurückgewonnen)', 'Entsorgt'],
  kmZustand: ['neu', 'recycelt', 'aufgearbeitet'],
  dichtMethode: [
    'Direkt: elektronisches Lecksuchgerät',
    'Direkt: Lecksuchspray / Schaum',
    'Indirekt: Prüfung der Betriebsdaten',
    'Druckprobe mit Stickstoff',
  ],
  einheiten: ['Stk.', 'm', 'kg', 'l', 'pausch.', 'Satz', 'Std.'],
};

const SCHLUESSEL = 'einstellungen';

export async function ladeEinstellungen() {
  const gespeichert = (await db.get('einstellungen', SCHLUESSEL)) || {};
  return { ...structuredClone(STANDARD), ...gespeichert };
}

// mitZeit: false bei reinen Gerätewerten (Nummernzähler), damit der Abgleich die Einstellungen
// der anderen Geräte nicht mit einer alten Fassung überschreibt
export async function speichereEinstellungen(e, { mitZeit = true } = {}) {
  if (mitZeit) e.geaendert = new Date().toISOString();
  await db.put('einstellungen', e, SCHLUESSEL);
}

const geraetKuerzel = (e) => String(e.geraet || '').trim().toUpperCase();

// Fortlaufende Berichtsnummer je Jahr und Gerät: AB-2026-001 (Handy), AB-2026-L001 (Lenovo).
// Unabhängig von FastBill-Rechnungsnummern.
export async function naechsteNummer(e, jahr = new Date().getFullYear()) {
  if (e.nrJahr !== jahr) {
    e.nrJahr = jahr;
    e.nrNaechste = 1;
  }
  const nr = `${e.nrPraefix || 'AB'}-${jahr}-${geraetKuerzel(e)}${String(e.nrNaechste).padStart(3, '0')}`;
  e.nrNaechste += 1;
  await speichereEinstellungen(e, { mitZeit: false });
  return nr;
}

// Nach dem Abgleich: Zähler hinter die höchste vorhandene Nummer dieses Geräts setzen
export async function nummerNachziehen(e, berichte, jahr = new Date().getFullYear()) {
  const praefix = (e.nrPraefix || 'AB').replace(/[^A-Za-z0-9]/g, '\\$&');
  const muster = new RegExp(`^${praefix}-${jahr}-${geraetKuerzel(e)}(\\d+)$`);
  let max = 0;
  for (const b of berichte) {
    const m = muster.exec(b.nr || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (e.nrJahr !== jahr) return false;
  if (max + 1 <= (e.nrNaechste || 1)) return false;
  e.nrNaechste = max + 1;
  await speichereEinstellungen(e, { mitZeit: false });
  return true;
}
