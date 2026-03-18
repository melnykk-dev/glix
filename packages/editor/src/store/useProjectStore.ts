import { create } from 'zustand';
import { MgexFile } from '@glix/shared';

export interface FileSystemFileHandle {
    kind: 'file';
    name: string;
    getFile(): Promise<File>;
    createWritable(options?: any): Promise<any>;
}

interface ProjectState {
    project: MgexFile | null;
    isDirty: boolean;
    fileHandle: FileSystemFileHandle | null;

    setProject: (project: MgexFile | null) => void;
    updateProject: (updater: (project: MgexFile) => MgexFile) => void;
    markDirty: () => void;
    clearDirty: () => void;
    setFileHandle: (handle: FileSystemFileHandle | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
    project: null,
    isDirty: false,
    fileHandle: null,

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
}));
