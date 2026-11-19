import { documentDirectory } from 'expo-file-system/legacy';

export const MODELS_DIR = `${documentDirectory}models/`;
export const EXECUTORCH_MODELS_DIR = `${documentDirectory}react-native-executorch/`;
export const MODEL_STORAGE_DIRS = [MODELS_DIR, EXECUTORCH_MODELS_DIR] as const;
