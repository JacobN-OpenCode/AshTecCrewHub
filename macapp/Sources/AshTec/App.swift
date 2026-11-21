import AppKit
import WebKit
import UserNotifications

// AshTec for macOS (feedback round 2, round 3).
//
// A full-page embed of the crew hub that presents itself as an installed app
// (a PWA) and delivers its notifications natively. The site runs exactly as it
// does in a browser — its own header, sidebar and pages — filling the window.
// Two things make it an app rather than a browser tab:
//
//   * The page is told it is a PWA (standalone display), so the site treats
//     itself as installed.
//   * Notifications reach the Mac: the app bridges the Web Notification API to
//     macOS, and polls the same endpoints the site's push would, so call and
//     live-show movement alerts arrive as real notifications.
//
// AppKit + WKWebView, so it builds with the Command Line Tools (SwiftUI needs
// full Xcode). Launch with `open AshTec.app`: running the binary directly from
// a shell does not fire applicationDidFinishLaunching.

let APP_URL = "https://ashtec.dino.icu"

// MARK: - Next-call model

struct Call: Codable {
    let title: String
    let show: String?
    let date: String?
    let dateTbc: Bool?
    let meetTime: String?
    let startTime: String?
    let when: String?

    var startDate: Date? {
        guard let date, let hm = Call.firstTime(startTime) ?? Call.firstTime(meetTime) else { return nil }
        let p = date.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        var c = DateComponents(); c.year = p[0]; c.month = p[1]; c.day = p[2]; c.hour = hm.0; c.minute = hm.1
        return Calendar.current.date(from: c)
    }
    static func firstTime(_ s: String?) -> (Int, Int)? {
        guard let s else { return nil }
        for raw in s.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "–" || $0 == "," }) {
            let t = raw.trimmingCharacters(in: CharacterSet(charactersIn: ".,()"))
            let bits = t.split(separator: ":")
            if bits.count == 2, let h = Int(bits[0]), let m = Int(bits[1]), h < 24, m < 60 { return (h, m) }
        }
        return nil
    }
}
struct Payload: Codable { let next: Call? }

// MARK: - The injected shim

/// Runs in the page before anything else. Makes the site believe it is an
/// installed PWA, bridges notifications to the native app, sends magic links
/// back to the app, and keeps the app fed with the data it needs to notify.
private let SHIM_JS = """
(() => {
  try {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (typeof q === 'string' && q.indexOf('display-mode: standalone') !== -1)
      ? { matches: true, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } }
      : mm(q);
    window.__ASHTEC_APP__ = true;
  } catch (e) {}

  const native = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ashtec;
  const post = (m) => { try { native && native.postMessage(m); } catch (e) {} };

  // Web Notification API -> native macOS notifications.
  try {
    class AppNotification extends EventTarget {
      constructor(title, options) {
        super();
        this.title = String(title == null ? 'AshTec' : title);
        this.body = (options && options.body) || '';
        post({ notify: { title: this.title, body: this.body } });
      }
      close() {}
      static get permission() { return window.__ashtecPerm || 'default'; }
      static requestPermission() {
        post({ askPermission: true });
        return Promise.resolve(window.__ashtecPerm || 'granted');
      }
    }
    window.Notification = AppNotification;
  } catch (e) {}

  // Magic links should come back to this app, not a browser.
  try {
    const orig = window.fetch;
    window.fetch = function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('/api/auth/magic-link') !== -1 && init && typeof init.body === 'string') {
          const b = JSON.parse(init.body); b.appScheme = 'ashtec';
          init = Object.assign({}, init, { body: JSON.stringify(b) });
        }
      } catch (e) {}
      return orig.call(this, input, init);
    };
  } catch (e) {}

  // Keep the app fed so it can notify even though a web view has no web push.
  const deviceKey = 'mac-' + Math.random().toString(36).slice(2, 10);
  async function poll() {
    try {
      const r = await window.fetch('/api/getCalendarFeed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (r.ok) { const d = await r.json(); if (d && d.url) post({ feed: d.url }); }
    } catch (e) {}
    try {
      const r = await window.fetch('/api/getLiveShowState', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceKey, deviceName: 'AshTec for Mac', platform: 'macOS' }) });
      if (r.ok) {
        const d = await r.json();
        const ls = d && d.liveShow;
        post({ live: { open: !!(d && d.open), alert: !!(ls && ls.movementAlert), message: (ls && ls.movementMessage) || '', name: (ls && ls.name) || '' } });
      }
    } catch (e) {}
  }
  setTimeout(poll, 4000);
  setInterval(poll, 30000);
})();
"""

