#import <React/RCTBridgeModule.h>

// Objective-C bridge declaration for the StoreKit app transaction.
@interface RCT_EXTERN_MODULE(AGIAppTransaction, NSObject)

RCT_EXTERN_METHOD(signedAppTransaction:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
