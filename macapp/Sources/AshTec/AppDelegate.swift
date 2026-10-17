import AppKit
import WebKit
import UserNotifications

// AshTec for macOS (feedback round 2, round 3).
//
// A proper Mac app: a native source-list sidebar, a unified toolbar, a full
// menu bar, a Dock icon, plus a menu bar extra with a live countdown to your
// next call and a notification before it. The hub is loaded with ?shell=mac so
// the web app hides its own sidebar/header and the native chrome is the only
// chrome. AppKit + WKWebView (SwiftUI needs full Xcode), so it builds with the
// Command Line Tools alone.

let APP_URL = "https://ashtec.dino.icu"

// MARK: - Sections shown in the native sidebar

struct Section {
    let title: String
    let path: String
    let symbol: String
}

let SECTIONS: [Section] = [
    Section(title: "Home", path: "/", symbol: "house"),
    Section(title: "Calendar", path: "/calendar", symbol: "calendar"),
    Section(title: "My events", path: "/my-events", symbol: "checklist"),
    Section(title: "Team", path: "/team", symbol: "person.2"),
    Section(title: "Announcements", path: "/announcements", symbol: "megaphone"),
    Section(title: "Memories", path: "/memories", symbol: "photo.on.rectangle"),
    Section(title: "Tools", path: "/tools", symbol: "wrench.and.screwdriver"),
    Section(title: "Settings", path: "/profile", symbol: "gearshape"),
]

// MARK: - Next-call model (menu bar)

struct Call: Codable, Identifiable {
    let title: String
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
        for raw in s.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "–" || $0 == "," }) {
            let t = raw.trimmingCharacters(in: CharacterSet(charactersIn: ".,()"))
            let bits = t.split(separator: ":")
            if bits.count == 2, let h = Int(bits[0]), let m = Int(bits[1]), h < 24, m < 60 { return (h, m) }
        }
        return nil
    }
}
struct Payload: Codable { let next: Call?; let upcoming: [Call]? }

// MARK: - Sidebar

final class SidebarViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    var onSelect: ((Section) -> Void)?
    private let table = NSTableView()
    private var current = "/"

    override func loadView() {
        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        table.style = .sourceList
        table.headerView = nil
        table.rowHeight = 30
        table.addTableColumn(NSTableColumn(identifier: .init("main")))
        table.dataSource = self
        table.delegate = self
        scroll.documentView = table
        view = scroll
    }

    func numberOfRows(in tableView: NSTableView) -> Int { SECTIONS.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let s = SECTIONS[row]
        let cell = NSTableCellView()
        let img = NSImageView()
        img.image = NSImage(systemSymbolName: s.symbol, accessibilityDescription: s.title)
        img.translatesAutoresizingMaskIntoConstraints = false
        let label = NSTextField(labelWithString: s.title)
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 13)
        cell.addSubview(img); cell.addSubview(label)
        cell.imageView = img
        cell.textField = label
        NSLayoutConstraint.activate([
            img.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2),
            img.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            img.widthAnchor.constraint(equalToConstant: 18),
            img.heightAnchor.constraint(equalToConstant: 18),
            label.leadingAnchor.constraint(equalTo: img.trailingAnchor, constant: 8),
            label.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            label.trailingAnchor.constraint(lessThanOrEqualTo: cell.trailingAnchor, constant: -4),
        ])
        return cell
    }

    func tableViewSelectionDidChange(_ notification: Notification) {
        let row = table.selectedRow
        guard row >= 0, row < SECTIONS.count else { return }
        let s = SECTIONS[row]
        if s.path != current { current = s.path; onSelect?(s) }
    }

    /// Reflect the page the web view actually landed on.
    func syncSelection(path: String) {
        let match = SECTIONS.firstIndex { $0.path != "/" && path.hasPrefix($0.path) }
            ?? (path == "/" ? SECTIONS.firstIndex { $0.path == "/" } : nil)
        guard let i = match else { return }
        current = SECTIONS[i].path
        if table.selectedRow != i { table.selectRowIndexes([i], byExtendingSelection: false) }
    }
}

