import Foundation
import AppIntents
import UIKit


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
