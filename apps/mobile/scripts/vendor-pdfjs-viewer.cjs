#!/usr/bin/env node
/* global console */

const { spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');
const process = require('node:process');

const ASSET_DIR = resolve(__dirname, '../assets/pdfjs');
const OUT_FILE = join(ASSET_DIR, 'pdf-viewer.json');
const LICENSE_FILE = join(ASSET_DIR, 'LICENSE');
const TEMPLATE_FILE = join(ASSET_DIR, 'viewer.template.html');
const WEB_DIR = resolve(__dirname, '../../web');
const EXPORT_LIST = /export\{([^}]*)\};?\s*$/;
const MODULE_END = /<\/script|<!--/i;
const SCRIPT_ELEMENT = /<script\b[^>]*>([\s\S]*?)<\/script(?:[\s/][^>]*)?>/gi;

function pdfjsDist() {
  const packageJson = require.resolve('pdfjs-dist/package.json', { paths: [WEB_DIR] });
  const root = dirname(packageJson);
  return {
    version: JSON.parse(readFileSync(packageJson, 'utf8')).version,
    build: join(root, 'legacy/build'),
    license: join(root, 'LICENSE'),
  };
}

function exportedAsGlobal(source) {
  const match = EXPORT_LIST.exec(source);
  if (!match) throw new Error('pdf.min.mjs no longer ends in a single export list');
  const members = match[1].split(',').map((entry) => {
    const [local, exported] = entry.trim().split(/\s+as\s+/);
    return exported ? `${exported}:${local}` : local;
  });
  if (!members.includes('getDocument')) {
    throw new Error('pdf.min.mjs no longer exports getDocument');
  }
  return `${source.slice(0, match.index)}globalThis.pdfjsLib={${members.join(',')}};`;
}

function assertEmbeddable(name, source) {
  if (MODULE_END.test(source)) {
    throw new Error(`${name} contains text that would end an inline script`);
  }
}

function assertParses(name, source) {
  const directory = mkdtempSync(join(tmpdir(), 'pdfjs-viewer-'));
  try {
    const file = join(directory, 'module.mjs');
    writeFileSync(file, source, 'utf8');
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`${name} is not a valid module:\n${check.stderr}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function buildPdfViewer() {
  const { version, build } = pdfjsDist();
  const worker = readFileSync(join(build, 'pdf.worker.min.mjs'), 'utf8');
  const library = exportedAsGlobal(readFileSync(join(build, 'pdf.min.mjs'), 'utf8'));
  const template = readFileSync(TEMPLATE_FILE, 'utf8');
  const scriptBodies = Array.from(template.matchAll(SCRIPT_ELEMENT), (element) => element[1]);
  const viewer = (scriptBodies.at(-1) ?? '').trim();
  if (!viewer.startsWith('{') || viewer.includes('__PDFJS_')) {
    throw new Error('viewer.template.html lost its viewer script');
  }
  assertEmbeddable('pdf.worker.min.mjs', worker);
  assertEmbeddable('pdf.min.mjs', library);
  assertEmbeddable('viewer.template.html', viewer);
  assertParses('pdf.worker.min.mjs', worker);
  assertParses('pdf.min.mjs', library);
  assertParses('viewer.template.html', viewer);
  const html = template
    .replace('__PDFJS_WORKER__;', () => worker)
    .replace('__PDFJS_LIBRARY__;', () => library);
  return { pdfjsVersion: version, html };
}

function licenseText() {
  return readFileSync(pdfjsDist().license, 'utf8');
}

if (require.main === module) {
  const viewer = buildPdfViewer();
  const license = licenseText();
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf8')) : null;
    const currentLicense = existsSync(LICENSE_FILE) ? readFileSync(LICENSE_FILE, 'utf8') : null;
    if (JSON.stringify(current) !== JSON.stringify(viewer) || currentLicense !== license) {
      console.error('assets/pdfjs is outdated; run scripts/vendor-pdfjs-viewer.cjs');
      process.exitCode = 1;
    } else {
      console.log('assets/pdfjs is current');
    }
  } else {
    writeFileSync(OUT_FILE, `${JSON.stringify(viewer, null, 2)}\n`, 'utf8');
    writeFileSync(LICENSE_FILE, license, 'utf8');
    console.log(`wrote assets/pdfjs for pdfjs-dist ${viewer.pdfjsVersion}`);
  }
}

module.exports = { buildPdfViewer, OUT_FILE };
