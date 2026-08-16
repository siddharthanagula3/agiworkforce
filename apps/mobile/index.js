import './polyfills';
import { initExecutorch } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';
import 'expo-router/entry';

initExecutorch({ resourceFetcher: ExpoResourceFetcher });
