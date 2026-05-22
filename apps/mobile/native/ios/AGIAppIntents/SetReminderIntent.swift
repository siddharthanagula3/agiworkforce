import AppIntents

// "Set reminder via AGI" — routes to AGI chat with a pre-filled reminder prompt.
// AGI's calendar/reminder agent tool handles the actual Reminders.app write.
@available(iOS 16.0, *)
struct SetReminderIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Reminder via AGI"
    static var description = IntentDescription(
        "Ask AGI to set a reminder on your behalf.",
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
