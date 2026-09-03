import Foundation
import Vision
import UIKit
import React

// On-device OCR via Apple Vision VNRecognizeTextRequest.
// No network calls. Supports multilingual scripts (Latin, Chinese, Japanese,
// Korean, Arabic, Devanagari, Cyrillic, Thai, Vietnamese).
@objc(AGIVisionOCR)
class AGIVisionOCR: NSObject {

  // MARK: - Availability

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: - Text recognition

  // recognizeText(imageUri) → { text: String, regions: [[x,y,w,h]] }
  // imageUri must be a file:// URI or an absolute path from expo-camera takePictureAsync.
  @objc(recognizeText:resolve:reject:)
  func recognizeText(
    imageUri: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    // Normalise URI: strip file:// prefix if present.
    let path = imageUri.hasPrefix("file://")
      ? String(imageUri.dropFirst(7))
      : imageUri

    guard let image = UIImage(contentsOfFile: path),
          let cgImage = image.cgImage else {
      reject("LOAD_ERROR", "Cannot load image at path: \(path)", nil)
      return
    }

    let request = VNRecognizeTextRequest { req, error in
      if let error = error {
        reject("VISION_ERROR", error.localizedDescription, error as NSError)
        return
      }

      guard let observations = req.results as? [VNRecognizedTextObservation] else {
        resolve(["text": "", "regions": []])
        return
      }

      var lines: [String] = []
      var regions: [[String: CGFloat]] = []

      let imageWidth = CGFloat(cgImage.width)
      let imageHeight = CGFloat(cgImage.height)

      for obs in observations {
        guard let top = obs.topCandidates(1).first else { continue }
        lines.append(top.string)

        // Convert normalised Vision coords (bottom-left origin) to top-left pixel coords.
        let box = obs.boundingBox
        let x = box.origin.x * imageWidth
        let y = (1.0 - box.origin.y - box.height) * imageHeight
        let w = box.width * imageWidth
        let h = box.height * imageHeight
        regions.append(["x": x, "y": y, "width": w, "height": h])
      }

      let fullText = lines.joined(separator: "\n")
      resolve(["text": fullText, "regions": regions])
    }

    // Accurate recognition, multilingual.
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = [
      "en-US", "fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR",
      "zh-Hans", "zh-Hant", "ja-JP", "ko-KR",
      "ar-SA", "hi-IN", "ru-RU", "th-TH", "vi-VN",
    ]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        reject("VISION_ERROR", error.localizedDescription, error as NSError)
      }
    }
  }
}
