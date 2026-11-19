import Foundation
import Capacitor
import StoreKit
import UIKit

/// Rain Out Pro purchases with StoreKit 2. Everything is on-device:
/// products and prices come from the App Store, entitlements from Transaction.currentEntitlements
/// (cryptographically verified by StoreKit). No server, no receipts sent anywhere.
@objc(RainOutStoreKitPlugin)
public class RainOutStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RainOutStoreKitPlugin"
    public let jsName = "RainOutStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Renewals, refunds, Ask to Buy approvals and purchases made on other devices arrive here.
        updatesTask = Task.detached(priority: .background) { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
                await self?.emitEntitlements()
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    // MARK: - JS methods

    @objc func getProducts(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let products = try await Product.products(for: ids)
                call.resolve(["products": products.map { Self.productJSON($0) }])
            } catch {
                call.reject("Could not load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Missing product id")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("This subscription is not available right now.")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        let ents = await Self.activeEntitlements()
                        call.resolve(["status": "purchased", "entitlements": ents])
                    case .unverified(_, let error):
                        call.reject("The App Store could not verify this purchase: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                // User may cancel the Apple Account sign-in; still return whatever is on the device.
            }
            let ents = await Self.activeEntitlements()
            call.resolve(["entitlements": ents])
        }
    }

    @objc func entitlements(_ call: CAPPluginCall) {
        Task {
            let ents = await Self.activeEntitlements()
            call.resolve(["entitlements": ents])
        }
    }

    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("No active window")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    // MARK: - Helpers

    private func emitEntitlements() async {
        let ents = await Self.activeEntitlements()
        notifyListeners("entitlements", data: ["entitlements": ents])
    }

    private static func activeEntitlements() async -> [JSObject] {
        var out: [JSObject] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result else { continue }
            if t.revocationDate != nil { continue }
            if let exp = t.expirationDate, exp < Date() { continue }
            var e: JSObject = [
                "productId": t.productID,
                "originalId": String(t.originalID),
                "purchased": t.purchaseDate.timeIntervalSince1970 * 1000
            ]
            if let exp = t.expirationDate { e["expires"] = exp.timeIntervalSince1970 * 1000 }
            out.append(e)
        }
        return out
    }

    private static func productJSON(_ p: Product) -> JSObject {
        var o: JSObject = [
            "id": p.id,
            "displayName": p.displayName,
            "description": p.description,
            "displayPrice": p.displayPrice,
            "price": NSDecimalNumber(decimal: p.price).doubleValue
        ]
        if let sub = p.subscription {
            let unit: String
            switch sub.subscriptionPeriod.unit {
            case .day: unit = "day"
            case .week: unit = "week"
            case .month: unit = "month"
            case .year: unit = "year"
            @unknown default: unit = "period"
            }
            o["period"] = ["unit": unit, "value": sub.subscriptionPeriod.value] as JSObject
            o["groupId"] = sub.subscriptionGroupID
        }
        return o
    }
}
