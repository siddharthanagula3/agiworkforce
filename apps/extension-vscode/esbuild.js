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
  external: ['vscode', 'bufferutil', 'utf-8-validate'],
  sourcemap: !isProduction,
  minify: isProduction,
  treeShaking: true,
  banner: {
    js: isProduction ? '' : '// AGI Code (dev build)',
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

/** @type {import('esbuild').BuildOptions} */
const webviewEnhanceOptions = {
  entryPoints: { enhance: path.join(__dirname, 'src', 'webview', 'enhance.ts') },
  bundle: true,
  outdir: path.join(__dirname, 'out', 'webview', 'enhance'),
  chunkNames: 'chunk-[hash]',
  splitting: true,
  platform: 'browser',
  target: 'es2020',
  format: 'esm',
  sourcemap: !isProduction,
  minify: isProduction,
  treeShaking: true,
  logLevel: 'warning',
};

const KATEX_FALLBACK_FONT_SOURCES =
  /,url\(fonts\/[^)]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g;

function copyKatexAssets() {
  const katexDist = path.join(path.dirname(require.resolve('katex/package.json')), 'dist');
  const katexDst = path.join(__dirname, 'out', 'webview', 'katex');
  fs.mkdirSync(path.join(katexDst, 'fonts'), { recursive: true });
  const css = fs.readFileSync(path.join(katexDist, 'katex.min.css'), 'utf8');
  fs.writeFileSync(
    path.join(katexDst, 'katex.min.css'),
    css.replace(KATEX_FALLBACK_FONT_SOURCES, ''),
  );
  for (const font of fs.readdirSync(path.join(katexDist, 'fonts'))) {
    if (font.endsWith('.woff2')) {
      fs.copyFileSync(path.join(katexDist, 'fonts', font), path.join(katexDst, 'fonts', font));
    }
  }
}

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
    if (process.argv.includes('--tests')) {
      const testRoot = path.join(__dirname, 'src', 'test');
      const entryPoints = fs
        .readdirSync(testRoot, { recursive: true })
        .filter((entry) => entry.endsWith('.ts'))
        .map((entry) => path.join(testRoot, entry));
      await esbuild.build({
        entryPoints,
        outbase: testRoot,
        outdir: path.join(__dirname, 'out', 'test'),
        bundle: true,
        platform: 'node',
        target: 'node18',
        format: 'cjs',
        external: ['vscode', '@vscode/test-electron', 'mocha', 'glob'],
        sourcemap: true,
        logLevel: 'info',
      });
    } else if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      const webviewCtx = await esbuild.context(webviewOptions);
      const enhanceCtx = await esbuild.context(webviewEnhanceOptions);
      copyKatexAssets();
      await Promise.all([ctx.watch(), webviewCtx.watch(), enhanceCtx.watch()]);
      console.log('[esbuild] Watching for changes…');
    } else {
      const results = await Promise.all([
        esbuild.build(buildOptions),
        esbuild.build(webviewOptions),
        esbuild.build(webviewEnhanceOptions),
      ]);
      const errors = results.flatMap((result) => result.errors);
      if (errors.length > 0) {
        console.error('[esbuild] Build failed with errors:');
        errors.forEach((e) => console.error(e));
        process.exit(1);
      }
      copyCodiconAssets();
      copyKatexAssets();
      const mode = isProduction ? 'production' : 'development';
      console.log(`[esbuild] Build complete (${mode}), extension + webview render`);
    }
  } catch (/** @type {unknown} */ err) {
    console.error('[esbuild] Fatal build error:', err);
    process.exit(1);
  }
}

build();
