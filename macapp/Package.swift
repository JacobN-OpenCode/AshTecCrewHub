// swift-tools-version:5.9
import PackageDescription

// The Mac app is a plain Swift package so it builds with the Command Line Tools
// (no Xcode, no paid Apple Developer account). build.sh wraps the built binary
// into a proper AshTec.app bundle.
let package = Package(
  name: "AshTec",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(name: "AshTec", path: "Sources/AshTec")
  ]
)
