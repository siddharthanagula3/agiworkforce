package com.agiworkforce.app.native

import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.*
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

// On-device OCR via ML Kit Text Recognition.
// No network calls. Latin script (English + 60+ languages) using bundled ML Kit.
// For CJK/Devanagari/Korean scripts, ML Kit automatically handles detection.
class AGIVisionOCR(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  companion object {
    const val MODULE_NAME = "AGIVisionOCR"
  }

  @ReactMethod
  fun recognizeText(imageUri: String, promise: Promise) {
    try {
      val uri = Uri.parse(imageUri)
      val path = uri.path ?: run {
        promise.reject("LOAD_ERROR", "Cannot parse URI: $imageUri")
        return
      }

      val file = File(path)
      if (!file.exists()) {
        promise.reject("LOAD_ERROR", "File not found: $path")
        return
      }

      val bitmap = BitmapFactory.decodeFile(path)
      if (bitmap == null) {
        promise.reject("LOAD_ERROR", "Cannot decode image at: $path")
        return
      }

      val image = InputImage.fromBitmap(bitmap, 0)
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

      recognizer.process(image)
        .addOnSuccessListener { visionText ->
          val lines = mutableListOf<String>()
          val regions = Arguments.createArray()

          for (block in visionText.textBlocks) {
            for (line in block.lines) {
              lines.add(line.text)
              val bb = line.boundingBox
              if (bb != null) {
                val regionMap = Arguments.createMap()
                regionMap.putDouble("x", bb.left.toDouble())
                regionMap.putDouble("y", bb.top.toDouble())
                regionMap.putDouble("width", bb.width().toDouble())
                regionMap.putDouble("height", bb.height().toDouble())
                regions.pushMap(regionMap)
              }
            }
          }

          val result = Arguments.createMap()
          result.putString("text", lines.joinToString("\n"))
          result.putArray("regions", regions)
          promise.resolve(result)
        }
        .addOnFailureListener { e ->
          promise.reject("MLKIT_ERROR", e.message ?: "Text recognition failed", e)
        }
    } catch (e: Exception) {
      promise.reject("MLKIT_ERROR", e.message ?: "Unexpected error", e)
    }
  }
}
