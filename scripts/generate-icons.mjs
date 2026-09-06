#!/usr/bin/env node
/**
 * Generate extension icons (16, 32, 48, 128, 512) from wb-logo design.
 * Uses macOS `sips` or falls back to pure Node.js canvas/SDF rasterization.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICONS_DIR = join(ROOT, 'public/icons');
const MASTER_SVG = join(ICONS_DIR, 'logo.svg');

const SVG_16 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#368af0"/>
      <stop offset="100%" stop-color="#2168d6"/>
    </linearGradient>
  </defs>
  <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" fill="url(#bg)"/>
  <g fill="none" stroke="#ffffff" stroke-width="1.3" stroke-linejoin="round">
    <rect x="2" y="3" width="12" height="10" rx="1.25"/>
    <path d="M6 3v10 M2 6.5h4"/>
  </g>
</svg>`;

const SVG_32 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#368af0"/>
      <stop offset="100%" stop-color="#2168d6"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="30" height="30" rx="7" fill="url(#bg)"/>
  <rect x="1" y="1" width="30" height="15" rx="7" fill="url(#shine)"/>
  <g fill="none" stroke="#ffffff" stroke-width="2.25" stroke-linejoin="round">
    <rect x="5.5" y="7" width="21" height="18" rx="2.5"/>
    <path d="M12 7v18 M5.5 13h6.5"/>
  </g>
</svg>`;

function hasSips() {
  try {
    execFileSync('which', ['sips'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// CRC32 table for pure-JS PNG encoder fallback
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crcBuf]);
}

function encodePng(width, height, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makePngChunk('IHDR', ihdr);

  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    scanlines[y * (1 + width * 4)] = 0; // Filter None
    rgbaBuffer.copy(
      scanlines,
      y * (1 + width * 4) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }
  const idatChunk = makePngChunk('IDAT', zlib.deflateSync(scanlines));
  const iendChunk = makePngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Analytical subpixel rasterizer fallback for wb-logo at any size.
 */
