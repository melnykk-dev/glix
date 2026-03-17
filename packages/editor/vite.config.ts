import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@glix/runtime': path.resolve(__dirname, '../runtime'),
            '@glix/shared': path.resolve(__dirname, '../shared'),
        },
    },
    server: {
        port: 3000,
    },
});
