// Génère les icônes PNG de l'application sans dépendance : node tools/gen-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, px) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const local = (x, y, cx, cy, w, h, deg) => { const a = -deg * Math.PI / 180, dx = x - cx, dy = y - cy; return [(dx * Math.cos(a) - dy * Math.sin(a)) / w, (dx * Math.sin(a) + dy * Math.cos(a)) / h]; };
const inRR = (u, v, r) => { const ax = Math.abs(u), ay = Math.abs(v); if (ax > .5 || ay > .5) return false; const qx = ax - (.5 - r), qy = ay - (.5 - r); return qx <= 0 || qy <= 0 || qx * qx + qy * qy <= r * r; };
function inPoly(u, v, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) c = !c; } return c; }
const SEVEN = [[-.27, -.33], [.27, -.33], [.27, -.2], [-.01, .35], [-.19, .35], [.09, -.2], [-.27, -.2]];
function color(x, y, maskable) {
  // fond
  let col = null;
  const rr = maskable ? true : inRR(x - .5, y - .5, .22);
  if (!rr) return [0, 0, 0, 0];
  const d = Math.hypot(x - .5, y - .42);
  const g = Math.min(1, d / .75);
  const c1 = hex('#1d8152'), c2 = hex('#073a23');
  col = c1.map((v, k) => Math.round(v + (c2[k] - v) * g));
  const s = maskable ? .78 : 1; // zone de sécurité des icônes adaptatives
  const X = .5 + (x - .5) / s, Y = .5 + (y - .5) / s;
  // carte de dos
  let [u, v] = local(X, Y, .40, .53, .40, .56, -15);
  if (inRR(u, v, .1)) { col = hex('#1f3f73'); if (inRR(u, v, .1) && !inRR(u * 1.14, v * 1.1, .1)) col = hex('#f6c945'); }
  // ombre carte avant
  [u, v] = local(X, Y, .585, .525, .44, .62, 9);
  if (inRR(u, v, .1) && col && !(inRR(...local(X, Y, .56, .50, .44, .62, 9), .1))) col = col.map(c => Math.round(c * .55));
  // carte avant
  [u, v] = local(X, Y, .56, .50, .44, .62, 9);
  if (inRR(u, v, .1)) {
    col = hex('#fbf3df');
    const inner = inRR(u * 1.16, v * 1.11, .09), inner2 = inRR(u * 1.27, v * 1.19, .08);
    if (!inner) col = hex('#fbf3df'); else if (!inner2) col = hex('#dc2626');
    if (inPoly(u - .025, v - .02, SEVEN)) col = hex('#1d2433');
    if (inPoly(u, v, SEVEN)) col = hex('#dc2626');
  }
  return [...col, 255];
}
function render(size, maskable) {
  const px = Buffer.alloc(size * size * 4), ss = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = color((x + (sx + .5) / ss) / size, (y + (sy + .5) / ss) / size, maskable);
      acc[0] += c[0] * c[3]; acc[1] += c[1] * c[3]; acc[2] += c[2] * c[3]; acc[3] += c[3];
    }
    const o = (y * size + x) * 4, a = acc[3];
    px[o] = a ? acc[0] / a : 0; px[o + 1] = a ? acc[1] / a : 0; px[o + 2] = a ? acc[2] / a : 0; px[o + 3] = a / (ss * ss);
  }
  return png(size, px);
}
const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), render(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), render(512, false));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), render(512, true));
console.log('icônes générées');
