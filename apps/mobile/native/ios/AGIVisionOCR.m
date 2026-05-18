#import <React/RCTBridgeModule.h>

// Objective-C bridge declaration for AGIVisionOCR Swift module.
@interface RCT_EXTERN_MODULE(AGIVisionOCR, NSObject)

RCT_EXTERN_METHOD(recognizeText:(NSString *)imageUri
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
