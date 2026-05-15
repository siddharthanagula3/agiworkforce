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

function copyCodiconAssets() {
  const codiconSrc = path.join(__dirname, 'node_modules', '@vscode', 'codicons', 'dist');
  const codiconDst = path.join(__dirname, 'out', 'codicons');
  if (!fs.existsSync(codiconSrc)) return;
  fs.mkdirSync(codiconDst, { recursive: true });
  for (const file of fs.readdirSync(codiconSrc)) {
    fs.copyFileSync(path.join(codiconSrc, file), path.join(codiconDst, file));
  }
}

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('[esbuild] Watching for changes…');
    } else {
      const result = await esbuild.build(buildOptions);
      if (result.errors.length > 0) {
        console.error('[esbuild] Build failed with errors:');
        result.errors.forEach((e) => console.error(e));
        process.exit(1);
      }
      copyCodiconAssets();
      const mode = isProduction ? 'production' : 'development';
      console.log(`[esbuild] Build complete (${mode})`);
    }
  } catch (/** @type {unknown} */ err) {
    console.error('[esbuild] Fatal build error:', err);
    process.exit(1);
  }
}

build();
