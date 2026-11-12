import { create } from 'zustand';
import { MgexFile } from '@glix/shared';

export interface FileSystemFileHandle {
    kind: 'file';
    name: string;
    getFile(): Promise<File>;
    createWritable(options?: any): Promise<any>;
}

/** What FileIO learned when the current file was opened (format v2). */
export interface OpenFileInfo {
    /** 'v1' = single JSON file (migrated in memory, file untouched until save);
     *  'v2' = .glix zip. Null = no file opened yet (new/empty project). */
    sourceFormat: 'v1' | 'v2' | null;
    /** Assets that will show as placeholders / cannot be carried into v2:
     * v2 opens — missing blob or checksum mismatch; v1 opens — skipped
     * during the in-memory migration. Empty when everything is fine. */
    brokenAssets: string[];
    /** Non-fatal notes from open (unknown files, dropped settings, fonts
     * the v1 editor model cannot hold, …). */
    fileWarnings: string[];
    /** v1 → v2 migration report for the opened file, if one ran. */
    migrationReport: {
        assetsExtracted: number;
        assetsSkipped: Array<{ id: string; reason: string }>;
        warnings: string[];
    } | null;
}

interface ProjectState {
    project: MgexFile | null;
    isDirty: boolean;
    fileHandle: FileSystemFileHandle | null;
    sourceFormat: 'v1' | 'v2' | null;
    brokenAssets: string[];
    fileWarnings: string[];
    migrationReport: OpenFileInfo['migrationReport'];

    setProject: (project: MgexFile | null) => void;
    updateProject: (updater: (project: MgexFile) => MgexFile) => void;
    markDirty: () => void;
    clearDirty: () => void;
    setFileHandle: (handle: FileSystemFileHandle | null) => void;
    setFileInfo: (info: Partial<Pick<OpenFileInfo, 'sourceFormat' | 'brokenAssets' | 'fileWarnings' | 'migrationReport'>>) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
    project: null,
    isDirty: false,
    fileHandle: null,
    sourceFormat: null,
    brokenAssets: [],
    fileWarnings: [],
    migrationReport: null,

    setProject: (project) => set({ project, isDirty: false }),

    updateProject: (updater) => set((state) => {
        if (!state.project) return state;
        return {
            project: updater(state.project),
            isDirty: true,
        };
    }),

    markDirty: () => set({ isDirty: true }),

    clearDirty: () => set({ isDirty: false }),

    setFileHandle: (fileHandle) => set({ fileHandle }),

    setFileInfo: (info) => set(info),
}));
