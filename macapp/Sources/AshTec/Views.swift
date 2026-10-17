import AppKit

// The app's screens, all native AppKit: Next up, Calendar, Announcements, a
// full-screen Live show window, and Settings.

func mkLabel(_ text: String, size: CGFloat, weight: NSFont.Weight = .regular, color: NSColor = .labelColor) -> NSTextField {
    let l = NSTextField(labelWithString: text)
    l.font = .systemFont(ofSize: size, weight: weight)
    l.textColor = color
    l.maximumNumberOfLines = 0
    l.lineBreakMode = .byWordWrapping
    l.preferredMaxLayoutWidth = 720
    return l
}

final class FlippedView: NSView { override var isFlipped: Bool { true } }

/// A scrollable, padded column. Subclasses rebuild `stack` in `reload()`.
class PanelViewController: NSViewController {
    let stack = NSStackView()
    private let scroll = NSScrollView()
    private var titleLabel: NSTextField!

    var heading: String { "" }

    override func loadView() {
        let root = NSView()

        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        root.addSubview(scroll)
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: root.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: root.bottomAnchor),
        ])

        let content = FlippedView()
        content.translatesAutoresizingMaskIntoConstraints = false
        scroll.documentView = content
        content.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor).isActive = true

        titleLabel = mkLabel(heading, size: 26, weight: .bold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(titleLabel)

        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(stack)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: content.topAnchor, constant: 22),
            titleLabel.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 26),
            titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: content.trailingAnchor, constant: -26),
            stack.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 14),
            stack.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 26),
            stack.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -26),
            stack.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -28),
        ])
        view = root
    }

    /// Add a row and make it fill the column (cards should not hug their text).
    func add(_ v: NSView) {
        stack.addArrangedSubview(v)
        v.widthAnchor.constraint(equalTo: stack.widthAnchor).isActive = true
    }

    func clearStack() { for v in stack.arrangedSubviews { v.removeFromSuperview() } }
    func reload() {}
    func accent() -> NSColor { Store.shared.accent.color }
    func card(_ children: [NSView]) -> NSView {
        let box = NSStackView(views: children)
        box.orientation = .vertical
        box.alignment = .leading
        box.spacing = 6
        box.edgeInsets = NSEdgeInsets(top: 14, left: 16, bottom: 14, right: 16)
        box.wantsLayer = true
        box.layer?.cornerRadius = 12
        box.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
        box.layer?.borderWidth = 1
        box.layer?.borderColor = NSColor.separatorColor.cgColor
        return box
    }
}

// MARK: - Next up

final class NextUpViewController: PanelViewController {
    override var heading: String { "Next up" }
    override func reload() {
        clearStack()
        let s = Store.shared
        if !s.isSignedIn {
            add(mkLabel("Sign in to see your calls.", size: 15, color: .secondaryLabelColor))
            return
        }
        if let next = s.nextEvent {
            let count = mkLabel(s.countdown(to: next), size: 22, weight: .bold, color: accent())
            var rows: [NSView] = [
                mkLabel("NEXT CALL", size: 11, weight: .semibold, color: .secondaryLabelColor),
                mkLabel(next.title, size: 24, weight: .bold),
            ]
            if let sid = next.showIds?.first, !s.showName(sid).isEmpty { rows.append(mkLabel(s.showName(sid), size: 15, color: .secondaryLabelColor)) }
            rows.append(mkLabel(s.whenText(next), size: 15))
            if let bring = next.thingsToBring, !bring.isEmpty { rows.append(mkLabel("Bring: \(bring)", size: 13, color: .secondaryLabelColor)) }
            rows.append(count)
            add(card(rows))
        } else {
            add(card([mkLabel("Nothing coming up", size: 20, weight: .bold)]))
        }

        let rest = s.upcoming.dropFirst().prefix(8)
        if !rest.isEmpty {
            add(mkLabel("Coming up", size: 13, weight: .semibold, color: .secondaryLabelColor))
            for e in rest {
                let show = e.showIds?.first.map { s.showName($0) } ?? ""
                add(card([
                    mkLabel(e.title, size: 15, weight: .medium),
                    mkLabel([show, s.whenText(e)].filter { !$0.isEmpty }.joined(separator: "  ·  "), size: 12, color: .secondaryLabelColor),
                ]))
            }
        }
        if let err = s.lastError { add(mkLabel(err, size: 12, color: .systemRed)) }
    }
}

// MARK: - Calendar

