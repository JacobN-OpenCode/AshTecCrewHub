import AppKit
import UserNotifications

// App-wide state: the signed-in member, their events and announcements, the
// live show, a theme and accent, and everything cached on disk so the app opens
// with your data even with no connection.

enum Theme: String, CaseIterable { case system, dark, light
    var label: String { self == .system ? "Match macOS" : self == .dark ? "Dark" : "Light" }
}
struct Accent { let id: String; let name: String; let color: NSColor }

let ACCENTS: [Accent] = [
    Accent(id: "red", name: "Red", color: NSColor(hex: 0xEC3750)),
    Accent(id: "orange", name: "Orange", color: NSColor(hex: 0xFF8C42)),
    Accent(id: "yellow", name: "Yellow", color: NSColor(hex: 0xF1C40F)),
    Accent(id: "green", name: "Green", color: NSColor(hex: 0x2ECC71)),
    Accent(id: "blue", name: "Blue", color: NSColor(hex: 0x338EDA)),
    Accent(id: "purple", name: "Purple", color: NSColor(hex: 0x9B5DE5)),
    Accent(id: "pink", name: "Pink", color: NSColor(hex: 0xFB558E)),
]

extension NSColor {
    convenience init(hex: Int) {
        self.init(srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255, blue: CGFloat(hex & 0xFF) / 255, alpha: 1)
    }
}

private struct Cache: Codable {
    var me: Member?
    var shows: [Show]
    var events: [Event]
    var announcements: [Announcement]
    var live: LiveState?
    var updated: Date?
}

final class Store {
    static let shared = Store()

    var me: Member?
    var shows: [Show] = []
    var events: [Event] = []
    var announcements: [Announcement] = []
    var live: LiveState?
    var lastError: String?
    var lastUpdated: Date?
    var busy = false

    /// Called on the main thread whenever anything above changes.
    var onChange: (() -> Void)?

    private var liveTimer: Timer?
    private var callTimer: Timer?
    private var notifiedCalls = Set<String>()
    private var notifiedMovement: String?

    private init() {
        loadCache()
        applyTheme()
    }

    // MARK: preferences

