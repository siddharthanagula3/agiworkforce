import Foundation
import React

// Main-app side of the Share Extension handoff. The extension publishes one
// JSON manifest per saved share into the App Group. The app claims a bounded
// batch by renaming those manifests into a receipt directory, copies the files
// into its own caches for review, and deletes the App Group copies only when
// JavaScript acknowledges that receipt. An unacknowledged receipt is delivered
// again, so a crash or a lost callback never discards received content.
@objc(AGIShareInbox)
final class AGIShareInbox: NSObject {
  private static let appGroupIdentifier = "group.com.agiworkforce.app.share"
  private static let inboxDirectoryName = "PendingShares"
  private static let fileDirectoryName = "files"
  private static let claimDirectoryName = "claims"
  private static let stagedDirectoryName = "AGISharedInbox"
  private static let maximumSharedBytes = 100 * 1024
  private static let maximumSharedFiles = 10
  private static let combinedTextOverheadBytes = 64
  private static let abandonedCopyLifetime: TimeInterval = 24 * 60 * 60
  private static let maximumClaimPasses = 32
  private static let receiptPattern =
    "^[0-9]{1,16}-[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$"
  private static let queue = DispatchQueue(label: "com.agiworkforce.app.share-inbox")

  private struct PendingShareFile: Decodable {
    let fileName: String
    let mimeType: String
    let relativePath: String
    let byteSize: Int
  }

  private struct PendingShare: Decodable {
    let text: String
    let truncated: Bool
    let files: [PendingShareFile]?
  }

