import Foundation
import React

// Marks app files that can be downloaded again, or never opened on another
// device, as excluded from iCloud and computer backups. Apple notes that some
// file operations reset the flag, so every item under a directory is marked
// again on each call, not only the directory itself.
@objc(AGIBackupExclusion)
final class AGIBackupExclusion: NSObject {
  private static let queue = DispatchQueue(
    label: "com.agiworkforce.app.backup-exclusion", qos: .utility)

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(excludeFromBackup:resolve:reject:)
  func excludeFromBackup(
    _ uris: [String],
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Self.queue.async {
      do {
        var marked = 0
        for uri in uris {
          marked += try Self.exclude(uri)
        }
        resolve(marked)
      } catch {
        reject("BACKUP_EXCLUSION_ERROR", error.localizedDescription, error as NSError)
      }
    }
  }

  private static func exclusionError(_ code: Int, _ message: String) -> NSError {
    NSError(
      domain: "AGIBackupExclusion", code: code, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private static func fileURL(from uri: String) -> URL? {
    if let url = URL(string: uri), url.isFileURL { return url }
    guard uri.hasPrefix("/") else { return nil }
    return URL(fileURLWithPath: uri)
  }

  private static func exclude(_ uri: String) throws -> Int {
    guard let root = fileURL(from: uri) else {
      throw exclusionError(1, "The path to exclude from backup is not a file path.")
    }
    let fileManager = FileManager.default
    guard fileManager.fileExists(atPath: root.path) else { return 0 }

    let home = URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
      .resolvingSymlinksInPath().path
    guard root.resolvingSymlinksInPath().path.hasPrefix(home + "/") else {
      throw exclusionError(2, "Only files inside this app can be excluded from backup.")
    }

    try markExcluded(root)
    var marked = 1
    if let enumerator = fileManager.enumerator(at: root, includingPropertiesForKeys: nil) {
      for case let item as URL in enumerator {
        try markExcluded(item)
        marked += 1
      }
    }
    return marked
  }

  private static func markExcluded(_ url: URL) throws {
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    var target = url
    try target.setResourceValues(values)
  }
}
