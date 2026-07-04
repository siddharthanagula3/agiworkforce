package com.agiworkforce.app.native

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.mlkit.genai.common.FeatureStatus
import com.google.mlkit.genai.prompt.GenerateContentRequest
import com.google.mlkit.genai.prompt.Generation
import com.google.mlkit.genai.prompt.GenerativeModel
import com.google.mlkit.genai.prompt.PromptPrefix
import com.google.mlkit.genai.prompt.TextPart
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect

// Tier 1 Android: on-device LLM inference via ML Kit GenAI Prompt API
// (com.google.mlkit:genai-prompt), which drives Gemini Nano through AICore.
class AGIAICoreModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), CoroutineScope {

  private val job = SupervisorJob()
  override val coroutineContext = Dispatchers.IO + job

  companion object {
    const val MODULE_NAME = "AGIAICore"

    @Volatile
    private var client: GenerativeModel? = null

    private val downloadInFlight = AtomicBoolean(false)

    private fun getOrCreateClient(): GenerativeModel {
      return client ?: synchronized(this) {
        client ?: Generation.getClient().also { client = it }
      }
    }

    private fun releaseClient() {
      synchronized(this) {
        client?.close()
        client = null
      }
    }

    // Returns true if device is thermally throttled (THROTTLING or SHUTDOWN states).
    fun isThermallyThrottled(context: Context): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val state = pm.currentThermalStatus
      // THERMAL_STATUS_SEVERE = 4, THERMAL_STATUS_CRITICAL = 5, THERMAL_STATUS_EMERGENCY = 6, THERMAL_STATUS_SHUTDOWN = 7
      return state >= PowerManager.THERMAL_STATUS_SEVERE
    }

    // JS-facing status string mirroring @agiworkforce/local-llm's Tier1Status union.
    fun statusToWireString(status: Int): String {
      return when (status) {
        FeatureStatus.AVAILABLE -> "available"
        FeatureStatus.DOWNLOADABLE -> "downloadable"
        FeatureStatus.DOWNLOADING -> "downloading"
        else -> "unavailable"
      }
    }
  }

  override fun getName() = MODULE_NAME

  // Starts (or joins) the AICore feature download without blocking the caller.
  // Safe to call repeatedly — download() is idempotent on Google's side and
  // downloadInFlight prevents us from spawning duplicate collectors.
  private fun triggerBackgroundDownload(model: GenerativeModel) {
    if (!downloadInFlight.compareAndSet(false, true)) return
    launch {
      try {
        model.download().collect { /* no JS progress channel wired yet */ }
      } catch (e: Exception) {
        // Best-effort: the next getCapabilities()/generate() call will re-check
        // status and retry the download if it's still needed.
      } finally {
        downloadInFlight.set(false)
      }
    }
  }

  @ReactMethod
  fun getCapabilities(promise: Promise) {
    launch {
      try {
        val status = runCatching { getOrCreateClient().checkStatus() }
          .getOrDefault(FeatureStatus.UNAVAILABLE)
        if (status == FeatureStatus.DOWNLOADABLE) {
          triggerBackgroundDownload(getOrCreateClient())
        }
        val available = status == FeatureStatus.AVAILABLE
        val thermalThrottled = isThermallyThrottled(reactContext)
        val totalRAMMB = getTotalRAMMB()
        val osVersion = "Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})"
        val map = WritableNativeMap().apply {
          putInt("tier", 1)
          putBoolean("available", available)
          putString("status", statusToWireString(status))
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

  @ReactMethod
  fun generate(
    prompt: String,
    systemPrompt: String?,
    messages: ReadableArray,
    requestId: String,
    promise: Promise
  ) {
    launch {
      val model = getOrCreateClient()
      try {
        val status = runCatching { model.checkStatus() }.getOrDefault(FeatureStatus.UNAVAILABLE)
        if (status != FeatureStatus.AVAILABLE) {
          if (status == FeatureStatus.DOWNLOADABLE) triggerBackgroundDownload(model)
          promise.reject("UNAVAILABLE", "Gemini Nano is not available on this device yet")
          return@launch
        }

        val requestBuilder = GenerateContentRequest.Builder(TextPart(buildPrompt(messages, prompt)))
        if (!systemPrompt.isNullOrBlank()) {
          requestBuilder.promptPrefix = PromptPrefix(systemPrompt)
        }

        val text = StringBuilder()
        model.generateContentStream(requestBuilder.build()).collect { response ->
          val token = response.candidates.firstOrNull()?.text.orEmpty()
          if (token.isNotEmpty()) {
            text.append(token)
            sendEvent(
              "AGIAICore.token",
              WritableNativeMap().apply {
                putString("requestId", requestId)
                putString("token", token)
                putBoolean("done", false)
              },
            )
          }
        }

        sendEvent(
          "AGIAICore.token",
          WritableNativeMap().apply {
            putString("requestId", requestId)
            putString("token", "")
            putBoolean("done", true)
            putBoolean("aborted", false)
          },
        )
        promise.resolve(text.toString())
      } catch (e: CancellationException) {
        sendEvent(
          "AGIAICore.token",
          WritableNativeMap().apply {
            putString("requestId", requestId)
            putString("token", "")
            putBoolean("done", true)
            putBoolean("aborted", true)
            putString("reason", "cancel")
          },
        )
        promise.resolve("")
      } catch (e: Exception) {
        sendEvent(
          "AGIAICore.token",
          WritableNativeMap().apply {
            putString("requestId", requestId)
            putString("token", "")
            putBoolean("done", true)
            putBoolean("aborted", true)
            putString("reason", e.message ?: "error")
          },
        )
        promise.reject("GENERATE_ERROR", e.message, e)
      }
    }
  }

  // genai-prompt's GenerateContentRequest carries a single TextPart plus an
  // optional PromptPrefix — there's no native multi-turn session API, so prior
  // turns are folded into one transcript ahead of the current prompt.
  private fun buildPrompt(messages: ReadableArray, prompt: String): String {
    val sb = StringBuilder()
    for (i in 0 until messages.size()) {
      val entry = messages.getMap(i) ?: continue
      val role = entry.getString("role") ?: continue
      val content = entry.getString("content") ?: continue
      val label = if (role == "assistant") "Assistant" else "User"
      sb.append(label).append(": ").append(content).append("\n\n")
    }
    sb.append("User: ").append(prompt).append("\n\nAssistant:")
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
    releaseClient()
    super.onCatalystInstanceDestroy()
  }
}
