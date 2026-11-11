#import <React/RCTBridgeModule.h>

// Objective-C bridge declaration for the App Group share inbox.
@interface RCT_EXTERN_MODULE(AGIShareInbox, NSObject)

RCT_EXTERN_METHOD(claimPendingShares:(NSArray<NSString *> *)heldReceipts
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(acknowledgePendingShares:(NSString *)receiptId
                  discardStagedCopies:(BOOL)discardStagedCopies
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
