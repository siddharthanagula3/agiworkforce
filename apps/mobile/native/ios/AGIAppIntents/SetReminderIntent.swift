import AppIntents

// "Set reminder via AGI" — routes to AGI chat with a pre-filled reminder prompt.
// The deep link only drafts the request; nothing is written to Reminders.app
// by this intent, so the user-facing strings must not promise that.
@available(iOS 16.0, *)
struct SetReminderIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Reminder via AGI"
    static var description = IntentDescription(
        "Opens AGI chat with a drafted reminder request for you to review and send.",
        categoryName: "Productivity"
    )
    static var openAppWhenRun: Bool = true

    @Parameter(title: "Reminder", description: "What to be reminded about.")
    var reminderText: String

    @Parameter(title: "When", description: "Optional natural-language time (e.g. 'tomorrow at 9am').")
    var when: String?

    static var parameterSummary: some ParameterSummary {
        When(\.$when, .hasAnyValue) {
            Summary("Remind me to \(\.$reminderText) at \(\.$when) via AGI")
        } otherwise: {
            Summary("Remind me to \(\.$reminderText) via AGI")
        }
    }

    func perform() async throws -> some IntentResult {
        var params: [String: String] = ["reminder": reminderText]
        if let w = when, !w.isEmpty {
            params["when"] = w
        }
        AGIIntentDispatch.open(verb: "remind", params: params)
        return .result()
    }
}
