// Game-save bridge (Harvest Valley, Studio Gate item 5).
//
// Why this exists: game scripts run sandboxed with no storage access by
// design, so a game persists by emitting `hv:save` { save } on the event
// bus. The HOST must listen and write to real browser storage, and feed
// the stored save back before the game's scripts run. Both hosts (editor
// Play mode and the exported standalone page) start scripts through
// ScriptSystem.init(), so the bridge attaches there — one implementation
// covers both hosts with no host-file changes (Exporter.ts / Viewport.tsx
// are owned by other teams and were not touched).
//
// Flow:
//   - GameManager.onStart emits `hv:load-request` when no save was
//     injected synchronously (via `engine.__hvSaveData`).
//   - The bridge reads IndexedDB (db `GlixGameSaves`, store `saves`,
//     key `hv-save`) and, if a save exists, calls
//     `engine.__hvGame.restoreFromSave(save)` — the live manager instance
//     the game stashes in onStart. The restore lands a few ms after boot;
//     the game clock has barely advanced, and restore() rebuilds plots,
//     HUD and player position, so the pop-in is invisible in practice.
//   - On sleep the game emits `hv:save` { save }; the bridge writes it to
//     IndexedDB (fire-and-forget — a failed write must never break play).
//
// The bridge never throws: with no IndexedDB (plain Node, no fake) every
// call is a silent no-op, and corrupt saves are warned about, never fatal.
// Attaching is idempotent per engine and safe across stop/start cycles:
// re-attaching first unsubscribes the previous handlers.

export const HV_SAVE_DB = 'GlixGameSaves';
export const HV_SAVE_STORE = 'saves';
export const HV_SAVE_KEY = 'hv-save';

function idbAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
}

/** True when the browser offers IndexedDB at all (false in plain Node). */
export function isSaveStorageAvailable(): boolean {
    return idbAvailable();
}

function openSaveDB(): Promise<IDBDatabase | null> {
    if (!idbAvailable()) return Promise.resolve(null);
    return new Promise((resolve) => {
        let req: IDBOpenDBRequest;
        try {
            req = indexedDB.open(HV_SAVE_DB, 1);
        } catch {
            resolve(null);
            return;
        }
        req.onupgradeneeded = () => {
            try {
                req.result.createObjectStore(HV_SAVE_STORE);
            } catch {
                // Store already exists (open with an existing db).
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
    });
}

/** Read a saved game JSON from IndexedDB. Returns null when there is no save or no storage. */
export async function readGameSave(key: string = HV_SAVE_KEY): Promise<string | null> {
    const db = await openSaveDB();
    if (!db) return null;
    try {
        const value: unknown = await new Promise((resolve, reject) => {
            const tx = db.transaction(HV_SAVE_STORE, 'readonly');
            const store = tx.objectStore(HV_SAVE_STORE);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => reject(req.error);
        });
        return typeof value === 'string' ? value : null;
    } catch {
        return null;
    } finally {
        try {
            db.close();
        } catch {
            // Ignore close errors.
        }
    }
}

/** Persist a save JSON to IndexedDB. Returns false when storage is unavailable. Never throws. */
export async function writeGameSave(save: string, key: string = HV_SAVE_KEY): Promise<boolean> {
    if (typeof save !== 'string') return false;
    const db = await openSaveDB();
    if (!db) return false;
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(HV_SAVE_STORE, 'readwrite');
            const store = tx.objectStore(HV_SAVE_STORE);
            const req = store.put(save, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        return true;
    } catch {
        return false;
    } finally {
        try {
            db.close();
        } catch {
            // Ignore close errors.
        }
    }
}

export interface SaveBridgeHandle {
    detach(): void;
}

/**
 * Attach the save bridge to an engine instance. `engine` is only used as
 * an anchor for the live game instance (`engine.__hvGame`, stashed by the
 * game in onStart) and for the stored unsubscribers — it needs no methods,
 * so duck-typed/fake engines (harness) work. `eventBus` is the engine's
 * bus. Safe to call on every ScriptSystem.init: re-attaching first
 * unsubscribes the previous handlers, so stop/start cycles never
 * double-subscribe.
 */
export function attachSaveBridge(
    engine: any,
    eventBus: { on(event: string, handler: (data: any) => void): () => void },
): SaveBridgeHandle | null {
    if (!engine || !eventBus || typeof eventBus.on !== 'function') return null;

    const prev = engine.__hvSaveBridge as SaveBridgeHandle | undefined;
    if (prev) {
        try {
            prev.detach();
        } catch {
            // A stale detach must not break the new attach.
        }
    }

    const unsubSave = eventBus.on('hv:save', (data: any) => {
        const save = data?.save;
        if (typeof save !== 'string' || save.length === 0) return;
        // No IndexedDB in this environment (plain Node / tests): stay silent,
        // the game keeps running. Only warn when storage exists but the
        // write itself failed.
        if (!isSaveStorageAvailable()) return;
        void writeGameSave(save).then((ok) => {
            if (!ok) console.warn('[Glix] Save bridge: could not write the save to IndexedDB.');
        });
    });

    const unsubLoad = eventBus.on('hv:load-request', () => {
        void readGameSave().then((save) => {
            if (typeof save !== 'string' || save.length <= 2) return;
            const gm = engine.__hvGame;
            if (!gm) return;
            try {
                if (typeof gm.restoreFromSave === 'function') {
                    gm.restoreFromSave(save);
                } else if (typeof gm.restore === 'function') {
                    gm.restore(save);
                }
            } catch (e) {
                console.warn('[Harvest Valley] Saved game was corrupt, starting fresh:', (e as Error).message);
            }
        });
    });

    const handle: SaveBridgeHandle = {
        detach() {
            try {
                unsubSave();
            } catch {
                // Ignore stale unsubscribes.
            }
            try {
                unsubLoad();
            } catch {
                // Ignore stale unsubscribes.
            }
        },
    };
    engine.__hvSaveBridge = handle;
    return handle;
}
