"""Testet den Abgleich zwischen zwei Geräten (Handy und Lenovo) über den Test-Briefkasten.

Voraussetzung: tools/testserver.py läuft. Aufruf aus dem App-Ordner:
    python tools/test_abgleich.py
Prüft: Bericht vom Handy erscheint am Lenovo, Nummern je Gerät, Kopie an Kunden offline vormerken,
Auftrag im Ausgang (Kunde + Büro), Büro-Kopie für alte Berichte nachholen, Quittung vom PC, Löschen auf allen Geräten, Einstellungen ohne Gerätewerte.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parent.parent
AUS = APP / "test" / "ausgabe"
KASTEN = AUS / "briefkasten"
URL = "http://127.0.0.1:8765/"
VERSAND = APP.parent / ".claude" / "scripts" / "arbeitsbericht_versand.py"

fehler = []


def check(name, bedingung, info=""):
    print(("OK     " if bedingung else "FEHLER ") + name + (f" ({info})" if info else ""))
    if not bedingung:
        fehler.append(name)


def zeichnen(page, canvas_sel):
    box = page.locator(canvas_sel).bounding_box()
    x0, y0 = box["x"] + 30, box["y"] + box["height"] * 0.6
    page.mouse.move(x0, y0)
    page.mouse.down()
    for i in range(1, 40):
        page.mouse.move(x0 + i * 7, y0 - 25 * ((i % 8) / 8) + (i % 3) * 4, steps=2)
    page.mouse.up()


def geraet(browser, handy):
    ctx = browser.new_context(
        viewport={"width": 412, "height": 915} if handy else {"width": 1280, "height": 800},
        is_mobile=handy, has_touch=True, locale="de-DE", accept_downloads=True, permissions=["camera"],
        user_agent=("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36"
                    if handy else None),
    )
    page = ctx.new_page()
    konsole = []
    page.on("console", lambda m: konsole.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: konsole.append(f"pageerror: {e}"))
    page.goto(URL)
    page.wait_for_selector('body[data-bereit="1"]')
    return ctx, page, konsole


def verbinden(page, kuerzel):
    page.evaluate("""async (k) => {
      const a = await import('./js/abgleich.js');
      await a.verbinden({ url: location.origin + '/__briefkasten', schluessel: 'test' });
    }""", kuerzel)
    page.goto(URL + "#/einstellungen")
    page.wait_for_selector('[data-e="geraet"]', state="attached")
    page.locator("details", has_text="Abgleich zwischen").locator("summary").click()
    page.select_option('[data-e="geraet"]', kuerzel)
    page.wait_for_timeout(700)


def abgleich(page):
    page.goto(URL + "#/")
    page.wait_for_selector('[data-aktion="abgleich"]')
    page.click('[data-aktion="abgleich"]')
    page.wait_for_function("document.querySelector('#toast').textContent.startsWith('Abgeglichen') || document.querySelector('#toast').textContent.startsWith('Abgleich hat')", timeout=30000)
    toast = page.inner_text("#toast")
    page.wait_for_timeout(400)
    return toast


def main():
    shutil.rmtree(KASTEN, ignore_errors=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True,
                                    args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        hctx, handy, hkons = geraet(browser, True)
        lctx, lenovo, lkons = geraet(browser, False)

        # 1. Handy: verbinden, Bericht anlegen, abgleichen
        verbinden(handy, "")
        handy.goto(URL)
        handy.wait_for_selector('[data-aktion="neu"]')
        handy.click('[data-aktion="neu"]')
        handy.wait_for_selector('[data-f="kunde.name"]')
        nr_handy = handy.inner_text("#kopf-titel")
        check("Handy-Nummer ohne Kürzel", nr_handy.startswith("AB-2026-") and nr_handy[8:].isdigit(), nr_handy)
        handy.fill('[data-f="kunde.name"]', "Abgleich Testkunde GmbH")
        handy.fill('[data-f="kunde.email"]', "kunde@example.com")
        handy.set_input_files('input[data-aktion="foto"][multiple]', str(APP / "icons" / "icon-192.png"))
        handy.wait_for_selector(".foto img")
        handy.wait_for_timeout(700)
        t = abgleich(handy)
        check("Handy gleicht ab", t.startswith("Abgeglichen"), t)
        index = json.loads((KASTEN / "daten" / "index.json").read_text(encoding="utf-8"))
        check("Briefkasten hat Bericht, Foto, Kunde, Einstellungen",
              any(n.startswith("b_") for n in index) and any(n.startswith("f_") for n in index)
              and any(n.startswith("k_") for n in index) and "e_einstellungen" in index, ", ".join(sorted(index))[:200])

        # 2. Lenovo: verbinden, Bericht vom Handy ist da
        verbinden(lenovo, "L")
        t = abgleich(lenovo)
        check("Lenovo gleicht ab", t.startswith("Abgeglichen"), t)
        check("Bericht vom Handy am Lenovo", "Abgleich Testkunde GmbH" in lenovo.inner_text(".karten"))
        lenovo.click(".karte a")
        lenovo.wait_for_selector(".foto img")
        check("Foto kam mit", lenovo.locator(".foto").count() == 1)

        # 3. Lenovo: neuer Bericht mit Kürzel L, offline unterschreiben und senden
        lenovo.goto(URL)
        lenovo.wait_for_selector('[data-aktion="neu"]')
        lenovo.click('[data-aktion="neu"]')
        lenovo.wait_for_selector('[data-f="kunde.name"]')
        nr_lenovo = lenovo.inner_text("#kopf-titel")
        check("Lenovo-Nummer mit L", nr_lenovo == "AB-2026-L001", nr_lenovo)
        lenovo.select_option('[data-aktion="kunde-waehlen"]', label="Abgleich Testkunde GmbH")
        check("Kunde vom Handy in der Auswahl", lenovo.input_value('[data-f="kunde.email"]') == "kunde@example.com")
        lenovo.fill('[data-f="arbeiten"]', "Verflüssiger gereinigt")
        check("Lenovo: Kamera-Knopf statt Dateiauswahl", lenovo.locator('[data-aktion="kamera"]').count() == 1)
        lenovo.click('[data-aktion="kamera"]')
        lenovo.wait_for_function("(() => { const v = document.querySelector('dialog[open] video'); return v && v.videoWidth > 0; })()", timeout=15000)
        lenovo.click('dialog[open] [data-k="ausloesen"]')
        lenovo.wait_for_timeout(300)
        lenovo.click('dialog[open] [data-k="ausloesen"]')
        lenovo.wait_for_function("document.querySelector('dialog[open] [data-k=info]').textContent.startsWith('2 Fotos')")
        lenovo.screenshot(path=AUS / "abgleich_0_kamera.png")
        lenovo.click('dialog[open] [data-k="fertig"]')
        lenovo.wait_for_function("document.querySelectorAll('.foto img').length === 2", timeout=15000)
        check("Kamera: 2 Fotos aufgenommen", lenovo.locator(".foto").count() == 2)
        lctx.set_offline(True)
        lenovo.click('.aktionsleiste [data-aktion="unterschreiben"]')
        lenovo.wait_for_selector("dialog[open] canvas")
        zeichnen(lenovo, "dialog[open] canvas")
        lenovo.fill('dialog[open] [name="name"]', "M. Muster")
        lenovo.click('dialog[open] [data-k="ok"]')
        lenovo.wait_for_selector('dialog[open] [data-k="ja"]')
        lenovo.click('dialog[open] [data-k="ja"]')            # „Kopie senden“
        lenovo.wait_for_function("document.querySelector('#toast').textContent.includes('vorgemerkt')", timeout=30000)
        lenovo.goto(URL)
        lenovo.wait_for_selector(".karte")
        karten = lenovo.inner_text(".karten")
        check("Offline: Kopie wartet auf Internet", "Kopie wartet auf Internet" in karten, karten.replace("\n", " | ")[:200])
        lenovo.screenshot(path=AUS / "abgleich_1_lenovo_offline.png")
        check("Noch nichts im Ausgang", not list((KASTEN / "Ausgang").glob("*.json")))

        # 4. Online: Auftrag landet im Ausgang
        lctx.set_offline(False)
        t = abgleich(lenovo)
        alle_auftraege = [(a, json.loads(a.read_text(encoding="utf-8"))) for a in (KASTEN / "Ausgang").glob("*.json")]
        check("Online: Kopie an Kunden und Kopie ins Büro im Ausgang (seit 1.5.4)",
              len(alle_auftraege) == 2 and all(a.with_suffix(".pdf").exists() for a, _ in alle_auftraege),
              ", ".join(str(d.get("an")) for _, d in alle_auftraege))
        auftraege = [a for a, d in alle_auftraege if d.get("an") != "buero"]
        auftrag = json.loads(auftraege[0].read_text(encoding="utf-8")) if auftraege else {}
        check("Auftrag an Kunden-Adresse mit Nummer", auftrag.get("an") == "kunde@example.com" and nr_lenovo in auftrag.get("betreff", ""), str(auftrag)[:200])
        buero = [d for _, d in alle_auftraege if d.get("an") == "buero"]
        check("Genau eine Büro-Kopie mit Nummer", len(buero) == 1 and buero[0].get("nr") == nr_lenovo, str(buero)[:200])
        check("PDF ist ein PDF", auftraege and auftraege[0].with_suffix(".pdf").read_bytes()[:5] == b"%PDF-")
        check("Liste: Kopie geht vom PC raus", "Kopie geht vom PC raus" in lenovo.inner_text(".karten"))

        # 5. Versandskript am PC im Probemodus (sendet nichts)
        env = {**os.environ, "CC_ABGLEICH": str(KASTEN), "PYTHONUTF8": "1"}
        import time
        time.sleep(21)                                         # Skript wartet, bis das PDF 20 s alt ist
        probe = subprocess.run([sys.executable, str(VERSAND), "--probe"], capture_output=True, text=True, env=env, encoding="utf-8")
        print("INFO   Probe:", probe.stdout.strip(), probe.stderr.strip()[:300])
        check("Versandskript erkennt den Auftrag", "würde gesendet" in probe.stdout and nr_lenovo in probe.stdout)

        # 6. Quittung vom PC: Status auf beiden Geräten
        (KASTEN / "Quittungen" / (auftraege[0].stem + ".json")).write_text(json.dumps({
            "format": "cc-arbeitsbericht-quittung/1", "berichtId": auftrag["berichtId"], "nr": auftrag["nr"],
            "an": auftrag["an"], "angefordert": auftrag["angefordert"], "status": "gesendet", "gesendet": "2026-10-22T15:00:00+02:00",
        }), encoding="utf-8")
        buero_datei = next(a for a, d in alle_auftraege if d.get("an") == "buero")
        (KASTEN / "Quittungen" / (buero_datei.stem + ".json")).write_text(json.dumps({
            "format": "cc-arbeitsbericht-quittung/1", "berichtId": buero[0]["berichtId"], "nr": buero[0]["nr"], "an": "buero", "zweck": "buero",
            "angefordert": buero[0]["angefordert"], "status": "gesendet", "gesendet": "2026-10-22T15:00:05+02:00",
        }), encoding="utf-8")
        abgleich(lenovo)
        lk = lenovo.inner_text(".karten")
        check("Lenovo: Kunde + Büro", "Kunde + Büro" in lk, lk.replace("\n", " | ")[:200])
        abgleich(handy)
        hk = handy.inner_text(".karten")
        check("Handy sieht Lenovo-Bericht als Kunde + Büro", nr_lenovo in hk and "Kunde + Büro" in hk, hk.replace("\n", " | ")[:200])
        handy.screenshot(path=AUS / "abgleich_2_handy.png")

        # 6b. Nachholen: ein unterschriebener Bericht ohne Büro-Kopie (vor 1.5.4) geht beim nächsten Abgleich von allein ins Büro,
        #     aber nur vom Gerät mit der eigenen Nummer (Handy-Bericht → Handy, nicht Lenovo)
        for a in (KASTEN / "Ausgang").glob("*.*"):
            a.unlink()
        handy.evaluate("""async (nr) => { const { db } = await import('./js/db.js');
            const b = (await db.alle('berichte')).find((x) => x.nr === nr);
            b.status = 'unterschrieben'; b.unterschrift = { name: 'Alt Unterschrieben', zeit: '2026-10-25T10:00:00.000Z' };
            b.geaendert = new Date().toISOString(); await db.put('berichte', b); }""", nr_handy)
        abgleich(lenovo)
        check("Lenovo holt fremden Handy-Bericht nicht nach", not list((KASTEN / "Ausgang").glob("*.json")))
        abgleich(handy)
        handy.wait_for_function("document.querySelector('#toast').textContent.includes('nachträglich ins Büro')", timeout=30000)
        handy.wait_for_timeout(1500)
        nach = [json.loads(a.read_text(encoding="utf-8")) for a in (KASTEN / "Ausgang").glob("*.json")]
        check("Handy holt Büro-Kopie für alten Bericht nach", len(nach) == 1 and nach[0].get("an") == "buero" and nach[0].get("nr") == nr_handy, str(nach)[:200])
        abgleich(handy)
        check("Nachholen nur einmal", len(list((KASTEN / "Ausgang").glob("*.json"))) == 1)

        # 7. Einstellungen: Text vom Handy kommt an, Gerätekürzel bleibt
        handy.goto(URL + "#/einstellungen")
        handy.wait_for_selector('[data-e="mailBetreff"]', state="attached")
        handy.locator("details", has_text="Mail an den Kunden").locator("summary").click()
        handy.fill('[data-e="mailBetreff"]', "Ihr Arbeitsbericht {nr}")
        handy.wait_for_timeout(800)
        abgleich(handy)
        abgleich(lenovo)
        e = lenovo.evaluate("async () => { const { db } = await import('./js/db.js'); return db.get('einstellungen', 'einstellungen'); }")
        check("Lenovo hat neuen Betreff", e.get("mailBetreff") == "Ihr Arbeitsbericht {nr}")
        check("Lenovo behält Kürzel L und Zähler", e.get("geraet") == "L" and e.get("nrNaechste") == 2, f"{e.get('geraet')} {e.get('nrNaechste')}")

        # 8. Löschen am Handy, weg am Lenovo
        handy.goto(URL)
        handy.wait_for_selector(".karte")
        handy.locator(".karte", has_text=nr_handy).locator('[data-aktion="liste-loeschen"]').click()
        handy.click('dialog[open] [data-k="ja"]')
        handy.wait_for_timeout(400)
        abgleich(handy)
        abgleich(lenovo)
        check("Gelöschter Bericht auch am Lenovo weg", nr_handy not in lenovo.inner_text(".karten"))
        fotos = lenovo.evaluate("async () => { const { db } = await import('./js/db.js'); return (await db.alle('fotos')).length; }")
        check("Foto vom Handy-Bericht weg, Kamera-Fotos bleiben", fotos == 2, str(fotos))

        lenovo.goto(URL + "#/einstellungen")
        lenovo.wait_for_selector('[data-e="geraet"]', state="attached")
        lenovo.locator("details", has_text="Abgleich zwischen").locator("summary").click()
        lenovo.screenshot(path=AUS / "abgleich_3_einstellungen.png", full_page=True)

        alle = hkons + lkons
        print("INFO   Konsole:", alle[:10] if alle else "keine Fehler")
        check("Keine Fehler in der Konsole", not alle)
        browser.close()

    print("ERGEBNIS:", "ALLES OK" if not fehler else f"{len(fehler)} FEHLER: {fehler}")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
