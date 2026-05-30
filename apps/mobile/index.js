import './polyfills';
import { initExecutorch } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';
import 'expo-router/entry';

// Wire the ExecuTorch resource fetcher at startup. Without this,
// ResourceFetcher.adapter is null and every on-device model load
// (tier2LoadModel) throws on a clean install — so no real offline generation is
// possible. Runs during module evaluation, before any user-triggered model
// download. See react-native-executorch's loading-models docs.
initExecutorch({ resourceFetcher: ExpoResourceFetcher });
