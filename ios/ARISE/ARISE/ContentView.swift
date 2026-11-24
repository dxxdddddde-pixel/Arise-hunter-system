import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        AriseWebView()
            .ignoresSafeArea()
            .preferredColorScheme(.dark)
            .statusBar(hidden: true)
    }
}

struct AriseWebView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "ariseBridge")

        // Restore the last saved state into localStorage before the page scripts run.
        if let saved = StateStore.load(),
           let wrapped = try? JSONSerialization.data(withJSONObject: [saved], options: []),
           let literal = String(data: wrapped, encoding: .utf8) {
            let restore = "try{localStorage.setItem('\(StateStore.key)',\(literal)[0]);}catch(e){}"
            contentController.addUserScript(
                WKUserScript(
                    source: restore,
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        }

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 4 / 255, green: 6 / 255, blue: 13 / 255, alpha: 1)
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]

        HealthKitManager.shared.attach(webView: webView)

        if let root = Bundle.main.url(forResource: "Web", withExtension: nil) {
            webView.loadFileURL(
                root.appendingPathComponent("index.html"),
                allowingReadAccessTo: root
            )
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKScriptMessageHandler {
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "ariseBridge",
                  let body = message.body as? [String: Any] else { return }

            switch body["type"] as? String ?? "" {
            case "ready":
                HealthKitManager.shared.syncIfReady()
            case "sync":
                HealthKitManager.shared.requestAuthorizationAndSync()
            case "state":
                if let json = body["data"] as? String { StateStore.save(json) }
            default:
                break
            }
        }
    }
}