  private struct InboxPaths {
    let inbox: URL
    let files: URL
    let claims: URL
    let staging: URL
  }

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(claimPendingShares:resolve:reject:)
  func claimPendingShares(
    _ heldReceipts: [String],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        resolve(try Self.claim(excluding: Set(heldReceipts)))
      } catch {
        reject("SHARE_INBOX_ERROR", error.localizedDescription, error as NSError)
      }
    }
  }

  @objc(acknowledgePendingShares:discardStagedCopies:resolve:reject:)
  func acknowledgePendingShares(
    _ receiptId: String,
    discardStagedCopies: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        try Self.acknowledge(receiptId: receiptId, discardStagedCopies: discardStagedCopies)
        resolve(true)
      } catch {
        reject("SHARE_INBOX_ACK_ERROR", error.localizedDescription, error as NSError)
      }
    }
  }

  private static func inboxError(_ code: Int, _ message: String) -> NSError {
    NSError(domain: "AGIShareInbox", code: code, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private static func inboxPaths() throws -> InboxPaths {
    let fileManager = FileManager.default
    guard
      let container = fileManager.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      )
    else {
      throw inboxError(1, "The AGI Share App Group is unavailable.")
    }
    guard let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else {
      throw inboxError(3, "The app caches directory is unavailable.")
    }
    let inbox = container.appendingPathComponent(inboxDirectoryName, isDirectory: true)
    return InboxPaths(
      inbox: inbox,
      files: inbox.appendingPathComponent(fileDirectoryName, isDirectory: true),
      claims: inbox.appendingPathComponent(claimDirectoryName, isDirectory: true),
      staging: caches.appendingPathComponent(stagedDirectoryName, isDirectory: true)
    )
  }

  private static func isReceiptIdentifier(_ value: String) -> Bool {
    value.range(of: receiptPattern, options: .regularExpression) != nil
  }

  private static func manifests(in directory: URL) -> [URL] {
    let entries =
      (try? FileManager.default.contentsOfDirectory(
        at: directory,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
      )) ?? []
    return entries.filter { $0.pathExtension == "json" }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  private static func decodeShare(_ manifest: URL) -> PendingShare? {
    guard let data = try? Data(contentsOf: manifest) else { return nil }
    return try? JSONDecoder().decode(PendingShare.self, from: data)
  }

  private static func outstandingReceipts(_ paths: InboxPaths) -> [String] {
    let entries =
      (try? FileManager.default.contentsOfDirectory(
        at: paths.claims,
        includingPropertiesForKeys: nil,
        options: [.skipsHiddenFiles]
      )) ?? []
    return entries.map { $0.lastPathComponent }.filter(isReceiptIdentifier).sorted()
  }

  private static func ownedSource(_ file: PendingShareFile, _ paths: InboxPaths) -> URL? {
    let source = paths.inbox.appendingPathComponent(file.relativePath, isDirectory: false)
      .standardizedFileURL
    let root = paths.files.standardizedFileURL.path + "/"
    return source.path.hasPrefix(root) ? source : nil
  }

  private static func claim(excluding held: Set<String>) throws -> [String: Any]? {
    let paths = try inboxPaths()
    guard FileManager.default.fileExists(atPath: paths.inbox.path) else { return nil }

    for _ in 0..<maximumClaimPasses {
      let receiptId: String
      if let outstanding = outstandingReceipts(paths).first(where: { !held.contains($0) }) {
        receiptId = outstanding
      } else if let claimed = try claimNextBatch(paths) {
        receiptId = claimed
        pruneAbandonedCopies(paths)
      } else {
        return nil
      }

      if let payload = deliver(receiptId: receiptId, paths: paths) {
        return payload
      }
      try acknowledge(receiptId: receiptId, discardStagedCopies: true)
    }
    return nil
  }

  private static func claimNextBatch(_ paths: InboxPaths) throws -> String? {
    let fileManager = FileManager.default
    let pending = manifests(in: paths.inbox)
    guard !pending.isEmpty else { return nil }

    var selected: [URL] = []
    var fileCount = 0
    var textBytes = 0
    for manifest in pending {
      let share = decodeShare(manifest)
      let files = share?.files?.count ?? 0
      let bytes = (share.map { Data($0.text.utf8).count } ?? 0) + combinedTextOverheadBytes
      if !selected.isEmpty
        && (fileCount + files > maximumSharedFiles || textBytes + bytes > maximumSharedBytes)
      {
        break
      }
      selected.append(manifest)
      fileCount += files
      textBytes += bytes
    }

    let receiptId = "\(Int(Date().timeIntervalSince1970 * 1_000))-\(UUID().uuidString)"
    let claim = paths.claims.appendingPathComponent(receiptId, isDirectory: true)
    try fileManager.createDirectory(at: claim, withIntermediateDirectories: true)
    var claimed = 0
    for manifest in selected {
      do {
        try fileManager.moveItem(
          at: manifest,
          to: claim.appendingPathComponent(manifest.lastPathComponent, isDirectory: false)
        )
        claimed += 1
      } catch {
        continue
      }
    }
    guard claimed > 0 else {
      try? fileManager.removeItem(at: claim)
      return nil
    }
    return receiptId
  }

  private static func deliver(receiptId: String, paths: InboxPaths) -> [String: Any]? {
    let claim = paths.claims.appendingPathComponent(receiptId, isDirectory: true)
    var texts: [String] = []
    var truncated = false
    var shareCount = 0
    var files: [PendingShareFile] = []
    for manifest in manifests(in: claim) {
      guard let share = decodeShare(manifest) else { continue }
      let text = share.text.trimmingCharacters(in: .whitespacesAndNewlines)
      let attachments = share.files ?? []
      guard !text.isEmpty || !attachments.isEmpty else { continue }
      shareCount += 1
      if !text.isEmpty { texts.append(text) }
      truncated = truncated || share.truncated
      files.append(contentsOf: attachments)
    }
    guard shareCount > 0 else { return nil }

    let combined =
      texts.count <= 1
      ? (texts.first ?? "")
      : texts.enumerated().map { index, text in
        "Shared item \(index + 1):\n\(text)"
      }.joined(separator: "\n\n---\n\n")
    let bounded = boundedUTF8(combined, maximumBytes: maximumSharedBytes)
    let staged = stageSharedFiles(files, receiptId: receiptId, paths: paths)

    return [
      "receiptId": receiptId,
      "text": bounded.value,
      "truncated": bounded.truncated || truncated,
      "count": shareCount,
      "files": staged.files,
      "unavailableFileCount": staged.unavailable,
    ]
  }

  // Copies, never moves: the App Group copy stays until the receipt is
  // acknowledged, so a failed copy or a lost delivery can be retried.
  private static func stageSharedFiles(
    _ files: [PendingShareFile],
    receiptId: String,
    paths: InboxPaths
  ) -> (files: [[String: Any]], unavailable: Int) {
    guard !files.isEmpty else { return ([], 0) }
    let fileManager = FileManager.default
    let stagingDirectory = paths.staging.appendingPathComponent(receiptId, isDirectory: true)
    guard (try? fileManager.createDirectory(at: stagingDirectory, withIntermediateDirectories: true))
      != nil
    else {
      return ([], files.count)
    }

    var staged: [[String: Any]] = []
    var unavailable = 0
    for (index, file) in files.enumerated() {
      guard let source = ownedSource(file, paths), fileManager.fileExists(atPath: source.path)
      else {
        unavailable += 1
        continue
      }
      let safeName = URL(fileURLWithPath: file.fileName).lastPathComponent
      let destination = stagingDirectory.appendingPathComponent(
        "\(index)-\(safeName.isEmpty ? "shared-file" : safeName)", isDirectory: false)
      do {
        if fileManager.fileExists(atPath: destination.path) {
          try fileManager.removeItem(at: destination)
        }
        try fileManager.copyItem(at: source, to: destination)
      } catch {
        unavailable += 1
        continue
      }
      staged.append([
        "uri": destination.absoluteString,
        "fileName": file.fileName,
        "mimeType": file.mimeType,
        "byteSize": file.byteSize,
      ])
    }
    return (staged, unavailable)
  }

  private static func acknowledge(receiptId: String, discardStagedCopies: Bool) throws {
    guard isReceiptIdentifier(receiptId) else {
      throw inboxError(2, "The share receipt is not valid.")
    }
    let fileManager = FileManager.default
    let paths = try inboxPaths()
    let claim = paths.claims.appendingPathComponent(receiptId, isDirectory: true)
    if fileManager.fileExists(atPath: claim.path) {
      for manifest in manifests(in: claim) {
        for file in decodeShare(manifest)?.files ?? [] {
          guard let source = ownedSource(file, paths) else { continue }
          try? fileManager.removeItem(at: source)
          let parent = source.deletingLastPathComponent()
          if parent.standardizedFileURL.path != paths.files.standardizedFileURL.path,
            (try? fileManager.contentsOfDirectory(atPath: parent.path))?.isEmpty == true
          {
            try? fileManager.removeItem(at: parent)
          }
        }
      }
      try fileManager.removeItem(at: claim)
    }
    if discardStagedCopies {
      let staged = paths.staging.appendingPathComponent(receiptId, isDirectory: true)
      if fileManager.fileExists(atPath: staged.path) {
        try fileManager.removeItem(at: staged)
      }
    }
  }

  // Removes only what no pending or claimed manifest references and what has
  // sat untouched for a day: an extension save interrupted before its manifest
  // was published, or a reviewed copy whose composer is long gone.
  private static func pruneAbandonedCopies(_ paths: InboxPaths) {
    let fileManager = FileManager.default
    let cutoff = Date().addingTimeInterval(-abandonedCopyLifetime)
    let outstanding = Set(outstandingReceipts(paths))

    var referenced = Set<String>()
    let claimedManifests = outstanding.flatMap {
      manifests(in: paths.claims.appendingPathComponent($0, isDirectory: true))
    }
    for manifest in manifests(in: paths.inbox) + claimedManifests {
      for file in decodeShare(manifest)?.files ?? [] {
        if let source = ownedSource(file, paths) { referenced.insert(source.path) }
      }
    }

    let keys: [URLResourceKey] = [.creationDateKey]
    let sourceEntries =
      (try? fileManager.contentsOfDirectory(
        at: paths.files, includingPropertiesForKeys: keys, options: [])) ?? []
    for entry in sourceEntries {
      let path = entry.standardizedFileURL.path
      if referenced.contains(where: { $0 == path || $0.hasPrefix(path + "/") }) { continue }
      let created = (try? entry.resourceValues(forKeys: [.creationDateKey]))?.creationDate
      if let created, created < cutoff { try? fileManager.removeItem(at: entry) }
    }

    let stagedEntries =
      (try? fileManager.contentsOfDirectory(
        at: paths.staging, includingPropertiesForKeys: keys, options: [])) ?? []
    for entry in stagedEntries where !outstanding.contains(entry.lastPathComponent) {
      let created = (try? entry.resourceValues(forKeys: [.creationDateKey]))?.creationDate
      if let created, created < cutoff { try? fileManager.removeItem(at: entry) }
    }
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
