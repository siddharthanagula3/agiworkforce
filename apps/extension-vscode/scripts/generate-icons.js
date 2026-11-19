#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TAURI_ICONS = path.resolve(__dirname, '../../../apps/desktop/src-tauri/icons');
const MEDIA_DIR = path.resolve(__dirname, '../media');

const copies = [
  { src: '128x128.png', dest: 'icon.png' },
  { src: '32x32.png', dest: 'icon-chat.png' },
];

const missing = copies
  .map(({ src }) => path.join(TAURI_ICONS, src))
  .filter((srcPath) => !fs.existsSync(srcPath));
if (missing.length > 0) {
  console.error(`Brand icon source missing, media/ left unchanged:\n${missing.join('\n')}`);
  process.exit(1);
}

fs.mkdirSync(MEDIA_DIR, { recursive: true });
for (const { src, dest } of copies) {
  fs.copyFileSync(path.join(TAURI_ICONS, src), path.join(MEDIA_DIR, dest));
  console.log(`Copied ${src} -> media/${dest}`);
}
