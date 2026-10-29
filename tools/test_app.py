"""Testet die App in Chrome (Handy-Ansicht, ohne Fenster) und rendert die Test-PDFs als Bilder.

Voraussetzung: tools/testserver.py läuft. Aufruf aus dem App-Ordner:
    python tools/test_app.py
Ergebnisse und Bildschirmfotos landen in test/ausgabe/.
"""
import json
import sys
from pathlib import Path

import pymupdf as fitz
from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent
AUS = APP / "test" / "ausgabe"
URL = "http://127.0.0.1:8765/"

TEILEN_ABFANGEN = """
window.__geteilt = [];
Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => {
  window.__geteilt.push({ title: d.title, text: d.text, files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })) });
}});
"""

fehler = []


def check(name, bedingung, info=""):
    print(("OK     " if bedingung else "FEHLER ") + name + (f" ({info})" if info else ""))
    if not bedingung:
        fehler.append(name)


def pdf_bilder(name):
    doc = fitz.open(AUS / name)
    for i, seite in enumerate(doc):
        seite.get_pixmap(dpi=80).save(AUS / f"{name[:-4]}_s{i + 1}.png")
    text = "".join(s.get_text() for s in doc)
    return len(doc), text


def zeichnen(page, canvas_sel):
    box = page.locator(canvas_sel).bounding_box()
    x0, y0 = box["x"] + 30, box["y"] + box["height"] * 0.6
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, 40):
        page.mouse.move(x0 + i * 7, y0 - 25 * ((i % 8) / 8) + (i % 3) * 4, steps=2)
    page.mouse.up()


