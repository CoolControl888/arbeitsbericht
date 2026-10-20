// Unterschriftenfeld: mit Finger oder Stift auf dem Display unterschreiben

const TINTE = '#10204a';
const STRICH = 2.6;

export class Unterschrift {
  constructor(canvas) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.striche = [];
    this.aktiv = null;
    this.beiAenderung = null;
    this._unten = (e) => this.unten(e);
    this._bewegt = (e) => this.bewegt(e);
    this._oben = (e) => this.oben(e);
    this._groesse = () => this.groesse();
    canvas.addEventListener('pointerdown', this._unten);
    canvas.addEventListener('pointermove', this._bewegt);
    canvas.addEventListener('pointerup', this._oben);
    canvas.addEventListener('pointercancel', this._oben);
    window.addEventListener('resize', this._groesse);
    this.groesse();
  }

  abbauen() {
    window.removeEventListener('resize', this._groesse);
  }

  groesse() {
    const r = this.c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.breite = r.width;
    this.hoehe = r.height;
    this.c.width = Math.max(1, Math.round(r.width * dpr));
    this.c.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.zeichneAlles();
  }

  punkt(e) {
    const r = this.c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  unten(e) {
    e.preventDefault();
    this.c.setPointerCapture?.(e.pointerId);
    this.aktiv = [this.punkt(e)];
    this.striche.push(this.aktiv);
    this.zeichneAlles();
  }

  bewegt(e) {
    if (!this.aktiv) return;
    e.preventDefault();
    const liste = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (liste.length ? liste : [e])) this.aktiv.push(this.punkt(ev));
    this.zeichneAlles();
  }

  oben() {
    if (!this.aktiv) return;
    this.aktiv = null;
    this.beiAenderung?.();
  }

  // Für Tests und zum Wiederherstellen
  strichHinzu(punkte) {
    this.striche.push(punkte.map((p) => ({ x: p.x, y: p.y })));
    this.zeichneAlles();
    this.beiAenderung?.();
  }

  loeschen() {
    this.striche = [];
    this.aktiv = null;
    this.zeichneAlles();
    this.beiAenderung?.();
  }

  leer() {
    // Ein einzelner Tipper zählt nicht als Unterschrift
    return this.striche.reduce((n, s) => n + s.length, 0) < 4;
  }

  static pfad(ctx, s) {
    ctx.beginPath();
    if (s.length === 1) {
      ctx.arc(s[0].x, s[0].y, STRICH / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.moveTo(s[0].x, s[0].y);
    for (let i = 1; i < s.length - 1; i++) {
      const mx = (s[i].x + s[i + 1].x) / 2;
      const my = (s[i].y + s[i + 1].y) / 2;
      ctx.quadraticCurveTo(s[i].x, s[i].y, mx, my);
    }
    const l = s[s.length - 1];
    ctx.lineTo(l.x, l.y);
    ctx.stroke();
  }

  zeichneAlles() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.breite || this.c.width, this.hoehe || this.c.height);
    ctx.strokeStyle = TINTE;
    ctx.fillStyle = TINTE;
    ctx.lineWidth = STRICH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.striche) Unterschrift.pfad(ctx, s);
  }

  // Zugeschnittenes PNG mit transparentem Hintergrund, Höhe ca. 240 px
  png() {
    if (this.leer()) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of this.striche) for (const p of s) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    const rand = 6;
    x0 -= rand; y0 -= rand; x1 += rand; y1 += rand;
    const w = Math.max(20, x1 - x0);
    const h = Math.max(20, y1 - y0);
    const f = Math.min(3, 240 / h, 900 / w);
    const c = document.createElement('canvas');
    c.width = Math.round(w * f);
    c.height = Math.round(h * f);
    const ctx = c.getContext('2d');
    ctx.setTransform(f, 0, 0, f, -x0 * f, -y0 * f);
    ctx.strokeStyle = TINTE;
    ctx.fillStyle = TINTE;
    ctx.lineWidth = STRICH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.striche) Unterschrift.pfad(ctx, s);
    return { png: c.toDataURL('image/png'), w: c.width, h: c.height };
  }
}
