import AppIntents

@available(iOS 16.0, *)
struct TranscribeIntent: AppIntent {
    static var title: LocalizedStringResource = "Transcribe with AGI"
    static var description = IntentDescription(
        "Transcribe an audio recording using AGI.",
        categoryName: "Audio"
    )
    static var openAppWhenRun: Bool = true

    @Parameter(
        title: "Audio",
        description: "The audio file to transcribe.",
        supportedTypeIdentifiers: ["public.audio", "public.mpeg-4-audio", "com.apple.m4a-audio"]
    )
    var audio: IntentFile

    func perform() async throws -> some IntentResult {
        var params: [String: String] = ["intent": "transcribe"]
        if let url = audio.fileURL {
            params["audioUri"] = url.absoluteString
        }
        AGIIntentDispatch.open(verb: "transcribe", params: params)
        return .result()
    }
}
