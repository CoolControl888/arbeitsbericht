// Entfernung Lager → Kunde als Vorschlag für „gefahrene km“ (Volkan 29.10.2026: nicht jedes Mal selbst raussuchen).
// Adressen werden über OpenStreetMap (Nominatim) in Koordinaten übersetzt, die Straßenstrecke rechnet der
// öffentliche OSRM-Server. Beides kostenlos, ohne Schlüssel, nur mit Internet. Ergebnisse werden beim Kunden
// gespeichert (entfernungKm, einfache Strecke), damit es offline beim nächsten Mal sofort da ist.

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

const koordCache = new Map();

export async function koordinaten(adresse) {
  const a = String(adresse || '').replace(/\s+/g, ' ').trim();
  if (a.length < 5) throw new Error('Adresse unvollständig');
  if (koordCache.has(a)) return koordCache.get(a);
  const url = `${NOMINATIM}?format=jsonv2&limit=1&countrycodes=de&q=${encodeURIComponent(a)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Adresssuche antwortet ${r.status}`);
  const liste = await r.json();
  if (!liste.length) throw new Error(`Adresse nicht gefunden: ${a}`);
  const k = { lat: Number(liste[0].lat), lon: Number(liste[0].lon) };
  koordCache.set(a, k);
  return k;
}

// Einfache Fahrstrecke in km (eine Richtung), auf eine Nachkommastelle
export async function strecke(von, nach) {
  const url = `${OSRM}${von.lon},${von.lat};${nach.lon},${nach.lat}?overview=false&alternatives=false&steps=false`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Routenrechner antwortet ${r.status}`);
  const d = await r.json();
  const m = d.routes?.[0]?.distance;
  if (!Number.isFinite(m)) throw new Error('Keine Route gefunden');
  return Math.round(m / 100) / 10;
}

// Lager-Koordinaten werden in den Einstellungen gemerkt (einst.lagerKoord), bis sich die Adresse ändert
export async function lagerKoordinaten(einst, speichern) {
  const lager = String(einst.lager || '').trim();
  if (!lager) throw new Error('Lageradresse fehlt (Einstellungen → Abrechnung)');
  if (einst.lagerKoord && einst.lagerKoord.adresse === lager) return einst.lagerKoord;
  const k = await koordinaten(lager);
  einst.lagerKoord = { ...k, adresse: lager };
  if (speichern) await speichern();
  return einst.lagerKoord;
}

// km-Vorschlag für einen Kunden: hin und zurück, auf ganze km gerundet. Gibt null zurück, wenn gerade nichts geht.
export async function kmVorschlag(kunde, einst, { speichern } = {}) {
  const adresse = [kunde.strasse, kunde.plzOrt].map((x) => String(x || '').trim()).filter(Boolean).join(', ');
  if (!adresse || !kunde.plzOrt) return null;
  if (Number.isFinite(kunde.entfernungKm) && kunde.entfernungAdresse === adresse) {
    return { km: Math.round(kunde.entfernungKm * 2), einfach: kunde.entfernungKm, quelle: 'gemerkt' };
  }
  if (!navigator.onLine) return null;
  const lager = await lagerKoordinaten(einst, speichern);
  const ziel = await koordinaten(adresse);
  const einfach = await strecke(lager, ziel);
  kunde.entfernungKm = einfach;
  kunde.entfernungAdresse = adresse;
  kunde.entfernungStand = new Date().toISOString();
  return { km: Math.round(einfach * 2), einfach, quelle: 'berechnet' };
}