final class CalendarViewController: PanelViewController {
    override var heading: String { "Calendar" }
    override func reload() {
        clearStack()
        let s = Store.shared
        guard s.isSignedIn else { add(mkLabel("Sign in to see the calendar.", size: 15, color: .secondaryLabelColor)); return }
        if s.upcoming.isEmpty { add(mkLabel("Nothing in the diary.", size: 15, color: .secondaryLabelColor)); return }
        for e in s.upcoming {
            let show = e.showIds?.first.map { s.showName($0) } ?? ""
            var rows: [NSView] = [mkLabel(e.title, size: 15, weight: .medium)]
            let meta = [e.type ?? "", show, s.whenText(e)].filter { !$0.isEmpty }.joined(separator: "  ·  ")
            rows.append(mkLabel(meta, size: 12, color: .secondaryLabelColor))
            if let st = e.status, !st.isEmpty {
                rows.append(mkLabel("You: \(st)", size: 12, color: accent()))
            }
            add(card(rows))
        }
    }
}

// MARK: - Announcements

final class AnnouncementsViewController: PanelViewController {
    override var heading: String { "Announcements" }
    override func reload() {
        clearStack()
        let s = Store.shared
        guard s.isSignedIn else { add(mkLabel("Sign in to read announcements.", size: 15, color: .secondaryLabelColor)); return }
        if s.announcements.isEmpty { add(mkLabel("No announcements yet.", size: 15, color: .secondaryLabelColor)); return }
        for a in s.announcements {
            var rows: [NSView] = []
            let title = (a.pinned ? "📌 " : "") + a.title
            rows.append(mkLabel(title, size: 15, weight: .semibold))
            rows.append(mkLabel(a.body, size: 13, color: .secondaryLabelColor))
            let date = Store.parseISO(a.createdAt).map { d -> String in
                let f = DateFormatter(); f.dateStyle = .medium; f.timeStyle = .short; f.locale = Locale(identifier: "en_GB"); return f.string(from: d)
            } ?? ""
            rows.append(mkLabel([a.authorName, date].filter { !$0.isEmpty }.joined(separator: "  ·  "), size: 11, color: .tertiaryLabelColor))
            add(card(rows))
        }
    }
}

// MARK: - Settings

final class SettingsViewController: PanelViewController {
    override var heading: String { "Settings" }
    private var observer: NSObjectProtocol?

