// esbuild.js — bundle the VS Code extension
// Run: node esbuild.js           (dev, with sourcemaps)
//      node esbuild.js --watch   (watch mode)
//      node esbuild.js --production (minified, no sourcemaps)

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [path.join(__dirname, 'src', 'extension.ts')],
  bundle: true,
  outfile: path.join(__dirname, 'out', 'extension.js'),
  // VS Code extensions run in Node.js, so the target is 'node'
  platform: 'node',
  // Target Node.js 18 (minimum for VS Code 1.95)
  target: 'node18',
  // CommonJS is required for VS Code extensions
  format: 'cjs',
  // 'vscode' is provided by VS Code at runtime — do not bundle it
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  // Tree-shake aggressively in production
  treeShaking: true,
  // Helps with debugging
  banner: {
    js: isProduction ? '' : '// AGI Workforce VS Code Extension (dev build)',
  },
  logLevel: 'info',
  // Suppress warnings for modules that reference node builtins
  mainFields: ['main', 'module'],
};

/**
 * Webview render bundle — markdown-it + DOMPurify, browser target.
 * Loaded by the webview HTML via a CSP-allowed <script src> tag. Exposes
 * `window.agiRender(markdown)` for the inline webview script to call.
 *
 * Audit findings F-02 / F-10: replaces the custom regex Markdown parser
 * + custom HTML sanitizer in webviewContent.ts:1066-1181.
 */
/** @type {import('esbuild').BuildOptions} */
const webviewOptions = {
  entryPoints: [path.join(__dirname, 'src', 'webview', 'render.ts')],
  bundle: true,
  outfile: path.join(__dirname, 'out', 'webview', 'render.js'),
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: !isProduction,
  minify: isProduction,
  treeShaking: true,
  logLevel: 'info',
};

function copyCodiconAssets() {
  const codiconSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist');
  const codiconDst = path.join(__dirname, 'out', 'codicons');
  if (!fs.existsSync(codiconSrc)) return;
  fs.mkdirSync(codiconDst, { recursive: true });
  // Only copy runtime assets (CSS + font); skip .html, .svg, .csv, .ts, .json reference files.
  for (const file of ['codicon.css', 'codicon.ttf']) {
    const src = path.join(codiconSrc, file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(codiconDst, file));
  }
}

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      const webviewCtx = await esbuild.context(webviewOptions);
      await Promise.all([ctx.watch(), webviewCtx.watch()]);
      console.log('[esbuild] Watching for changes…');
    } else {
      const [extResult, webviewResult] = await Promise.all([
        esbuild.build(buildOptions),
        esbuild.build(webviewOptions),
      ]);
      const errors = [...extResult.errors, ...webviewResult.errors];
      if (errors.length > 0) {
        console.error('[esbuild] Build failed with errors:');
        errors.forEach((e) => console.error(e));
        process.exit(1);
      }
      copyCodiconAssets();
      const mode = isProduction ? 'production' : 'development';
      console.log(`[esbuild] Build complete (${mode}) — extension + webview render`);
    }
  } catch (/** @type {unknown} */ err) {
    console.error('[esbuild] Fatal build error:', err);
    process.exit(1);
  }
}

build();
