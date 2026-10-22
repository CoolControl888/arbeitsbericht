// CC Arbeitsbericht – Briefkasten in Google Drive
//
// Läuft als Web-App in Volkans Google-Konto (script.google.com, „Ausführen als: Ich“).
// Die Geräte (Handy, Lenovo, Tablet) legen hier Berichte, Fotos, Kunden und Einstellungen ab
// und holen die der anderen. Kopien an Kunden landen in „Ausgang“, der HP verschickt sie und
// legt eine Quittung in „Quittungen“. Alles liegt im Drive-Ordner „Arbeitsbericht-Abgleich“.
//
// SCHLUESSEL: wird beim Einrichten durch einen langen Zufallswert ersetzt (nie ins Git).

const SCHLUESSEL = '%%SCHLUESSEL%%';
const ORDNER = 'Arbeitsbericht-Abgleich';

function doGet() {
  return ContentService.createTextOutput('CC Arbeitsbericht: Briefkasten läuft.');
}

function doPost(e) {
  let antwort;
  try {
    const a = JSON.parse(e.postData.contents);
    if (!a || a.schluessel !== SCHLUESSEL) throw new Error('Schlüssel stimmt nicht');
    const fn = AKTIONEN[a.aktion];
    if (!fn) throw new Error('Unbekannte Aktion: ' + a.aktion);
    antwort = fn(a);
    antwort.ok = true;
  } catch (err) {
    antwort = { ok: false, fehler: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(antwort)).setMimeType(ContentService.MimeType.JSON);
}

function unterordner(eltern, name) {
  const it = eltern.getFoldersByName(name);
  return it.hasNext() ? it.next() : eltern.createFolder(name);
}

function ordner() {
  const basis = unterordner(DriveApp.getRootFolder(), ORDNER);
  return {
    basis,
    daten: unterordner(basis, 'daten'),
    ausgang: unterordner(basis, 'Ausgang'),
    quittungen: unterordner(basis, 'Quittungen'),
  };
}

// index.json: { name: { g: geaendert, id: Datei-ID } }, damit „liste“ nicht jede Datei öffnen muss
function indexLesen(o) {
  const it = o.daten.getFilesByName('index.json');
  if (!it.hasNext()) return { datei: null, index: {} };
  const datei = it.next();
  return { datei, index: JSON.parse(datei.getBlob().getDataAsString() || '{}') };
}

function indexSchreiben(o, datei, index) {
  const text = JSON.stringify(index);
  if (datei) datei.setContent(text);
  else o.daten.createFile('index.json', text, 'application/json');
}

const AKTIONEN = {
  liste() {
    const o = ordner();
    const { index } = indexLesen(o);
    const stand = {};
    Object.keys(index).forEach((n) => { stand[n] = index[n].g; });
    const quittungen = [];
    const it = o.quittungen.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (!/\.json$/.test(f.getName())) continue;
      try { quittungen.push(JSON.parse(f.getBlob().getDataAsString())); } catch (e) { /* halb geschrieben, nächstes Mal */ }
    }
    return { stand, quittungen };
  },

  holen(a) {
    const o = ordner();
    const { index } = indexLesen(o);
    const dateien = {};
    (a.namen || []).forEach((n) => {
      if (!index[n]) return;
      try { dateien[n] = DriveApp.getFileById(index[n].id).getBlob().getDataAsString(); } catch (e) { /* fehlt */ }
    });
    return { dateien };
  },

  // dateien: [{ name, g, inhalt }]; ältere Fassungen als die vorhandene werden übergangen
  ablegen(a) {
    const sperre = LockService.getScriptLock();
    sperre.waitLock(30000);
    try {
      const o = ordner();
      const { datei, index } = indexLesen(o);
      const erledigt = [];
      (a.dateien || []).forEach((d) => {
        const alt = index[d.name];
        if (alt && alt.g >= d.g) { erledigt.push(d.name); return; }
        let f = null;
        if (alt) { try { f = DriveApp.getFileById(alt.id); } catch (e) { f = null; } }
        if (f) f.setContent(d.inhalt);
        else f = o.daten.createFile(d.name + '.json', d.inhalt, 'application/json');
        index[d.name] = { g: d.g, id: f.getId() };
        erledigt.push(d.name);
      });
      indexSchreiben(o, datei, index);
      return { erledigt };
    } finally {
      sperre.releaseLock();
    }
  },

  // Kopie an den Kunden: PDF + Auftrag in „Ausgang“. Der HP verschickt und quittiert.
  versand(a) {
    if (!a.berichtId || !a.an || !a.pdf) throw new Error('Versand unvollständig');
    const o = ordner();
    const basisName = a.berichtId + '_' + String(a.angefordert).replace(/[^0-9]/g, '');
    const pdfName = basisName + '.pdf';
    const alt = o.ausgang.getFilesByName(pdfName);
    if (!alt.hasNext()) {
      o.ausgang.createFile(Utilities.newBlob(Utilities.base64Decode(a.pdf), 'application/pdf', pdfName));
    }
    const auftrag = {
      format: 'cc-arbeitsbericht-versand/1',
      berichtId: a.berichtId, nr: a.nr, an: a.an, betreff: a.betreff, text: a.text,
      anhangName: a.pdfName, pdf: pdfName, angefordert: a.angefordert, geraet: a.geraet || '',
    };
    const jsonName = basisName + '.json';
    const altJson = o.ausgang.getFilesByName(jsonName);
    if (!altJson.hasNext()) o.ausgang.createFile(jsonName, JSON.stringify(auftrag, null, 2), 'application/json');
    return {};
  },
};
