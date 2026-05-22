import AppIntents

// "Translate with AGI" — text intent. Routes to the on-device translate screen.
@available(iOS 16.0, *)
struct TranslateIntent: AppIntent {
    static var title: LocalizedStringResource = "Translate with AGI"
    static var description = IntentDescription(
        "Translate text into another language using AGI.",
        categoryName: "Text"
    )
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Text", description: "Text to translate.")
    var text: String

    @Parameter(title: "Target Language", description: "Language to translate into (e.g. 'Spanish').")
    var targetLanguage: String?

    static var parameterSummary: some ParameterSummary {
        When(\.$targetLanguage, .hasAnyValue) {
            Summary("Translate \(\.$text) to \(\.$targetLanguage) with AGI")
        } otherwise: {
            Summary("Translate \(\.$text) with AGI")
        }
    }

    func perform() async throws -> some IntentResult {
        var params: [String: String] = ["text": text]
        if let lang = targetLanguage, !lang.isEmpty {
            params["targetLanguage"] = lang
        }
        AGIIntentDispatch.open(verb: "translate", params: params)
        return .result()
    }
}