    override func reload() {
        clearStack()
        let s = Store.shared

        // Account
        var accountRows: [NSView] = [mkLabel("Account", size: 13, weight: .semibold, color: .secondaryLabelColor)]
        if s.isSignedIn {
            accountRows.append(mkLabel(s.displayName, size: 18, weight: .bold))
            if let m = s.me { accountRows.append(mkLabel([m.memberType, m.year].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: "  ·  "), size: 12, color: .secondaryLabelColor)) }
            let out = NSButton(title: "Sign out", target: self, action: #selector(signOut))
            accountRows.append(out)
        } else {
            accountRows.append(mkLabel("Not signed in.", size: 14, color: .secondaryLabelColor))
            let inBtn = NSButton(title: "Sign in…", target: self, action: #selector(signIn))
            accountRows.append(inBtn)
        }
        add(card(accountRows))

        // Appearance
        let themePopup = NSPopUpButton()
        themePopup.addItems(withTitles: Theme.allCases.map { $0.label })
        themePopup.selectItem(at: Theme.allCases.firstIndex(of: s.theme) ?? 0)
        themePopup.target = self; themePopup.action = #selector(themeChanged(_:))
        add(card([
            mkLabel("Appearance", size: 13, weight: .semibold, color: .secondaryLabelColor),
            mkLabel("Theme", size: 13),
            themePopup,
            mkLabel("Accent", size: 13),
            accentRow(),
        ]))

        // Notifications
        let notif = NSButton(checkboxWithTitle: "Notifications for calls and movement", target: self, action: #selector(notifToggled(_:)))
        notif.state = s.notificationsEnabled ? .on : .off
        add(card([
            mkLabel("Notifications", size: 13, weight: .semibold, color: .secondaryLabelColor),
            notif,
        ]))

        // Live show device
        let copy = NSButton(title: "Copy", target: self, action: #selector(copyDeviceKey))
        add(card([
            mkLabel("Live show", size: 13, weight: .semibold, color: .secondaryLabelColor),
            mkLabel("This Mac's screen id — give it to an admin to enable the live board.", size: 12, color: .secondaryLabelColor),
            mkLabel(s.deviceKey, size: 13),
            copy,
        ]))
    }

    private func accentRow() -> NSView {
        let row = NSStackView()
        row.orientation = .horizontal
        row.spacing = 8
        for a in ACCENTS {
            let b = NSButton(title: "", target: self, action: #selector(accentTapped(_:)))
            b.bezelStyle = .circular
            b.tag = ACCENTS.firstIndex { $0.id == a.id } ?? 0
            b.wantsLayer = true
            b.layer?.backgroundColor = a.color.cgColor
            b.layer?.cornerRadius = 9
            b.widthAnchor.constraint(equalToConstant: 18).isActive = true
            b.heightAnchor.constraint(equalToConstant: 18).isActive = true
            b.toolTip = a.name
            row.addArrangedSubview(b)
        }
        return row
    }

    @objc private func signIn() { AppDelegate.shared?.signIn() }
    @objc private func signOut() { Store.shared.signOut(); AppDelegate.shared?.reloadAll() }
    @objc private func themeChanged(_ sender: NSPopUpButton) {
        Store.shared.theme = Theme.allCases[sender.indexOfSelectedItem]
        AppDelegate.shared?.reloadAll()
    }
    @objc private func accentTapped(_ sender: NSButton) {
        Store.shared.accentId = ACCENTS[sender.tag].id
        AppDelegate.shared?.reloadAll()
    }
    @objc private func notifToggled(_ sender: NSButton) { Store.shared.notificationsEnabled = sender.state == .on }
    @objc private func copyDeviceKey() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(Store.shared.deviceKey, forType: .string)
    }
}

// MARK: - Live show (its own full-screen window)

final class LiveShowViewController: PanelViewController {
    override var heading: String { "Live show" }
    override func reload() {
        clearStack()
        let s = Store.shared
        guard let state = s.live, state.hasShow == true else {
            add(card([mkLabel("No show is running.", size: 20, weight: .bold)]))
            return
        }
        if state.enabled != true {
            add(card([
                mkLabel("This screen is not enabled yet", size: 18, weight: .bold),
                mkLabel("An admin needs to enable this Mac as a live-show screen.", size: 13, color: .secondaryLabelColor),
                mkLabel("Screen id: \(s.deviceKey)", size: 13),
            ]))
            return
        }
        guard let ls = state.liveShow else { return }

        if ls.movementAlert {
            add(card([
                mkLabel("MOVEMENT", size: 13, weight: .bold, color: .systemRed),
                mkLabel(ls.movementMessage.isEmpty ? "Movement on stage" : ls.movementMessage, size: 22, weight: .bold, color: .systemRed),
            ]))
        }

        if let scene = s.liveNowScene() {
            add(card([
                mkLabel("ON STAGE NOW", size: 11, weight: .semibold, color: accent()),
                mkLabel(scene.label, size: 15, weight: .semibold, color: .secondaryLabelColor),
                mkLabel(scene.title, size: 30, weight: .bold),
                mkLabel("Elapsed \(s.liveTimerText())", size: 15, color: .secondaryLabelColor),
            ]))
            if let cast = scene.cast, !cast.isEmpty { add(card([mkLabel("Cast", size: 12, weight: .semibold, color: .secondaryLabelColor), mkLabel(cast.joined(separator: ", "), size: 13)])) }
            if let notes = scene.notes, !notes.isEmpty {
                var rows: [NSView] = [mkLabel("Notes", size: 12, weight: .semibold, color: .secondaryLabelColor)]
                for n in notes { rows.append(mkLabel("• \(n)", size: 13)) }
                add(card(rows))
            }
        } else {
            add(card([mkLabel(ls.name, size: 24, weight: .bold), mkLabel("Waiting for the first cue", size: 14, color: .secondaryLabelColor)]))
        }

        let next = s.nextScenes(3)
        if !next.isEmpty {
            add(mkLabel("Coming up", size: 13, weight: .semibold, color: .secondaryLabelColor))
            for sc in next { add(card([mkLabel(sc.label, size: 12, weight: .semibold, color: .secondaryLabelColor), mkLabel(sc.title, size: 16, weight: .medium)])) }
        }
        if let anns = state.announcements, !anns.isEmpty {
            for a in anns { add(card([mkLabel("ANNOUNCEMENT", size: 11, weight: .bold, color: accent()), mkLabel(a.body, size: 16, weight: .medium)])) }
        }
        add(mkLabel("\(ls.name) · \(ls.status)", size: 12, color: .tertiaryLabelColor))
    }
}

final class LiveShowWindowController: NSWindowController {
    let vc = LiveShowViewController()
    convenience init() {
        let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 900, height: 760),
                         styleMask: [.titled, .closable, .resizable, .fullSizeContentView],
                         backing: .buffered, defer: false)
        w.title = "Live show"
        w.isReleasedWhenClosed = false
        w.collectionBehavior = [.fullScreenPrimary]
        self.init(window: w)
        w.contentViewController = vc
        vc.loadView()
    }
    func show() {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func toggleFullScreen() { window?.toggleFullScreen(nil) }
}
