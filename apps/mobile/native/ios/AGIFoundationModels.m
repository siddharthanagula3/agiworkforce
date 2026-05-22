#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Objective-C bridge declaration for AGIFoundationModels Swift module.
@interface RCT_EXTERN_MODULE(AGIFoundationModels, RCTEventEmitter)

RCT_EXTERN_METHOD(getCapabilities:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generate:(NSString *)prompt
                  systemPrompt:(NSString *)systemPrompt
                  messages:(NSArray<NSDictionary *> *)messages
                  requestId:(NSString *)requestId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
