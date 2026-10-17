import AppKit
import WebKit
import UserNotifications

// AshTec for macOS (feedback round 2, round 3).
//
// The whole crew hub, in a real Mac app: a native window showing the site, its
// own Dock icon, a menu bar extra with a live countdown to your next call, and
// a notification when a call is close. AppKit + WKWebView, so it builds with
// the Command Line Tools (no Xcode, no paid developer account).
//
// Sign-in: the magic link is emailed with an `ashtec://` scheme when requested
// from the app, so clicking it opens the app, which then loads the https verify
// URL in its own web view and sets the session cookie there.

let APP_URL = "https://ashtec.dino.icu"

// MARK: - Model

struct Call: Codable, Identifiable {
    let title: String
    let type: String?
    let subtype: String?
    let show: String?
    let date: String?
    let dateTbc: Bool?
    let meetTime: String?
    let startTime: String?
    let endTime: String?
    let when: String?

    var id: String { "\(date ?? "")|\(startTime ?? meetTime ?? "")|\(title)" }

    var startDate: Date? {
        guard let date, let hm = Call.firstTime(startTime) ?? Call.firstTime(meetTime) else { return nil }
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var c = DateComponents()
        c.year = parts[0]; c.month = parts[1]; c.day = parts[2]; c.hour = hm.0; c.minute = hm.1
        return Calendar.current.date(from: c)
    }

    static func firstTime(_ s: String?) -> (Int, Int)? {
        guard let s else { return nil }
        let tokens = s.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "–" || $0 == "," })
        for raw in tokens {
            let t = raw.trimmingCharacters(in: CharacterSet(charactersIn: ".,()"))
            let bits = t.split(separator: ":")
            if bits.count == 2, let h = Int(bits[0]), let m = Int(bits[1]), h < 24, m < 60 { return (h, m) }
        }
        return nil
    }
}

struct Payload: Codable { let next: Call?; let upcoming: [Call]? }

