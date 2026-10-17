import AppKit
import UserNotifications

// The app: a native sidebar, a content area, a toolbar, a full menu bar, a
// status-bar countdown, a full-screen Live show window, and sign-in. No web view.

enum Screen: Int, CaseIterable {
    case nextUp, calendar, announcements, liveShow, settings
    var title: String {
        switch self {
        case .nextUp: return "Next up"
        case .calendar: return "Calendar"
        case .announcements: return "Announcements"
        case .liveShow: return "Live show"
        case .settings: return "Settings"
        }
    }
    var symbol: String {
        switch self {
        case .nextUp: return "clock"
        case .calendar: return "calendar"
        case .announcements: return "megaphone"
        case .liveShow: return "play.rectangle"
        case .settings: return "gearshape"
        }
    }
}

final class SidebarViewController: NSViewController, NSTableViewDataSource, NSTableViewDelegate {
    var onSelect: ((Screen) -> Void)?
    private let table = NSTableView()
    private var selected: Screen = .nextUp

    override func loadView() {
        let scroll = NSScrollView()
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        table.style = .sourceList
        table.headerView = nil
        table.rowHeight = 32
        table.addTableColumn(NSTableColumn(identifier: .init("main")))
        table.dataSource = self
        table.delegate = self
        scroll.documentView = table
        view = scroll
    }
    override func viewDidAppear() {
        super.viewDidAppear()
        table.selectRowIndexes([Screen.nextUp.rawValue], byExtendingSelection: false)
    }

