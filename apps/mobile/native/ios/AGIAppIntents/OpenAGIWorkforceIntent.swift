import AppIntents

// Compiled into both the app target and the AGIWidgets extension: a control
// opens the app only when its intent is a member of both targets.
@available(iOS 18.0, *)
struct OpenAGIWorkforceIntent: AppIntent {
    static var title: LocalizedStringResource = "Open AGI Mobile"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult { .result() }
}