function renderWbLogoFallback(size) {
  const buf = Buffer.alloc(size * size * 4, 0);

  // Colors: top #368af0 (54, 138, 240), bottom #2168d6 (33, 104, 214)
  const cTop = [54, 138, 240];
  const cBot = [33, 104, 214];

  // Tile dimensions
  const pad = Math.max(0.5, size * (4 / 128));
  const r = size * (28 / 128);
  const tileMin = pad;
  const tileMax = size - pad;

  // Icon geometry
  const iconW = size * (80 / 128);
  const iconH = size * (68 / 128);
  const iconX0 = (size - iconW) / 2;
  const iconX1 = iconX0 + iconW;
  const iconY0 = (size - iconH) / 2;
  const iconY1 = iconY0 + iconH;
  const iconR = size * (8 / 128);
  const strokeW = Math.max(1.2, size * (8 / 128));
  const halfStroke = strokeW / 2;
  const splitX = iconX0 + iconW * (25 / 80);
  const splitY = iconY0 + iconH * (20 / 68);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // 4x4 supersampling for antialiasing
      let tileAlpha = 0;
      let iconAlpha = 0;
      let gradR = 0, gradG = 0, gradB = 0;

      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const x = px + (sx + 0.5) / 4;
          const y = py + (sy + 0.5) / 4;

          // SDF to rounded tile
          const qx = Math.abs(x - size / 2) - (size / 2 - pad - r);
          const qy = Math.abs(y - size / 2) - (size / 2 - pad - r);
          const dTile = (Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) ** 0.5 + Math.min(Math.max(qx, qy), 0) - r;

          if (dTile <= 0) {
            tileAlpha++;
            const t = Math.max(0, Math.min(1, (y - tileMin) / (tileMax - tileMin)));
            let rCol = cTop[0] + (cBot[0] - cTop[0]) * t;
            let gCol = cTop[1] + (cBot[1] - cTop[1]) * t;
            let bCol = cTop[2] + (cBot[2] - cTop[2]) * t;

            // Specular top shine
            if (y < tileMin + (tileMax - tileMin) * 0.5) {
              const st = 1 - (y - tileMin) / ((tileMax - tileMin) * 0.5);
              const shine = st * 0.16;
              rCol = rCol + (255 - rCol) * shine;
              gCol = gCol + (255 - gCol) * shine;
              bCol = bCol + (255 - bCol) * shine;
            }

            gradR += rCol;
            gradG += gCol;
            gradB += bCol;
          }

          // SDF to workbench icon
          if (dTile <= 0) {
            // Distance to outer rect border
            const iqx = Math.abs(x - (iconX0 + iconW / 2)) - (iconW / 2 - iconR);
            const iqy = Math.abs(y - (iconY0 + iconH / 2)) - (iconH / 2 - iconR);
            const dOuter = (Math.max(iqx, 0) ** 2 + Math.max(iqy, 0) ** 2) ** 0.5 + Math.min(Math.max(iqx, iqy), 0) - iconR;
            const dFrame = Math.abs(dOuter) - halfStroke;

            // Vertical divider
            let dVert = 1e9;
            if (y >= iconY0 && y <= iconY1) {
              dVert = Math.abs(x - splitX) - halfStroke;
            }

            // Horizontal divider (left portion only)
            let dHoriz = 1e9;
            if (x >= iconX0 && x <= splitX) {
              dHoriz = Math.abs(y - splitY) - halfStroke;
            }

            const dIcon = Math.min(dFrame, dVert, dHoriz);
            if (dIcon <= 0) {
              iconAlpha++;
            }
          }
        }
      }

      if (tileAlpha > 0) {
        const tA = tileAlpha / 16;
        const iA = iconAlpha / 16;
        const bgR = gradR / tileAlpha;
        const bgG = gradG / tileAlpha;
        const bgB = gradB / tileAlpha;

        // Composite white icon over gradient
        const finalR = Math.round(bgR * (1 - iA) + 255 * iA);
        const finalG = Math.round(bgG * (1 - iA) + 255 * iA);
        const finalB = Math.round(bgB * (1 - iA) + 255 * iA);
        const finalA = Math.round(tA * 255);

        const idx = (py * size + px) * 4;
        buf[idx] = finalR;
        buf[idx + 1] = finalG;
        buf[idx + 2] = finalB;
        buf[idx + 3] = finalA;
      }
    }
  }

  return encodePng(size, size, buf);
}

function main() {
  mkdirSync(ICONS_DIR, { recursive: true });
  const useSips = hasSips();

  const sizes = [
    { size: 16, name: 'icon16.png', svg: SVG_16 },
    { size: 32, name: 'icon32.png', svg: SVG_32 },
    { size: 48, name: 'icon48.png', svg: null },
    { size: 128, name: 'icon128.png', svg: null },
    { size: 512, name: 'logo-512.png', svg: null },
  ];

  for (const { size, name, svg } of sizes) {
    const dest = join(ICONS_DIR, name);
    let done = false;

    if (useSips) {
      try {
        let svgSource = MASTER_SVG;
        let tempSvg = null;
        if (svg) {
          tempSvg = join(ICONS_DIR, `temp-${size}.svg`);
          writeFileSync(tempSvg, svg, 'utf8');
          svgSource = tempSvg;
        }

        execFileSync(
          'sips',
          ['-s', 'format', 'png', '-z', String(size), String(size), svgSource, '--out', dest],
          { stdio: 'ignore' }
        );

        if (tempSvg && existsSync(tempSvg)) {
          unlinkSync(tempSvg);
        }
        done = true;
        console.log(`[sips] generated ${name} (${size}x${size})`);
      } catch (err) {
        console.warn(`sips failed for ${name}, using fallback:`, err.message);
      }
    }

    if (!done) {
      const pngBuffer = renderWbLogoFallback(size);
      writeFileSync(dest, pngBuffer);
      console.log(`[fallback] generated ${name} (${size}x${size})`);
    }
  }

  console.log('All icons generated successfully!');
}

main();
