import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
  private static let appGroupIdentifier = "group.com.agiworkforce.app.share"
  private static let inboxDirectoryName = "PendingShares"
  private static let maximumSharedBytes = 100 * 1024

  private struct PendingShare: Encodable {
    let text: String
    let truncated: Bool
    let createdAt: TimeInterval
  }

  private let titleLabel = UILabel()
  private let detailLabel = UILabel()
  private let previewView = UITextView()
  private let cancelButton = UIButton(type: .system)
  private let reviewButton = UIButton(type: .system)
  private let activityIndicator = UIActivityIndicatorView(style: .medium)

  private var sharedText: String?
  private var contentWasTruncated = false
  private var hasFinished = false

  override func viewDidLoad() {
    super.viewDidLoad()
    configureView()
    loadSharedContent()
  }

  private func configureView() {
    view.backgroundColor = .systemBackground

    titleLabel.text = "Share with AGI"
    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.adjustsFontForContentSizeCategory = true

    detailLabel.text =
      "Review this content here, then save it. Open AGI Workforce to review again before sending."
    detailLabel.font = .preferredFont(forTextStyle: .subheadline)
    detailLabel.textColor = .secondaryLabel
    detailLabel.numberOfLines = 0
    detailLabel.adjustsFontForContentSizeCategory = true

    previewView.isEditable = false
    previewView.isSelectable = true
    previewView.backgroundColor = .secondarySystemBackground
    previewView.layer.cornerRadius = 12
    previewView.font = .preferredFont(forTextStyle: .body)
    previewView.adjustsFontForContentSizeCategory = true
    previewView.text = "Loading shared content…"
    previewView.accessibilityLabel = "Shared content preview"

    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    cancelButton.accessibilityHint = "Closes the share sheet without saving"

    reviewButton.setTitle("Save for AGI Review", for: .normal)
    reviewButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    reviewButton.isEnabled = false
    reviewButton.addTarget(self, action: #selector(saveForReview), for: .touchUpInside)
    reviewButton.accessibilityHint = "Saves this content for review when AGI Workforce opens"

    activityIndicator.startAnimating()
    activityIndicator.hidesWhenStopped = true

    let header = UIStackView(arrangedSubviews: [titleLabel, activityIndicator])
    header.axis = .horizontal
    header.alignment = .center
    header.spacing = 8

    let buttons = UIStackView(arrangedSubviews: [cancelButton, reviewButton])
    buttons.axis = .horizontal
    buttons.distribution = .fillEqually
    buttons.spacing = 12

    let stack = UIStackView(arrangedSubviews: [header, detailLabel, previewView, buttons])
    stack.axis = .vertical
    stack.spacing = 14
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)

    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 18),
      stack.trailingAnchor.constraint(
        equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -18),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 18),
      stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -18),
      previewView.heightAnchor.constraint(greaterThanOrEqualToConstant: 180),
      cancelButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
      reviewButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
    ])
  }

  private func loadSharedContent() {
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
      .flatMap { $0.attachments ?? [] }

    guard !providers.isEmpty else {
      showLoadError("No text or link was shared.")
      return
    }

    loadFirstValue(typeIdentifier: UTType.plainText.identifier, providers: providers) {
      [weak self] textValue in
      self?.loadFirstValue(typeIdentifier: UTType.url.identifier, providers: providers) {
        [weak self] urlValue in
        self?.finishLoading(text: textValue, url: urlValue)
      }
    }
  }

  private func loadFirstValue(
    typeIdentifier: String,
    providers: [NSItemProvider],
    index: Int = 0,
    completion: @escaping (String?) -> Void
  ) {
    guard index < providers.count else {
      DispatchQueue.main.async { completion(nil) }
      return
    }

    let provider = providers[index]
    guard provider.hasItemConformingToTypeIdentifier(typeIdentifier) else {
      loadFirstValue(
        typeIdentifier: typeIdentifier,
        providers: providers,
        index: index + 1,
        completion: completion
      )
      return
    }

    provider.loadItem(forTypeIdentifier: typeIdentifier, options: nil) { [weak self] item, _ in
      let value = self?.stringValue(from: item)?.trimmingCharacters(in: .whitespacesAndNewlines)
      if let value, !value.isEmpty {
        DispatchQueue.main.async { completion(value) }
      } else {
        self?.loadFirstValue(
          typeIdentifier: typeIdentifier,
          providers: providers,
          index: index + 1,
          completion: completion
        )
      }
    }
  }

  private func stringValue(from item: NSSecureCoding?) -> String? {
    switch item {
    case let value as String:
      return value
    case let value as NSAttributedString:
      return value.string
    case let value as URL:
      return value.absoluteString
    case let value as NSURL:
      return value.absoluteString
    case let value as Data:
      return String(data: value, encoding: .utf8)
    default:
      return nil
    }
  }

  private func finishLoading(text: String?, url: String?) {
    let combined: String
    if let text, let url, text != url {
      combined = "\(text)\n\n\(url)"
    } else if let text {
      combined = text
    } else if let url {
      combined = url
    } else {
      showLoadError("AGI can receive shared text and web links from this screen.")
      return
    }

    let bounded = Self.boundedUTF8(combined, maximumBytes: Self.maximumSharedBytes)
    sharedText = bounded.value
    contentWasTruncated = bounded.truncated
    previewView.text = Self.previewText(bounded.value, truncated: bounded.truncated)
    activityIndicator.stopAnimating()
    reviewButton.isEnabled = true
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

  private static func previewText(_ value: String, truncated: Bool) -> String {
    let previewLimit = 4_000
    let preview = value.count > previewLimit ? String(value.prefix(previewLimit)) + "…" : value
    return truncated ? "Content was truncated to 100 KB.\n\n\(preview)" : preview
  }

  private static func persistForReview(_ text: String, truncated: Bool) throws {
    let fileManager = FileManager.default
    guard
      let container = fileManager.containerURL(
        forSecurityApplicationGroupIdentifier: appGroupIdentifier
      )
    else {
      throw NSError(
        domain: "AGIShareExtension",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "The AGI Share App Group is unavailable."]
      )
    }

    let inbox = container.appendingPathComponent(inboxDirectoryName, isDirectory: true)
    try fileManager.createDirectory(at: inbox, withIntermediateDirectories: true)

    let now = Date().timeIntervalSince1970
    let pending = PendingShare(text: text, truncated: truncated, createdAt: now)
    let data = try JSONEncoder().encode(pending)
    let fileName = "\(Int(now * 1_000))-\(UUID().uuidString).json"
    let destination = inbox.appendingPathComponent(fileName, isDirectory: false)
    try data.write(to: destination, options: [.atomic])
    try? fileManager.setAttributes(
      [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
      ofItemAtPath: destination.path
    )
  }

  private func showLoadError(_ message: String) {
    sharedText = nil
    previewView.text = message
    activityIndicator.stopAnimating()
    reviewButton.isEnabled = false
  }

  @objc private func saveForReview() {
    guard !hasFinished, let sharedText, !sharedText.isEmpty else { return }

    reviewButton.isEnabled = false
    activityIndicator.startAnimating()
    let truncated = contentWasTruncated
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      do {
        try Self.persistForReview(sharedText, truncated: truncated)
        DispatchQueue.main.async { self?.finishExtension() }
      } catch {
        DispatchQueue.main.async {
          guard let self else { return }
          self.activityIndicator.stopAnimating()
          self.reviewButton.isEnabled = true
          let alert = UIAlertController(
            title: "Could Not Save Share",
            message: "Try again. AGI Workforce will not receive this content until it is saved.",
            preferredStyle: .alert
          )
          alert.addAction(UIAlertAction(title: "OK", style: .default))
          self.present(alert, animated: true)
        }
      }
    }
  }

  @objc private func cancel() {
    guard !hasFinished else { return }
    hasFinished = true
    extensionContext?.cancelRequest(
      withError: NSError(
        domain: NSCocoaErrorDomain,
        code: NSUserCancelledError,
        userInfo: [NSLocalizedDescriptionKey: "Share cancelled"]
      )
    )
  }

  private func finishExtension() {
    guard !hasFinished else { return }
    hasFinished = true
    extensionContext?.completeRequest(returningItems: nil)
  }
}
