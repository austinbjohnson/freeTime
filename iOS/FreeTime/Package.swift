// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "TagScanner",
    platforms: [
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "TagScanner",
            targets: ["TagScanner"]
        ),
    ],
    dependencies: [
        // Convex Swift SDK (when available) or we'll use REST API
    ],
    targets: [
        .target(
            name: "TagScanner",
            dependencies: []
        ),
        .testTarget(
            name: "TagScannerTests",
            dependencies: ["TagScanner"]
        ),
    ]
)

