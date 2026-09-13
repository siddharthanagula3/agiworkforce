const { withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PLUGIN_NAME = 'agi-share-intent-plugin';
const PLUGIN_VERSION = '1.0.0';

const PATCH_MARKER = 'rewriteShareIntent';

const IMPORTS = [
  'import android.content.Intent',
  'import android.net.Uri',
  'import android.provider.OpenableColumns',
  'import java.io.File',
  'import org.json.JSONArray',
  'import org.json.JSONObject',
];

const COMPANION_AND_METHODS = `
  companion object {
    // Mirrors MAX_SHARED_BYTES (100 KB) in src/features/share-preview, the JS
    // side re-enforces the byte cap; this just keeps the rewritten URI bounded.
    private const val MAX_SHARED_TEXT_CHARS = 100 * 1024
    // Mirror maximumSharedFileBytes and maximumSharedFiles in the iOS share
    // extension; the composer re-validates every staged file.
    private const val MAX_SHARED_FILE_BYTES = 12L * 1024 * 1024
    private const val MAX_SHARED_FILES = 5
    private const val SHARED_INBOX_DIR = "shared-inbox"
    private const val SHARED_INBOX_TTL_MS = 24L * 60 * 60 * 1000
  }

  override fun onNewIntent(intent: Intent) {
    val rewritten = rewriteShareIntent(intent)
    setIntent(rewritten)
    super.onNewIntent(rewritten)
  }

  /**
   * RN's Linking module only surfaces intent data URIs, for ACTION_SEND the
   * payload lives in EXTRA_TEXT (data is null) and for ACTION_PROCESS_TEXT in
   * EXTRA_PROCESS_TEXT, so shares never reached JS. Rewrite both onto the
   * app's existing deep-link seam (agiworkforce://intent/share?text=…) so the
   * intent-verb handler in app/_layout.tsx receives them like any other verb.
   * The \`ts\` param makes repeat shares of identical text produce distinct
   * URLs, so the JS url-change effect re-fires.
   */
  private fun rewriteShareIntent(intent: Intent): Intent {
    val text: String? = when (intent.action) {
      Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE -> intent.getStringExtra(Intent.EXTRA_TEXT)
      Intent.ACTION_PROCESS_TEXT ->
        intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()
      else -> null
    }
    val files = copySharedStreams(intent)
    if (text.isNullOrBlank() && files.length() == 0) {
      return intent
    }
    val uri = Uri.Builder()
      .scheme("agiworkforce")
      .authority("intent")
      .path("share")
      .apply {
        if (!text.isNullOrBlank()) {
          appendQueryParameter("text", text.take(MAX_SHARED_TEXT_CHARS))
        }
        if (files.length() > 0) {
          appendQueryParameter("files", files.toString())
        }
      }
      .appendQueryParameter("ts", System.currentTimeMillis().toString())
      .build()
    return Intent(Intent.ACTION_VIEW, uri).setPackage(packageName)
  }

  /**
   * The read grant on a shared content:// URI belongs to this intent, so it is
   * gone by the time the rewritten deep link reaches JS. Copy the bytes into
   * the app's own cache here, while the grant still holds, and hand JS file://
   * URIs it can open, mirroring what the iOS extension does with the App Group.
   */
  private fun copySharedStreams(intent: Intent): JSONArray {
    val copied = JSONArray()
    val uris = sharedStreamUris(intent).take(MAX_SHARED_FILES)
    if (uris.isEmpty()) {
      return copied
    }
    val inbox = File(cacheDir, SHARED_INBOX_DIR)
    if (!inbox.exists() && !inbox.mkdirs()) {
      return copied
    }
    pruneSharedInbox(inbox)
    for (uri in uris) {
      val entry = copySharedStream(uri, inbox)
      if (entry != null) {
        copied.put(entry)
      }
    }
    return copied
  }

  @Suppress("DEPRECATION")
  private fun sharedStreamUris(intent: Intent): List<Uri> = when (intent.action) {
    Intent.ACTION_SEND -> listOfNotNull(intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri)
    Intent.ACTION_SEND_MULTIPLE ->
      intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.filterNotNull() ?: emptyList()
    else -> emptyList()
  }

  private fun copySharedStream(uri: Uri, inbox: File): JSONObject? {
    val fileName = sharedDisplayName(uri)
    val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
    val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
    val target = File(inbox, "\${System.currentTimeMillis()}-\${safeName}")
    val bytes = try {
      contentResolver.openInputStream(uri)?.use { input ->
        target.outputStream().use { output ->
          var total = 0L
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) break
            total += read
            if (total > MAX_SHARED_FILE_BYTES) return@use -1L
            output.write(buffer, 0, read)
          }
          total
        }
      }
    } catch (error: Exception) {
      null
    }
    if (bytes == null || bytes < 0L) {
      target.delete()
      return null
    }
    return JSONObject()
      .put("uri", Uri.fromFile(target).toString())
      .put("fileName", fileName)
      .put("mimeType", mimeType)
      .put("byteSize", bytes)
  }

  private fun sharedDisplayName(uri: Uri): String {
    if (uri.scheme == "file") {
      return uri.lastPathSegment ?: "shared-file"
    }
    val queried = try {
      contentResolver
        .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
          val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (index < 0 || !cursor.moveToFirst()) null else cursor.getString(index)
        }
    } catch (error: Exception) {
      null
    }
    return queried?.takeIf { it.isNotBlank() } ?: "shared-file"
  }

  private fun pruneSharedInbox(inbox: File) {
    val cutoff = System.currentTimeMillis() - SHARED_INBOX_TTL_MS
    inbox.listFiles()?.forEach { file ->
      if (file.lastModified() < cutoff) {
        file.delete()
      }
    }
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
