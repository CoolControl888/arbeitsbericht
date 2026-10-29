# CC Arbeitsbericht (Android-App)

Web-App für Cool Control, die am Android wie eine App auf dem Startbildschirm liegt. Beim Kunden erfasst Volkan Kunde, Anlage/Gerät, Arbeiten, Zeiten, Material, Kältemittel und Dichtheitskontrolle, Fotos und die Unterschrift des Kunden. Daraus entsteht ein PDF im Stil der Rechnung (Schreibmaschinenschrift, Logo rechts mit Spruch, ganz leichte Linien), das direkt an den Kunden geht. Freiwillige Felder (Seriennummer, Kältemittel, Einsatzort, Ansprechpartner, Auftragsnummer …) stehen nur im Bericht, wenn etwas eingetragen ist. Unterschreibt nur der Kunde, mit Namen in Druckbuchstaben. Fürs Büro gibt es dazu die Rechnungsdaten, aus denen Claude den Rechnungsentwurf für FastBill vorbereitet.

Stand 29.10.2026, Version 1.6.0 (Abgleich zwischen Handy, Lenovo und Tablet über Google Drive). **Seit 1.6.0:** Fahrtzeit als An- und Abfahrt in Minuten (die App rechnet die Uhrzeiten), Anfahrt-Abrechnung per Antippen (Hamburg IB / AB / gefahrene km / keine), merkt sich je Kunde die zuletzt gewählte Anfahrt, und bei „gefahrene km“ kommt die Straßenstrecke Lager → Kunde (hin und zurück) als Vorschlag ins km-Feld (OpenStreetMap, Lageradresse in den Einstellungen). **Seit 1.5.4 geht jeder unterschriebene Bericht automatisch als PDF ins Büro** (Volkan 29.10.2026: „sodass ich es nicht im handy extra schicken muss“): Die App legt nach der Unterschrift die Kopie mit `an: "buero"` in den Drive-Briefkasten, `.claude/scripts/arbeitsbericht_versand.py` auf dem HP legt sie in `G:\Meine Ablage\Serviceberichte\` ab (ohne Mail) und quittiert; das Büro-Fenster (`App-Buero`) findet den Bericht dort und rechnet die Rechnungsdaten selbst. „Ins Büro“ bleibt als Handweg für den Fall, dass der Abgleich aus ist.

## Ablauf beim Kunden

1. **Neuer Arbeitsbericht** antippen. Die Nummer (AB-2026-001 …) vergibt die App, unabhängig von FastBill.
2. **Kunde** eintragen. Bekannte Kunden schlägt die App vor und ergänzt Adresse, Telefon, E-Mail. Bekannte Anlagen des Kunden lassen sich übernehmen.
3. **Anlage / Gerät**, **Einsatz** (Art antippen), **Zeiten** („jetzt“ setzt die Uhrzeit; Fahrtzeit nur als Minuten bei „Anfahrt min“ und „Abfahrt min“, die App rechnet daraus, wann es losging und wann du zurück warst; Anfahrt-Abrechnung antippen, die App schlägt vor, was beim Kunden zuletzt gewählt war, und bei „gefahrene km“ die Strecke Lager → Kunde), **Arbeiten** (Textbausteine antippen oder über das Tastatur-Mikrofon diktieren), **Material**, **Kältemittel und Dichtheitskontrolle**, **Befund**.
4. **Prüfungen & Messwerte** (freiwillig): Prüfpunkte antippen zum Abhaken, Messwerte vorher/nachher eintragen (Drücke, Überhitzung, Unterkühlung, Heißgas, Strom, Temperaturen). Im Bericht stehen nur abgehakte Punkte und ausgefüllte Werte. Die Checkliste lässt sich in den Einstellungen anpassen.
5. **Fotos**: aufnehmen oder aus der Galerie, mit Beschreibung. Typenschild nicht vergessen.
5. **Unterschrift**: Der Kunde sieht eine Zusammenfassung, unterschreibt mit dem Finger und trägt seinen Namen ein. Danach ist der Bericht gesperrt („Bericht wieder bearbeiten“ entfernt die Unterschrift).
6. **Kopie an den Kunden (Pflicht)**: Direkt nach der Unterschrift fragt die App, ob die Kopie per Mail rausgehen soll. Fehlt die E-Mail-Adresse, fragt sie danach und merkt sie sich beim Kunden. Solange der Kunde keine Kopie hat, steht der Bericht rot auf „Kopie an Kunde fehlt“, und „Ins Büro“ erinnert noch einmal daran.
7. **Senden**:
   - **An den Kunden**: nur das PDF. Android öffnet das Teilen-Menü, z. B. Gmail. Die E-Mail-Adresse des Kunden liegt schon in der Zwischenablage, Betreff und Text sind vorausgefüllt. Abschicken tust du selbst.
   - **Ins Büro**: PDF + Rechnungsdaten. Im Teilen-Menü **Drive** wählen und in `Meine Ablage/Arbeitsberichte` (Montage) oder `Meine Ablage/Serviceberichte` (Service) speichern. Danach am PC zu Claude: „Arbeitsbericht aus der App abrechnen“.

Alles wird beim Tippen automatisch gespeichert und funktioniert auch ohne Netz (Keller, Kühlhaus).

## Abrechnung

Der Abschnitt **Abrechnung (intern)** zeigt den Rechnungsvorschlag. Er steht **nicht** im PDF für den Kunden.

- Arbeitszeit Monteur × Stundensatz, Helfer × Helfersatz, Anfahrt aus dem Katalog, Material mit deinem VK-Preis, gefülltes Kältemittel je kg.
- An- und Abfahrt zählen als Arbeitszeit, für jede Person mit Zeiten im Bericht (alle fahren mit). Im Bericht stehen sie je Person als Zeilen „Anfahrt“ und „Abfahrt“ mit errechneten Uhrzeiten.
- km-Vorschlag: Adresse des Kunden und Lageradresse werden über OpenStreetMap (Nominatim) gesucht, die Straßenstrecke rechnet der öffentliche OSRM-Server. Einmal je Kunde mit Internet, danach gemerkt (`entfernungKm` beim Kunden). Bei Fehlern steht der Grund unter dem km-Feld, dann selbst eintragen.
- Zeiten werden im eingestellten Takt aufgerundet (Start: 15 Minuten).
- Fehlt ein Preis, steht dort `[offen]`. Nichts wird geraten.
- Die Rechnungsnummer vergibt FastBill.

**Weg zur Rechnung (seit 19.10.2026):** Nach „Ins Büro“ findet die geplante Aufgabe `arbeitsberichte-abrechnen` am PC den Bericht (stündlich, oder sofort, wenn du im Handy-Chat „abrechnen“ sagst). Claude baut daraus einen Rechnungsentwurf im Frigotechnik-Stil und schickt dir den Link zum Prüfen. Sagst du „raus“, legt Claude die Rechnung in FastBill an (Nummer), erzeugt die Endfassung und sendet sie mit dem unterschriebenen Bericht an den Kunden und an DATEV. Einzelheiten im Skill `rechnung`, Abschnitt „Bericht aus der Handy-App“.

Startwerte im Positionskatalog stammen aus `Firma/firma.md` (Standardpositionen, Stand 10/2026). In den Einstellungen prüfen und anpassen.

## Installieren am Android

1. Die Adresse der App in **Chrome** öffnen (siehe unten „Veröffentlichen“).
2. Menü ⋮ → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
3. App einmal öffnen, in den Einstellungen unter **Daten und Sicherung** „Dauerhaft speichern anfordern“ antippen.

## Abgleich zwischen den Geräten (seit 22.10.2026, v1.5.0)

Handy, Lenovo und später ein Tablet haben denselben Stand. Weg: ein kleines Google-Apps-Skript in Volkans Google-Konto („Briefkasten“, `drive-briefkasten/Code.gs`) legt alles im Drive-Ordner `Meine Ablage/Arbeitsbericht-Abgleich/` ab. Kein eigener Server, keine Kosten.

- **Was abgeglichen wird:** Berichte, Fotos, Kunden, Einstellungen (ohne Gerätekürzel und Nummernzähler). Die neuere Fassung gewinnt (Feld `geaendert`). Gelöschtes verschwindet auf allen Geräten.
- **Wann:** beim Öffnen, wenn das Gerät wieder Netz hat, kurz nach jedem Speichern und alle 3 Minuten. Ohne Netz wird nur gespeichert, der Abgleich holt es nach. Den gerade offenen Bericht überschreibt der Abgleich nicht.
- **Nummern:** Jedes Gerät zählt selbst, mit Kürzel: Handy `AB-2026-001`, Lenovo `AB-2026-L001`, Tablet `AB-2026-T001` (Einstellungen → Abgleich → „Welches Gerät ist das?“).
- **Kopie an den Kunden:** Ist der Abgleich an, wird „Senden → Kopie an den Kunden“ vorgemerkt (Liste: „Kopie wartet auf Internet“) und geht beim nächsten Abgleich in den Ordner `Ausgang`. Der HP verschickt sie von info@coolcontrol.online (`.claude/scripts/arbeitsbericht_versand.py`, Aufgabenplanung „CC Arbeitsbericht Versand“ alle 5 Minuten, Log `~/.claude/logs/arbeitsbericht-versand.log`) und legt eine Quittung in `Quittungen`. Die App zeigt dann „an Kunden geteilt“, bei Problemen „Versand fehlgeschlagen“ (Auftrag liegt dann in `Ausgang/Fehler`). Der alte Weg über das Teilen-Menü bleibt als „Kopie selbst mit der Mail-App senden“.
- **Einrichten (einmalig):** Skript in script.google.com anlegen und als Web-App bereitstellen (Ausführen als: ich, Zugriff: jeder). Den Schlüssel trägt Claude vorher ein, er steht nie im Git. Claude legt danach `Arbeitsbericht-Abgleich/verbindung.json` ab; die Datei auf jedem Gerät unter Einstellungen → Abgleich einspielen. Die Kundenliste nur auf einem Gerät einspielen.
- **Test am PC:** `python tools/test_abgleich.py` (zwei Geräte, Test-Briefkasten im Testserver, Versandskript nur im Probemodus).

## Daten und Datenschutz

- Berichte, Fotos und Unterschriften liegen im Browser-Speicher der App und, wenn der Abgleich an ist, in Volkans Google Drive (Ordner `Arbeitsbericht-Abgleich`). Den Zugang zum Briefkasten hat nur, wer Adresse und Schlüssel kennt (Verbindungsdatei). Weiter gehen Daten nur, wenn du sie teilst oder sendest.
- Schriften und Bibliotheken sind in der App enthalten, es wird nichts von Google oder anderen Diensten nachgeladen.
- **Sicherung**: Einstellungen → Daten und Sicherung → „Sicherung herunterladen“, die Datei in Google Drive ablegen. Empfehlung: einmal pro Woche. Bei Handywechsel dort „Sicherung einspielen“.
- App-Daten löschen in den Android-Einstellungen löscht auch die Berichte. Vorher sichern.

## Veröffentlichen (einmalig)

Die App braucht eine https-Adresse, sonst lässt Android sie nicht installieren. Vorschlag: GitHub Pages unter dem Konto `CoolControl888`, kostenlos. Der Ordner enthält nur Programmcode, keine Kundendaten.

1. Auf github.com (angemeldet als CoolControl888) ein neues Repository **arbeitsbericht** anlegen, Sichtbarkeit **Public**, ohne README.
2. Claude lädt den Code hoch (`git push`). Beim ersten Mal öffnet Windows ein GitHub-Anmeldefenster, das bestätigst du.
3. Im Repository: Settings → Pages → Source „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → Save.
4. Nach 1–2 Minuten läuft die App unter `https://coolcontrol888.github.io/arbeitsbericht/`.

