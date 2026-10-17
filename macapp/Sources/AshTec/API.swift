import Foundation

// The crew hub's API, called directly. No web view: the app signs in with the
// magic link (which opens the app via ashtec://), keeps the session cookie in
// URLSession's cookie store, and talks to the same endpoints the website does.

let BASE_URL = URL(string: "https://ashtec.dino.icu")!

enum APIError: Error, LocalizedError {
    case notSignedIn
    case http(Int)
    case decode
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "Not signed in"
        case .http(let c): return "Server said \(c)"
        case .decode: return "Unexpected reply from the crew hub"
        }
    }
}

// MARK: - Models

struct Member: Codable {
    let id: String
    let firstName: String
    let lastName: String
    let isAdmin: Bool?
    let memberType: String?
    let year: String?
    let avatarUrl: String?
}
struct MeResp: Codable { let member: Member?; let liveShowActive: Bool?; let supportAwaiting: Int? }

struct Show: Codable { let id: String; let name: String; let code: String? }
struct Event: Codable {
    let id: String
    let title: String
    let type: String?
    let subtype: String?
    let showIds: [String]?
    let date: String?
    let dateTbc: Bool?
    let meetTime: String?
    let startTime: String?
    let endTime: String?
    let importance: String?
    let status: String?
    let description: String?
    let thingsToBring: String?
}
struct CalendarResp: Codable { let shows: [Show]; let subEvents: [Event] }

struct Announcement: Codable {
    let id: String
    let title: String
    let body: String
    let authorName: String
    let pinned: Bool
    let createdAt: String
}
struct AnnouncementsResp: Codable { let items: [Announcement] }

struct LiveShow: Codable {
    let id: String
    let name: String
    let status: String
    let open: Bool
    let intermissionMinutes: Int
    let currentSceneIndex: Int
    let movementAlert: Bool
    let movementMessage: String
    let movementSeconds: Int
    let timerMode: String
    let timerStartAt: String?
    let timerElapsedMs: Int
}
struct Scene: Codable {
    let id: String
    let label: String
    let title: String
    let minutes: Int?
    let cast: [String]?
    let notes: [String]?
    let sortIndex: Int?
}
struct LiveAnnouncement: Codable { let id: String; let body: String; let seconds: Int?; let expiresAt: String? }
struct LiveState: Codable {
    let open: Bool?
    let hasShow: Bool?
    let enabled: Bool?
    let liveShow: LiveShow?
    let scenes: [Scene]?
    let announcements: [LiveAnnouncement]?
}

// MARK: - Client

final class API {
    static let shared = API()
    private let session: URLSession

    init() {
        let cfg = URLSessionConfiguration.default
        cfg.httpCookieStorage = HTTPCookieStorage.shared
        cfg.httpShouldSetCookies = true
        cfg.httpCookieAcceptPolicy = .always
        cfg.timeoutIntervalForRequest = 20
        session = URLSession(configuration: cfg)
    }

    /// POST /api/<name> with the session cookie attached automatically.
    func call<T: Decodable>(_ name: String, _ body: [String: Any] = [:], as: T.Type) async throws -> T {
        var req = URLRequest(url: BASE_URL.appendingPathComponent("api/\(name)"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.decode }
        if http.statusCode == 401 { throw APIError.notSignedIn }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
        do { return try JSONDecoder().decode(T.self, from: data) } catch { throw APIError.decode }
    }

    func me() async throws -> MeResp { try await call("getMe", as: MeResp.self) }
    func calendar() async throws -> CalendarResp { try await call("getCalendar", as: CalendarResp.self) }
    func announcements() async throws -> AnnouncementsResp { try await call("getAnnouncements", ["limit": 60], as: AnnouncementsResp.self) }
    func liveState(deviceKey: String) async throws -> LiveState {
        try await call("getLiveShowState", ["deviceKey": deviceKey, "deviceName": "AshTec for Mac", "platform": "macOS"], as: LiveState.self)
    }

    /// Ask for a sign-in link that opens this app.
    func requestMagicLink(email: String) async throws {
        var req = URLRequest(url: BASE_URL.appendingPathComponent("api/auth/magic-link"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "appScheme": "ashtec"])
        _ = try await session.data(for: req)
    }

    /// Redeem the token from the emailed link; the server sets the session cookie.
    func completeSignIn(token: String) async throws {
        var comps = URLComponents(url: BASE_URL.appendingPathComponent("api/auth/verify"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "token", value: token), URLQueryItem(name: "callbackURL", value: "/")]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        _ = try await session.data(for: req)
    }

    var isSignedIn: Bool {
        (HTTPCookieStorage.shared.cookies(for: BASE_URL) ?? []).contains { $0.name == "crew_session" }
    }

    func signOut() {
        for c in HTTPCookieStorage.shared.cookies(for: BASE_URL) ?? [] { HTTPCookieStorage.shared.deleteCookie(c) }
    }
}
