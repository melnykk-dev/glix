import { useProjectStore } from '../store/useProjectStore';
import { MgexFile } from '@glix/shared';

const DB_NAME = 'GlixAutoSaveDB';
const STORE_NAME = 'autosave';
const KEY = 'glix_autosave';

export interface AutoSaveData {
    timestamp: number;
    project: MgexFile;
}

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function writeAutoSave(data: AutoSaveData): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(data, KEY);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Failed to write autosave', e);
    }
}

export async function readAutoSave(): Promise<AutoSaveData | null> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Failed to read autosave', e);
        return null;
    }
}

export async function clearAutoSave(): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(KEY);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
            tx.oncomplete = () => db.close();
        });
    } catch (e) {
        console.error('Failed to clear autosave', e);
    }
}

let timeoutId: number | null = null;
let lastSavedProjectRef: MgexFile | null = null;

export function initAutoSave() {
    // Debounced autosave listener
    useProjectStore.subscribe((state) => {
        if (!state.isDirty || !state.project) return;
        if (state.project === lastSavedProjectRef) return;

        if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
        }

        timeoutId = window.setTimeout(() => {
            const projectToSave = state.project;
            if (projectToSave) {
                // requestIdleCallback is supported in most modern browsers (except older Safari)
                const saveTask = () => {
                    writeAutoSave({ timestamp: Date.now(), project: projectToSave })
                        .then(() => {
                            lastSavedProjectRef = projectToSave;
                        });
                };

                if ('requestIdleCallback' in window) {
                    (window as any).requestIdleCallback(saveTask);
                } else {
                    setTimeout(saveTask, 0);
                }
            }
        }, 1500);
    });
}
