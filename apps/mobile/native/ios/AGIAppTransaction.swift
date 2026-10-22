import Foundation
import React
import StoreKit

// The server needs Apple's signed app transaction, not decoded fields, to link
// this install to an account: Apple names the install, never the account, when
// a parent or guardian withdraws consent (RESCIND_CONSENT).
@objc(AGIAppTransaction)
final class AGIAppTransaction: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(signedAppTransaction:reject:)
  func signedAppTransaction(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        resolve(try await AppTransaction.shared.jwsRepresentation)
      } catch {
        reject("APP_TRANSACTION_ERROR", error.localizedDescription, error as NSError)
      }
    }
  }
}