    var theme: Theme {
        get { Theme(rawValue: UserDefaults.standard.string(forKey: "theme") ?? "system") ?? .system }
        set { UserDefaults.standard.set(newValue.rawValue, forKey: "theme"); applyTheme(); onChange?() }
    }
    var accentId: String {
        get { UserDefaults.standard.string(forKey: "accent") ?? "red" }
        set { UserDefaults.standard.set(newValue, forKey: "accent"); onChange?() }
    }
    var accent: Accent { ACCENTS.first { $0.id == accentId } ?? ACCENTS[0] }
    var notificationsEnabled: Bool {
        get { UserDefaults.standard.object(forKey: "notifications") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "notifications"); onChange?() }
    }
    /// A stable id for this Mac, used to be enabled as a live-show screen.
    var deviceKey: String {
        if let k = UserDefaults.standard.string(forKey: "deviceKey") { return k }
        let k = "mac-" + UUID().uuidString.prefix(8)
        UserDefaults.standard.set(k, forKey: "deviceKey")
        return k
    }

    var isSignedIn: Bool { API.shared.isSignedIn }
    var displayName: String { me.map { "\($0.firstName) \($0.lastName)".trimmingCharacters(in: .whitespaces) } ?? "Crew" }

    func applyTheme() {
        switch theme {
        case .system: NSApp.appearance = nil
        case .dark: NSApp.appearance = NSAppearance(named: .darkAqua)
        case .light: NSApp.appearance = NSAppearance(named: .aqua)
        }
    }

    // MARK: derived data

    var upcoming: [Event] {
        let today = Store.isoDay(Date())
        return events
            .filter { ($0.date ?? "") >= today }
            .sorted { "\($0.date ?? "") \($0.startTime ?? $0.meetTime ?? "")" < "\($1.date ?? "") \($1.startTime ?? $1.meetTime ?? "")" }
    }
    var nextEvent: Event? { upcoming.first }
    func showName(_ id: String?) -> String { shows.first { $0.id == id }?.name ?? "" }
    func eventStart(_ e: Event) -> Date? {
        guard let d = e.date, let hm = Store.firstTime(e.startTime) ?? Store.firstTime(e.meetTime) else { return nil }
        let p = d.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        var c = DateComponents(); c.year = p[0]; c.month = p[1]; c.day = p[2]; c.hour = hm.0; c.minute = hm.1
        return Calendar.current.date(from: c)
    }
    func countdown(to e: Event?) -> String {
        guard let e, let d = eventStart(e) else { return e?.dateTbc == true ? "Date TBC" : "" }
        let s = Int(d.timeIntervalSinceNow)
        if s < 0 { return "On now" }
        if s < 60 { return "in under a minute" }
        let m = s / 60
        if m < 60 { return "in \(m) min" }
        let h = m / 60
        if h < 24 { return "in \(h)h \(m % 60)m" }
        return "in \(h / 24) day\(h / 24 == 1 ? "" : "s")"
    }
    func whenText(_ e: Event) -> String {
        guard let d = e.date else { return "Date TBC" }
        let nice = Store.niceDate(d)
        if let s = e.startTime { return "\(nice) · \(s)\(e.endTime.map { "–\($0)" } ?? "")" }
        if let m = e.meetTime, !m.isEmpty { return "\(nice) · meet \(m)" }
        return nice
    }
    func liveNowScene() -> Scene? {
        guard let scenes = live?.scenes, let i = live?.liveShow?.currentSceneIndex, i >= 0, i < scenes.count else { return nil }
        return scenes[i]
    }
    func nextScenes(_ n: Int) -> [Scene] {
        guard let scenes = live?.scenes, let i = live?.liveShow?.currentSceneIndex else { return [] }
        return Array(scenes.dropFirst(i + 1).prefix(n))
    }
    func liveTimerText() -> String {
        guard let ls = live?.liveShow else { return "" }
        var elapsed = ls.timerElapsedMs / 1000
        if ls.timerMode == "running", let start = ls.timerStartAt, let t = Store.parseISO(start) {
            elapsed += Int(Date().timeIntervalSince(t))
        }
        if elapsed < 0 { elapsed = 0 }
        return String(format: "%d:%02d", elapsed / 60, elapsed % 60)
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
    static func isoDay(_ d: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_GB"); return f.string(from: d)
    }
    static func niceDate(_ key: String) -> String {
        let p = key.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return key }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_GB"); f.dateFormat = "EEE d MMM"
        return f.string(from: Calendar.current.date(from: DateComponents(year: p[0], month: p[1], day: p[2])) ?? Date())
    }
    static func parseISO(_ s: String) -> Date? {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    // MARK: loading

    func refresh() {
        guard isSignedIn else { onChange?(); return }
        busy = true
        Task { @MainActor in
            do {
                async let meT = API.shared.me()
                async let calT = API.shared.calendar()
                async let annT = API.shared.announcements()
                let (m, c, a) = try await (meT, calT, annT)
                me = m.member
                shows = c.shows
                events = c.subEvents
                announcements = a.items
                lastError = nil
                lastUpdated = Date()
                await refreshLive()
                saveCache()
                checkCallNotifications()
            } catch {
                lastError = (error as? LocalizedError)?.errorDescription ?? "Could not reach the crew hub."
            }
            busy = false
            onChange?()
        }
    }

    private func refreshLive() async {
        do { live = try await API.shared.liveState(deviceKey: deviceKey) } catch { /* keep last */ }
        checkMovementNotification()
    }

    func startTimers() {
        liveTimer?.invalidate()
        callTimer?.invalidate()
        callTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
        // The live show wants to be fresher than the calendar.
        liveTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.live?.open == true else { return }
                await self.refreshLive()
                self.onChange?()
            }
        }
    }

    func signOut() {
        API.shared.signOut()
        me = nil; events = []; shows = []; announcements = []; live = nil
        saveCache()
        onChange?()
    }

    // MARK: notifications

    private func notify(title: String, body: String, id: String) {
        guard notificationsEnabled else { return }
        let c = UNMutableNotificationContent()
        c.title = title; c.body = body; c.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: c, trigger: nil))
    }

    private func checkCallNotifications() {
        guard let next = nextEvent, let start = eventStart(next) else { return }
        let secs = start.timeIntervalSinceNow
        guard secs > 0, secs <= 15 * 60 else { return }
        let id = "call-\(next.id)"
        guard !notifiedCalls.contains(id) else { return }
        notifiedCalls.insert(id)
        notify(title: "Next call: \(next.title)", body: [showName(next.showIds?.first), whenText(next)].filter { !$0.isEmpty }.joined(separator: " · "), id: id)
    }

    /// Movement alerts from the live show: the whole point of having the app on
    /// the desk during a show.
    private func checkMovementNotification() {
        guard let ls = live?.liveShow, ls.open, ls.movementAlert else { notifiedMovement = nil; return }
        let message = ls.movementMessage.isEmpty ? "Movement on stage" : ls.movementMessage
        guard notifiedMovement != message else { return }
        notifiedMovement = message
        notify(title: "Movement — \(ls.name)", body: message, id: "movement-\(message.hashValue)")
    }

    // MARK: cache

    private var cacheURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("AshTec", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("cache.json")
    }
    private func saveCache() {
        let c = Cache(me: me, shows: shows, events: events, announcements: announcements, live: live, updated: lastUpdated)
        if let data = try? JSONEncoder().encode(c) { try? data.write(to: cacheURL) }
    }
    private func loadCache() {
        guard let data = try? Data(contentsOf: cacheURL), let c = try? JSONDecoder().decode(Cache.self, from: data) else { return }
        me = c.me; shows = c.shows; events = c.events; announcements = c.announcements; live = c.live; lastUpdated = c.updated
    }
}
