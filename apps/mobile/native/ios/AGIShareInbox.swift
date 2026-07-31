import Foundation
import React

// Main-app side of the supported Share Extension handoff. The extension writes
// bounded JSON drafts to the shared App Group container; the app consumes every
// pending draft on authenticated launch/foreground and routes the aggregate to
// its existing explicit review screen.
@objc(AGIShareInbox)
final class AGIShareInbox: NSObject {
  private static let appGroupIdentifier = "group.com.agiworkforce.app.share"
  private static let inboxDirectoryName = "PendingShares"
  private static let maximumSharedBytes = 100 * 1024

  private struct PendingShare: Decodable {
    let text: String
    let truncated: Bool
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(consumePendingShares:reject:)
  func consumePendingShares(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        resolve(try Self.consumePendingShares())
      } catch {
        reject("SHARE_INBOX_ERROR", error.localizedDescription, error as NSError)
      }
    }
  }

  private static func consumePendingShares() throws -> [String: Any]? {
    let fileManager = FileManager.default
    guard
      let container = fileManager.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      )
    else {
      throw NSError(
        domain: "AGIShareInbox",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "The AGI Share App Group is unavailable."]
      )
    }

    let inbox = container.appendingPathComponent(inboxDirectoryName, isDirectory: true)
    guard fileManager.fileExists(atPath: inbox.path) else { return nil }

    let files = try fileManager.contentsOfDirectory(
      at: inbox,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    )
    .filter { $0.pathExtension == "json" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

    let decoder = JSONDecoder()
    var shares: [PendingShare] = []
    var consumedFiles: [URL] = []
    for file in files {
      consumedFiles.append(file)
      guard let share = try? decoder.decode(PendingShare.self, from: Data(contentsOf: file)) else {
        continue
      }
      let text = share.text.trimmingCharacters(in: .whitespacesAndNewlines)
      if !text.isEmpty {
        shares.append(PendingShare(text: text, truncated: share.truncated))
      }
    }

    guard !shares.isEmpty else {
      for file in consumedFiles { try? fileManager.removeItem(at: file) }
      return nil
    }

    let combined =
      shares.count == 1
      ? shares[0].text
      : shares.enumerated().map { index, share in
        "Shared item \(index + 1):\n\(share.text)"
      }.joined(separator: "\n\n---\n\n")
    let bounded = boundedUTF8(combined, maximumBytes: maximumSharedBytes)

    // Delete only after every valid draft has been decoded and the aggregate
    // is ready. Cleanup is best-effort: a rare failed delete may show the draft
    // again, but never prevents delivery or silently loses unreviewed content.
    for file in consumedFiles {
      try? fileManager.removeItem(at: file)
    }

    return [
      "text": bounded.value,
      "truncated": bounded.truncated || shares.contains(where: { $0.truncated }),
      "count": shares.count,
    ]
  }

  private static func boundedUTF8(
    _ value: String,
    maximumBytes: Int
  ) -> (value: String, truncated: Bool) {
    let data = Data(value.utf8)
    guard data.count > maximumBytes else { return (value, false) }

    var end = maximumBytes
    while end > 0 {
      if let bounded = String(data: data.prefix(end), encoding: .utf8) {
        return (bounded, true)
      }
      end -= 1
    }
    return ("", true)
  }
}
