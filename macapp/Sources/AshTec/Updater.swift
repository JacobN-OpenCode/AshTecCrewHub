import AppKit
import Foundation

// In-app updating (ticket c80f5a65).
//
// The app can replace itself because it is not sandboxed: download the new zip,
// unpack it somewhere safe, then hand the actual swap to a tiny shell script
// that waits for this process to exit before touching the bundle. Nothing can
// overwrite a bundle while it is running, so the script has to outlive the app.
//
// No Sparkle, no Apple Developer account, no helper daemon. The new copy keeps
// its quarantine flag stripped (`xattr -dr`) so the swap does not leave the crew
// clicking through Gatekeeper after every update.
final class Updater {

    struct Release {
        let version: String
        let url: URL
    }

    struct Failure: LocalizedError {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }

    private struct Latest: Decodable {
        let version: String
        let url: String
    }

    private static let site = "https://ashtec.dino.icu"
    private static let endpoint = URL(string: site + "/downloads/latest.json")!

    private(set) var busy = false

    /// Asks the site which build it is handing out. `completion` gets nil when
    /// this copy is already the newest one, or when the site cannot be reached:
    /// a failed check must never look like an available update.
    func check(completion: @escaping (Release?) -> Void) {
        let local = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0"
        var request = URLRequest(url: Updater.endpoint)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, _, _ in
            var found: Release?
            if let data,
               let latest = try? JSONDecoder().decode(Latest.self, from: data),
               let url = Updater.url(for: latest.url),
               Updater.isNewer(latest.version, than: local) {
                found = Release(version: latest.version, url: url)
            }
            DispatchQueue.main.async { completion(found) }
        }.resume()
    }

    /// Downloads, unpacks, then swaps this bundle for the new one and quits.
    /// `progress` is called on the main thread with a line for the panel;
    /// `failure` means nothing was changed.
    func install(_ release: Release,
                 progress: @escaping (String) -> Void,
                 failure: @escaping (String) -> Void) {
        guard !busy else { return }
        busy = true

        let report: (String) -> Void = { line in DispatchQueue.main.async { progress(line) } }
        let fail: (String) -> Void = { [weak self] message in
            self?.busy = false
            DispatchQueue.main.async { failure(message) }
        }

        guard Bundle.main.bundlePath.hasSuffix(".app") else {
            fail("AshTec is not running as an app bundle, so it cannot replace itself. Open AshTec.app instead of the raw binary.")
            return
        }

        let current = Bundle.main.bundlePath
        guard let target = Updater.installTarget(replacing: current) else {
            fail("There is nowhere AshTec is allowed to write. Move AshTec.app into your Applications folder and try again.")
            return
        }

        let work = FileManager.default.temporaryDirectory
            .appendingPathComponent("ashtec-update-" + UUID().uuidString)
        let script = FileManager.default.temporaryDirectory
            .appendingPathComponent("ashtec-swap-" + UUID().uuidString + ".sh")

        report("Downloading \(release.version)…")
        var request = URLRequest(url: release.url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { data, _, error in
            guard let data, !data.isEmpty else {
                fail("The download failed: " + (error?.localizedDescription ?? "the file was empty."))
                return
            }
            do {
                try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
                let zip = work.appendingPathComponent("AshTec.zip")
                try data.write(to: zip)

                report("Unpacking \(release.version)…")
                try Updater.unzip(zip, into: work)
                let unpacked = work.appendingPathComponent("AshTec.app")
                guard FileManager.default.fileExists(atPath: unpacked.path) else {
                    throw Failure("The download did not contain AshTec.app.")
                }

                report("Installing…")
                let body = Updater.swapScript(new: unpacked.path,
                                              target: target,
                                              current: current,
                                              work: work.path,
                                              pid: ProcessInfo.processInfo.processIdentifier)
                try body.write(to: script, atomically: true, encoding: .utf8)
                try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)

                let runner = Process()
                runner.executableURL = URL(fileURLWithPath: "/bin/sh")
                runner.arguments = ["-c", "/usr/bin/nohup " + Updater.shellQuote(script.path) + " >/dev/null 2>&1 &"]
                try runner.run()

                DispatchQueue.main.async {
                    progress("AshTec will reopen in a moment.")
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { NSApp.terminate(nil) }
                }
            } catch {
                fail(error.localizedDescription)
            }
        }.resume()
    }

    // MARK: pieces

    static func isNewer(_ remote: String, than local: String) -> Bool {
        let a = remote.split(separator: ".").map { Int($0) ?? 0 }
        let b = local.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<Swift.max(a.count, b.count) {
            let mine = i < b.count ? b[i] : 0
            let theirs = i < a.count ? a[i] : 0
            if mine != theirs { return theirs > mine }
        }
        return false
    }

    private static func url(for path: String) -> URL? {
        if path.hasPrefix("http") { return URL(string: path) }
        return URL(string: site + (path.hasPrefix("/") ? path : "/" + path))
    }

    /// Where the new bundle should land. In place when the folder allows it,
    /// otherwise ~/Applications, which always does.
    static func installTarget(replacing current: String) -> String? {
        let fm = FileManager.default
        let parent = (current as NSString).deletingLastPathComponent
        if fm.isWritableFile(atPath: parent) { return current }

        let apps = fm.homeDirectoryForCurrentUser.appendingPathComponent("Applications")
        try? fm.createDirectory(at: apps, withIntermediateDirectories: true)
        guard fm.isWritableFile(atPath: apps.path) else { return nil }
        return apps.appendingPathComponent("AshTec.app").path
    }

    private static func unzip(_ zip: URL, into dir: URL) throws {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        p.arguments = ["-x", "-k", zip.path, dir.path]
        try p.run()
        p.waitUntilExit()
        guard p.terminationStatus == 0 else {
            throw Failure("The download could not be unpacked.")
        }
    }

    static func shellQuote(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    /// The script that outlives the app: wait for our pid to go, then swap.
    static func swapScript(new: String, target: String, current: String, work: String, pid: Int32) -> String {
        let quotedNew = shellQuote(new)
        let quotedTarget = shellQuote(target)
        let quotedCurrent = shellQuote(current)
        let quotedWork = shellQuote(work)
        return """
        #!/bin/sh
        # Written by AshTec just before it quits. Waits for the old copy to exit,
        # puts the new bundle where the old one was, and opens it.
        while /bin/kill -0 \(pid) 2>/dev/null; do /bin/sleep 0.3; done
        /bin/sleep 0.8
        /bin/rm -rf \(quotedTarget)
        /bin/cp -R \(quotedNew) \(quotedTarget)
        /usr/bin/xattr -dr com.apple.quarantine \(quotedTarget) >/dev/null 2>&1
        /usr/bin/open \(quotedTarget)
        if [ \(quotedCurrent) != \(quotedTarget) ]; then
          /bin/rm -rf \(quotedCurrent) >/dev/null 2>&1
        fi
        /bin/rm -rf \(quotedWork) >/dev/null 2>&1
        /bin/rm -f "$0" >/dev/null 2>&1
        exit 0

        """
    }
}

