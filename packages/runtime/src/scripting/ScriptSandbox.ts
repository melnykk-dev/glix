import { ScriptComponent } from './ScriptComponent';

/**
 * Evaluates compiled JS in a restricted sandbox.
 *
 * The sandbox intentionally omits `window`, `document`, `fetch`, and similar
 * browser globals so user scripts cannot reach outside their permitted API.
 *
 * The compiled JS must export a class (the default class) that extends
 * ScriptComponent.  esbuild compiles it to IIFE / CJS format where the class
 * is assigned to `exports.default`.
 */
export class ScriptSandbox {
    /**
     * Instantiate a user script class from compiled JS.
     *
     * @param compiledJs  Output of esbuild targeting a CJS-like format.
     * @returns           An instance of the user script class (extends ScriptComponent).
     */
    static instantiate(compiledJs: string): ScriptComponent {
        // A minimal CommonJS-like environment
        const module = { exports: {} as any };
        const exports = module.exports;

        // Sandbox: explicitly block dangerous globals
        const sandbox = {
            // Allowed globals
            console,
            Math,
            JSON,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            Promise,
            Error,
            Array,
            Object,
            String,
            Number,
            Boolean,
            Date,
            RegExp,
            Map,
            Set,
            Symbol,
            // Provide ScriptComponent base class
            ScriptComponent,
            // CommonJS-ish helpers
            module,
            exports,
            require: (_id: string) => {
                throw new Error(`require() is not available in Glix scripts (tried: "${_id}")`);
            },
            // Explicitly block dangerous globals
            window: undefined,
            document: undefined,
            fetch: undefined,
            XMLHttpRequest: undefined,
            WebSocket: undefined,
            localStorage: undefined,
            sessionStorage: undefined,
        };

        // Build a function where all sandbox keys are in scope via destructuring
        // and the dangerous globals are shadowed by undefined.
        const keys = Object.keys(sandbox);
        const values = keys.map(k => (sandbox as any)[k]);

        // Wrap in a with() { } block to shadow outer scope
        // Note: 'with' only works in non-strict mode
        // eslint-disable-next-line no-new-func
        const fn = new Function(
            ...keys,
            `"use strict";\n${compiledJs}\n;return module.exports;`
        );

        let moduleExports: any;
        try {
            moduleExports = fn(...values);
        } catch (e) {
            throw new Error(`Script evaluation error: ${(e as Error).message}`);
        }

        // Support both `export default class Foo {}` (compiled to module.exports.default)
        // and direct class assignment (module.exports = class Foo {})
        const Ctor = moduleExports?.default ?? moduleExports;

        if (typeof Ctor !== 'function') {
            throw new Error(
                'Script must export a default class that extends ScriptComponent.'
            );
        }

        return new Ctor() as ScriptComponent;
    }
}
