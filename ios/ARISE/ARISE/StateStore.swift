import Foundation

/* The web dashboard keeps its state in localStorage. The native shell mirrors
   that JSON into the app's sandbox so a WKWebView data reset cannot wipe it. */
enum StateStore {
    static let key = "arise-hunter-system-v1"

    private static var fileURL: URL? {
        guard let root = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else { return nil }

        let folder = root.appendingPathComponent("ARISE", isDirectory: true)
        do {
            try FileManager.default.createDirectory(
                at: folder,
                withIntermediateDirectories: true
            )
        } catch {
            return nil
        }
        return folder.appendingPathComponent("state.json")
    }

    static func load() -> String? {
        guard let url = fileURL else { return nil }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    static func save(_ json: String) {
        guard let url = fileURL, let data = json.data(using: .utf8) else { return }
        try? data.write(to: url, options: .atomic)
    }
}
