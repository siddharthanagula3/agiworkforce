package com.agiworkforce.app.native

import android.os.Build
import android.os.PowerManager
import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import android.app.ActivityManager
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession.LlmInferenceSessionOptions
import java.io.File

// Tier 1 Android: on-device LLM inference via MediaPipe tasks-genai
// (com.google.mediapipe:tasks-genai, real LlmInference/LlmInferenceSession API —
// verified against google-ai-edge/mediapipe-samples' llm_inference/android
// sample). Replaces the earlier com.google.mlkit:genai-common stub, which never
// exposed a generic chat/completion surface (only task-specific transforms).
//
// This is model-file-based, not an OS session API: the JS side downloads a
// quantized Gemma 3 1B .task bundle (see packages/local-llm/src/catalog.ts,
// id "gemini-nano-aicore") and calls prepareModel(path) once the file is on
// disk (apps/mobile/src/features/model-picker/installStore.ts). Until a model
// is prepared, getCapabilities().available is false and generate() rejects, so
// the Tier 1/2/3 selector in packages/local-llm/src/selector.ts falls through
// to Tier 2 (executorch) / Tier 3 (llama.rn).
class AGIAICoreModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), CoroutineScope {

  private val job = SupervisorJob()
  override val coroutineContext = Dispatchers.IO + job

  companion object {
    const val MODULE_NAME = "AGIAICore"
    private const val TAG = "AGIAICore"
    private const val MAX_TOKENS = 2048

    // Set by prepareModel() once the JS side has downloaded the .task file.
    // Null until then — generate()/isAvailable() treat that as "not ready".
    @Volatile private var modelPath: String? = null
    @Volatile private var llmInference: LlmInference? = null
    @Volatile private var llmInferenceSession: LlmInferenceSession? = null
    private val engineLock = Any()

    fun isAvailable(context: Context): Boolean {
      val path = modelPath ?: return false
      return File(path).exists()
    }

    // Returns true if device is thermally throttled (THROTTLING or SHUTDOWN states).
    fun isThermallyThrottled(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val state = pm.currentThermalStatus
      // THERMAL_STATUS_SEVERE = 4, THERMAL_STATUS_CRITICAL = 5, THERMAL_STATUS_EMERGENCY = 6, THERMAL_STATUS_SHUTDOWN = 7
      return state >= PowerManager.THERMAL_STATUS_SEVERE
    }

    private fun releaseEngineLocked() {
      try {
        llmInferenceSession?.close()
      } catch (e: Exception) {
        Log.w(TAG, "Error closing LlmInferenceSession: ${e.message}")
      }
      try {
        llmInference?.close()
      } catch (e: Exception) {
        Log.w(TAG, "Error closing LlmInference: ${e.message}")
      }
      llmInferenceSession = null
      llmInference = null
    }
  }

