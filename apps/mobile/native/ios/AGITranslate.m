#import <React/RCTBridgeModule.h>

// Objective-C bridge declaration for AGITranslate Swift module.
@interface RCT_EXTERN_MODULE(AGITranslate, NSObject)

RCT_EXTERN_METHOD(translate:(NSString *)text
                  sourceLanguage:(NSString *)sourceLanguage
                  targetLanguage:(NSString *)targetLanguage
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isPairDownloaded:(NSString *)sourceLanguage
                  targetLanguage:(NSString *)targetLanguage
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
