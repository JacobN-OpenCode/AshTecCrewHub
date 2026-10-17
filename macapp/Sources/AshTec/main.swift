import AppKit

// AshTec for macOS (feedback round 2, round 3).
//
// AppKit, not SwiftUI: the SwiftUI macros are not in the Command Line Tools, so
// this is the only way to build a Mac app without a full Xcode install. It is a
// proper app — a Dock icon, a window, a menu bar extra showing a live countdown
// to your next call, and a notification when a call is close. ("Live Activities"
// are an iOS/watchOS feature and do not exist on macOS; the menu bar countdown
// updating every second is the Mac equivalent.)

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
