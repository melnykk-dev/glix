/**
 * Real per-extension Worker sandbox — PLUGIN_SPEC.md §4.
 *
 * Extension code runs in a dedicated Worker (one per extension) with no
 * `document`, no `window`, no `localStorage` by construction. The worker
 * global scope has `fetch` / `WebSocket` / `XMLHttpRequest` shadowed to
 * `undefined` by the bootstrap (best effort — see below), and the only way
 * out is the `postMessage` bridge to the host, which validates every call.
 *
 * Honest limits (do not oversell this):
 * - `eval` still exists as a language builtin inside the worker. It can
 *   only evaluate code *inside* the worker, with no host, DOM or engine
 *   reference, and the loader statically rejects `eval(`/`new Function(`
 *   at install anyway (defence in depth). The Worker boundary — not the
 *   scan — is the real enforcement.
 * - Shadowing `fetch` uses `Object.defineProperty` on the worker global.
 *   It works in Node `worker_threads` (verified) and in module workers in
 *   current Chrome/Firefox; if a future host refuses the redefinition, a
 *   bare `fetch()` from extension code could reach the network — but with
 *   no credentials, no DOM and no project data beyond what `ctx` gave it.
 *   `ctx.network.fetch` (allowlist-enforced, host-side) is the supported
 *   path; bare `fetch` is never part of the extension API.
 * - System `update()` calls are async across the bridge, so the host runs
 *   them with a one-frame pipeline: each frame the host sends a world
 *   snapshot and applies the patches from the previous round-trip. See
 *   `ExtensionLoader` — the stub system documents the lag. `flush()`
 *   (used by tests) awaits a round-trip instead.
 *
 * Fallback: when no Worker is available at all (very old browsers, some
 * sandboxed iframes), the loader falls back to the in-process
 * `new Function` path in `ExtensionLoader` — clearly marked
 * prototype-grade there. The fallback is a *capability* fallback, never a
 * silent downgrade: `WorkerSandbox.start()` reports which mode is active
 * and the loader records it on the extension.
 */

export type SandboxMode = 'worker' | 'in-process';

export interface WorldSnapshotEntity {
    id: string;
    name?: string;
    components: Record<string, unknown>;
}

export interface WorldSnapshot {
    entities: WorldSnapshotEntity[];
}

export interface ComponentPatch {
    entity: string;
    type: string;
    patch: Record<string, unknown>;
}

export interface InputSnapshot {
    actions: Record<string, boolean>;
    axes: Record<string, number>;
}

/** Host-side services the worker reaches through the bridge. Every method
 * is validated by the loader before it runs (permissions, declared
 * contributions, allowlists) — the bridge itself never trusts the worker. */
export interface SandboxHost {
    /** A `ctx` call from the worker (method names are the dotted `ctx`
     * paths, e.g. `'components.register'`). Returns a JSON value. */
    onCtxCall(method: string, args: unknown[]): Promise<unknown>;
    /** Patches a worker system produced (already validated host-side
     * before this is called — the host applies them). */
    onSystemResult(systemId: string, patches: ComponentPatch[]): void;
    /** A worker system threw during `update()`. */
    onSystemError(systemId: string, error: string): void;
    onLog(level: 'info' | 'warn' | 'error', message: string): void;
}

export interface WorkerSandboxOptions {
    code: string;
    extId: string;
    /** Frozen manifest copy, as the worker's `ctx.manifest`. */
    manifest: unknown;
    /** Extension storage as plain `{key: value}` pairs (host namespaces). */
    storage: Record<string, unknown>;
    /** Package-relative asset paths (`assets/...` without the prefix). */
    assetIds: string[];
    granted: string[];
    input?: InputSnapshot;
}

const HOOK_TIMEOUT_MS = 5000;
const START_TIMEOUT_MS = 10000;

/** Minimal worker surface shared by the browser `Worker` and Node
 * `worker_threads` `Worker`. */
interface WorkerLike {
    postMessage(message: unknown): void;
    terminate(): void | Promise<unknown>;
    onMessage(cb: (message: unknown) => void): void;
    onError(cb: (err: Error) => void): void;
}

