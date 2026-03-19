import { create } from 'zustand';
import { EntityDef } from '@glix/shared';

export type PlayState = 'stopped' | 'playing' | 'paused';

interface SceneState {
    playState: PlayState;
    prefabs: Record<string, EntityDef>;
    setPlayState: (state: PlayState) => void;
    addPrefab: (name: string, entity: EntityDef) => void;
    setPrefabs: (prefabs: Record<string, EntityDef>) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
    playState: 'stopped',
    prefabs: {},
    setPlayState: (playState) => set({ playState }),
    addPrefab: (name, entity) => set((state) => ({
        prefabs: { ...state.prefabs, [name]: entity }
    })),
    setPrefabs: (prefabs) => set({ prefabs }),
}));
