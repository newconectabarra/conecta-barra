#!/usr/bin/env node
/**
 * Gera o logotipo do Conecta Barra e todos os recursos de imagem do app (ícone, ícone adaptativo
 * do Android, splash azul, ícone de notificação, favicon).
 *
 * Roda automaticamente durante a compilação (script `eas-build-post-install` e `prebuild`),
 * sem nenhuma dependência externa (rasterizador próprio + PNG via zlib).
 *
 * NÃO sobrescreve assets/brand/prefeitura-logo.png se ele já existir: é onde fica o logotipo
 * oficial da Prefeitura de Barra do Piraí (versão 2026), que você deve copiar do portal/Secom.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve("assets/images");
const BRAND = path.resolve("assets/brand");
mkdirSync(OUT, { recursive: true });
mkdirSync(BRAND, { recursive: true });

// ---------- PNG ----------
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- Geometria (espaço 1024x1024) ----------
const NAVY = [6, 43, 94], BLUE = [11, 95, 216], SKY = [56, 166, 255], WHITE = [255, 255, 255];
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const gradient = (t) => (t < 0.5 ? lerp(NAVY, BLUE, t / 0.5) : lerp(BLUE, SKY, (t - 0.5) / 0.5));

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const PIN_KITE = [[512, 468], [323, 603], [512, 868], [701, 603]];
const inPin = (x, y) => inCircle(x, y, 512, 468, 232) || inPoly(x, y, PIN_KITE);
const inHole = (x, y) => inCircle(x, y, 512, 468, 142);
function inBridge(x, y) {
  // arco da ponte (Barra do Piraí é cidade ferroviária e de pontes sobre o Paraíba do Sul)
  const dx = x - 512, dy = y - 590, d = Math.hypot(dx, dy);
  if (Math.abs(d - 118) <= 12 && dy < -50) return true;
  if (y >= 530 && y <= 552 && x >= 388 && x <= 636) return true; // tabuleiro
  for (const hx of [458, 512, 566]) if (Math.abs(x - hx) <= 6 && y >= 470 && y <= 534) { const top = 590 - Math.sqrt(Math.max(0, 118 ** 2 - (hx - 512) ** 2)); if (y >= top) return true; }
  return false;
}

/** Desenha uma imagem `size`×`size` (ou w×h) com super-amostragem 3×3. */
function render(width, height, shader) {
  const buf = Buffer.alloc(width * height * 4);
  const SS = 3;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = shader((px + (sx + 0.5) / SS) / width, (py + (sy + 0.5) / SS) / height);
        if (c) { r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]; }
      }
      const o = (py * width + px) * 4, n = SS * SS;
      if (a > 0) { buf[o] = Math.round(r / a); buf[o + 1] = Math.round(g / a); buf[o + 2] = Math.round(b / a); buf[o + 3] = Math.round((a / n) * 255); }
    }
  }
  return buf;
}
/**
 * Remove um possível halo claro introduzido por redimensionamento/captura na
 * borda azul esquerda do ícone. A faixa fica fora da área segura do símbolo
 * branco; por isso a operação não altera o desenho central.
 */
function cleanBlueEdge(name, width, height, rgba) {
  if ((name !== "icon.png" && name !== "android-icon-background.png") || width !== 1024 || height !== 1024) return rgba;
  const x = 127; // x≈15/121, posição observada na referência do usuário
  const y0 = 398; // y≈49/126
  const y1 = 687; // y≈84/126
  for (let y = y0; y <= y1; y++) {
    const dst = (y * width + x) * 4;
    const src = (y * width + x + 1) * 4;
    // Copia a cor azul imediatamente vizinha e mantém o canal alfa opaco.
    rgba[dst] = rgba[src];
    rgba[dst + 1] = rgba[src + 1];
    rgba[dst + 2] = rgba[src + 2];
    rgba[dst + 3] = rgba[src + 3];
  }
  return rgba;
}

