import AppIntents

@available(iOS 16.0, *)
struct AnalyzeImageIntent: AppIntent {
    static var title: LocalizedStringResource = "Analyze Image with AGI"
    static var description = IntentDescription(
        "Analyze an image using AGI's on-device AI.",
        categoryName: "Images"
    )
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Image", description: "The image to analyze.", supportedTypeIdentifiers: ["public.image"])
    var image: IntentFile

    @Parameter(title: "Question", description: "Optional question about the image.")
    var question: String?

    static var parameterSummary: some ParameterSummary {
        When(\.$question, .hasAnyValue) {
            Summary("Analyze \(\.$image), \(\.$question), with AGI")
        } otherwise: {
            Summary("Analyze \(\.$image) with AGI")
        }
    }

    func perform() async throws -> some IntentResult {
        var params: [String: String] = ["intent": "analyze_image"]
        if let q = question, !q.isEmpty {
            params["question"] = q
        }
        if let url = image.fileURL {
            params["imageUri"] = url.absoluteString
        }
        AGIIntentDispatch.open(verb: "analyze_image", params: params)
        return .result()
    }
}