// MARK: - App delegate

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, NSMenuDelegate {

    private var window: NSWindow!
    private var webView: WKWebView!

    private var feedURL: String = ""
    private var lastRefresh = Date.distantPast
    private var notifiedCalls = Set<String>()
    private var notifiedMovement: String?

    // MARK: lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWebView()
        buildWindow()
        requestNotificationPermission()

        // The next-call poll: a notification 15 minutes before a call.
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.checkNextCall() }

        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }

    /// `ashtec://verify?token=…` from the emailed sign-in link: redeem it in the
    /// web view so the session cookie lands where the site can use it.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "ashtec" {
            let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "token" }?.value ?? ""
            guard !token.isEmpty else { continue }
            var target = URLComponents(string: "\(APP_URL)/api/auth/verify")!
            target.queryItems = [URLQueryItem(name: "token", value: token), URLQueryItem(name: "callbackURL", value: "/")]
            window.makeKeyAndOrderFront(nil)
            webView.load(URLRequest(url: target.url!))
        }
    }

    // MARK: web view

    private func buildWebView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // persistent cookies + service worker
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(source: SHIM_JS, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(self, name: "ashtec")
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: URL(string: APP_URL)!))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }

        if let notify = body["notify"] as? [String: Any] {
            post(title: (notify["title"] as? String) ?? "AshTec", body: (notify["body"] as? String) ?? "", id: UUID().uuidString)
        }
        if body["askPermission"] != nil { requestNotificationPermission() }
        if let feed = body["feed"] as? String, !feed.isEmpty {
            feedURL = feed.replacingOccurrences(of: "/calendar.ics", with: "/next-call.json")
        }
        if let live = body["live"] as? [String: Any] { handleLive(live) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let t = webView.title, !t.isEmpty { window.title = t }
    }

    // External links (target=_blank) open in the browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // MARK: window

    private func buildWindow() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                         backing: .buffered, defer: false)
        w.title = "AshTec"
        w.center()
        w.isReleasedWhenClosed = false
        w.contentView = webView
        w.minSize = NSSize(width: 700, height: 500)
        window = w
    }

    // MARK: notifications

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            DispatchQueue.main.async {
                self.webView.evaluateJavaScript("window.__ashtecPerm = '\(granted ? "granted" : "denied")';", completionHandler: nil)
            }
        }
    }

    private func post(title: String, body: String, id: String) {
        let c = UNMutableNotificationContent()
        c.title = title
        c.body = body
        c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }

    private func checkNextCall() {
        guard let url = URL(string: feedURL) else { return }
        if Date().timeIntervalSince(lastRefresh) < 20 { return }
        lastRefresh = Date()
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let payload = try? JSONDecoder().decode(Payload.self, from: data), let call = payload.next else { return }
            DispatchQueue.main.async {
                guard let start = call.startDate else { return }
                let secs = start.timeIntervalSinceNow
                guard secs > 0, secs <= 15 * 60 else { return }
                let id = "call-\(call.date ?? "")-\(call.title)"
                guard !self.notifiedCalls.contains(id) else { return }
                self.notifiedCalls.insert(id)
                self.post(title: "Next call: \(call.title)", body: [call.show, call.when].compactMap { $0 }.joined(separator: " · "), id: id)
            }
        }.resume()
    }

    /// Movement alerts from the live show — the whole point of having this open
    /// on the desk during a show.
    private func handleLive(_ live: [String: Any]) {
        let alert = (live["alert"] as? Bool) ?? false
        let open = (live["open"] as? Bool) ?? false
        let message = (live["message"] as? String) ?? ""
        let name = (live["name"] as? String) ?? "Live show"
        guard open, alert else { notifiedMovement = nil; return }
        let body = message.isEmpty ? "Movement on stage" : message
        guard notifiedMovement != body else { return }
        notifiedMovement = body
        post(title: "Movement — \(name)", body: body, id: "movement-\(body.hashValue)")
    }

    // MARK: menu

    private func buildMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About AshTec", action: #selector(about), keyEquivalent: "").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide AshTec", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit AshTec", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileItem = NSMenuItem(); main.addItem(fileItem)
        let fileMenu = NSMenu(title: "File"); fileItem.submenu = fileMenu
        fileMenu.addItem(withTitle: "Home", action: #selector(goHome), keyEquivalent: "h").target = self
        fileMenu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "r").target = self
        fileMenu.addItem(withTitle: "Open in Browser", action: #selector(openInBrowser), keyEquivalent: "b").target = self
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")

        let editItem = NSMenuItem(); main.addItem(editItem)
        let editMenu = NSMenu(title: "Edit"); editItem.submenu = editMenu
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let viewItem = NSMenuItem(); main.addItem(viewItem)
        let viewMenu = NSMenu(title: "View"); viewItem.submenu = viewMenu
        viewMenu.addItem(withTitle: "Back", action: #selector(goBack), keyEquivalent: "[").target = self
        viewMenu.addItem(withTitle: "Forward", action: #selector(goForward), keyEquivalent: "]").target = self
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Actual Size", action: #selector(actualSize), keyEquivalent: "0").target = self
        viewMenu.addItem(withTitle: "Zoom In", action: #selector(zoomIn), keyEquivalent: "+").target = self
        viewMenu.addItem(withTitle: "Zoom Out", action: #selector(zoomOut), keyEquivalent: "-").target = self
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")

        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window"); windowItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")

        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }

    @objc private func about() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "AshTec",
            .applicationVersion: "2.0",
            .credits: NSAttributedString(string: "The Ashford School Tech Crew hub.\nBuilt by the crew, for the crew."),
        ])
    }
    @objc private func goHome() { webView.load(URLRequest(url: URL(string: APP_URL)!)) }
    @objc private func reload() { webView.reload() }
    @objc private func goBack() { webView.goBack() }
    @objc private func goForward() { webView.goForward() }
    @objc private func openInBrowser() { if let u = webView.url { NSWorkspace.shared.open(u) } }
    @objc private func actualSize() { webView.pageZoom = 1.0 }
    @objc private func zoomIn() { webView.pageZoom = min(2.0, webView.pageZoom + 0.1) }
    @objc private func zoomOut() { webView.pageZoom = max(0.5, webView.pageZoom - 0.1) }
}
