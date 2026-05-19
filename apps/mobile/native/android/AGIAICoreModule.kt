package com.agiworkforce.app.native

import android.os.Build
import android.os.PowerManager
import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import kotlinx.coroutines.*
import android.app.ActivityManager
import java.util.UUID
import kotlinx.coroutines.flow.Flow

// Tier 1 Android: wraps Gemini Nano via Google AICore (GMS on-device inference).
// Requires Google Play Services with AICore support: Pixel 8+, Galaxy S24+, expanding 2026.
// Falls back gracefully: isAvailable() returns false when GMS/AICore absent.
//
// AICore GMS dependency (add to android/app/build.gradle):
//   implementation 'com.google.android.gms:play-services-aicore:<latest>'
class AGIAICoreModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), CoroutineScope {

  private val job = SupervisorJob()
  override val coroutineContext = Dispatchers.IO + job

  companion object {
    const val MODULE_NAME = "AGIAICore"

    fun isAvailable(context: Context): Boolean {
      // AICore requires Android 12+ and compatible GMS build.
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return false
      return try {
        // GoogleGenerativeAI on-device check — uses GMS service presence.
        val ai = com.google.android.gms.ai.AppAI.getInstance(context)
        val available = Tasks.await(ai.isModelAvailable())
        available
      } catch (_: Exception) {
        false
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

  @ReactMethod
  fun generate(
    prompt: String,
    systemPrompt: String?,
    messages: ReadableArray,
    requestId: String,
    promise: Promise
  ) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.reject("UNAVAILABLE", "AICore requires Android 12+")
      return
    }
    if (isThermallyThrottled(reactContext)) {
      promise.reject("THERMAL", "Device is thermally throttled — inference paused")
      return
    }

    launch {
      try {
        val ai = com.google.android.gms.ai.AppAI.getInstance(reactContext)
        val session = Tasks.await(ai.createSession())

        // Build conversation context from history array.
        val historyList = mutableListOf<Pair<String, String>>()
        for (i in 0 until messages.size()) {
          val msg = messages.getMap(i) ?: continue
          val role = msg.getString("role") ?: continue
          val content = msg.getString("content") ?: continue
          historyList.add(role to content)
        }

        // Prepend system prompt if provided.
        val contextPrefix = if (!systemPrompt.isNullOrBlank()) {
          "System: $systemPrompt\n\n"
        } else ""

        val fullPrompt = buildString {
          append(contextPrefix)
          for ((role, content) in historyList) {
            appendLine("${role.replaceFirstChar { it.uppercase() }}: $content")
          }
          append("User: $prompt")
        }

        val fullText = StringBuilder()
        val flow: Flow<String> = session.generateStream(fullPrompt)
        flow.collect { token ->
          fullText.append(token)
          sendEvent("AGIAICore.token", WritableNativeMap().apply {
            putString("requestId", requestId)
            putString("token", token)
            putBoolean("done", false)
          })
          // Thermal check mid-stream.
          if (isThermallyThrottled(reactContext)) {
            sendEvent("AGIAICore.token", WritableNativeMap().apply {
              putString("requestId", requestId)
              putString("token", "")
              putBoolean("done", true)
              putBoolean("aborted", true)
              putString("reason", "thermal")
            })
            return@collect
          }
        }

        sendEvent("AGIAICore.token", WritableNativeMap().apply {
          putString("requestId", requestId)
          putString("token", "")
          putBoolean("done", true)
          putBoolean("aborted", false)
        })
        promise.resolve(fullText.toString())
      } catch (e: Exception) {
        promise.reject("INFERENCE_ERROR", e.message, e)
      }
    }
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