interface Pending {
    resolve: (value: never) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class WorkerSandbox {
    mode: SandboxMode = 'in-process';
    /** Hook names the extension actually exports (from the ready message). */
    hooks: string[] = [];
    private worker: WorkerLike | null = null;
    private blobUrl: string | null = null;
    private nextCallId = 1;
    private helloSeen = false;
    private pending = new Map<number, Pending>();
    private systemWaiters = new Map<number, { resolve: (p: ComponentPatch[]) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    private nextRequestId = 1;
    private startPromise: Promise<SandboxMode> | null = null;

    constructor(
        private options: WorkerSandboxOptions,
        private host: SandboxHost,
    ) {}

    /** Starts the dedicated Worker. Returns `'worker'` on success.
     * Throws when no Worker runtime exists — the caller falls back to the
     * in-process sandbox (or refuses, when it asked for Worker only). */
    start(): Promise<SandboxMode> {
        if (this.startPromise) return this.startPromise;
        this.startPromise = this.doStart();
        return this.startPromise;
    }

    private async doStart(): Promise<SandboxMode> {
        const worker = await this.createWorker();
        this.worker = worker;
        worker.onMessage((msg) => this.handleMessage(msg));
        worker.onError((err) => {
            // A worker error (uncaught exception in the bootstrap) fails
            // any pending start; later calls fail loudly on their own.
            const pending = this.pending.get(0);
            if (pending) {
                clearTimeout(pending.timer);
                this.pending.delete(0);
                pending.reject(err);
            }
        });

        await this.waitForHello();
        const ready = await this.sendInit();
        if (!ready.ok) {
            await this.terminate();
            throw new Error(
                `The extension code could not be loaded inside its worker: ${ready.error ?? 'unknown error'}.`,
            );
        }
        this.hooks = ready.hooks ?? [];
        this.mode = 'worker';
        return 'worker';
    }

    private async createWorker(): Promise<WorkerLike> {
        // Browser path: a module worker (no `importScripts`, no DOM).
        const g = globalThis as unknown as Record<string, unknown>;
        if (typeof g['Worker'] === 'function') {
            const WorkerCtor = g['Worker'] as new (url: string, opts?: { type: string }) => {
                postMessage(m: unknown): void;
                terminate(): void;
                onmessage: ((e: { data: unknown }) => void) | null;
                onerror: ((e: { message?: string }) => void) | null;
            };
            const url = URL.createObjectURL(new Blob([WORKER_BOOTSTRAP], { type: 'text/javascript' }));
            this.blobUrl = url;
            const w = new WorkerCtor(url, { type: 'module' });
            return {
                postMessage: (m) => w.postMessage(m),
                terminate: () => w.terminate(),
                onMessage: (cb) => { w.onmessage = (e) => cb(e.data); },
                onError: (cb) => { w.onerror = (e) => cb(new Error(e.message ?? 'Worker error')); },
            };
        }
        // Node path (harness + SSR): worker_threads, bootstrap via eval.
        // The dynamic import is left alone by bundlers (@vite-ignore) and
        // never runs in a browser, where the branch above wins.
        try {
            // @ts-ignore — node:worker_threads types are not visible to
            // every tsconfig in this repo (the browser build never runs
            // this branch); the cast below is the real contract.
            const wt = await import(/* @vite-ignore */ 'node:worker_threads') as unknown as {
                Worker: new (code: string, opts: { eval: boolean }) => {
                    postMessage(m: unknown): void;
                    terminate(): Promise<number>;
                    on(ev: string, cb: (v: unknown) => void): void;
                };
            };
            const w = new wt.Worker(WORKER_BOOTSTRAP, { eval: true });
            return {
                postMessage: (m) => w.postMessage(m),
                terminate: () => w.terminate(),
                onMessage: (cb) => w.on('message', (m) => cb(m)),
                onError: (cb) => w.on('error', (e) => cb(e as Error)),
            };
        } catch {
            throw new Error(
                'No Worker runtime is available in this environment, so the extension cannot run in a real Worker sandbox.',
            );
        }
    }

    private waitForHello(): Promise<void> {
        if (this.helloSeen) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(0);
                reject(new Error('The extension worker did not start in time.'));
            }, START_TIMEOUT_MS);
            this.pending.set(0, {
                resolve: (() => { clearTimeout(timer); resolve(); }) as (value: never) => void,
                reject: ((err: Error) => { clearTimeout(timer); reject(err); }) as (err: Error) => void,
                timer,
            });
        });
    }

    private sendInit(): Promise<{ ok: boolean; hooks?: string[]; error?: string }> {
        return new Promise((resolve, reject) => {
            const callId = this.nextCallId++;
            const timer = setTimeout(() => {
                this.pending.delete(callId);
                reject(new Error('The extension worker did not load its code in time.'));
            }, START_TIMEOUT_MS);
            this.pending.set(callId, {
                resolve: ((v: never) => { clearTimeout(timer); resolve(v as unknown as { ok: boolean; hooks?: string[]; error?: string }); }) as (value: never) => void,
                reject: ((err: Error) => { clearTimeout(timer); reject(err); }) as (err: Error) => void,
                timer,
            });
            this.worker?.postMessage({
                kind: 'init',
                callId,
                code: this.options.code,
                extId: this.options.extId,
                manifest: this.options.manifest,
                storage: this.options.storage,
                assetIds: this.options.assetIds,
                granted: this.options.granted,
                input: this.options.input ?? { actions: {}, axes: {} },
            });
        });
    }

    /** Runs one lifecycle hook inside the worker. Rejects (plain message)
     * when the hook throws or times out — a hung hook never freezes the
     * engine: the worker is terminated on timeout. */
    async callHook(phase: string, timeoutMs: number = HOOK_TIMEOUT_MS): Promise<void> {
        const worker = this.worker;
        if (!worker) throw new Error('The extension worker is not running.');
        const callId = this.nextCallId++;
        const reply = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(callId);
                void this.terminate();
                reject(new Error(`timed out after ${timeoutMs / 1000} seconds`));
            }, timeoutMs);
            this.pending.set(callId, {
                resolve: (() => { clearTimeout(timer); resolve(); }) as (value: never) => void,
                reject: ((err: Error) => { clearTimeout(timer); reject(err); }) as (err: Error) => void,
                timer,
            });
        });
        worker.postMessage({ kind: 'hook', callId, phase });
        await reply;
    }

    /** Round-trip ping. Also a flush barrier: a pong is queued behind every
     * message sent before it, so awaiting `ping()` guarantees the worker
     * has processed all earlier messages (storage writes, log lines). */
    async ping(timeoutMs = 5000): Promise<void> {
        const worker = this.worker;
        if (!worker) return;
        const callId = this.nextCallId++;
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(callId);
                reject(new Error('The extension worker did not answer a ping in time.'));
            }, timeoutMs);
            this.pending.set(callId, {
                resolve: (() => { clearTimeout(timer); resolve(); }) as (value: never) => void,
                reject: ((err: Error) => { clearTimeout(timer); reject(err); }) as (err: Error) => void,
                timer,
            });
            worker.postMessage({ kind: 'ping', callId });
        });
    }

    /** Alias for `ping()` — use after fire-and-forget sends. */
    sync(): Promise<void> {
        return this.ping();
    }

    /** Fire-and-forget system update for the frame loop. The worker
     * replies with patches; they are delivered via `onSystemResult`. */
    sendSystemUpdate(systemId: string, snapshot: WorldSnapshot, dt: number, input: InputSnapshot): void {
        this.worker?.postMessage({
            kind: 'system-update',
            requestId: this.nextRequestId++,
            systemId,
            snapshot,
            dt,
            input,
            awaited: false,
        });
    }

    /** Awaited system update (tests, `flush()`). Rejects on timeout. */
    requestSystemUpdate(
        systemId: string,
        snapshot: WorldSnapshot,
        dt: number,
        input: InputSnapshot,
        timeoutMs = 5000,
    ): Promise<ComponentPatch[]> {
        const worker = this.worker;
        if (!worker) return Promise.resolve([]);
        const requestId = this.nextRequestId++;
        return new Promise<ComponentPatch[]>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.systemWaiters.delete(requestId);
                reject(new Error(`The extension system "${systemId}" did not answer its update in time.`));
            }, timeoutMs);
            this.systemWaiters.set(requestId, { resolve, reject, timer });
            worker.postMessage({
                kind: 'system-update',
                requestId,
                systemId,
                snapshot,
                dt,
                input,
                awaited: true,
            });
        });
    }

    sendEvent(pattern: string, payload: unknown): void {
        this.worker?.postMessage({ kind: 'event', pattern, payload });
    }

    sendInputState(input: InputSnapshot): void {
        this.worker?.postMessage({ kind: 'input-state', input });
    }

    async terminate(): Promise<void> {
        for (const [, p] of this.pending) clearTimeout(p.timer);
        this.pending.clear();
        for (const [, w] of this.systemWaiters) clearTimeout(w.timer);
        this.systemWaiters.clear();
        const worker = this.worker;
        this.worker = null;
        if (worker) {
            try {
                worker.postMessage({ kind: 'shutdown' });
            } catch {
                // Already dead — terminate below regardless.
            }
            await worker.terminate();
        }
        if (this.blobUrl) {
            try {
                URL.revokeObjectURL(this.blobUrl);
            } catch {
                // Non-browser runtimes have no blob URLs to revoke.
            }
            this.blobUrl = null;
        }
        this.mode = 'in-process';
        this.startPromise = null;
    }

    private handleMessage(msg: unknown): void {
        const m = msg as Record<string, unknown>;
        if (!m || typeof m !== 'object') return;
        switch (m['kind']) {
            case 'hello': {
                const p = this.pending.get(0);
                if (p) {
                    this.pending.delete(0);
                    p.resolve(undefined as never);
                } else {
                    // Hello arrived before the waiter was registered.
                    this.helloSeen = true;
                }
                break;
            }
            case 'ready': {
                const p = this.pending.get(m['callId'] as number);
                if (p) {
                    this.pending.delete(m['callId'] as number);
                    p.resolve({ ok: m['ok'], hooks: m['hooks'], error: m['error'] } as never);
                }
                break;
            }
            case 'hook-reply': {
                const p = this.pending.get(m['callId'] as number);
                if (!p) break;
                this.pending.delete(m['callId'] as number);
                if (m['ok']) p.resolve(undefined as never);
                else p.reject(new Error(String(m['error'] ?? 'The extension hook failed.')));
                break;
            }
            case 'pong': {
                const p = this.pending.get(m['callId'] as number);
                if (p) {
                    this.pending.delete(m['callId'] as number);
                    p.resolve(undefined as never);
                }
                break;
            }
            case 'rpc': {
                const callId = m['callId'] as number;
                void this.host.onCtxCall(String(m['method']), (m['args'] as unknown[]) ?? [])
                    .then((value) => {
                        this.worker?.postMessage({ kind: 'rpc-reply', callId, ok: true, value });
                    })
                    .catch((err: unknown) => {
                        this.worker?.postMessage({
                            kind: 'rpc-reply',
                            callId,
                            ok: false,
                            error: err instanceof Error ? err.message : String(err),
                        });
                    });
                break;
            }
            case 'system-result': {
                const patches = (m['patches'] as ComponentPatch[]) ?? [];
                const waiter = this.systemWaiters.get(m['requestId'] as number);
                if (waiter) {
                    clearTimeout(waiter.timer);
                    this.systemWaiters.delete(m['requestId'] as number);
                    waiter.resolve(patches);
                } else {
                    this.host.onSystemResult(String(m['systemId']), patches);
                }
                break;
            }
            case 'system-error': {
                const waiter = this.systemWaiters.get(m['requestId'] as number);
                if (waiter) {
                    clearTimeout(waiter.timer);
                    this.systemWaiters.delete(m['requestId'] as number);
                    waiter.reject(new Error(String(m['error'] ?? 'The extension system failed.')));
                } else {
                    this.host.onSystemError(String(m['systemId']), String(m['error'] ?? 'The extension system failed.'));
                }
                break;
            }
            default:
                break;
        }
    }
}