const save = (dir, name, w, h, shader) => {
  const rgba = cleanBlueEdge(name, w, h, render(w, h, shader));
  writeFileSync(path.join(dir, name), encodePng(w, h, rgba));
  console.log(`[brand] ${path.relative(process.cwd(), path.join(dir, name))} (${w}×${h})`);
};

/** Marca (pin + ponte) numa escala/posição, em coordenadas normalizadas u,v (0–1). */
function mark(u, v, { scale = 1, cx = 0.5, cy = 0.5, hole = "blue" } = {}) {
  const x = ((u - cx) / scale + 0.5) * 1024, y = ((v - cy) / scale + 0.5) * 1024;
  if (!inPin(x, y)) return null;
  if (inHole(x, y)) {
    if (inBridge(x, y)) return [...WHITE, 1];
    return hole === "cut" ? null : [...gradient(0.42), 1];
  }
  return [...WHITE, 1];
}
const bgGradient = (u, v) => gradient(Math.min(1, Math.max(0, (u * 0.45 + v * 0.75) / 1.1)));

// ---------- Saídas ----------
// Ícone clássico (iOS/Play Store/web)
save(OUT, "icon.png", 1024, 1024, (u, v) => {
  const m = mark(u, v, { scale: 0.86, cy: 0.5 });
  if (m) return m;
  return [...bgGradient(u, v), 1];
});
// Android adaptativo: fundo + frente (zona segura ≈ 66%)
save(OUT, "android-icon-background.png", 1024, 1024, (u, v) => [...bgGradient(u, v), 1]);
save(OUT, "android-icon-foreground.png", 1024, 1024, (u, v) => mark(u, v, { scale: 0.64 }));
save(OUT, "android-icon-monochrome.png", 1024, 1024, (u, v) => { const m = mark(u, v, { scale: 0.64, hole: "cut" }); return m ? [0, 0, 0, 1] : null; });
// Splash azul → azul claro (retrato), marca ao centro
save(OUT, "splash.png", 1080, 1920, (u, v) => {
  const m = mark((u - 0.5) * (1080 / 1920) * 1.0 + 0.5, (v - 0.46) * 1 + 0.5, { scale: 0.42 });
  if (m) return m;
  return [...gradient(Math.min(1, v * 0.9 + u * 0.15)), 1];
});
save(OUT, "splash-icon.png", 1024, 1024, (u, v) => mark(u, v, { scale: 0.6 }));
save(OUT, "favicon.png", 96, 96, (u, v) => (inRoundRect(u, v, 0, 0, 1, 1, 0.22) ? mark(u, v, { scale: 0.86 }) ?? [...bgGradient(u, v), 1] : null));
// Ícone de notificação do Android: somente silhueta (o sistema pinta de branco/tinta)
save(OUT, "notification-icon.png", 96, 96, (u, v) => (mark(u, v, { scale: 0.92, hole: "cut" }) ? [255, 255, 255, 1] : null));

// Logotipo da Prefeitura: só cria um MARCADOR se ainda não houver o arquivo oficial.
const prefeitura = path.join(BRAND, "prefeitura-logo.png");
if (!existsSync(prefeitura)) {
  save(BRAND, "prefeitura-logo.png", 512, 512, (u, v) => {
    if (!inRoundRect(u, v, 0.04, 0.04, 0.96, 0.96, 0.18)) return null;
    const x = u * 512, y = v * 512;
    if (inPoly(x, y, [[256, 96], [112, 190], [400, 190]])) return [...NAVY, 1];
    for (const cx of [140, 208, 276, 344]) if (x >= cx - 18 && x <= cx + 18 && y >= 206 && y <= 340) return [...BLUE, 1];
    if (x >= 96 && x <= 416 && y >= 352 && y <= 384) return [...NAVY, 1];
    if (x >= 80 && x <= 432 && y >= 394 && y <= 418) return [...SKY, 1];
    return [255, 255, 255, 1];
  });
  console.warn("[brand] ⚠ Usando MARCADOR do logotipo da Prefeitura. Substitua assets/brand/prefeitura-logo.png pelo arquivo oficial 2026.");
} else {
  console.log("[brand] assets/brand/prefeitura-logo.png oficial preservado.");
}
