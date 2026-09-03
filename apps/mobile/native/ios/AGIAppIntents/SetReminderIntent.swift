import AppIntents
import Foundation

@available(iOS 16.0, *)
struct SetReminderIntent: AppIntent {
  static var title: LocalizedStringResource = "Set Reminder via AGI"
  static var description = IntentDescription(
    "Opens AGI Workforce to review and create an Apple Reminder.",
    categoryName: "Productivity"
  )
  static var openAppWhenRun: Bool = true

  @Parameter(title: "Reminder", description: "What to be reminded about.")
  var reminderText: String

  @Parameter(title: "When", description: "Optional due date and time.")
  var when: Date?

  static var parameterSummary: some ParameterSummary {
    When(\.$when, .hasAnyValue) {
      Summary("Remind me to \(\.$reminderText) at \(\.$when) via AGI")
    } otherwise: {
      Summary("Remind me to \(\.$reminderText) via AGI")
    }
  }

  func perform() async throws -> some IntentResult {
    var params: [String: String] = ["reminder": reminderText]
    if let when {
      params["due"] = ISO8601DateFormatter().string(from: when)
    }
    AGIIntentDispatch.open(verb: "remind", params: params)
    return .result()
  }
}