Später kann die App unter einer eigenen Adresse laufen (z. B. `bericht.coolcontrol.online`).

## Updates

1. Änderung machen und testen (siehe unten).
2. In `sw.js` die `VERSION` und in `js/app.js` die `VERSION` erhöhen, sonst behält das Handy die alte Fassung.
3. Hochladen. Die App zeigt beim nächsten Öffnen „Neue Version der App ist da“ → „Jetzt laden“.

## Ordner

| Pfad | Inhalt |
|---|---|
| `index.html`, `app.css` | Oberfläche |
| `js/app.js` | Ansichten, Formular, Unterschrift, Senden, Einstellungen |
| `js/pdf.js` | PDF im Stil von `Vorlagen/rechnung-frigostil.html` (seit 20.10.2026, v1.1.0), Rechnungsdaten fürs Büro |
| `js/abrechnung.js` | Stunden, Takt, Rechnungsvorschlag |
| `js/settings.js` | Startwerte: Katalog, Texte, Fußzeile |
| `js/abgleich.js` | Abgleich mit dem Drive-Briefkasten, Ausgang für Kopien an Kunden |
| `drive-briefkasten/Code.gs` | Briefkasten-Skript für script.google.com (ohne Schlüssel) |
| `js/db.js`, `js/util.js`, `js/signature.js`, `js/photos.js` | Speicher, Helfer, Unterschriftenfeld, Fotos verkleinern |
| `sw.js`, `manifest.webmanifest` | Offline-Betrieb, Installation |
| `vendor/jspdf.umd.min.js` | jsPDF 4.2.1 (MIT) |
| `fonts/` | Courier Prime normal und fett (SIL Open Font License, `LICENSE-CourierPrime.txt`), inkl. ı ş ğ İ €; fehlende Zeichen ersetzt `pdfText` |
| `img/`, `icons/` | Logo und App-Symbole, erzeugt mit `tools/build-assets.py` |
| `tools/` | Testserver, automatischer Test, Asset-Erzeugung |
| `test/` | Testseite mit Musterdaten (erfundene Namen); `test/ausgabe/` wird nicht hochgeladen |

## Testen am PC

```
python tools/testserver.py          # Server auf http://127.0.0.1:8765/
python tools/test_app.py            # zweites Fenster: Test in Handy-Ansicht
```

Der Test füllt einen Bericht aus, unterschreibt, teilt an Kunde und Büro, prüft Offline-Start und Speicherung und legt PDFs und Bildschirmfotos in `test/ausgabe/` ab. Voraussetzung: Python mit `playwright` und `pymupdf`, Google Chrome.

## Format der Rechnungsdaten

`<datum>_rechnungsdaten_<nr>_<kunde>.txt` ist JSON mit `format: "cc-arbeitsbericht/1"`:

- `bericht`: alle Felder des Berichts (Kunde, Anlage, Zeiten mit `minutenAbgerechnet`, Material, Kältemittel, Dichtheitskontrolle, Befund, Unterschrift mit Name und Zeit, ohne Bild)
- `abrechnung`: `positionen` (bezeichnung, menge, einheit, preis oder null, herkunft), `netto`, `ust`, `brutto`, `offen` (Anzahl fehlender Preise), `taktMinuten`, `rechnungshinweis`
