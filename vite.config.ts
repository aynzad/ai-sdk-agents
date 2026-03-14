import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      outDir: 'dist',
      rollupTypes: true,  // Bundle all .d.ts into a single file
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AiSdkAgents',
      formats: ['es', 'cjs'],
      fileName: (format) =>
        format === 'es' ? 'ai-sdk-agents.js' : 'ai-sdk-agents.cjs',
    },
    rollupOptions: {
      // Externalize peer deps — never bundle these
      external: ['ai', 'zod'],
      output: {
        globals: {
          ai: 'ai',
          zod: 'zod',
        },
      },
    },
    sourcemap: true,
    minify: false,       // Keep readable for debugging
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