// MARK: - App delegate

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, WKNavigationDelegate, WKScriptMessageHandler, WKUIDelegate, NSToolbarDelegate {

    private var window: NSWindow!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!

    private var next: Call?
    private var upcoming: [Call] = []
    private var notifiedFor: String?
    private var tickTimer: Timer?
    private var refreshTimer: Timer?
    private var lastRefresh = Date.distantPast

    private let cat: NSImage? = {
        guard let img = Bundle.main.image(forResource: "cat") else { return nil }
        let copy = img.copy() as? NSImage ?? img
        copy.size = NSSize(width: 18, height: 18)
        return copy
    }()

    /// The next-call URL (with token), learned from the signed-in web view.
    private var feedURL: String {
        get { UserDefaults.standard.string(forKey: "feedURL") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "feedURL"); refresh(force: true) }
    }

    // MARK: lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWebView()
        buildWindow()
        setupStatusItem()
        buildMenuBar()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }

        tickTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.render() }
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.refresh() }

        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }

    /// `ashtec://verify?token=…&callbackURL=…` from the emailed sign-in link.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "ashtec" {
            let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let token = comps?.queryItems?.first(where: { $0.name == "token" })?.value ?? ""
            guard !token.isEmpty else { continue }
            var target = URLComponents(string: "\(APP_URL)/api/auth/verify")!
            target.queryItems = [
                URLQueryItem(name: "token", value: token),
                URLQueryItem(name: "callbackURL", value: "/"),
            ]
            window.makeKeyAndOrderFront(nil)
            webView.load(URLRequest(url: target.url!))
        }
    }

    // MARK: web view

    private func buildWebView() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // persistent cookies: sign in once
        let controller = WKUserContentController()
        // After each page settles, ask the hub (with the web view's own cookies)
        // for this member's calendar feed, and derive the next-call URL from it.
        let js = """
        (async () => {
          try {
            const r = await fetch('/api/getCalendarFeed', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
            if (!r.ok) return;
            const d = await r.json();
            if (d && d.url) window.webkit.messageHandlers.ashtec.postMessage({ feed: d.url });
          } catch (e) {}
        })();
        """
        controller.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        controller.add(self, name: "ashtec")
        config.userContentController = controller

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: URL(string: APP_URL)!))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let feed = body["feed"] as? String else { return }
        // .../calendar.ics?token=…  ->  .../next-call.json?token=…
        let nextCall = feed.replacingOccurrences(of: "/calendar.ics", with: "/next-call.json")
        if nextCall != feedURL { feedURL = nextCall }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let t = webView.title, !t.isEmpty { window.title = t }
    }

    // Open any target=_blank / external links in the real browser.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // MARK: window + toolbar

    private func buildWindow() {
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1100, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false
        )
        w.title = "AshTec"
        w.center()
        w.isReleasedWhenClosed = false
        w.contentView = webView

        let toolbar = NSToolbar(identifier: "main")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        w.toolbar = toolbar
        w.toolbarStyle = .unified

        window = w
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.init("back"), .init("forward"), .init("reload"), .flexibleSpace, .init("home")]
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.init("back"), .init("forward"), .init("reload"), .flexibleSpace, .init("home")]
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        let item = NSToolbarItem(itemIdentifier: id)
        item.isBordered = true
        switch id.rawValue {
        case "back": item.image = NSImage(systemSymbolName: "chevron.backward", accessibilityDescription: "Back"); item.action = #selector(goBack); item.target = self
        case "forward": item.image = NSImage(systemSymbolName: "chevron.forward", accessibilityDescription: "Forward"); item.action = #selector(goForward); item.target = self
        case "reload": item.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "Reload"); item.action = #selector(reload); item.target = self
        case "home": item.image = NSImage(systemSymbolName: "house", accessibilityDescription: "Home"); item.action = #selector(goHome); item.target = self
        default: return nil
        }
        item.label = id.rawValue.capitalized
        return item
    }

    @objc private func goBack() { webView.goBack() }
    @objc private func goForward() { webView.goForward() }
    @objc private func reload() { webView.reload() }
    @objc private func goHome() { webView.load(URLRequest(url: URL(string: APP_URL)!)) }

    @objc private func openInBrowser() {
        if let u = webView.url { NSWorkspace.shared.open(u) }
    }

    /// Native sign-in: ask for the address, request a magic link that opens the
    /// app, and the emailed link finishes the job in the web view.
    @objc private func signIn() {
        let alert = NSAlert()
        alert.messageText = "Sign in to AshTec"
        alert.informativeText = "Enter your school email. We'll send a link; clicking it opens this app and signs you in."
        alert.addButton(withTitle: "Send link")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.placeholderString = "you@ashpupil.co.uk"
        alert.accessoryView = field
        alert.window.initialFirstResponder = field
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let email = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard email.contains("@") else { return }

        var req = URLRequest(url: URL(string: "\(APP_URL)/api/auth/magic-link")!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["email": email, "appScheme": "ashtec"])
        URLSession.shared.dataTask(with: req) { _, _, _ in
            DispatchQueue.main.async {
                let done = NSAlert()
                done.messageText = "Check your email"
                done.informativeText = "If \(email) is on the crew list, a sign-in link is on its way. Click it and this app will finish signing you in."
                done.addButton(withTitle: "OK")
                done.runModal()
            }
        }.resume()
    }

    // MARK: status item + menu

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let b = statusItem.button {
            if let cat { b.image = cat; b.imagePosition = .imageLeading }
            b.title = " AshTec"
            b.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        }
    }

    private func buildMenuBar() {
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        if let call = next {
            menu.addItem(disabled("Next call"))
            menu.addItem(disabled(call.title))
            if let show = call.show, !show.isEmpty { menu.addItem(disabled(show)) }
            menu.addItem(disabled(call.when ?? "Date TBC"))
            menu.addItem(disabled(countdownText()))
            if upcoming.count > 1 {
                menu.addItem(.separator())
                menu.addItem(disabled("Coming up"))
                for c in upcoming.dropFirst() { menu.addItem(disabled("• \(c.when ?? "TBC") — \(c.title)")) }
            }
        } else {
            menu.addItem(disabled("Nothing coming up"))
        }
        menu.addItem(.separator())
        menu.addItem(item("Open AshTec", #selector(showWindow), "o"))
        menu.addItem(item("Sign in…", #selector(signIn), "s"))
        menu.addItem(item("Reload", #selector(reload), "r"))
        menu.addItem(.separator())
        menu.addItem(item("Quit AshTec", #selector(NSApplication.terminate(_:)), "q"))
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        i.isEnabled = false
        return i
    }
    private func item(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
        i.target = self
        return i
    }

    @objc private func showWindow() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    // MARK: next-call data (for the menu bar)

    func refresh(force: Bool = false) {
        guard let url = URL(string: feedURL) else { next = nil; upcoming = []; render(); return }
        if !force, Date().timeIntervalSince(lastRefresh) < 20 { return }
        lastRefresh = Date()
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data, let payload = try? JSONDecoder().decode(Payload.self, from: data) else { return }
            DispatchQueue.main.async {
                self.next = payload.next
                self.upcoming = payload.upcoming ?? (payload.next.map { [$0] } ?? [])
                self.maybeNotify()
                self.render()
            }
        }.resume()
    }

    private func secondsUntilNext() -> Int? {
        guard let d = next?.startDate else { return nil }
        return Int(d.timeIntervalSinceNow)
    }

    private func countdownText() -> String {
        guard let s = secondsUntilNext() else { return next?.dateTbc == true ? "Date TBC" : "" }
        if s < 0 { return "On now" }
        if s < 60 { return "in under a minute" }
        let m = s / 60
        if m < 60 { return "in \(m) minute\(m == 1 ? "" : "s")" }
        let h = m / 60, rm = m % 60
        if h < 24 { return "in \(h)h \(rm)m" }
        return "in \(h / 24) day\(h / 24 == 1 ? "" : "s")"
    }

    private func menuTitle() -> String {
        guard secondsUntilNext() != nil else { return " AshTec" }
        let s = secondsUntilNext()!
        if s < 0 { return " on now" }
        if s < 60 { return " <1m" }
        let m = s / 60
        if m < 60 { return " \(m)m" }
        let h = m / 60
        if h < 24 { return " \(h)h\(m % 60)m" }
        return " \(h / 24)d"
    }

    private func maybeNotify() {
        guard let s = secondsUntilNext(), s > 0, s <= 15 * 60, let call = next, notifiedFor != call.id else { return }
        notifiedFor = call.id
        let content = UNMutableNotificationContent()
        content.title = "Next call: \(call.title)"
        content.body = [call.show, call.when].compactMap { $0 }.joined(separator: " · ")
        content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: call.id, content: content, trigger: nil))
    }

    private func render() {
        statusItem.button?.title = menuTitle()
    }
}
