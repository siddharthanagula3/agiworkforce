import { Platform } from 'react-native';

import { codeFontFaces } from './tokens';

export const codeFontFamily = Platform.select<string>(codeFontFaces);
