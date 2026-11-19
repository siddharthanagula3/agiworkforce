import Foundation
import AppIntents
import ImageIO
import UIKit
import UniformTypeIdentifiers

// Central deep-link dispatcher for all AGI App Intents.
// Each Intent calls `AGIIntentDispatch.open(_:)` with a pre-built URL;
// the RN runtime picks it up via expo-linking in the root _layout.tsx handler.
//
// URL format: agiworkforce://intent/<verb>?<params>
// Verbs: chat, ask, summarize, analyze_image, transcribe, translate, scan, remind
//
// Works offline, no network call is made here. The RN side handles the intent
// params once the app is foregrounded.

enum AGIIntentDispatch {
    static let scheme = "agiworkforce"

    static func url(verb: String, params: [String: String] = [:]) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "intent"
        components.path = "/\(verb)"
        if !params.isEmpty {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return components.url
    }

    @discardableResult
    static func open(verb: String, params: [String: String] = [:]) -> Bool {
        guard let url = url(verb: verb, params: params) else { return false }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
        return true
    }
}

@available(iOS 16.0, *)
struct AGIIntentFileError: Error, CustomLocalizedStringResourceConvertible {
    let localizedStringResource: LocalizedStringResource

    static let unreadableImage = AGIIntentFileError(
        localizedStringResource: "AGI Mobile could not read this image. Choose another image and try again."
    )
    static let unreadableAudio = AGIIntentFileError(
        localizedStringResource: "AGI Mobile could not read this recording. Choose another file and try again."
    )
}

// A Shortcuts file can arrive without a fileURL, and a provider's file can be
// gone before JavaScript reads it, so every file is copied into the app's own
// caches first. Images are re-encoded as JPEG because the screens that receive
// them send image/jpeg, and AGI Cloud cannot read HEIC.
@available(iOS 16.0, *)
enum AGIIntentFileStaging {
    private static let directoryName = "AGIIntentFiles"
    private static let staleLifetime: TimeInterval = 24 * 60 * 60
    private static let jpegQuality = 0.85
    private static let maximumImagePixelSize = 4096

    static func stageImage(_ file: IntentFile) throws -> URL {
        let staged: URL? = read(
            file,
            fromURL: { url in CGImageSourceCreateWithURL(url as CFURL, nil).flatMap { writeJPEG(from: $0) } },
            fromData: { data in CGImageSourceCreateWithData(data as CFData, nil).flatMap { writeJPEG(from: $0) } }
        )
        guard let staged else { throw AGIIntentFileError.unreadableImage }
        return staged
    }

    static func stageAudio(_ file: IntentFile) throws -> URL {
        guard let destination = try? stagingURL(fileExtension: audioExtension(for: file)) else {
            throw AGIIntentFileError.unreadableAudio
        }
        let staged: URL? = read(
            file,
            fromURL: { url in
                (try? FileManager.default.copyItem(at: url, to: destination)) != nil ? destination : nil
            },
            fromData: { data in
                (try? data.write(to: destination, options: [.atomic])) != nil ? destination : nil
            }
        )
        guard let staged else { throw AGIIntentFileError.unreadableAudio }
        return staged
    }

    private static func read<T>(
        _ file: IntentFile,
        fromURL: (URL) -> T?,
        fromData: (Data) -> T?
    ) -> T? {
        if let url = file.fileURL {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            return fromURL(url)
        }
        let data = file.data
        return data.isEmpty ? nil : fromData(data)
    }

    private static func writeJPEG(from source: CGImageSource) -> URL? {
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumImagePixelSize,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions as CFDictionary),
              let destination = try? stagingURL(fileExtension: "jpg"),
              let writer = CGImageDestinationCreateWithURL(
                  destination as CFURL, UTType.jpeg.identifier as CFString, 1, nil)
        else { return nil }
        let writeOptions: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: jpegQuality]
        CGImageDestinationAddImage(writer, image, writeOptions as CFDictionary)
        guard CGImageDestinationFinalize(writer) else {
            try? FileManager.default.removeItem(at: destination)
            return nil
        }
        return destination
    }

    private static func audioExtension(for file: IntentFile) -> String {
        let candidates = [
            URL(fileURLWithPath: file.filename).pathExtension,
            file.type?.preferredFilenameExtension ?? "",
        ]
        let allowed = CharacterSet.alphanumerics
        return candidates.first { candidate in
            !candidate.isEmpty && candidate.count <= 8
                && candidate.unicodeScalars.allSatisfy { allowed.contains($0) }
        }?.lowercased() ?? "m4a"
    }

    private static func stagingURL(fileExtension: String) throws -> URL {
        let fileManager = FileManager.default
        let caches = try fileManager.url(
            for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = caches.appendingPathComponent(directoryName, isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        pruneStaleFiles(in: directory)
        return directory.appendingPathComponent(
            "\(UUID().uuidString).\(fileExtension)", isDirectory: false)
    }

    private static func pruneStaleFiles(in directory: URL) {
        let fileManager = FileManager.default
        let cutoff = Date().addingTimeInterval(-staleLifetime)
        let entries =
            (try? fileManager.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.creationDateKey],
                options: [.skipsHiddenFiles]
            )) ?? []
        for entry in entries {
            guard let created = (try? entry.resourceValues(forKeys: [.creationDateKey]))?.creationDate,
                  created < cutoff
            else { continue }
            try? fileManager.removeItem(at: entry)
        }
    }
}
