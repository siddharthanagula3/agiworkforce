#import <React/RCTBridgeModule.h>

// Objective-C bridge declaration for the AGIBackupExclusion Swift module.
@interface RCT_EXTERN_MODULE(AGIBackupExclusion, NSObject)

RCT_EXTERN_METHOD(excludeFromBackup:(NSArray<NSString *> *)uris
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
