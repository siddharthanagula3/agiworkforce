import AppIntents

@available(iOS 16.0, *)
struct AskAGIIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask AGI"
    static var description = IntentDescription("Ask AGI any question and get an answer.")
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Question", description: "What do you want to ask AGI?")
    var prompt: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask AGI \(\.$prompt)")
    }

    func perform() async throws -> some IntentResult {
        AGIIntentDispatch.open(verb: "ask", params: ["prompt": prompt])
        return .result()
    }
}
