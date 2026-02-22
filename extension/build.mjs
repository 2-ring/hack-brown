import * as esbuild from 'esbuild';
import { copyFileSync, readdirSync } from 'fs';
import { join } from 'path';

const isWatch = process.argv.includes('--watch');

// Copy static assets (CSS, HTML) from source dirs to dist
function copyStaticAssets() {
  const dirs = ['popup', 'sidebar'];
  const exts = ['.css', '.html'];
  for (const dir of dirs) {
    for (const file of readdirSync(dir)) {
      if (exts.some(ext => file.endsWith(ext))) {
        copyFileSync(join(dir, file), join('dist', dir, file));
      }
    }
  }
}

const commonOptions = {
  bundle: true,
  target: 'chrome120',
  format: 'esm',
  sourcemap: true,
  minify: !isWatch,
};

async function run() {
  const bgCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['background.ts'],
    outfile: 'dist/background.js',
  });

  const popupCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['popup/popup.ts'],
    outfile: 'dist/popup/popup.js',
  });

  const contentCtx = await esbuild.context({
    ...commonOptions,
    format: 'iife', // Content scripts can't be ES modules
    entryPoints: ['content.ts'],
    outfile: 'dist/content.js',
  });

  const sidebarCtx = await esbuild.context({
    ...commonOptions,
    entryPoints: ['sidebar/sidebar.ts'],
    outfile: 'dist/sidebar/sidebar.js',
  });

  if (isWatch) {
    await Promise.all([bgCtx.watch(), popupCtx.watch(), contentCtx.watch(), sidebarCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([bgCtx.rebuild(), popupCtx.rebuild(), contentCtx.rebuild(), sidebarCtx.rebuild()]);
    await Promise.all([bgCtx.dispose(), popupCtx.dispose(), contentCtx.dispose(), sidebarCtx.dispose()]);
    copyStaticAssets();
    console.log('Build complete.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
