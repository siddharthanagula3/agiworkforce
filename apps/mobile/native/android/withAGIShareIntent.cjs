
const { withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-share-intent-plugin';
const PLUGIN_VERSION = '1.0.0';

const PATCH_MARKER = 'rewriteShareIntent';

const IMPORTS = ['import android.content.Intent', 'import android.net.Uri'];

const COMPANION_AND_METHODS = `
  companion object {
    // Mirrors MAX_SHARED_BYTES (100 KB) in src/features/share-preview — the JS
    // side re-enforces the byte cap; this just keeps the rewritten URI bounded.
    private const val MAX_SHARED_TEXT_CHARS = 100 * 1024
  }

  override fun onNewIntent(intent: Intent) {
    val rewritten = rewriteShareIntent(intent)
    setIntent(rewritten)
    super.onNewIntent(rewritten)
  }

  /**
   * RN's Linking module only surfaces intent data URIs — for ACTION_SEND the
   * payload lives in EXTRA_TEXT (data is null) and for ACTION_PROCESS_TEXT in
   * EXTRA_PROCESS_TEXT, so shares never reached JS. Rewrite both onto the
   * app's existing deep-link seam (agiworkforce://intent/share?text=…) so the
   * intent-verb handler in app/_layout.tsx receives them like any other verb.
   * The \`ts\` param makes repeat shares of identical text produce distinct
   * URLs, so the JS url-change effect re-fires.
   */
  private fun rewriteShareIntent(intent: Intent): Intent {
    val text: String? = when (intent.action) {
      Intent.ACTION_SEND ->
        if (intent.type?.startsWith("text/") == true) intent.getStringExtra(Intent.EXTRA_TEXT) else null
      Intent.ACTION_PROCESS_TEXT ->
        intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
      else -> null
    }
    if (text.isNullOrBlank()) {
      return intent
    }
    val uri = Uri.Builder()
      .scheme("agiworkforce")
      .authority("intent")
      .path("share")
      .appendQueryParameter("text", text.take(MAX_SHARED_TEXT_CHARS))
      .appendQueryParameter("ts", System.currentTimeMillis().toString())
      .build()
    return Intent(Intent.ACTION_VIEW, uri).setPackage(packageName)
  }
`;

const ON_CREATE_REWRITE = '    intent?.let { setIntent(rewriteShareIntent(it)) }\n';

function patchMainActivity(contents) {
  if (contents.includes(PATCH_MARKER)) return contents;

  let out = contents;

  const missingImports = IMPORTS.filter((imp) => !out.includes(imp));
  if (missingImports.length > 0) {
    const firstImport = out.match(/^import .*$/m);
    if (!firstImport) {
      throw new Error(`${PLUGIN_NAME}: MainActivity.kt has no import block to anchor on`);
    }
    out = out.replace(firstImport[0], `${firstImport[0]}\n${missingImports.join('\n')}`);
  }

  const superOnCreate = out.match(/^(\s*)super\.onCreate\([^)]*\)/m);
  if (!superOnCreate) {
    throw new Error(`${PLUGIN_NAME}: could not find super.onCreate(...) in MainActivity.kt`);
  }
  out = out.replace(superOnCreate[0], `${ON_CREATE_REWRITE}${superOnCreate[0]}`);

  const anchor = out.match(/^[\t ]*\/\*\*[\s\S]*?\*\/\s*^[\t ]*override fun getMainComponentName/m)
    ? out.match(/^[\t ]*\/\*\*[\s\S]*?\*\/\s*(?=^[\t ]*override fun getMainComponentName)/m)
    : out.match(/^[\t ]*(?=override fun getMainComponentName)/m);
  if (!anchor) {
    throw new Error(`${PLUGIN_NAME}: could not find getMainComponentName in MainActivity.kt`);
  }
  out = out.replace(anchor[0], `${COMPANION_AND_METHODS}\n${anchor[0]}`);

  return out;
}

function withShareIntentMainActivity(config) {
  return withDangerousMod(config, [
    'android',
    async (c) => {
      const mainActivityPath = path.join(
        c.modRequest.projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'agiworkforce',
        'app',
        'MainActivity.kt',
      );
      if (!fs.existsSync(mainActivityPath)) {
        throw new Error(`${PLUGIN_NAME}: MainActivity.kt not found at ${mainActivityPath}`);
      }
      const contents = fs.readFileSync(mainActivityPath, 'utf8');
      fs.writeFileSync(mainActivityPath, patchMainActivity(contents));
      return c;
    },
  ]);
}

module.exports = createRunOncePlugin(withShareIntentMainActivity, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.patchMainActivity = patchMainActivity;
