#import <React/RCTBridgeModule.h>

// Objective-C bridge declaration for the App Group share-draft inbox.
@interface RCT_EXTERN_MODULE(AGIShareInbox, NSObject)

RCT_EXTERN_METHOD(consumePendingShares:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
