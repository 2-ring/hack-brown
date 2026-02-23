// Generates browser-specific manifests from base.json.
// Usage: node --loader ts-node/esm manifest/build.ts chrome|firefox|safari

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = JSON.parse(readFileSync(resolve(__dirname, 'base.json'), 'utf-8'));

type Browser = 'chrome' | 'firefox' | 'safari';

function buildManifest(browser: Browser): Record<string, any> {
  switch (browser) {
    case 'chrome':
      return {
        ...base,
        permissions: [...base.permissions, 'notifications', 'sidePanel'],
        background: {
          service_worker: 'background.js',
          type: 'module',
        },
        side_panel: {
          default_path: 'sidebar/sidebar.html',
        },
      };

    case 'firefox':
      return {
        ...base,
        permissions: [...base.permissions, 'notifications'],
        background: {
          scripts: ['background.js'],
          type: 'module',
        },
        sidebar_action: {
          default_panel: 'sidebar/sidebar.html',
          default_title: 'DropCal',
        },
        browser_specific_settings: {
          gecko: {
            id: 'dropcal@dropcal.ai',
            strict_min_version: '121.0',
          },
        },
      };

    case 'safari':
      return {
        ...base,
        // Safari lacks chrome.notifications — omit from permissions
        background: {
          service_worker: 'background.js',
        },
        // No side_panel or sidebar_action — uses popup window fallback
      };
  }
}

// CLI entry point
const target = process.argv[2] as Browser;
if (!target || !['chrome', 'firefox', 'safari'].includes(target)) {
  console.error('Usage: node manifest/build.js <chrome|firefox|safari>');
  process.exit(1);
}

const manifest = buildManifest(target);
const outPath = process.argv[3] || 'dist/manifest.json';
writeFileSync(resolve(process.cwd(), outPath), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest written for ${target} → ${outPath}`);
