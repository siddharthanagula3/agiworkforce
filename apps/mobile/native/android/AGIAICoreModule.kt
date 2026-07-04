package com.agiworkforce.app.native

import android.os.Build
import android.os.PowerManager
import android.content.Context
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import android.app.ActivityManager

// Tier 1 Android: on-device LLM inference, rewrite in progress against
// MediaPipe tasks-genai (com.google.mediapipe:tasks-genai, LlmInference API).
// STUBBED: returns available=false and generate() rejects. The previous
// implementation called classes that do not exist in the real
// com.google.mlkit:genai-common API surface (that dependency only exposes a
// shared FeatureStatus/DownloadStatus/StreamingCallback base used by ML Kit's
// task-specific GenAI features — no generic chat/session inference API).
// While stubbed, the JS bridge still works — calls return "not available" so
// the LLM tier selector falls through to Tier 2 (executorch) / Tier 3 (llama.rn).
class AGIAICoreModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), CoroutineScope {

  private val job = SupervisorJob()
  override val coroutineContext = Dispatchers.IO + job

  companion object {
    const val MODULE_NAME = "AGIAICore"

    fun isAvailable(context: Context): Boolean {
      return false
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
    promise.reject("UNAVAILABLE", "On-device Android inference is not implemented yet")
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
