package com.agiworkforce.app.native

import com.facebook.react.bridge.*
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import kotlinx.coroutines.*

// Android translation via ML Kit on-device Translation.
// Add to android/app/build.gradle:
//   implementation 'com.google.mlkit:translate:17.0.3'
//
// ML Kit translate is fully on-device once the language model is downloaded.
// BCP-47 tags are mapped to ML Kit's TranslateLanguage constants.
class AGITranslateModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), CoroutineScope {

  private val job = SupervisorJob()
  override val coroutineContext = Dispatchers.IO + job

  companion object {
    const val MODULE_NAME = "AGITranslate"

    // Subset of ML Kit language tags for our supported pairs.
    // ML Kit uses two-letter BCP-47 codes matching TranslateLanguage constants.
    fun bcp47ToMlKit(tag: String): String? = when (tag.lowercase().take(2)) {
      "en" -> TranslateLanguage.ENGLISH
      "hi" -> TranslateLanguage.HINDI
      "es" -> TranslateLanguage.SPANISH
      "fr" -> TranslateLanguage.FRENCH
      "de" -> TranslateLanguage.GERMAN
      "ja" -> TranslateLanguage.JAPANESE
      "ko" -> TranslateLanguage.KOREAN
      "zh" -> TranslateLanguage.CHINESE
      "ar" -> TranslateLanguage.ARABIC
      "pt" -> TranslateLanguage.PORTUGUESE
      else -> null
    }
  }

  override fun getName() = MODULE_NAME

  @ReactMethod
  fun translate(
    text: String,
    sourceLanguage: String,
    targetLanguage: String,
    promise: Promise
  ) {
    val srcTag = bcp47ToMlKit(sourceLanguage)
    val tgtTag = bcp47ToMlKit(targetLanguage)

    if (srcTag == null || tgtTag == null) {
      promise.reject("UNSUPPORTED_LANGUAGE", "Unsupported language pair: $sourceLanguage -> $targetLanguage")
      return
    }

    launch {
      try {
        val options = TranslatorOptions.Builder()
          .setSourceLanguage(srcTag)
          .setTargetLanguage(tgtTag)
          .build()
        val translator = Translation.getClient(options)

        // Download model if not present (blocks until ready; model ~30 MB).
        val conditions = DownloadConditions.Builder().build()
        Tasks.await(translator.downloadModelIfNeeded(conditions))

        val translated = Tasks.await(translator.translate(text))
        translator.close()

        val result = WritableNativeMap().apply {
          putString("translatedText", translated)
          putString("sourceLanguage", sourceLanguage)
          putString("targetLanguage", targetLanguage)
          putString("backend", "mlkit_translate")
        }
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("TRANSLATE_ERROR", e.message, e)
      }
    }
  }

  @ReactMethod
  fun isPairDownloaded(
    sourceLanguage: String,
    targetLanguage: String,
    promise: Promise
  ) {
    val srcTag = bcp47ToMlKit(sourceLanguage)
    val tgtTag = bcp47ToMlKit(targetLanguage)

    if (srcTag == null || tgtTag == null) {
      promise.resolve(false)
      return
    }

    launch {
      try {
        val options = TranslatorOptions.Builder()
          .setSourceLanguage(srcTag)
          .setTargetLanguage(tgtTag)
          .build()
        val translator = Translation.getClient(options)
        // Attempt download with no network -- if it fails, model isn't cached.
        val conditions = DownloadConditions.Builder().build()
        Tasks.await(translator.downloadModelIfNeeded(conditions))
        translator.close()
        promise.resolve(true)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  override fun onCatalystInstanceDestroy() {
    job.cancel()
    super.onCatalystInstanceDestroy()
  }
}
