// swift-tools-version: 5.9
import PackageDescription

// Local Capacitor plugin. `npx cap sync` adds it to ios/App/CapApp-SPM/Package.swift as "RainoutStorekit".
let package = Package(
    name: "RainoutStorekit",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "RainoutStorekit", targets: ["RainOutStoreKitPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "RainOutStoreKitPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/RainOutStoreKitPlugin")
    ]
)