  override fun getName() = MODULE_NAME

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    launch {
      try {
        val available = isAvailable(reactContext)
        val thermalThrottled = isThermallyThrottled(reactContext)
        val totalRAMMB = getTotalRAMMB()
        val osVersion = "Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})"
        val map = WritableNativeMap().apply {
          putInt("tier", 1)
          putBoolean("available", available)
          putBoolean("thermalThrottled", thermalThrottled)
          putInt("totalRAMMB", totalRAMMB)
          putString("osVersion", osVersion)
          putString("runtimeName", "aicore")
        }
        promise.resolve(map)
      } catch (e: Exception) {
        promise.reject("CAPABILITY_ERROR", e.message, e)
      }
    }
  }

  // Called once by the JS install flow after the .task model file has been
  // downloaded and checksum-verified (installStore.ts). Records the path so
  // isAvailable()/generate() can find it; the actual LlmInference engine is
  // created lazily on first generate() call to avoid holding model memory
  // resident before the user actually starts a local chat.
  @ReactMethod
  fun prepareModel(path: String, promise: Promise) {
    launch {
      try {
        if (!File(path).exists()) {
          promise.reject("MODEL_NOT_FOUND", "No file at path: $path")
          return@launch
        }
        synchronized(engineLock) {
          if (modelPath != path) {
            releaseEngineLocked()
          }
          modelPath = path
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("PREPARE_MODEL_ERROR", e.message, e)
      }
    }
  }

  private fun ensureEngine(path: String) {
    synchronized(engineLock) {
      if (llmInference != null && llmInferenceSession != null) return

      val inferenceOptions = LlmInference.LlmInferenceOptions.builder()
        .setModelPath(path)
        .setMaxTokens(MAX_TOKENS)
        .build()
      val inference = LlmInference.createFromOptions(reactContext, inferenceOptions)

      val sessionOptions = LlmInferenceSessionOptions.builder()
        .setTemperature(1.0f)
        .setTopK(64)
        .setTopP(0.95f)
        .build()
      val session = LlmInferenceSession.createFromOptions(inference, sessionOptions)

      llmInference = inference
      llmInferenceSession = session
    }
  }

  @ReactMethod
  fun generate(
    prompt: String,
    systemPrompt: String?,
    messages: ReadableArray,
    requestId: String,
    promise: Promise
  ) {
    val path = modelPath
    if (path == null || !File(path).exists()) {
      promise.reject("UNAVAILABLE", "No on-device model is prepared yet. Download it in Models first.")
      return
    }

    launch {
      try {
        ensureEngine(path)
        val session = llmInferenceSession
        if (session == null) {
          promise.reject("UNAVAILABLE", "Failed to create an inference session")
          return@launch
        }

        val fullPrompt = buildPrompt(systemPrompt, messages, prompt)

        // LlmInferenceSession is not safe for concurrent addQueryChunk/generate
        // calls — the singleton session is reused per turn but only one
        // generate() runs at a time per module instance.
        synchronized(engineLock) {
          session.addQueryChunk(fullPrompt)
        }

        val resultText = StringBuilder()
        val done = CompletableDeferred<Unit>()

        session.generateResponseAsync { partialResult, isDone ->
          if (partialResult.isNotEmpty()) {
            resultText.append(partialResult)
            sendEvent(
              "AGIAICore.token",
              WritableNativeMap().apply {
                putString("requestId", requestId)
                putString("token", partialResult)
                putBoolean("done", false)
              },
            )
          }
          if (isDone) {
            sendEvent(
              "AGIAICore.token",
              WritableNativeMap().apply {
                putString("requestId", requestId)
                putBoolean("done", true)
                putBoolean("aborted", false)
              },
            )
            if (!done.isCompleted) done.complete(Unit)
          }
        }

        done.await()
        promise.resolve(resultText.toString())
      } catch (e: Exception) {
        Log.e(TAG, "generate() failed: ${e.message}", e)
        promise.reject("GENERATE_ERROR", e.message, e)
      }
    }
  }

  private fun buildPrompt(systemPrompt: String?, messages: ReadableArray, prompt: String): String {
    val sb = StringBuilder()
    if (!systemPrompt.isNullOrBlank()) {
      sb.append(systemPrompt).append("\n\n")
    }
    for (i in 0 until messages.size()) {
      val entry = messages.getMap(i) ?: continue
      val role = entry.getString("role") ?: continue
      val content = entry.getString("content") ?: continue
      sb.append(role).append(": ").append(content).append("\n")
    }
    sb.append("user: ").append(prompt)
    return sb.toString()
  }

  private fun sendEvent(eventName: String, params: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  private fun getTotalRAMMB(): Int {
    val am = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    val info = ActivityManager.MemoryInfo()
    am.getMemoryInfo(info)
    return (info.totalMem / 1_048_576).toInt()
  }

  override fun onCatalystInstanceDestroy() {
    job.cancel()
    super.onCatalystInstanceDestroy()
  }
}
