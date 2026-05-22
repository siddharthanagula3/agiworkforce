import Foundation
import Translation
import React

// Apple Translate framework wrapper.
// Direct non-UI TranslationSession construction is available in the current SDK
// only on iOS 26+, so older OS versions report unavailable and JS falls back.
@objc(AGITranslate)
class AGITranslate: NSObject {

  // MARK: - Availability

  @objc static func isAvailable() -> Bool {
    if #available(iOS 26.0, *) {
      return true
    }
    return false
  }

  // MARK: - Translate (single string, non-streaming)

  // sourceLanguage / targetLanguage: BCP-47 tags, e.g. "en", "hi", "es".
  @objc(translate:sourceLanguage:targetLanguage:resolve:reject:)
  func translate(
    _ text: String,
    sourceLanguage: String,
    targetLanguage: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 26.0, *) else {
      reject("UNAVAILABLE", "Apple Translate direct sessions require iOS 26+", nil)
      return
    }

    Task {
      do {
        let src = Locale.Language(identifier: sourceLanguage)
        let tgt = Locale.Language(identifier: targetLanguage)

        let session = TranslationSession(installedSource: src, target: tgt)
        let response = try await session.translate(text)

        resolve([
          "translatedText": response.targetText,
          "sourceLanguage": sourceLanguage,
          "targetLanguage": targetLanguage,
          "backend": "apple_translate",
        ])
      } catch {
        reject("TRANSLATE_ERROR", error.localizedDescription, error as NSError)
      }
    }
  }

  // MARK: - Download check

  // Returns whether the language pair model is locally available (no download needed).
  @objc(isPairDownloaded:targetLanguage:resolve:reject:)
  func isPairDownloaded(
    _ sourceLanguage: String,
    targetLanguage: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 18.0, *) else {
      resolve(false)
      return
    }

    Task {
      let src = Locale.Language(identifier: sourceLanguage)
      let tgt = Locale.Language(identifier: targetLanguage)
      let availability = LanguageAvailability()
      let status = await availability.status(from: src, to: tgt)
      switch status {
      case .installed:
        resolve(true)
      case .supported:
        resolve(false)
      default:
        resolve(false)
      }
    }
  }

  // MARK: - RCT

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
