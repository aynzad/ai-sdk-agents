import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    dts({
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
      outDir: 'dist',
      entryRoot: 'src',
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: {
        'ai-sdk-agents': resolve(__dirname, 'src/index.ts'),
        'test/index': resolve(__dirname, 'src/test/index.ts'),
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) =>
        `${entryName}${format === 'es' ? '.js' : '.cjs'}`,
    },
    rollupOptions: {
      external: ['ai', 'zod', 'vitest'],
      output: {
        globals: {
          ai: 'ai',
          zod: 'zod',
          vitest: 'vitest',
        },
      },
    },
    sourcemap: true,
    minify: false,
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
