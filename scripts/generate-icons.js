import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = createCRC32Table();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(4 + 4 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crcData = buf.subarray(4, 8 + len);
  buf.writeUInt32BE(crc32(crcData), 8 + len);
  return buf;
}

function encodeRGBAtoPNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // RGBA color type
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  let srcOffset = 0;
  let dstOffset = 0;

  for (let y = 0; y < height; y++) {
    scanlines[dstOffset++] = 0; // filter byte: none
    for (let x = 0; x < width; x++) {
      scanlines[dstOffset++] = rgbaBuffer[srcOffset++];
      scanlines[dstOffset++] = rgbaBuffer[srcOffset++];
      scanlines[dstOffset++] = rgbaBuffer[srcOffset++];
      scanlines[dstOffset++] = rgbaBuffer[srcOffset++];
    }
  }

  const compressed = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Draws the Geometric Phi (Φ) Logo into an RGBA pixel buffer
 */
function renderPheroPhiIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.28;
  const strokeWidth = Math.max(1.5, size * 0.09);
  const halfStroke = strokeWidth / 2;

  // Background: dark rounded rectangle or deep matte circle
  const bgRadius = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Distance from center for rounded container
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const cornerDx = Math.max(0, dx - (size / 2 - bgRadius));
      const cornerDy = Math.max(0, dy - (size / 2 - bgRadius));
      const cornerDist = Math.sqrt(cornerDx * cornerDx + cornerDy * cornerDy);

      let inBg = cornerDist <= bgRadius;

      if (!inBg) {
        // Transparent outside rounded container
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
        continue;
      }

      // Base background color: #09090B
      let r = 9;
      let g = 9;
      let b = 11;
      let a = 255;

      // Subtle border for container
      if (cornerDist > bgRadius - 1.2 || dx > size / 2 - 1.2 || dy > size / 2 - 1.2) {
        r = 35;
        g = 35;
        b = 38;
      }

      // Check if pixel is on Phi Circle
      const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const onCircle = Math.abs(distFromCenter - radius) <= halfStroke;

      // Check if pixel is on Vertical Meridian Axis
      const onLine = Math.abs(x - cx) <= halfStroke && y >= size * 0.12 && y <= size * 0.88;

      if (onCircle || onLine) {
        // PHERO Electric Indigo Accent (#3B82F6) / Crisp White (#F4F4F6)
        r = 59;
        g = 130;
        b = 246;
        a = 255;
      }

      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  return encodeRGBAtoPNG(size, heightOrWidth(size), buffer);
}

function heightOrWidth(s) {
  return s;
}

// Generate icons
const iconsDir = path.resolve('public/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const png = renderPheroPhiIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), png);
  console.log(`Generated icon-${size}.png (${size}x${size})`);
}

// Also create vector SVG icon
const svgContent = `<svg width="128" height="128" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="5" fill="#09090B"/>
  <rect x="0.5" y="0.5" width="23" height="23" rx="4.5" stroke="#232326"/>
  <line x1="12" y1="3" x2="12" y2="21" stroke="#3B82F6" stroke-width="2.2" stroke-linecap="round"/>
  <circle cx="12" cy="12" r="6.6" stroke="#3B82F6" stroke-width="2.2"/>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent);
console.log('Generated icon.svg');
