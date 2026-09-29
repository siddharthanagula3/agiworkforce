import AppIntents
import SwiftUI
import WidgetKit

private enum AGIWidgetLink {
    static let newChat = URL(string: "agiworkforce://intent/chat")!
    static let camera = URL(string: "agiworkforce://intent/camera")!
    static let voice = URL(string: "agiworkforce://intent/voice")!
}

struct AGIQuickActionsEntry: TimelineEntry {
    let date: Date
}

struct AGIQuickActionsProvider: TimelineProvider {
    func placeholder(in context: Context) -> AGIQuickActionsEntry { AGIQuickActionsEntry(date: .now) }

    func getSnapshot(in context: Context, completion: @escaping (AGIQuickActionsEntry) -> Void) {
        completion(AGIQuickActionsEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AGIQuickActionsEntry>) -> Void) {
        completion(Timeline(entries: [AGIQuickActionsEntry(date: .now)], policy: .never))
    }
}

private struct AGIActionButton: View {
    let title: String
    let symbol: String
    let url: URL

    var body: some View {
        Link(destination: url) {
            VStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .semibold))
                Text(title)
                    .font(.caption)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: 14))
        }
        .accessibilityLabel(title)
    }
}

struct AGIQuickActionsView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 26, weight: .semibold))
                Spacer()
                Text("New chat")
                    .font(.headline)
                Text("AGI Workforce")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .widgetURL(AGIWidgetLink.newChat)
        default:
            HStack(spacing: 10) {
                AGIActionButton(title: "New chat", symbol: "square.and.pencil", url: AGIWidgetLink.newChat)
                AGIActionButton(title: "Camera", symbol: "camera", url: AGIWidgetLink.camera)
                AGIActionButton(title: "Dictate", symbol: "mic", url: AGIWidgetLink.voice)
            }
        }
    }
}

struct AGIQuickActionsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "AGIQuickActions", provider: AGIQuickActionsProvider()) { _ in
            AGIQuickActionsView()
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("AGI Workforce")
        .description("Start a new chat, open the camera or dictate.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@available(iOS 18.0, *)
struct OpenAGIWorkforceIntent: AppIntent {
    static var title: LocalizedStringResource = "Open AGI Workforce"
    static var openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult { .result() }
}

@available(iOS 18.0, *)
struct AGIOpenControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.agiworkforce.app.open") {
            ControlWidgetButton(action: OpenAGIWorkforceIntent()) {
                Label("AGI Workforce", systemImage: "bubble.left.and.bubble.right.fill")
            }
        }
        .displayName("Open AGI Workforce")
        .description("Open AGI Workforce from Control Center, the Lock Screen or the Action Button.")
    }
}

@main
struct AGIWidgetsBundle: WidgetBundle {
    var body: some Widget {
        AGIQuickActionsWidget()
        if #available(iOS 18.0, *) {
            AGIOpenControl()
        }
    }
}
