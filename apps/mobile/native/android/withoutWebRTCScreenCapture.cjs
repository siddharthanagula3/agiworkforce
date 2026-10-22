const { withAndroidManifest, createRunOncePlugin } = require('expo/config-plugins');

const PLUGIN_NAME = 'agi-without-webrtc-screen-capture';
const PLUGIN_VERSION = '1.0.0';

// react-native-webrtc declares a mediaProjection foreground service for screen
// sharing. The app never captures the screen, and Play requires a declaration
// and a demo video for every foreground-service type a release manifest carries.
const MEDIA_PROJECTION_SERVICE = 'com.oney.WebRTCModule.MediaProjectionService';

function withoutWebRTCScreenCapture(config) {
  return withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';
    const application = manifest.application?.[0];
    if (!application) return c;
    const services = application.service ?? [];
    if (!services.some((service) => service.$?.['android:name'] === MEDIA_PROJECTION_SERVICE)) {
      services.push({ $: { 'android:name': MEDIA_PROJECTION_SERVICE, 'tools:node': 'remove' } });
    }
    application.service = services;
    return c;
  });
}

module.exports = createRunOncePlugin(withoutWebRTCScreenCapture, PLUGIN_NAME, PLUGIN_VERSION);
