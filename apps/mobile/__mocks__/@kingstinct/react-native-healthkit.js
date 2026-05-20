// Stub for @kingstinct/react-native-healthkit.
// The real native module is loaded after `expo prebuild` on device.
// Test files override this with jest.mock().
module.exports = {
  default: {
    requestAuthorization: jest.fn().mockResolvedValue(false),
    getAuthorizationStatusForType: jest.fn().mockResolvedValue('notDetermined'),
    queryWorkoutSamples: jest.fn().mockResolvedValue([]),
    queryQuantitySamples: jest.fn().mockResolvedValue([]),
    queryCategorySamples: jest.fn().mockResolvedValue([]),
  },
};
