import XCTest
@testable import AGIAppIntents

// Tests verifying each Intent's parameter extraction logic.
// These tests inspect the URL produced by the dispatch helper rather than
// calling `perform()` (which requires UIApplication) — isolating the
// parameter-mapping logic that is under our control.
@available(iOS 16.0, *)
final class IntentParameterExtractionTests: XCTestCase {

    // MARK: AskAGIIntent

    func testAskIntentPromptsEncoded() {
        let url = AGIIntentDispatch.url(verb: "ask", params: ["prompt": "What is AGI?"])!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "prompt" })?.value, "What is AGI?")
    }

    func testAskIntentEmptyPromptIsValid() {
        let url = AGIIntentDispatch.url(verb: "ask", params: ["prompt": ""])
        XCTAssertNotNil(url)
    }

    // MARK: SummarizeIntent

    func testSummarizeTextParam() {
        let text = "Apple announced new developer tools at WWDC."
        let url = AGIIntentDispatch.url(verb: "summarize", params: ["text": text])!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "text" })?.value, text)
    }

    // MARK: AnalyzeImageIntent

    func testAnalyzeImageIntentParamsWhenQuestionPresent() {
        let params: [String: String] = [
            "intent": "analyze_image",
            "imageUri": "file:///tmp/photo.jpg",
            "question": "What breed is this dog?",
        ]
        let url = AGIIntentDispatch.url(verb: "analyze_image", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let items = components.queryItems ?? []
        XCTAssertEqual(items.first(where: { $0.name == "question" })?.value, "What breed is this dog?")
        XCTAssertEqual(items.first(where: { $0.name == "imageUri" })?.value, "file:///tmp/photo.jpg")
        XCTAssertEqual(items.first(where: { $0.name == "intent" })?.value, "analyze_image")
    }

    func testAnalyzeImageIntentParamsWhenNoQuestion() {
        let params: [String: String] = [
            "intent": "analyze_image",
            "imageUri": "file:///tmp/photo.jpg",
        ]
        let url = AGIIntentDispatch.url(verb: "analyze_image", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let questionItem = components.queryItems?.first(where: { $0.name == "question" })
        XCTAssertNil(questionItem)
    }

    // MARK: TranscribeIntent

    func testTranscribeIntentAudioUri() {
        let params: [String: String] = [
            "intent": "transcribe",
            "audioUri": "file:///tmp/recording.m4a",
        ]
        let url = AGIIntentDispatch.url(verb: "transcribe", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(
            components.queryItems?.first(where: { $0.name == "audioUri" })?.value,
            "file:///tmp/recording.m4a"
        )
    }

    // MARK: TranslateIntent

    func testTranslateIntentWithTargetLanguage() {
        let params: [String: String] = ["text": "Hello", "targetLanguage": "French"]
        let url = AGIIntentDispatch.url(verb: "translate", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "targetLanguage" })?.value, "French")
    }

    func testTranslateIntentWithoutTargetLanguage() {
        let params: [String: String] = ["text": "Bonjour"]
        let url = AGIIntentDispatch.url(verb: "translate", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertNil(components.queryItems?.first(where: { $0.name == "targetLanguage" }))
    }

    // MARK: ScanIntent

    func testScanIntentNoImageProducesEmptyParams() {
        let url = AGIIntentDispatch.url(verb: "scan", params: [:])!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertNil(components.queryItems)
    }

    func testScanIntentWithImageUri() {
        let params: [String: String] = ["imageUri": "file:///tmp/doc.jpg"]
        let url = AGIIntentDispatch.url(verb: "scan", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "imageUri" })?.value, "file:///tmp/doc.jpg")
    }

    // MARK: SetReminderIntent

    func testReminderIntentWithWhen() {
        let params: [String: String] = ["reminder": "call dentist", "when": "tomorrow at 9am"]
        let url = AGIIntentDispatch.url(verb: "remind", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "reminder" })?.value, "call dentist")
        XCTAssertEqual(components.queryItems?.first(where: { $0.name == "when" })?.value, "tomorrow at 9am")
    }

    func testReminderIntentWithoutWhen() {
        let params: [String: String] = ["reminder": "buy groceries"]
        let url = AGIIntentDispatch.url(verb: "remind", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertNil(components.queryItems?.first(where: { $0.name == "when" }))
    }

    // MARK: StartChatIntent

    func testStartChatURLHasNoChatParams() {
        let url = AGIIntentDispatch.url(verb: "chat")!
        XCTAssertEqual(url.path, "/chat")
        XCTAssertEqual(url.host, "intent")
    }
}