    func numberOfRows(in tableView: NSTableView) -> Int { Screen.allCases.count }
    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let s = Screen.allCases[row]
        let cell = NSTableCellView()
        let img = NSImageView()
        img.image = NSImage(systemSymbolName: s.symbol, accessibilityDescription: s.title)
        img.translatesAutoresizingMaskIntoConstraints = false
        let label = NSTextField(labelWithString: s.title)
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 13)
        cell.addSubview(img); cell.addSubview(label)
        cell.imageView = img; cell.textField = label
        NSLayoutConstraint.activate([
            img.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 2),
            img.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            img.widthAnchor.constraint(equalToConstant: 18),
            img.heightAnchor.constraint(equalToConstant: 18),
            label.leadingAnchor.constraint(equalTo: img.trailingAnchor, constant: 8),
            label.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
        ])
        return cell
    }
    func tableViewSelectionDidChange(_ notification: Notification) {
        let row = table.selectedRow
        guard row >= 0, row < Screen.allCases.count else { return }
        let s = Screen.allCases[row]
        if s != selected { selected = s; onSelect?(s) }
    }
    func select(_ s: Screen) {
        selected = s
        table.selectRowIndexes([s.rawValue], byExtendingSelection: false)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate, NSToolbarDelegate {
    static weak var shared: AppDelegate?

    private var window: NSWindow!
    private var splitVC: NSSplitViewController!
    private var sidebar: SidebarViewController!
    private var container: NSView!
    private var current: PanelViewController?
    private var statusItem: NSStatusItem!
    private var liveWindow: LiveShowWindowController?

    private let controllers: [Screen: PanelViewController] = [
        .nextUp: NextUpViewController(),
        .calendar: CalendarViewController(),
        .announcements: AnnouncementsViewController(),
        .liveShow: LiveShowViewController(),
        .settings: SettingsViewController(),
    ]

    func applicationDidFinishLaunching(_ notification: Notification) {
        AppDelegate.shared = self
        buildMainMenu()
        buildWindow()
        setupStatusItem()
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }

        Store.shared.onChange = { [weak self] in self?.reloadAll() }
        Store.shared.startTimers()
        show(.nextUp)
        reloadAll()
        if Store.shared.isSignedIn { Store.shared.refresh() }

        NSApp.activate(ignoringOtherApps: true)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window.makeKeyAndOrderFront(nil) }
        return true
    }

    // MARK: sign-in via the emailed link

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "ashtec" {
            let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "token" }?.value ?? ""
            guard !token.isEmpty else { continue }
            Task { @MainActor in
                do {
                    try await API.shared.completeSignIn(token: token)
                    Store.shared.refresh()
                } catch {
                    let a = NSAlert(); a.messageText = "Sign-in failed"; a.informativeText = error.localizedDescription; a.runModal()
                }
            }
        }
    }

    @objc func signIn() {
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
        Task { @MainActor in
            try? await API.shared.requestMagicLink(email: email)
            let done = NSAlert()
            done.messageText = "Check your email"
            done.informativeText = "If \(email) is on the crew list, a sign-in link is on its way. Click it and this app will finish signing you in."
            done.addButton(withTitle: "OK")
            done.runModal()
        }
    }

    // MARK: window / sidebar / content

    private func buildWindow() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1080, height: 760),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                         backing: .buffered, defer: false)
        w.title = "AshTec"
        w.center()
        w.isReleasedWhenClosed = false

        sidebar = SidebarViewController()
        sidebar.onSelect = { [weak self] screen in
            if screen == .liveShow { self?.openLiveShow() } else { self?.show(screen) }
        }
        let sideItem = NSSplitViewItem(sidebarWithViewController: sidebar)
        sideItem.canCollapse = true
        sideItem.minimumThickness = 200
        sideItem.maximumThickness = 280

        container = NSView()
        let contentVC = NSViewController()
        contentVC.view = container

        splitVC = NSSplitViewController()
        splitVC.addSplitViewItem(sideItem)
        splitVC.addSplitViewItem(NSSplitViewItem(viewController: contentVC))
        w.contentViewController = splitVC
        // Assigning contentViewController shrinks the window to the split view's
        // (tiny) fitting size, so set a real size back and a sensible minimum.
        w.setContentSize(NSSize(width: 1080, height: 760))
        w.minSize = NSSize(width: 880, height: 600)
        w.center()

        let toolbar = NSToolbar(identifier: "main")
        toolbar.delegate = self
        toolbar.displayMode = .iconOnly
        toolbar.allowsUserCustomization = false
        w.toolbar = toolbar
        w.toolbarStyle = .unified
        window = w
    }

    private func show(_ screen: Screen) {
        guard let vc = controllers[screen] else { return }
        current?.view.removeFromSuperview()
        vc.loadView()
        vc.view.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(vc.view)
        NSLayoutConstraint.activate([
            vc.view.topAnchor.constraint(equalTo: container.topAnchor),
            vc.view.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            vc.view.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            vc.view.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])
        current = vc
        vc.reload()
    }

    @objc func openLiveShow() {
        if liveWindow == nil { liveWindow = LiveShowWindowController() }
        liveWindow?.vc.reload()
        liveWindow?.show()
    }

    @objc func reloadAll() {
        window?.title = "AshTec"
        current?.reload()
        liveWindow?.vc.reload()
        statusItem.button?.title = menuTitle()
    }

    // MARK: toolbar

    func toolbarAllowedItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .init("refresh"), .init("live"), .flexibleSpace, .init("signin")]
    }
    func toolbarDefaultItemIdentifiers(_ toolbar: NSToolbar) -> [NSToolbarItem.Identifier] {
        [.toggleSidebar, .init("refresh"), .init("live"), .flexibleSpace, .init("signin")]
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
        case "refresh": item.image = NSImage(systemSymbolName: "arrow.clockwise", accessibilityDescription: "Refresh"); item.action = #selector(refreshNow); item.target = self; item.label = "Refresh"
        case "live": item.image = NSImage(systemSymbolName: "play.rectangle", accessibilityDescription: "Live show"); item.action = #selector(openLiveShow); item.target = self; item.label = "Live show"
        case "signin": item.image = NSImage(systemSymbolName: "person.crop.circle", accessibilityDescription: "Sign in"); item.action = #selector(signIn); item.target = self; item.label = "Sign in"
        default: return nil
        }
        return item
    }
    @objc private func refreshNow() { Store.shared.refresh() }

    // MARK: menu bar

    private func buildMainMenu() {
        let main = NSMenu()
        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
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
        fileMenu.addItem(withTitle: "Refresh", action: #selector(refreshNow), keyEquivalent: "r").target = self
        fileMenu.addItem(withTitle: "Live show", action: #selector(openLiveShow), keyEquivalent: "l").target = self
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
        let sidebarItem = viewMenu.addItem(withTitle: "Toggle Sidebar", action: #selector(NSSplitViewController.toggleSidebar(_:)), keyEquivalent: "l")
        sidebarItem.target = splitVC
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
            .applicationVersion: "1.1",
            .credits: NSAttributedString(string: "The Ashford School Tech Crew hub.\nBuilt by the crew, for the crew."),
        ])
    }

    // MARK: status bar countdown

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let b = statusItem.button {
            if let img = Bundle.main.image(forResource: "cat") {
                let copy = img.copy() as? NSImage ?? img
                copy.size = NSSize(width: 18, height: 18)
                b.image = copy
                b.imagePosition = .imageLeading
            }
            b.title = " AshTec"
            b.font = .monospacedDigitSystemFont(ofSize: 12, weight: .medium)
        }
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        menu.removeAllItems()
        let s = Store.shared
        if let next = s.nextEvent {
            menu.addItem(disabled("Next call"))
            menu.addItem(disabled(next.title))
            if let sid = next.showIds?.first, !s.showName(sid).isEmpty { menu.addItem(disabled(s.showName(sid))) }
            menu.addItem(disabled(s.whenText(next)))
            menu.addItem(disabled(s.countdown(to: next)))
        } else {
            menu.addItem(disabled("Nothing coming up"))
        }
        menu.addItem(.separator())
        menu.addItem(item("Open AshTec", #selector(showMain), "o"))
        menu.addItem(item("Live show", #selector(openLiveShow), "l"))
        menu.addItem(item("Refresh", #selector(refreshNow), "r"))
        menu.addItem(.separator())
        menu.addItem(item("Quit AshTec", #selector(NSApplication.terminate(_:)), "q"))
    }
    private func disabled(_ t: String) -> NSMenuItem { let i = NSMenuItem(title: t, action: nil, keyEquivalent: ""); i.isEnabled = false; return i }
    private func item(_ t: String, _ a: Selector, _ k: String) -> NSMenuItem { let i = NSMenuItem(title: t, action: a, keyEquivalent: k); i.target = self; return i }
    @objc private func showMain() { NSApp.activate(ignoringOtherApps: true); window.makeKeyAndOrderFront(nil) }

    private func menuTitle() -> String {
        let s = Store.shared
        guard let next = s.nextEvent, let d = s.eventStart(next) else { return " AshTec" }
        let secs = Int(d.timeIntervalSinceNow)
        if secs < 0 { return " on now" }
        if secs < 60 { return " <1m" }
        let m = secs / 60
        if m < 60 { return " \(m)m" }
        let h = m / 60
        if h < 24 { return " \(h)h\(m % 60)m" }
        return " \(h / 24)d"
    }
}
