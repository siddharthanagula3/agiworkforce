import AppIntents

// "Scan with AGI" — camera intent. Opens the camera-scan flow (document / QR / text OCR).
// Registers as a Visual Intelligence onscreen intent via @available(iOS 18.0, *) guard below.
@available(iOS 16.0, *)
struct ScanIntent: AppIntent {
    static var title: LocalizedStringResource = "Scan with AGI"
    static var description = IntentDescription(
        "Use your camera to scan a document, QR code, or text with AGI.",
        categoryName: "Camera"
    )
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Image", description: "Optional image to scan instead of opening the camera.", supportedTypeIdentifiers: ["public.image"])
    var image: IntentFile?

    func perform() async throws -> some IntentResult {
        var params: [String: String] = [:]
        if let file = image, let url = file.fileURL {
            params["imageUri"] = url.absoluteString
        }
        AGIIntentDispatch.open(verb: "scan", params: params)
        return .result()
    }
}
