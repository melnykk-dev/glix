import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        outDir: '../editor/public',
        emptyOutDir: false,
        lib: {
            entry: resolve(__dirname, 'index.ts'),
            name: 'GlixEngine',
            formats: ['iife'],
            fileName: () => 'runtime.iife.js',
        },
        rollupOptions: {
            external: [],
            output: {
                globals: {}
            }
        }
    }
});
