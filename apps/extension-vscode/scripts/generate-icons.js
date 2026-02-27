#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Copies brand icons from the desktop app's Tauri icons directory
 * into apps/extension-vscode/media/ for use by the VS Code extension.
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

const TAURI_ICONS = path.resolve(__dirname, '../../../apps/desktop/src-tauri/icons');
const MEDIA_DIR = path.resolve(__dirname, '../media');

fs.mkdirSync(MEDIA_DIR, { recursive: true });

const copies = [
  { src: '128x128.png', dest: 'icon.png' },
  { src: '32x32.png', dest: 'icon-chat.png' },
];

for (const { src, dest } of copies) {
  const srcPath = path.join(TAURI_ICONS, src);
  const destPath = path.join(MEDIA_DIR, dest);

  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${src} -> media/${dest}`);
  } else {
    console.warn(`Warning: ${srcPath} not found, creating 1x1 placeholder`);
    // Minimal valid 1x1 transparent PNG
    const placeholder = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    fs.writeFileSync(destPath, placeholder);
    console.log(`Created 1x1 placeholder -> media/${dest}`);
  }
}

console.log('Done.');
