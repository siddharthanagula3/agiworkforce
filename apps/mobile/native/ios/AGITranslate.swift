import Foundation
import Translation
import React

// Apple Translate framework wrapper (iOS 17.4+).
// On iOS < 17.4 or when a language pair is unavailable, isAvailable returns false
// and the JS side falls back to Qwen3 prompt translation.
@objc(AGITranslate)
class AGITranslate: NSObject {

  // MARK: - Availability

  @objc static func isAvailable() -> Bool {
    if #available(iOS 17.4, *) {
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
    guard #available(iOS 17.4, *) else {
      reject("UNAVAILABLE", "Apple Translate requires iOS 17.4+", nil)
      return
    }

    Task {
      do {
        let src = Locale.Language(identifier: sourceLanguage)
        let tgt = Locale.Language(identifier: targetLanguage)

        let config = TranslationSession.Configuration(source: src, target: tgt)
        let session = try await TranslationSession(configuration: config)
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
    guard #available(iOS 17.4, *) else {
      resolve(false)
      return
    }

    Task {
      do {
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
      } catch {
        resolve(false)
      }
    }
  }

  // MARK: - RCT

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
