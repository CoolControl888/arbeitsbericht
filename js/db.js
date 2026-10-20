// Speicher auf dem Handy (IndexedDB). Nichts verlässt das Gerät, außer du teilst es.

const NAME = 'cc-arbeitsbericht';
const VERSION = 1;
let offen;

function oeffnen() {
  if (!offen) {
    offen = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('berichte')) d.createObjectStore('berichte', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('fotos')) {
          d.createObjectStore('fotos', { keyPath: 'id' }).createIndex('bericht', 'berichtId');
        }
        if (!d.objectStoreNames.contains('kunden')) d.createObjectStore('kunden', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('einstellungen')) d.createObjectStore('einstellungen');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return offen;
}

async function tx(store, modus, fn) {
  const d = await oeffnen();
  return new Promise((res, rej) => {
    const t = d.transaction(store, modus);
    let ergebnis;
    const anfrage = fn(t.objectStore(store));
    if (anfrage) anfrage.onsuccess = () => { ergebnis = anfrage.result; };
    t.oncomplete = () => res(ergebnis);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Speichern abgebrochen'));
  });
}

export const db = {
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  alle: (store) => tx(store, 'readonly', (s) => s.getAll()),
  put: (store, wert, key) => tx(store, 'readwrite', (s) => (key === undefined ? s.put(wert) : s.put(wert, key))),
  weg: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  nachIndex: (store, index, wert) => tx(store, 'readonly', (s) => s.index(index).getAll(wert)),
};