def main():
    AUS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        ctx = browser.new_context(
            viewport={"width": 412, "height": 915}, device_scale_factor=2, is_mobile=True, has_touch=True,
            locale="de-DE", accept_downloads=True,
            user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36",
        )
        ctx.add_init_script(TEILEN_ABFANGEN)
        page = ctx.new_page()
        konsole = []
        page.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: konsole.append(f"pageerror: {e}"))
        page.on("response", lambda r: konsole.append(f"http {r.status}: {r.url}") if r.status >= 400 else None)

        # 1. Logik- und PDF-Tests
        page.goto(URL + "test/test.html")
        page.wait_for_selector('body[data-fertig="1"]', timeout=90000)
        ergebnis = page.inner_text("#ergebnis")
        print(ergebnis)
        if "ALLE TESTS OK" not in ergebnis:
            fehler.append("Testseite")

        for name, zeichen in (("test-1.pdf", "ışğİçŞ"), ("test-2.pdf", "Şşı")):
            seiten, text = pdf_bilder(name)
            print(f"INFO   {name}: {seiten} Seiten")
            check(f"{name}: türkische Zeichen im Text", all(z in text for z in zeichen))
            check(f"{name}: kein Preis im Kundenbericht", "91,00" not in text and "38,50" not in text)
        _, text1 = pdf_bilder("test-1.pdf")
        check("PDF 1: Zertifikat genannt", "007 0021 2021 1" in text1)
        check("PDF 1: Gesamtstunden 4,75", "4,75" in text1, "30+150+105 min")

        # 2. App: Liste
        page.goto(URL)
        page.wait_for_selector('body[data-bereit="1"]')
        page.screenshot(path=AUS / "app_1_liste.png")
        n = page.locator(".karte").count()
        check("Liste zeigt Musterberichte", n >= 2, f"{n} Karten")

        # 3. Bestehenden Bericht öffnen (Vollbild)
        page.goto(URL + "#/bericht/test-1")
        page.wait_for_selector("#sek-kunde")
        page.screenshot(path=AUS / "app_2_bericht_oben.png")
        page.screenshot(path=AUS / "app_3_bericht_ganz.png", full_page=True)
        check("Stunden je Zeile berechnet", page.locator('[data-std="1"]').inner_text() == "2,50 Std.")
        page.locator("#sek-abrechnung > summary").click()
        page.locator("#abr-tabelle").scroll_into_view_if_needed()
        check("Abrechnung netto 656,65", "656,65 €" in page.locator("#abr-tabelle").inner_text())
        page.screenshot(path=AUS / "app_4_abrechnung.png")

        # 4. Unterschrift
        page.locator('.aktionsleiste [data-aktion="unterschreiben"]').click()
        page.wait_for_selector("dialog[open] canvas")
        page.screenshot(path=AUS / "app_5_unterschrift_leer.png")
        zeichnen(page, "dialog[open] canvas")
        page.fill('dialog[open] [name="name"]', "Ayşe Yıldız")
        page.screenshot(path=AUS / "app_6_unterschrift.png")
        page.click('dialog[open] [data-k="ok"]')
        page.wait_for_selector(".sperre")
        check("Bericht nach Unterschrift gesperrt", page.locator('#sek-kunde fieldset[disabled]').count() == 1)
        # Frage „Jetzt die Kopie per Mail senden?“ mit „Später“ schließen, das Senden testet Schritt 5
        if page.locator('dialog[open] [data-k="nein"]').count():
            page.click('dialog[open] [data-k="nein"]')
        page.screenshot(path=AUS / "app_7_unterschrieben.png")

        # 5. Senden an Kunden und Büro (Teilen wird abgefangen)
        page.click('.aktionsleiste [data-aktion="senden"]')
        page.wait_for_selector('dialog[open] [data-k="kunde"]', timeout=30000)
        page.screenshot(path=AUS / "app_8_senden.png")
        page.click('dialog[open] [data-k="kunde"]')
        page.wait_for_function("window.__geteilt.length === 1")
        page.click('.aktionsleiste [data-aktion="senden"]')
        page.wait_for_selector('dialog[open] [data-k="buero"]')
        page.click('dialog[open] [data-k="buero"]')
        page.wait_for_function("window.__geteilt.length === 2")
        geteilt = page.evaluate("window.__geteilt")
        print("INFO   geteilt:", json.dumps(geteilt, ensure_ascii=False)[:600])
        check("Kunde bekommt nur PDF", [f["type"] for f in geteilt[0]["files"]] == ["application/pdf"])
        check("Mailtext mit Nummer", "AB-2026-001" in geteilt[0]["text"] and "15.10.2026" in geteilt[0]["title"])
        check("Büro bekommt PDF + Rechnungsdaten", [f["type"] for f in geteilt[1]["files"]] == ["application/pdf", "text/plain"])

        # 6. Neuer Bericht: Kunde aus Vorschlag, Anlage übernehmen, Foto, Zeiten
        page.goto(URL)
        page.wait_for_selector('[data-aktion="neu"]')
        page.click('[data-aktion="neu"]')
        page.wait_for_selector('[data-f="kunde.name"]')
        check("Neue Nummer AB-2026-004", page.inner_text("#kopf-titel") == "AB-2026-004")
        page.fill('[data-f="kunde.name"]', "Şahin Döner & Grill (Muster)")
        page.locator('[data-f="kunde.name"]').blur()
        page.wait_for_timeout(300)
        check("Kundendaten automatisch ergänzt", page.input_value('[data-f="kunde.plzOrt"]') == "20095 Hamburg")
        page.select_option('[data-aktion="anlage-waehlen"]', "0")
        check("Anlage übernommen", page.input_value('[data-f="anlage.seriennr"]') == "SN-2024-0815")
        page.click('[data-aktion="art"][data-wert="Wartung"]')
        page.fill('[data-f="zeiten.0.von"]', "09:00")
        page.fill('[data-f="zeiten.0.bis"]', "10:05")
        check("Takt 15 min: 1,25 Std.", page.inner_text('[data-std="0"]') == "1,25 Std.")
        page.click('[data-aktion="baustein"][data-wert="Verflüssiger gereinigt"]')
        page.click('[data-aktion="neu"][data-liste="kaeltemittel"]')
        check("Kältemittel aus Anlage vorbelegt", page.input_value('[data-f="kaeltemittel.0.typ"]') == "R455A")
        page.set_input_files('input[data-aktion="foto"][multiple]', str(AUS / "test-1_s1.png"))
        page.wait_for_selector(".foto img")
        check("Foto hinzugefügt", page.locator(".foto").count() == 1)
        page.wait_for_timeout(800)
        page.screenshot(path=AUS / "app_9_neuer_bericht.png", full_page=True)

        # 7. Speichern überlebt Neuladen
        page.reload()
        page.wait_for_selector('[data-f="kunde.name"]')
        check("Nach Neuladen noch da", page.input_value('[data-f="zeiten.0.bis"]') == "10:05" and page.locator(".foto").count() == 1)

        # 8. PDF ansehen lädt herunter (Android-Verhalten)
        with page.expect_download(timeout=30000) as dl:
            page.click('.aktionsleiste [data-aktion="pdf"]')
        d = dl.value
        check("PDF-Download mit Dateiname", d.suggested_filename.startswith(page.locator("[data-f=datum]").input_value()), d.suggested_filename)

        # 9. Einstellungen
        page.goto(URL + "#/einstellungen")
        page.wait_for_selector(".einstellungen")
        page.screenshot(path=AUS / "app_10_einstellungen.png", full_page=True)

        # 10. Offline: Service Worker aktiv, App lädt ohne Netz
        page.goto(URL)
        page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)
        ctx.set_offline(True)
        page.reload()
        page.wait_for_selector('body[data-bereit="1"]', timeout=15000)
        check("App startet offline", page.locator(".karte").count() >= 3)
        ctx.set_offline(False)

        print("INFO   Konsole:", konsole[:12] if konsole else "keine Fehler")
        check("Keine Fehler in der Konsole", not [k for k in konsole if k.startswith(("error", "pageerror"))])
        browser.close()

    print("ERGEBNIS:", "ALLES OK" if not fehler else f"{len(fehler)} FEHLER: {fehler}")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
