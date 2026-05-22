import AppIntents

// "Start chat with AGI" — opens AGI and starts a new empty conversation.
// Discoverable via Siri, Spotlight, and the Shortcuts app.
@available(iOS 16.0, *)
struct StartChatIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Chat with AGI"
    static var description = IntentDescription("Opens AGI and starts a new conversation.")
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult {
        AGIIntentDispatch.open(verb: "chat")
        return .result()
    }
}
