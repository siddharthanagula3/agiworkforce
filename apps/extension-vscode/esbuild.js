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
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  treeShaking: true,
  banner: {
    js: isProduction ? '' : '// AGI Workforce VS Code Extension (dev build)',
  },
  logLevel: 'info',
  mainFields: ['main', 'module'],
};

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

const CODICON_ASSETS = ['codicon.css', 'codicon.ttf'];

function copyCodiconAssets() {
  const codiconSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist');
  const codiconDst = path.join(__dirname, 'out', 'codicons');
  fs.mkdirSync(codiconDst, { recursive: true });
  for (const file of CODICON_ASSETS) {
    const src = path.join(codiconSrc, file);
    if (!fs.existsSync(src)) {
      throw new Error(
        `[esbuild] missing ${path.relative(__dirname, src)}. The sidebar webview links ` +
          `out/codicons/codicon.css, so a build without it ships tofu glyphs. ` +
          `Run pnpm install to restore @vscode/codicons.`,
      );
    }
    fs.copyFileSync(src, path.join(codiconDst, file));
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
      console.log(`[esbuild] Build complete (${mode}), extension + webview render`);
    }
  } catch (/** @type {unknown} */ err) {
    console.error('[esbuild] Fatal build error:', err);
    process.exit(1);
  }
}

build();
