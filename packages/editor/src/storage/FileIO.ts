import { MgexFile, MgexSchema } from '@glix/shared';
import { useProjectStore, FileSystemFileHandle } from '../store/useProjectStore';

const LAST_SAVE_KEY = 'glix_last_save_time';

export async function saveProject(project: MgexFile, handle: FileSystemFileHandle | null): Promise<FileSystemFileHandle | null> {
    if (handle) {
        try {
            await writeToHandle(project, handle);
            localStorage.setItem(LAST_SAVE_KEY, Date.now().toString());
            useProjectStore.getState().clearDirty();
            return handle;
        } catch (e) {
            console.warn('Failed to save to existing handle, falling back to Save As', e);
        }
    }
    return saveProjectAs(project);
}

export async function saveProjectAs(project: MgexFile): Promise<FileSystemFileHandle | null> {
    const json = JSON.stringify(project, null, 2);
    const fileName = `${project.meta.name || 'project'}.glix`;

    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'Glix Project',
                    accept: { 'application/json': ['.glix'] },
                }],
            });
            await writeToHandle(project, handle);
            localStorage.setItem(LAST_SAVE_KEY, Date.now().toString());
            useProjectStore.getState().setFileHandle(handle);
            useProjectStore.getState().clearDirty();
            return handle;
        } catch (e: any) {
            if (e.name !== 'AbortError') throw e;
            return null;
        }
    } else {
        // Fallback for Firefox
        downloadStringAsFile(json, fileName);
        localStorage.setItem(LAST_SAVE_KEY, Date.now().toString());
        useProjectStore.getState().clearDirty();
        return null; // File System Access API not used
    }
}

async function writeToHandle(project: MgexFile, handle: FileSystemFileHandle) {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(project, null, 2));
    await writable.close();
}

export function loadProject(): Promise<MgexFile | null> {
    return new Promise((resolve, reject) => {
        if ('showOpenFilePicker' in window) {
            (window as any).showOpenFilePicker({
                types: [{
                    description: 'Glix Project',
                    accept: { 'application/json': ['.glix'] },
                }],
            }).then(async ([handle]: any[]) => {
                try {
                    const file = await handle.getFile();
                    const text = await file.text();
                    const project = parseAndValidateProject(text);
                    useProjectStore.getState().setFileHandle(handle);
                    useProjectStore.getState().setProject(project);
                    resolve(project);
                } catch (e) {
                    reject(e);
                }
            }).catch((e: any) => {
                if (e.name !== 'AbortError') reject(e);
                else resolve(null);
            });
        } else {
            // Fallback for Firefox
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.glix';
            input.onchange = async (e: any) => {
                const file = e.target.files[0];
                if (!file) {
                    resolve(null);
                    return;
                }
                try {
                    const text = await file.text();
                    const project = parseAndValidateProject(text);
                    useProjectStore.getState().setFileHandle(null);
                    useProjectStore.getState().setProject(project);
                    resolve(project);
                } catch (err) {
                    reject(err);
                }
            };
            input.click();
        }
    });
}

function parseAndValidateProject(jsonString: string): MgexFile {
    try {
        const raw = JSON.parse(jsonString);
        return MgexSchema.parse(raw);
    } catch (e: any) {
        console.error('Project validation failed', e);
        // We'll throw the readable ZodError message if possible
        const msg = e.errors ? e.errors.map((err: any) => err.message).join(', ') : 'Invalid project file format.';
        throw new Error(`Project validation failed: ${msg}`);
    }
}

function downloadStringAsFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function getLastSaveTime(): number {
    const val = localStorage.getItem(LAST_SAVE_KEY);
    return val ? parseInt(val, 10) : 0;
}
