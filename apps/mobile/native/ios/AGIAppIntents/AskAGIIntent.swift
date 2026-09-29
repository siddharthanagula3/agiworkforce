import AppIntents
import Foundation
import Security

@available(iOS 16.0, *)
struct AskAGIIntent: AppIntent {
    static var title: LocalizedStringResource = "Ask AGI Workforce"
    static var description = IntentDescription(
        "Ask AGI Workforce a question and hear the answer without opening the app. Turn on Ask from Siri in the app first."
    )
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "Question",
        description: "What do you want to ask AGI Workforce?",
        requestValueDialog: IntentDialog("What do you want to ask?")
    )
    var prompt: String

    static var parameterSummary: some ParameterSummary {
        Summary("Ask AGI Workforce \(\.$prompt)")
    }

    func perform() async throws -> some IntentResult & ProvidesDialog & ReturnsValue<String> {
        let answer = await AGIAskClient.ask(prompt)
        return .result(value: answer, dialog: IntentDialog(stringLiteral: answer))
    }
}

enum AGIAskClient {
    static let signInMessage = "Open AGI Workforce to sign in."
    static let unavailableMessage = "AGI Workforce could not answer right now. Try again in the app."
    private static let keychainService = "com.agiworkforce.app.ask-intent:no-auth"
    private static let keychainKey = "ask_intent_token"
    private static let path = "/api/mobile/intent/ask"
    private static let maxPromptCharacters = 2_000

    static func ask(_ prompt: String) async -> String {
        let question = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, question.count <= maxPromptCharacters else {
            return "Ask a shorter question."
        }
        guard let token = storedToken(), let url = endpoint() else { return signInMessage }

        var request = URLRequest(url: url, timeoutInterval: 55)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["prompt": question])

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let body = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            if status == 200, let text = body?["text"] as? String, !text.isEmpty { return text }
            if status == 401 { return signInMessage }
            if let error = body?["error"] as? [String: Any], let message = error["message"] as? String {
                return message
            }
            return unavailableMessage
        } catch {
            return unavailableMessage
        }
    }

    private static func endpoint() -> URL? {
        guard let base = Bundle.main.object(forInfoDictionaryKey: "AGIApiBaseURL") as? String,
              let origin = URL(string: base), origin.scheme == "https"
        else { return nil }
        return URL(string: path, relativeTo: origin)
    }

    private static func storedToken() -> String? {
        let key = Data(keychainKey.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrGeneric as String: key,
            kSecAttrAccount as String: key,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let token = String(data: data, encoding: .utf8),
              token.hasPrefix("agi_it_")
        else { return nil }
        return token
    }
}
