import AppIntents

// AppShortcutsProvider registers phrase triggers for Siri, Spotlight, and the
// Shortcuts app. Phrase strings use ${applicationName} so they stay correct if
// the bundle display name ever changes, and are localizable via
// AppShortcuts.xcstrings (see en.lproj/ below for English defaults).
//
// Visual Intelligence (iOS 18+): AnalyzeImageIntent and ScanIntent are
// discoverable on-screen via the Intent's `@available(iOS 16.0, *)` guard;
// the system registers them as Visual Intelligence actions automatically when
// the host app has the `com.apple.developer.intents` entitlement.
@available(iOS 16.0, *)
struct AGIAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: StartChatIntent(),
            phrases: [
                "Start chat with \(.applicationName)",
                "Open \(.applicationName)",
                "New conversation in \(.applicationName)",
            ],
            shortTitle: "Start Chat",
            systemImageName: "bubble.left.and.bubble.right"
        )

        AppShortcut(
            intent: AskAGIIntent(),
            phrases: [
                "Ask \(.applicationName)",
                "\(.applicationName) answer my question",
                "Talk to \(.applicationName)",
            ],
            shortTitle: "Ask AGI",
            systemImageName: "questionmark.bubble"
        )

        AppShortcut(
            intent: SummarizeIntent(),
            phrases: [
                "Summarize this with \(.applicationName)",
                "Summarize with \(.applicationName)",
                "\(.applicationName) summarize this",
            ],
            shortTitle: "Summarize",
            systemImageName: "text.quote"
        )

        AppShortcut(
            intent: AnalyzeImageIntent(),
            phrases: [
                "Analyze this image with \(.applicationName)",
                "Analyze image with \(.applicationName)",
                "\(.applicationName) analyze this photo",
            ],
            shortTitle: "Analyze Image",
            systemImageName: "photo.on.rectangle.angled"
        )

        AppShortcut(
            intent: TranscribeIntent(),
            phrases: [
                "Transcribe with \(.applicationName)",
                "Transcribe audio with \(.applicationName)",
                "\(.applicationName) transcribe this",
            ],
            shortTitle: "Transcribe",
            systemImageName: "waveform"
        )

        AppShortcut(
            intent: TranslateIntent(),
            phrases: [
                "Translate with \(.applicationName)",
                "Translate this with \(.applicationName)",
                "\(.applicationName) translate this",
            ],
            shortTitle: "Translate",
            systemImageName: "character.bubble"
        )

        AppShortcut(
            intent: ScanIntent(),
            phrases: [
                "Scan with \(.applicationName)",
                "Scan document with \(.applicationName)",
                "\(.applicationName) scan this",
            ],
            shortTitle: "Scan",
            systemImageName: "doc.viewfinder"
        )

        AppShortcut(
            intent: SetReminderIntent(),
            phrases: [
                "Set reminder via \(.applicationName)",
                "Remind me via \(.applicationName)",
                "\(.applicationName) remind me",
            ],
            shortTitle: "Set Reminder",
            systemImageName: "bell"
        )
    }
}
