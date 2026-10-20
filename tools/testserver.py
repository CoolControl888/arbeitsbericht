"""Lokaler Testserver für die Arbeitsbericht-App.

Liefert den App-Ordner unter http://127.0.0.1:8765/ aus und nimmt Test-Uploads an
(POST /__upload/<name> landet in test/ausgabe/<name>). Nur für Tests auf dem PC.

Aufruf (aus dem App-Ordner):  python tools/testserver.py
"""
import http.server
import re
from functools import partial
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
AUSGABE = APP / "test" / "ausgabe"
PORT = 8765


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
