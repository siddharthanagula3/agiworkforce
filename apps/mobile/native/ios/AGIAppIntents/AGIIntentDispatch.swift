import Foundation
import AppIntents
import UIKit

// Central deep-link dispatcher for all AGI App Intents.
// Each Intent calls `AGIIntentDispatch.open(_:)` with a pre-built URL;
// the RN runtime picks it up via expo-linking in the root _layout.tsx handler.
//
// URL format: agiworkforce://intent/<verb>?<params>
// Verbs: chat, ask, summarize, analyze_image, transcribe, translate, scan, remind
//
// Works offline, no network call is made here. The RN side handles the intent
// params once the app is foregrounded.

enum AGIIntentDispatch {
    static let scheme = "agiworkforce"

    static func url(verb: String, params: [String: String] = [:]) -> URL? {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "intent"
        components.path = "/\(verb)"
        if !params.isEmpty {
            components.queryItems = params.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        return components.url
    }

    @discardableResult
    static func open(verb: String, params: [String: String] = [:]) -> Bool {
        guard let url = url(verb: verb, params: params) else { return false }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
        return true
    }
}
