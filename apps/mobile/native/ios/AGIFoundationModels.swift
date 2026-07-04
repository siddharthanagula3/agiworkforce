import Foundation
import React
import UIKit

// Tier 1 iOS: Apple Foundation Models wrapper.
// STUBBED: returns isAvailable=false. The full implementation depends on the
// iOS 26 SDK (LanguageModelSession, Instructions, ConversationEntry,
// GenerationOptions) which isn't available in current Xcode. Once the iOS 26
// SDK ships, restore the implementation from git history.
//
// While stubbed, the JS bridge still works — calls return "not available" so
// the LLM tier selector falls through to Tier 2 (executorch) / Tier 3 (llama.rn).
@objc(AGIFoundationModels)
class AGIFoundationModels: RCTEventEmitter {

  @objc static func isAvailable() -> Bool {
    return false
  }

  @objc static func isThermallyThrottled() -> Bool {
    let state = ProcessInfo.processInfo.thermalState
    return state == .serious || state == .critical
  }

  @objc(getCapabilities:reject:)
  func getCapabilities(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let totalRAMMB = Int(ProcessInfo.processInfo.physicalMemory / 1_048_576)
    let osVersion = ProcessInfo.processInfo.operatingSystemVersionString

    resolve([
      "tier": 1,
      "available": false,
      // Mirrors @agiworkforce/local-llm's Tier1Status union; always "unavailable"
      // while stubbed — there's no download flow here, unlike Android AICore.
      "status": "unavailable",
      "thermalThrottled": AGIFoundationModels.isThermallyThrottled(),
      "totalRAMMB": totalRAMMB,
      "osVersion": osVersion,
      "runtimeName": "foundation_models",
    ])
  }

  @objc(generate:systemPrompt:messages:requestId:resolve:reject:)
  func generate(
    prompt: String,
    systemPrompt: String?,
    messages: [[String: String]],
    requestId: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    reject("UNAVAILABLE", "Apple Foundation Models require iOS 26+", nil)
  }

  override func supportedEvents() -> [String]! {
    return ["AGIFoundationModels.token"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
