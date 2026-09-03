import AppIntents

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
