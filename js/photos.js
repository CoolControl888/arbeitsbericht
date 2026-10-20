// Fotos verkleinern, bevor sie gespeichert werden (spart Platz und hält das PDF mailbar)

export async function verkleinern(datei, max = 1600, qualitaet = 0.8) {
  const bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
  const f = Math.min(1, max / Math.max(bild.width, bild.height));
  const w = Math.round(bild.width * f);
  const h = Math.round(bild.height * f);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bild, 0, 0, w, h);
  bild.close?.();
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', qualitaet));
  if (!blob) throw new Error('Foto konnte nicht verarbeitet werden');
  return { blob, w, h };
}
