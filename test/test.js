// Automatische Tests: Rechnen, Speichern, PDF. Alle Namen sind erfunden (Musterdaten).
import { parseZahl, dauer, aufrunden, slug, menge, hhmm } from '../js/util.js';
import { db } from '../js/db.js';
import { STANDARD } from '../js/settings.js';
import { positionen, summen, summeMinuten, fahrtZeilen, zeilenGeordnet } from '../js/abrechnung.js';
import { berichtPdf, rechnungsdaten, dateiname, pdfText } from '../js/pdf.js';
import { Unterschrift } from '../js/signature.js';
import { verkleinern } from '../js/photos.js';

const ergebnisse = [];
const pruefe = (name, ist, soll) => {
  const ok = JSON.stringify(ist) === JSON.stringify(soll);
  ergebnisse.push(`${ok ? 'OK ' : 'FEHLER'} ${name}${ok ? '' : `: ist ${JSON.stringify(ist)}, soll ${JSON.stringify(soll)}`}`);
};

async function hochladen(name, daten) {
  await fetch('/__upload/' + name, { method: 'POST', body: daten });
}

function testFoto(nr, w, h, farbe) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, farbe); g.addColorStop(1, '#ffffff');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = '#123'; x.font = `${Math.round(h / 8)}px sans-serif`;
  x.fillText(`Testfoto ${nr} (${w}×${h})`, w * 0.08, h * 0.55);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
}

function testUnterschrift() {
  const c = document.createElement('canvas');
  document.body.appendChild(c);
  const u = new Unterschrift(c);
  const p = [];
  for (let i = 0; i <= 60; i++) p.push({ x: 20 + i * 4.5, y: 80 + Math.sin(i / 4) * 30 - i * 0.5 });
  u.strichHinzu(p);
  u.strichHinzu([{ x: 60, y: 40 }, { x: 70, y: 110 }, { x: 80, y: 50 }]);
  const png = u.png();
  c.remove();
  return png;
}

function musterBericht(id, nr) {
  return {
    id, v: 1, nr, status: 'entwurf', erstellt: '2026-10-15T08:00:00.000Z', geaendert: '2026-10-15T11:00:00.000Z',
    datum: '2026-10-15',
    kunde: { name: 'Şahin Döner & Grill (Muster)', ansprechpartner: 'Ayşe Yıldız', telefon: '040 123456', strasse: 'Musterstraße 1', plzOrt: '20095 Hamburg', email: 'muster@example.org' },
    einsatzort: 'Küche, Kellergeschoss',
    anlage: { bezeichnung: 'TK-Zelle Lager', art: 'TK-Zelle', hersteller: 'KIDE', typ: 'Monoblock MT 12', seriennr: 'SN-2024-0815', kaeltemittel: 'R455A', fuellmenge: '2,4' },
    auftragsart: ['Störung / Reparatur', 'Dichtheitskontrolle (F-Gase)'], auftragNr: 'A123999', monteur: 'Kerem Volkan Giris', helfer: 'Muster-Helfer',
    zeiten: [
      { id: 'z1', person: 'Monteur', art: 'Fahrt', von: '07:30', bis: '07:52', pause: '' },
      { id: 'z2', person: 'Monteur', art: 'Arbeit', von: '08:00', bis: '10:20', pause: '' },
      { id: 'z3', person: 'Helfer', art: 'Arbeit', von: '08:00', bis: '10:00', pause: '15' },
    ],
    anfahrt: { katalogId: 'ab1', km: '' },
    arbeiten: 'Fehlersuche: Verdampferlüfter läuft nicht\nLüftermotor getauscht (ı, ş, ğ, İ, ç, ö, ü, ß, € geprüft)\nDichtheitskontrolle durchgeführt\nAnlage wieder in Betrieb genommen 🙂',
    material: [
      { bezeichnung: 'Verdampferlüftermotor 10 W', menge: '1', einheit: 'Stk.', preis: '38,50' },
      { bezeichnung: 'Kleinmaterial / Material zur elektrischen Verdrahtung', menge: '1', einheit: 'pausch.', preis: '19,90' },
      { bezeichnung: 'Kabelbinder', menge: '10', einheit: 'Stk.', preis: '' },
    ],
    kaeltemittel: [
      { vorgang: 'Nachgefüllt', typ: 'R455A', menge: '1,2', zustand: 'neu', flasche: 'FL-4711', preis: '85' },
      { vorgang: 'Abgesaugt (zurückgewonnen)', typ: 'R404A', menge: '3', zustand: 'recycelt', flasche: 'FL-0815', preis: '' },
    ],
    dichtheit: { durchgefuehrt: 'ja', methode: 'Direkt: elektronisches Lecksuchgerät', ergebnis: 'dicht', massnahme: '' },
    befund: 'Türdichtung unten rechts rissig. Tausch empfohlen, Angebot folgt.',
    offen: 'Türdichtung bestellen, Termin nach Lieferung.',
    betriebsbereit: 'ja',
    zusatz: [], rechnungshinweis: '',
    unterschrift: null, monteurUnterschrift: null, geteiltKunde: null, geteiltBuero: null,
  };
}

