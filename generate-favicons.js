#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const BRAND_COLOR = '#1170C5';

// Icon sizes with minimal padding (only to prevent browser warping)
const iconConfigs = [
  { size: 16, padding: 0, name: 'favicon-16x16' },       // 0px - max size
  { size: 32, padding: 0, name: 'favicon-32x32' },       // 0px - max size
  { size: 48, padding: 0, name: 'favicon-48x48' },       // 0px - max size
  { size: 180, padding: 0.01, name: 'apple-touch-icon' }, // ~2px
  { size: 192, padding: 0.01, name: 'android-chrome-192x192' }, // ~2px
  { size: 512, padding: 0.01, name: 'android-chrome-512x512' }, // ~5px
];

// Generate SVG for each size with padding and brand color
function generatePaddedSVG(size, paddingRatio) {
  const padding = Math.floor(size * paddingRatio);
  const innerSize = size - (padding * 2);
  const scale = innerSize / 256;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${padding}, ${padding}) scale(${scale})">
    <path fill="${BRAND_COLOR}" d="M174,47.75a254.19,254.19,0,0,0-41.45-38.3,8,8,0,0,0-9.18,0A254.19,254.19,0,0,0,82,47.75C54.51,79.32,40,112.6,40,144a88,88,0,0,0,176,0C216,112.6,201.49,79.32,174,47.75Zm9.85,105.59a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68Z"/>
  </g>
</svg>`;
}

async function generateIcons() {
  console.log('🎨 Generating favicons with brand color ' + BRAND_COLOR + '\n');

  const publicDir = path.join(__dirname, 'frontend', 'public');

  for (const config of iconConfigs) {
    const { size, padding, name } = config;
    const svg = generatePaddedSVG(size, padding);

    // Convert to PNG with transparent background
    const pngPath = path.join(publicDir, `${name}.png`);
    await sharp(Buffer.from(svg))
      .png({ quality: 100, compressionLevel: 9 })
      .toFile(pngPath);

    const paddingPx = Math.floor(size * padding);
    console.log(`✓ ${name}.png (${size}x${size}, ${paddingPx}px padding)`);
  }

  // Generate multi-size favicon.ico (32x32 for best quality)
  console.log('\n🔧 Generating favicon.ico...');
  const svg32 = generatePaddedSVG(32, 0);
  const icoPath = path.join(publicDir, 'favicon.ico');
  await sharp(Buffer.from(svg32))
    .resize(32, 32)
    .png()
    .toFile(icoPath);
  console.log('✓ favicon.ico (32x32, max size)');

  // Save logo.svg (no padding, just brand color)
  const logoSVG = generatePaddedSVG(256, 0);
  const logoPath = path.join(publicDir, 'logo.svg');
  fs.writeFileSync(logoPath, logoSVG);
  console.log('\n✓ logo.svg (256x256, no padding)');

  console.log('\n✅ All favicons generated successfully!');
  console.log(`📁 Output directory: ${publicDir}`);
}

generateIcons().catch(console.error);