// MARK: - App delegate

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, NSToolbarDelegate {

    private var window: NSWindow!
    private var splitVC: NSSplitViewController!
    private var sidebar: SidebarViewController!
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

    private var feedURL: String {
        get { UserDefaults.standard.string(forKey: "feedURL") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "feedURL"); refresh(force: true) }
    }

    // MARK: lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMainMenu()
        buildWebView()
        buildWindow()
        setupStatusItem()
        buildStatusMenu()
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

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "ashtec" {
            let comps = URLComponents(url: url, resolvingAgainstBaseURL: false)
            let token = comps?.queryItems?.first(where: { $0.name == "token" })?.value ?? ""
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
        config.websiteDataStore = .default()
        let controller = WKUserContentController()
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
        webView.load(URLRequest(url: URL(string: "\(APP_URL)/?shell=mac")!))
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let feed = body["feed"] as? String else { return }
        let nextCall = feed.replacingOccurrences(of: "/calendar.ics", with: "/next-call.json")
        if nextCall != feedURL { feedURL = nextCall }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let t = webView.title, !t.isEmpty { window.title = t }
        if let p = webView.url?.path { sidebar.syncSelection(path: p) }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    /// In-app navigation without a full reload: drive the SPA's router.
    private func navigate(to path: String) {
        guard webView.url != nil else { return }
        let js = "window.history.pushState({}, '', '\(path)'); window.dispatchEvent(new PopStateEvent('popstate')); window.scrollTo(0,0);"
        webView.evaluateJavaScript(js) { [weak self] _, err in
            if err != nil { self?.webView.load(URLRequest(url: URL(string: "\(APP_URL)\(path)?shell=mac")!)) }
        }
    }

    // MARK: window, split view, toolbar

    private func buildWindow() {
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered, defer: false
        )
        w.title = "AshTec"
        w.center()
        w.isReleasedWhenClosed = false
        w.titlebarAppearsTransparent = false

        sidebar = SidebarViewController()
        sidebar.onSelect = { [weak self] section in self?.navigate(to: section.path) }

        let webVC = NSViewController()
        webVC.view = webView

        splitVC = NSSplitViewController()
        let side = NSSplitViewItem(sidebarWithViewController: sidebar)
        side.canCollapse = true
        side.minimumThickness = 190
        side.maximumThickness = 260
        splitVC.addSplitViewItem(side)
        splitVC.addSplitViewItem(NSSplitViewItem(viewController: webVC))

        w.contentViewController = splitVC

        let toolbar = NSToolbar(identifier: "main")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        w.toolbar = toolbar
        w.toolbarStyle = .unified

        window = w
    }

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .init("back"), .init("forward"), .init("reload"), .flexibleSpace, .init("signin")]
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .init("back"), .init("forward"), .init("reload"), .flexibleSpace, .init("signin")]
    }
    func toolbar(_ toolbar: NSToolbar, itemForItemIdentifier id: NSToolbarItem.Identifier, willBeInsertedIntoToolbar flag: Bool) -> NSToolbarItem? {
        if id == .toggleSidebar {
            let item = NSToolbarItem(itemIdentifier: .toggleSidebar)
            item.image = NSImage(systemSymbolName: "sidebar.left", accessibilityDescription: "Sidebar")
            item.action = #selector(NSSplitViewController.toggleSidebar(_:))
            item.target = splitVC
            item.label = "Sidebar"
            return item
        }
        let item = NSToolbarItem(itemIdentifier: id)
        item.isBordered = true
        switch id.rawValue {
        case "back": item.image = NSImage(systemSymbolName: "chevron.backward", accessibilityDescription: "Back"); item.action = #selector(goBack); item.target = self; item.label = "Back"
        case "forward": item.image = NSImage(systemSymbolName: "chevron.forward", accessibilityDescription: "Forward"); item.action = #selector(goForward); item.target = self; item.label = "Forward"
        case "reload": item.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "Reload"); item.action = #selector(reloadPage); item.target = self; item.label = "Reload"
        case "signin": item.image = NSImage(systemSymbolName: "person.crop.circle", accessibilityDescription: "Sign in"); item.action = #selector(signIn); item.target = self; item.label = "Sign in"
        default: return nil
        }
        return item
    }

    @objc private func goBack() { webView.goBack() }
    @objc private func goForward() { webView.goForward() }
    @objc private func reloadPage() {
        if let p = webView.url?.path {
            webView.load(URLRequest(url: URL(string: "\(APP_URL)\(p)?shell=mac")!))
        } else { webView.reload() }
    }
    @objc private func openInBrowser() { if let u = webView.url { NSWorkspace.shared.open(u) } }

    // MARK: sign-in

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

    // MARK: main menu bar

    private func buildMainMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        main.addItem(appItem)
        let appMenu = NSMenu()
        appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About AshTec", action: #selector(about), keyEquivalent: "").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Sign in…", action: #selector(signIn), keyEquivalent: "s").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide AshTec", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit AshTec", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let fileItem = NSMenuItem(); main.addItem(fileItem)
        let fileMenu = NSMenu(title: "File"); fileItem.submenu = fileMenu
        fileMenu.addItem(withTitle: "Reload", action: #selector(reloadPage), keyEquivalent: "r").target = self
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
        let sidebarItem = viewMenu.addItem(withTitle: "Toggle Sidebar", action: #selector(NSSplitViewController.toggleSidebar(_:)), keyEquivalent: "l")
        sidebarItem.target = splitVC
        viewMenu.addItem(withTitle: "Actual Size", action: #selector(actualSize), keyEquivalent: "0").target = self
        viewMenu.addItem(withTitle: "Zoom In", action: #selector(zoomIn), keyEquivalent: "+").target = self
        viewMenu.addItem(withTitle: "Zoom Out", action: #selector(zoomOut), keyEquivalent: "-").target = self
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")

        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let windowMenu = NSMenu(title: "Window"); windowItem.submenu = windowMenu
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")

        NSApp.mainMenu = main
        NSApp.windowsMenu = windowMenu
    }

    @objc private func about() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "AshTec",
            .applicationVersion: "1.0",
            .credits: NSAttributedString(string: "The Ashford School Tech Crew hub.\nBuilt by the crew, for the crew."),
        ])
    }
    @objc private func actualSize() { webView.pageZoom = 1.0 }
    @objc private func zoomIn() { webView.pageZoom = min(2.0, webView.pageZoom + 0.1) }
    @objc private func zoomOut() { webView.pageZoom = max(0.5, webView.pageZoom - 0.1) }

    // MARK: menu bar extra (next call)

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let b = statusItem.button {
            if let cat { b.image = cat; b.imagePosition = .imageLeading }
            b.title = " AshTec"
            b.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        }
    }
    private func buildStatusMenu() {
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
        menu.addItem(item("Reload", #selector(reloadPage), "r"))
        menu.addItem(.separator())
        menu.addItem(item("Quit AshTec", #selector(NSApplication.terminate(_:)), "q"))
    }

    private func disabled(_ title: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: nil, keyEquivalent: ""); i.isEnabled = false; return i
    }
    private func item(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let i = NSMenuItem(title: title, action: action, keyEquivalent: key); i.target = self; return i
    }
    @objc private func showWindow() {
        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
    }

    // MARK: next-call data

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
        guard let s = secondsUntilNext() else { return " AshTec" }
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
    private func render() { statusItem.button?.title = menuTitle() }
}