async function main() {
  // Rechnen
  pruefe('parseZahl Komma', parseZahl('1,5'), 1.5);
  pruefe('parseZahl Punkt', parseZahl('0.250'), 0.25);
  pruefe('parseZahl Tausender', parseZahl('1.500,50'), 1500.5);
  pruefe('parseZahl leer', parseZahl(''), null);
  pruefe('dauer über Mitternacht', dauer('22:30', '01:15'), 165);
  pruefe('aufrunden 140/15', aufrunden(140, 15), 150);
  pruefe('aufrunden 150/15', aufrunden(150, 15), 150);
  pruefe('aufrunden ohne Takt', aufrunden(22, 0), 22);
  pruefe('slug türkisch', slug('Yılmaz Dayı Fürth'), 'yilmaz-dayi-fuerth');
  pruefe('menge', menge(2.5), '2,5');
  pruefe('pdfText Emoji', pdfText('ok 🙂 ı€'), 'ok  ı€');
  pruefe('pdfText fremde Schrift', pdfText('ok ب'), 'ok ?');

  const einst = structuredClone(STANDARD);
  const b = musterBericht('test-1', 'AB-2026-001');
  pruefe('Minuten gesamt (Takt 15)', summeMinuten(b, 15), 30 + 150 + 105);
  const pos = positionen(b, einst);
  pruefe('Positionen', pos.map((p) => [p.bezeichnung, p.menge, p.preis]), [
    ['Arbeitszeit Servicetechniker + Fahrtzeit', 3, 91],
    ['Montagehelfer Servicetechniker 2', 1.75, 59],
    ['Fahrzeugkosten Hamburg AB', 1, 120],
    ['Verdampferlüftermotor 10 W', 1, 38.5],
    ['Kleinmaterial / Material zur elektrischen Verdrahtung', 1, 19.9],
    ['Kabelbinder', 10, null],
    ['Kältemittel R455A', 1.2, 85],
  ]);
  pruefe('Summen', summen(pos, 19), { netto: 656.65, ustSatz: 19, ust: 124.76, brutto: 781.41, offen: 1 });

  // An- und Abfahrt in Minuten (seit 1.6.0): Uhrzeiten aus Arbeitsbeginn/-ende, jede Person fährt mit
  const bf = musterBericht('test-fahrt', 'AB-2026-009');
  bf.zeiten = bf.zeiten.filter((z) => z.art !== 'Fahrt');
  bf.fahrt = { anMin: '25', abMin: '20' };
  pruefe('hhmm negativ', hhmm(-30), '23:30');
  pruefe('Fahrtzeilen', fahrtZeilen(bf).map((z) => [z.person, z.art, z.von, z.bis, z.minuten]), [
    ['Monteur', 'Anfahrt', '07:35', '08:00', 25],
    ['Monteur', 'Abfahrt', '10:20', '10:40', 20],
    ['Helfer', 'Anfahrt', '07:35', '08:00', 25],
    ['Helfer', 'Abfahrt', '10:00', '10:20', 20],
  ]);
  pruefe('Minuten mit Fahrt (Takt 15)', summeMinuten(bf, 15), 150 + 30 + 30 + 105 + 30 + 30);
  pruefe('Reihenfolge im Bericht', zeilenGeordnet(bf).map((z) => z.art), ['Anfahrt', 'Arbeit', 'Abfahrt', 'Anfahrt', 'Arbeit', 'Abfahrt']);
  pruefe('Fahrt ohne Zeiten', fahrtZeilen({ zeiten: [], fahrt: { anMin: '10', abMin: '' } }).map((z) => [z.person, z.von, z.minuten]), [['Monteur', '', 10]]);
  pruefe('Ohne Fahrt keine Zeilen', fahrtZeilen(b).length, 0);
  pruefe('Dateiname', dateiname(b), '2026-10-15_arbeitsbericht_ab-2026-001_sahin-doener-grill-muster.pdf');

  // Speicher
  await db.put('berichte', b);
  pruefe('DB lesen', (await db.get('berichte', 'test-1')).kunde.name, b.kunde.name);

  // Fotos und Unterschrift
  const fotos = [];
  const formate = [[1600, 1200, '#29abe2'], [900, 1600, '#0071bc'], [2400, 1000, '#7cb342']];
  for (let i = 0; i < formate.length; i++) {
    const roh = await testFoto(i + 1, ...formate[i]);
    const { blob, w, h } = await verkleinern(roh);
    const rec = { id: 'f' + (i + 1), berichtId: 'test-1', blob, w, h, titel: ['Typenschild', 'Verdampfer nach Reparatur', ''][i], nr: i + 1 };
    await db.put('fotos', rec);
    fotos.push(rec);
  }
  pruefe('Foto verkleinert', [fotos[2].w, fotos[2].h], [1600, 667]);
  const sig = testUnterschrift();
  pruefe('Unterschrift PNG', sig.png.startsWith('data:image/png'), true);
  const sigMonteur = testUnterschrift();

  // PDF 1: unterschrieben, normaler Umfang
  const b1 = { ...b, status: 'unterschrieben', unterschrift: { name: 'Ayşe Yıldız', ...sig, zeit: '2026-10-15T10:31:00.000Z' }, monteurUnterschrift: sigMonteur };
  const t0 = performance.now();
  const pdf1 = await berichtPdf(b1, fotos, einst, new URL('../', location.href));
  const ms = Math.round(performance.now() - t0);
  pruefe('PDF 1 ist PDF', new TextDecoder().decode(new Uint8Array(await pdf1.slice(0, 5).arrayBuffer())), '%PDF-');
  await hochladen('test-1.pdf', pdf1);
  const daten = rechnungsdaten(b1, einst, pos, summen(pos, 19));
  pruefe('Rechnungsdaten ohne Unterschriftsbild', JSON.stringify(daten).includes('data:image'), false);
  await hochladen('test-1_rechnungsdaten.txt', JSON.stringify(daten, null, 2));

  // PDF 2: viel Inhalt, Seitenumbrüche, unsigniert
  const b2 = musterBericht('test-2', 'AB-2026-002');
  b2.arbeiten = Array.from({ length: 30 }, (_, i) => `Arbeitsschritt ${i + 1}: ${'Ventil geprüft und eingestellt, '.repeat((i % 3) + 1)}`).join('\n');
  b2.material = Array.from({ length: 22 }, (_, i) => ({ bezeichnung: `Material Nr. ${i + 1} mit längerer Bezeichnung zum Umbrechen der Zeile im PDF`, menge: String(i + 1), einheit: 'Stk.', preis: '' }));
  b2.befund = 'Langer Befund. '.repeat(60);
  const viele = [];
  for (let i = 0; i < 7; i++) viele.push({ ...fotos[i % 3], titel: `Foto mit Beschreibung ${i + 1}` });
  const pdf2 = await berichtPdf(b2, viele, einst, new URL('../', location.href));
  await hochladen('test-2.pdf', pdf2);

  // Musterdaten für Bildschirmfotos der App
  await db.put('berichte', { ...b, geaendert: new Date().toISOString() });
  await db.put('berichte', { ...b1, id: 'test-3', nr: 'AB-2026-003', datum: '2026-10-14', geteiltKunde: '2026-10-14T12:00:00.000Z' });
  for (const f of fotos) await db.put('fotos', { ...f, id: 'g' + f.id, berichtId: 'test-3' });
  await db.put('kunden', { id: 'k1', name: b.kunde.name, ansprechpartner: 'Ayşe Yıldız', strasse: b.kunde.strasse, plzOrt: b.kunde.plzOrt, telefon: b.kunde.telefon, email: b.kunde.email, anlagen: [b.anlage] });
  await db.put('einstellungen', { ...einst, monteurUnterschrift: sigMonteur, nrJahr: 2026, nrNaechste: 4 }, 'einstellungen');

  ergebnisse.push(`INFO PDF 1: ${Math.round(pdf1.size / 1024)} KB in ${ms} ms · PDF 2: ${Math.round(pdf2.size / 1024)} KB`);
  const fehler = ergebnisse.filter((e) => e.startsWith('FEHLER')).length;
  ergebnisse.push(fehler ? `${fehler} FEHLER` : 'ALLE TESTS OK');
}

main()
  .catch((e) => ergebnisse.push('ABBRUCH ' + (e.stack || e)))
  .finally(() => {
    document.getElementById('ergebnis').textContent = ergebnisse.join('\n');
    document.body.dataset.fertig = '1';
  });
