import AppIntents

@available(iOS 16.0, *)
struct SummarizeIntent: AppIntent {
    static var title: LocalizedStringResource = "Summarize with AGI"
    static var description = IntentDescription(
        "Summarize text using AGI's on-device AI.",
        categoryName: "Text"
    )
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Text", description: "Text to summarize.")
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Summarize \(\.$text) with AGI")
    }

    func perform() async throws -> some IntentResult {
        AGIIntentDispatch.open(verb: "summarize", params: ["text": text])
        return .result()
    }
}