/**
 * The worker bootstrap. Runs as a classic script in Node `worker_threads`
 * (`eval: true`) and as a module worker in browsers. It imports the
 * extension entrypoint from a `data:` URL (the only import path — relative
 * imports have no base to resolve against, and the loader rejects them at
 * install), builds the local-mirror `ctx`, and answers host messages.
 *
 * Written without backticks / `${}` so it can live in a template literal.
 * `ctx` methods are local-first: synchronous reads come from mirrors
 * pushed by the host (storage, input, asset list); writes notify the host
 * over the bridge. Before answering a hook or a system update, the worker
 * drains all outstanding bridge calls so a host-side rejection (e.g.
 * undeclared registration) fails the hook instead of being swallowed.
 */
export const WORKER_BOOTSTRAP = [
    "'use strict';",
    "var port = null;",
    "var isNode = (typeof require !== 'undefined');",
    "if (isNode) { port = require('worker_threads').parentPort; } else { port = self; }",
    "function post(m) { port.postMessage(m); }",
    "function onMsg(fn) { if (port.on) { port.on('message', fn); } else { port.onmessage = function (e) { fn(e.data); }; } }",
    // Shadow network/DOM globals (best effort — see file header).
    "try { Object.defineProperty(globalThis, 'fetch', { value: undefined, writable: false, configurable: false }); } catch (e) {}",
    "try { Object.defineProperty(globalThis, 'WebSocket', { value: undefined, writable: false, configurable: false }); } catch (e) {}",
    "try { Object.defineProperty(globalThis, 'XMLHttpRequest', { value: undefined, writable: false, configurable: false }); } catch (e) {}",
    "var definition = null;",
    "var extId = '';",
    "var manifestObj = null;",
    "var storageMap = {};",
    "var inputState = { actions: {}, axes: {} };",
    "var queriedActions = {};",
    "var queriedAxes = {};",
    "var assetIds = [];",
    "var systemsLocal = {};",
    "var ownComponents = [];",
    "var listenersLocal = [];",
    "var rpcErrors = [];",
    "var pending = {};",
    "var nextCallId = 1;",
    "var drainWaiters = [];",
    "var busy = Promise.resolve();",
    "function rpc(method, args) { return new Promise(function (resolve, reject) { var id = nextCallId++; pending[id] = { resolve: resolve, reject: reject }; post({ kind: 'rpc', callId: id, method: method, args: args }); }); }",
    "function rpcNotify(method, args) { var id = nextCallId++; pending[id] = { resolve: function () {}, reject: function (err) { rpcErrors.push(err instanceof Error ? err.message : String(err)); } }; post({ kind: 'rpc', callId: id, method: method, args: args }); }",
    "function checkPending() { var ids = Object.keys(pending); if (ids.length === 0) { var w = drainWaiters; drainWaiters = []; w.forEach(function (fn) { fn(); }); } }",
    "function drainRpcs() { return new Promise(function (resolve) { if (Object.keys(pending).length === 0) { resolve(); return; } drainWaiters.push(resolve); }); }",
    "function base64ToBytes(b64) { var bin = atob(b64); var bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; }",
    "function globMatches(pattern, value) { var esc = pattern.replace(/[.+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '.*'); return new RegExp('^' + esc + '$').test(value); }",
    "var WRITABLE = ['transform', 'sprite', 'sortingLayer', 'frameAnimation'];",
    "function snapshotWorldView(snapshot, ownComponents) {",
    "  var byId = {};",
    "  snapshot.entities.forEach(function (e) { byId[e.id] = e; });",
    "  var patches = [];",
    "  var view = {",
    "    getEntitiesWithComponents: function () { var types = Array.prototype.slice.call(arguments); return snapshot.entities.filter(function (e) { return types.every(function (t) { return e.components && Object.prototype.hasOwnProperty.call(e.components, t); }); }).map(function (e) { return e.id; }); },",
    "    getComponent: function (entity, type) { var e = byId[entity]; if (!e || !e.components) return undefined; var v = e.components[type]; return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); },",
    "    setComponent: function (entity, type, patch) { if (ownComponents.indexOf(type) < 0 && WRITABLE.indexOf(type) < 0) throw new Error('Extension systems may only change components they registered themselves or whitelisted ones (' + WRITABLE.join(', ') + '); \"' + type + '\" is neither.'); patches.push({ entity: entity, type: type, patch: patch }); },",
    "    findEntityByName: function (name) { var found = undefined; snapshot.entities.forEach(function (e) { if (e.name === name) found = e.id; }); return found; },",
    "    getName: function (entity) { var e = byId[entity]; return e ? e.name : undefined; }",
    "  };",
    "  return { view: view, patches: patches };",
    "}",
    "function buildCtx() {",
    "  return {",
    "    extId: extId,",
    "    manifest: manifestObj,",
    "    systems: { register: function (def) {",
    "      if (!def || typeof def.id !== 'string' || !def.id) throw new Error('Extension tried to add a system without an id.');",
    "      if (def.phase !== 'fixed' && def.phase !== 'render') throw new Error('Extension tried to add a system with a phase that is not \"fixed\" or \"render\".');",
    "      if (systemsLocal[def.id]) throw new Error('Extension tried to add the system \"' + def.id + '\" twice.');",
    "      if (typeof def.update !== 'function') throw new Error('Extension tried to add a system called \"' + def.id + '\" without an update() function.');",
    "      systemsLocal[def.id] = def;",
    "      rpcNotify('systems.register', [{ id: def.id, phase: def.phase }]);",
    "    } },",
    "    components: { register: function (type, defaults) { if (ownComponents.indexOf(type) < 0) ownComponents.push(type); rpcNotify('components.register', [type, defaults]); } },",
    "    assets: {",
    "      get: function (id) { return rpc('assets.get', [id]).then(function (res) { return new Blob([base64ToBytes(res.dataBase64)], { type: res.mimeType || '' }); }); },",
    "      list: function () { return assetIds.map(function (p) { return { id: 'ext://' + extId + '/' + p, name: p }; }); },",
    "      import: function (blob, name) { return blob.text().then(function (text) { return rpc('assets.import', [name, text]); }); }",
    "    },",
    "    storage: {",
    "      get: function (key) { return storageMap.hasOwnProperty(key) ? JSON.parse(JSON.stringify(storageMap[key])) : undefined; },",
    "      set: function (key, value) { var s = JSON.stringify(value); if (s === undefined) throw new Error('Extension tried to store an undefined value. Storage only holds JSON values.'); var parsed = JSON.parse(s); storageMap[key] = parsed; rpcNotify('storage.set', [key, parsed]); }",
    "    },",
    "    network: { fetch: function (url, opts) { return rpc('network.fetch', [url, opts || null]).then(function (res) { return { ok: res.ok, status: res.status, statusText: res.statusText || '', text: function () { return Promise.resolve(res.text); }, json: function () { return Promise.resolve(JSON.parse(res.text)); } }; }); } },",
    "    events: {",
    "      on: function (pattern, cb) { if (typeof cb !== 'function') throw new Error('Extension called events.on() without a function.'); var entry = { pattern: pattern, cb: cb }; listenersLocal.push(entry); rpcNotify('events.on', [pattern]); return function () { var i = listenersLocal.indexOf(entry); if (i >= 0) listenersLocal.splice(i, 1); rpcNotify('events.off', [pattern]); }; },",
    "      emit: function (event, payload) { rpcNotify('events.emit', [event, payload]); }",
    "    },",
    "    input: { getAction: function (n) { if (!queriedActions[n]) { queriedActions[n] = true; rpcNotify('input.query', ['action', n]); } return !!inputState.actions[n]; }, getAxis: function (n) { if (!queriedAxes[n]) { queriedAxes[n] = true; rpcNotify('input.query', ['axis', n]); } return inputState.axes[n] || 0; } },",
    "    scripts: { registerBehaviour: function (name, fn) { if (typeof fn !== 'function') throw new Error('Extension tried to add a script behaviour called \"' + name + '\" without a function.'); rpcNotify('scripts.register', [name]); } },",
    "    ui: { registerPanel: function (def) { rpcNotify('ui.registerPanel', [def]); }, addMenuItem: function (def) { rpcNotify('ui.addMenuItem', [def]); } },",
    "    log: { info: function (m) { rpcNotify('log', ['info', String(m)]); }, warn: function (m) { rpcNotify('log', ['warn', String(m)]); }, error: function (m) { rpcNotify('log', ['error', String(m)]); } }",
    "  };",
    "}",
    "var ctx = null;",
    "function handleRpcReply(msg) { var p = pending[msg.callId]; if (!p) return; delete pending[msg.callId]; if (msg.ok) { p.resolve(msg.value); } else { p.reject(new Error(msg.error || 'Extension bridge call failed.')); } checkPending(); }",
    "onMsg(function (msg) {",
    "  if (!msg || typeof msg !== 'object') return;",
    "  if (msg.kind === 'init') {",
    "    extId = msg.extId; manifestObj = msg.manifest; storageMap = msg.storage || {}; assetIds = msg.assetIds || []; inputState = msg.input || { actions: {}, axes: {} };",
    "    var code = msg.code;",
    "    import('data:text/javascript;charset=utf-8,' + encodeURIComponent(code)).then(function (mod) {",
    "      definition = mod.default;",
    "      if (definition === null || typeof definition !== 'object') throw new Error('The extension entrypoint must have a single default export — the extension definition object.');",
    "      ctx = buildCtx();",
    "      var hooks = ['install', 'activate', 'deactivate', 'uninstall'].filter(function (h) { return typeof definition[h] === 'function'; });",
    "      post({ kind: 'ready', callId: msg.callId, ok: true, hooks: hooks });",
    "    }).catch(function (err) { post({ kind: 'ready', callId: msg.callId, ok: false, error: String(err && err.message || err) }); });",
    "    return;",
    "  }",
    "  if (msg.kind === 'rpc-reply') { handleRpcReply(msg); return; }",
    "  if (msg.kind === 'ping') { busy.then(function () { return drainRpcs(); }).then(function () { post({ kind: 'pong', callId: msg.callId }); }); return; }",
    "  if (msg.kind === 'input-state') { inputState = msg.input || inputState; return; }",
    "  if (msg.kind === 'event') { listenersLocal.forEach(function (l) { if (globMatches(l.pattern, msg.pattern)) { try { l.cb(msg.payload); } catch (err) { post({ kind: 'rpc', callId: 0, method: 'log', args: ['warn', 'Event listener failed: ' + String(err && err.message || err)] }); } } }); return; }",
    "  if (msg.kind === 'hook') {",
    "    rpcErrors = [];",
    "    var hook = definition ? definition[msg.phase] : null;",
    "    if (typeof hook !== 'function') { post({ kind: 'hook-reply', callId: msg.callId, ok: true }); return; }",
    "    busy = busy.then(function () {",
    "      return Promise.resolve().then(function () { return hook(ctx); }).then(function () { return drainRpcs(); }).then(function () {",
    "        if (rpcErrors.length > 0) { post({ kind: 'hook-reply', callId: msg.callId, ok: false, error: rpcErrors[0] }); }",
    "        else { post({ kind: 'hook-reply', callId: msg.callId, ok: true }); }",
    "      }).catch(function (err) { post({ kind: 'hook-reply', callId: msg.callId, ok: false, error: String(err && err.message || err) }); });",
    "    });",
    "    return;",
    "  }",
    "  if (msg.kind === 'system-update') {",
    "    var def = systemsLocal[msg.systemId];",
    "    if (!def) { post({ kind: 'system-error', requestId: msg.requestId, systemId: msg.systemId, error: 'No system \"' + msg.systemId + '\" is registered in this worker.' }); return; }",
    "    if (msg.input) inputState = msg.input;",
    "    var built = snapshotWorldView(msg.snapshot, ownComponents);",
    "    rpcErrors = [];",
    "    busy = busy.then(function () {",
    "      return Promise.resolve().then(function () { return def.update(built.view, msg.dt); }).then(function () { return drainRpcs(); }).then(function () {",
    "        if (rpcErrors.length > 0) { post({ kind: 'system-error', requestId: msg.requestId, systemId: msg.systemId, error: rpcErrors[0] }); }",
    "        else { post({ kind: 'system-result', requestId: msg.requestId, systemId: msg.systemId, patches: built.patches }); }",
    "      }).catch(function (err) { post({ kind: 'system-error', requestId: msg.requestId, systemId: msg.systemId, error: String(err && err.message || err) }); });",
    "    });",
    "    return;",
    "  }",
    "  if (msg.kind === 'shutdown') { return; }",
    "});",
    "post({ kind: 'hello' });",
].join('\n');
