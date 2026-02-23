import * as esbuild from 'esbuild';
import { copyFileSync, readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isWatch = process.argv.includes('--watch');

// Parse --browser flag (default: chrome)
const browserArg = process.argv.find(a => a.startsWith('--browser='));
const browser = browserArg ? browserArg.split('=')[1] : 'chrome';

if (!['chrome', 'firefox', 'safari'].includes(browser)) {
  console.error('Invalid --browser value. Must be chrome, firefox, or safari.');
  process.exit(1);
}

const outDir = `dist-${browser}`;

// Build the browser-specific manifest from base.json
function buildManifest() {
  const base = JSON.parse(readFileSync(resolve(__dirname, 'manifest/base.json'), 'utf-8'));

  let manifest;
  switch (browser) {
    case 'chrome':
      manifest = {
        ...base,
        permissions: [...base.permissions, 'notifications', 'sidePanel'],
        background: { service_worker: 'background.js', type: 'module' },
        side_panel: { default_path: 'sidebar/sidebar.html' },
      };
      break;
    case 'firefox':
      manifest = {
        ...base,
        permissions: [...base.permissions, 'notifications'],
        background: { scripts: ['background.js'], type: 'module' },
        sidebar_action: { default_panel: 'sidebar/sidebar.html', default_title: 'DropCal' },
        browser_specific_settings: {
          gecko: { id: 'dropcal@dropcal.ai', strict_min_version: '121.0' },
        },
      };
      break;
    case 'safari':
      manifest = {
        ...base,
        background: { service_worker: 'background.js' },
      };
      break;
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}

// Copy static assets (CSS, HTML, icons, fonts) to output dir
function copyStaticAssets() {
  const dirs = ['popup', 'sidebar'];
  const exts = ['.css', '.html'];
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      if (exts.some(ext => file.endsWith(ext))) {
        copyFileSync(join(dir, file), join(outDir, dir, file));
      }
    }
  }

  // Copy icons
  if (existsSync('icons')) {
    for (const file of readdirSync('icons')) {
      copyFileSync(join('icons', file), join(outDir, 'icons', file));
    }
  }

  // Copy fonts
  if (existsSync('fonts')) {
    for (const file of readdirSync('fonts')) {
      copyFileSync(join('fonts', file), join(outDir, 'fonts', file));
    }
  }
}

// esbuild target per browser
const targetMap = {
  chrome: 'chrome120',
  firefox: 'firefox121',
  safari: 'safari16.4',
};

const commonOptions = {
  bundle: true,
  target: targetMap[browser],
  format: 'esm',
  sourcemap: true,
  minify: !isWatch,
};

async function run() {
  // Ensure output directories exist
  for (const dir of [outDir, join(outDir, 'popup'), join(outDir, 'sidebar'), join(outDir, 'icons'), join(outDir, 'fonts')]) {
    mkdirSync(dir, { recursive: true });
  }

  const bgCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['background.ts'],
    outfile: join(outDir, 'background.js'),
  });

  const popupCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['popup/popup.ts'],
    outfile: join(outDir, 'popup/popup.js'),
  });

  const contentCtx = await esbuild.context({
    ...commonOptions,
    format: 'iife', // Content scripts can't be ES modules
    entryPoints: ['content.ts'],
    outfile: join(outDir, 'content.js'),
  });

  const sidebarCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['sidebar/sidebar.ts'],
    outfile: join(outDir, 'sidebar/sidebar.js'),
  });

  if (isWatch) {
    buildManifest();
    copyStaticAssets();
    await Promise.all([bgCtx.watch(), popupCtx.watch(), contentCtx.watch(), sidebarCtx.watch()]);
    console.log(`Watching for changes (${browser})...`);
  } else {
    await Promise.all([bgCtx.rebuild(), popupCtx.rebuild(), contentCtx.rebuild(), sidebarCtx.rebuild()]);
    await Promise.all([bgCtx.dispose(), popupCtx.dispose(), contentCtx.dispose(), sidebarCtx.dispose()]);
    buildManifest();
    copyStaticAssets();
    console.log(`Build complete (${browser}) → ${outDir}/`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