/// The little "Updating AshTec…" panel. Frame layout on purpose: it is three
/// views and Auto Layout would be more code than the thing it lays out.
final class UpdatePanel {
    private let panel: NSPanel
    private let label: NSTextField

    init(title: String) {
        let window = NSPanel(contentRect: NSRect(x: 0, y: 0, width: 400, height: 96),
                             styleMask: [.titled],
                             backing: .buffered,
                             defer: false)
        window.title = title
        window.isMovableByWindowBackground = true
        window.isReleasedWhenClosed = false

        let field = NSTextField(labelWithString: "Starting")
        field.frame = NSRect(x: 18, y: 54, width: 364, height: 20)
        field.font = NSFont.systemFont(ofSize: 12)

        let bar = NSProgressIndicator(frame: NSRect(x: 18, y: 24, width: 364, height: 14))
        bar.style = .bar
        bar.isIndeterminate = true
        bar.startAnimation(nil)

        let content = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 96))
        content.addSubview(field)
        content.addSubview(bar)
        window.contentView = content

        panel = window
        label = field
    }

    func show() {
        panel.center()
        panel.makeKeyAndOrderFront(nil)
    }

    func set(_ line: String) {
        label.stringValue = line
    }

    func close() {
        panel.orderOut(nil)
    }
}
