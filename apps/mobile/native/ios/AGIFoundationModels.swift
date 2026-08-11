import Foundation
import React
import UIKit

#if canImport(FoundationModels)
import FoundationModels
#endif

// Tier 1 iOS: Apple Foundation Models wrapper.
//
// The framework is weakly selected at compile time and guarded again at
// runtime. Older iOS releases and devices without Apple Intelligence therefore
// remain on the existing ExecuTorch/llama.rn fallback without crossing the
// Local trust boundary.
@objc(AGIFoundationModels)
class AGIFoundationModels: RCTEventEmitter {
  private let taskLock = NSLock()
  private var generationTasks: [String: Task<Void, Never>] = [:]

  @objc static func isAvailable() -> Bool {
#if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      return SystemLanguageModel.default.isAvailable
    }
#endif
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
      "available": AGIFoundationModels.isAvailable(),
      "status": AGIFoundationModels.isAvailable() ? "available" : "unavailable",
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
#if canImport(FoundationModels)
    if #available(iOS 26.0, *) {
      guard SystemLanguageModel.default.isAvailable else {
        reject("UNAVAILABLE", "Apple Foundation Models are not available on this device", nil)
        return
      }

      let generationTask = Task { [weak self] in
        // `Task` starts eagerly. Yield once so the task is present in
        // generationTasks before any terminal path can remove it.
        await Task.yield()
        guard let self else { return }
        do {
          let session = LanguageModelSession(
            model: SystemLanguageModel.default,
            instructions: systemPrompt?.trimmingCharacters(in: .whitespacesAndNewlines)
          )
          let request = self.buildPrompt(messages: messages, prompt: prompt)
          var emittedText = ""

          for try await snapshot in session.streamResponse(to: request) {
            try Task.checkCancellation()
            let currentText = snapshot.content
            let delta: String
            if currentText.hasPrefix(emittedText) {
              delta = String(currentText.dropFirst(emittedText.count))
            } else {
              // Snapshots are documented as cumulative. If the system model
              // ever revises a prefix, emit only the new snapshot and reset our
              // accumulator instead of manufacturing an invalid suffix.
              delta = currentText
            }
            emittedText = currentText

            if !delta.isEmpty {
              self.sendToken(requestId: requestId, token: delta)
            }
          }

          self.sendDone(requestId: requestId, aborted: false)
          resolve(emittedText)
        } catch is CancellationError {
          self.sendDone(requestId: requestId, aborted: true, reason: "cancel")
          resolve("")
        } catch {
          self.sendDone(requestId: requestId, aborted: true, reason: error.localizedDescription)
          reject("GENERATE_ERROR", error.localizedDescription, error)
        }
        self.removeTask(requestId: requestId)
      }

      storeTask(generationTask, requestId: requestId)
      return
    }
#endif

    reject("UNAVAILABLE", "Apple Foundation Models require iOS 26 or later", nil)
  }

  @objc(cancel:)
  func cancel(requestId: String) {
    taskLock.lock()
    let task = generationTasks.removeValue(forKey: requestId)
    taskLock.unlock()
    task?.cancel()
  }

  private func buildPrompt(messages: [[String: String]], prompt: String) -> String {
    var parts: [String] = []
    for message in messages {
      guard let role = message["role"], let content = message["content"] else { continue }
      let label = role == "assistant" ? "Assistant" : "User"
      parts.append("\(label): \(content)")
    }
    parts.append("User: \(prompt)")
    parts.append("Assistant:")
    return parts.joined(separator: "\n\n")
  }

  private func storeTask(_ task: Task<Void, Never>, requestId: String) {
    taskLock.lock()
    generationTasks[requestId]?.cancel()
    generationTasks[requestId] = task
    taskLock.unlock()
  }

  private func removeTask(requestId: String) {
    taskLock.lock()
    generationTasks.removeValue(forKey: requestId)
    taskLock.unlock()
  }

  private func sendToken(requestId: String, token: String) {
    sendEvent(withName: "AGIFoundationModels.token", body: [
      "requestId": requestId,
      "token": token,
      "done": false,
    ])
  }

  private func sendDone(requestId: String, aborted: Bool, reason: String? = nil) {
    var body: [String: Any] = [
      "requestId": requestId,
      "token": "",
      "done": true,
      "aborted": aborted,
    ]
    if let reason {
      body["reason"] = reason
    }
    sendEvent(withName: "AGIFoundationModels.token", body: body)
  }

  override func supportedEvents() -> [String]! {
    return ["AGIFoundationModels.token"]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  deinit {
    taskLock.lock()
    let tasks = Array(generationTasks.values)
    generationTasks.removeAll()
    taskLock.unlock()
    tasks.forEach { $0.cancel() }
  }
}
