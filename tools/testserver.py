"""Lokaler Testserver für die Arbeitsbericht-App.

Liefert den App-Ordner unter http://127.0.0.1:8765/ aus und nimmt Test-Uploads an
(POST /__upload/<name> landet in test/ausgabe/<name>). POST /__briefkasten spielt den
Drive-Briefkasten (drive-briefkasten/Code.gs) nach, Ablage in test/ausgabe/briefkasten/.
Nur für Tests auf dem PC.

Aufruf (aus dem App-Ordner):  python tools/testserver.py
"""
import base64
import http.server
import json
import re
import threading
from functools import partial
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
AUSGABE = APP / "test" / "ausgabe"
KASTEN = AUSGABE / "briefkasten"
PORT = 8765
SPERRE = threading.Lock()


def briefkasten(a):
    """Gleiche Aktionen wie drive-briefkasten/Code.gs, Schlüssel „test“."""
    if a.get("schluessel") != "test":
        raise ValueError("Schlüssel stimmt nicht")
    daten, ausgang, quitt = KASTEN / "daten", KASTEN / "Ausgang", KASTEN / "Quittungen"
    for o in (daten, ausgang, quitt):
        o.mkdir(parents=True, exist_ok=True)
    idx_datei = daten / "index.json"
    with SPERRE:
        index = json.loads(idx_datei.read_text(encoding="utf-8")) if idx_datei.exists() else {}
        if a["aktion"] == "liste":
            quittungen = [json.loads(q.read_text(encoding="utf-8")) for q in quitt.glob("*.json")]
            return {"stand": {n: v["g"] for n, v in index.items()}, "quittungen": quittungen}
        if a["aktion"] == "holen":
            return {"dateien": {n: (daten / f"{n}.json").read_text(encoding="utf-8") for n in a["namen"] if n in index}}
        if a["aktion"] == "ablegen":
            for d in a["dateien"]:
                if d["name"] in index and index[d["name"]]["g"] >= d["g"]:
                    continue
                (daten / f"{d['name']}.json").write_text(d["inhalt"], encoding="utf-8")
                index[d["name"]] = {"g": d["g"], "id": d["name"]}
            idx_datei.write_text(json.dumps(index), encoding="utf-8")
            return {"erledigt": [d["name"] for d in a["dateien"]]}
        if a["aktion"] == "versand":
            basis = a["berichtId"] + "_" + re.sub(r"[^0-9]", "", a["angefordert"])
            (ausgang / f"{basis}.pdf").write_bytes(base64.b64decode(a["pdf"]))
            auftrag = {k: a.get(k) for k in ("berichtId", "nr", "an", "betreff", "text", "angefordert", "geraet")}
            auftrag.update(format="cc-arbeitsbericht-versand/1", anhangName=a.get("pdfName"), pdf=f"{basis}.pdf")
            (ausgang / f"{basis}.json").write_text(json.dumps(auftrag, ensure_ascii=False), encoding="utf-8")
            return {}
    raise ValueError("Unbekannte Aktion")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".ttf": "font/ttf",
        ".png": "image/png",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path == "/__briefkasten":
            laenge = int(self.headers.get("Content-Length", 0))
            try:
                antwort = {**briefkasten(json.loads(self.rfile.read(laenge))), "ok": True}
            except Exception as e:
                antwort = {"ok": False, "fehler": str(e)}
            roh = json.dumps(antwort).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(roh)))
            self.end_headers()
            self.wfile.write(roh)
            return
        m = re.fullmatch(r"/__upload/([A-Za-z0-9._-]+)", self.path)
        if not m:
            self.send_error(404)
            return
        laenge = int(self.headers.get("Content-Length", 0))
        AUSGABE.mkdir(parents=True, exist_ok=True)
        (AUSGABE / m.group(1)).write_bytes(self.rfile.read(laenge))
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(APP)))
    print(f"Testserver läuft: http://127.0.0.1:{PORT}/", flush=True)
    server.serve_forever()
