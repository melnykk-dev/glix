/**
 * Web Worker: TypeScript → JS compilation using esbuild-wasm.
 *
 * esbuild-wasm is loaded lazily the first time a compile is requested.
 * The worker receives `{ src: string }` messages and responds with
 * `{ compiledJs: string }` or `{ error: string }`.
 */

// esbuild-wasm is not typed as a module for workers — use dynamic import
let esbuildReady: Promise<typeof import('esbuild-wasm')> | null = null;

async function getEsbuild() {
    if (!esbuildReady) {
        esbuildReady = import('esbuild-wasm').then(async (esbuild) => {
            await esbuild.initialize({
                wasmURL: new URL('esbuild-wasm/esbuild.wasm', import.meta.url).href,
                worker: false, // We are already in a worker
            });
            return esbuild;
        });
    }
    return esbuildReady;
}

export interface CompileRequest {
    src: string;
    /** Unique tag echoed back in the response */
    id: string;
}

export interface CompileResponse {
    id: string;
    compiledJs?: string;
    error?: string;
}

self.onmessage = async (event: MessageEvent<CompileRequest>) => {
    const { src, id } = event.data;

    try {
        const esbuild = await getEsbuild();

        const result = await esbuild.transform(src, {
            loader: 'ts',
            format: 'cjs',   // CommonJS output — ScriptSandbox expects module.exports
            target: 'es2020',
            // Inline source map for line-number reporting
            sourcemap: 'inline',
            sourcefile: 'script.ts',
        });

        const response: CompileResponse = { id, compiledJs: result.code };
        self.postMessage(response);
    } catch (e: any) {
        const response: CompileResponse = { id, error: e?.message ?? String(e) };
        self.postMessage(response);
    }
};
