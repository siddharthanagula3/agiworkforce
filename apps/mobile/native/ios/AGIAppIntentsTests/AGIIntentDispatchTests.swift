import XCTest
@testable import AGIAppIntents

// Tests for AGIIntentDispatch URL construction.
// These run without a simulator — no UIApplication.shared calls are made.
final class AGIIntentDispatchTests: XCTestCase {

    func testURLSchemeAndHost() {
        let url = AGIIntentDispatch.url(verb: "chat")!
        XCTAssertEqual(url.scheme, "agiworkforce")
        XCTAssertEqual(url.host, "intent")
        XCTAssertEqual(url.path, "/chat")
    }

    func testURLWithParams() {
        let url = AGIIntentDispatch.url(verb: "ask", params: ["prompt": "hello world"])!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let query = components.queryItems?.first(where: { $0.name == "prompt" })
        XCTAssertEqual(query?.value, "hello world")
    }

    func testURLEncodesSpecialCharacters() {
        let url = AGIIntentDispatch.url(verb: "summarize", params: ["text": "Hello & World / Test"])!
        // URL must be valid (non-nil) with special chars
        XCTAssertNotNil(url)
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let text = components.queryItems?.first(where: { $0.name == "text" })?.value
        XCTAssertEqual(text, "Hello & World / Test")
    }

    func testAllVerbsProduceValidURLs() {
        let verbs = ["chat", "ask", "summarize", "analyze_image", "transcribe", "translate", "scan", "remind"]
        for verb in verbs {
            let url = AGIIntentDispatch.url(verb: verb)
            XCTAssertNotNil(url, "Expected non-nil URL for verb '\(verb)'")
            XCTAssertEqual(url?.path, "/\(verb)")
        }
    }

    func testEmptyParamsProducesNoQueryItems() {
        let url = AGIIntentDispatch.url(verb: "chat", params: [:])!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        XCTAssertNil(components.queryItems)
    }

    func testMultipleParamsAllPresent() {
        let params = ["text": "foo", "targetLanguage": "Spanish"]
        let url = AGIIntentDispatch.url(verb: "translate", params: params)!
        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let items = components.queryItems ?? []
        let names = Set(items.compactMap { $0.name })
        XCTAssertTrue(names.contains("text"))
        XCTAssertTrue(names.contains("targetLanguage"))
    }
}
