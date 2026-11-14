import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: [/react-native-executorch\/lib\/module\/legacy\/src\/constants\//],
      },
    },
  },
});
