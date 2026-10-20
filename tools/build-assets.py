"""Baut Logo, App-Icons und (bis v1.0) die verkleinerte Roboto-Schrift für die Arbeitsbericht-App.
Seit v1.1.0 nutzt das PDF Courier Prime ungekürzt aus fonts/; den Schrift-Schritt nicht mehr ausführen.

Aufruf (aus dem App-Ordner):
    python tools/build-assets.py <ordner-mit-Roboto-Regular.ttf-und-Roboto-Bold.ttf>

Quelle Logo: ../Vorlagen/briefpapier/logo.png
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from fontTools import subset

APP = Path(__file__).resolve().parent.parent
LOGO = APP.parent / "Vorlagen" / "briefpapier" / "logo.png"
BLAU = (0, 113, 188, 255)

# Zeichen, die das PDF darstellen kann. Gleiche Liste steht in js/pdf.js (PDF_ZEICHEN).
UNICODES = (
    "U+0020-007E,U+00A0-00FF,U+0100-017F,U+0218-021B,"
    "U+2013-2014,U+2018-201E,U+2022,U+2026,U+20AC,U+2082,U+2122,U+2190-2193,U+2212,U+2264-2265"
)


def logo():
    im = Image.open(LOGO).convert("RGBA")
    # Für PDF und Kopfzeile reicht 900 px Breite
    w = 900
    h = round(im.height * w / im.width)
    klein = im.resize((w, h), Image.LANCZOS)
    klein.save(APP / "img" / "logo.png", optimize=True)
    # Weiße Variante für den blauen App-Kopf
    weiss = klein.copy()
    px = weiss.load()
    for y in range(weiss.height):
        for x in range(weiss.width):
            a = px[x, y][3]
            px[x, y] = (255, 255, 255, a)
    weiss.save(APP / "img" / "logo-weiss.png", optimize=True)
    return im


def schneeflocke(im):
    # Große Schneeflocke rechts oben im Logo
    box = (1630, 60, 1800, 255)
    flocke = im.crop(box)
    bbox = flocke.getbbox()
    return flocke.crop(bbox)


def icon(flocke, groesse, anteil, rund, name):
    bild = Image.new("RGBA", (groesse, groesse), (0, 0, 0, 0))
    d = ImageDraw.Draw(bild)
    if rund:
        d.rounded_rectangle([0, 0, groesse - 1, groesse - 1], radius=round(groesse * 0.22), fill=BLAU)
    else:
        d.rectangle([0, 0, groesse, groesse], fill=BLAU)
    seite = round(groesse * anteil)
    f = flocke.copy()
    f.thumbnail((seite, seite), Image.LANCZOS)
    px = f.load()
    for y in range(f.height):
        for x in range(f.width):
            px[x, y] = (255, 255, 255, px[x, y][3])
    bild.alpha_composite(f, ((groesse - f.width) // 2, (groesse - f.height) // 2))
    bild.save(APP / "icons" / name, optimize=True)


def schriften(quelle):
    for schnitt in ("Regular", "Bold"):
        opt = subset.Options()
        opt.hinting = False
        opt.desubroutinize = True
        opt.name_IDs = ["*"]
        opt.notdef_outline = True
        font = subset.load_font(str(Path(quelle) / f"Roboto-{schnitt}.ttf"), opt)
        s = subset.Subsetter(opt)
        s.populate(unicodes=subset.parse_unicodes(UNICODES))
        s.subset(font)
        ziel = APP / "fonts" / f"Roboto-{schnitt}.ttf"
        subset.save_font(font, str(ziel), opt)
        print(ziel.name, ziel.stat().st_size, "Bytes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    original = logo()
    fl = schneeflocke(original)
    icon(fl, 192, 0.62, True, "icon-192.png")
    icon(fl, 512, 0.62, True, "icon-512.png")
    icon(fl, 512, 0.50, False, "icon-maskable-512.png")
    icon(fl, 180, 0.62, False, "apple-touch-icon.png")
    schriften(sys.argv[1])
    print("fertig")
