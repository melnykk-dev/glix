import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface EditorState {
    leftPanelWidth: number;
    rightPanelWidth: number;
    selectedEntityIds: string[];
    activeRightTab: 'inspector' | 'script' | 'tilemap' | 'project';
    showNewProjectDialog: boolean;
    gizmoMode: 'translate' | 'rotate' | 'scale';
    theme: 'dark' | 'light';
    showShortcuts: boolean;
    hasSeenWelcome: boolean;
    setLeftPanelWidth: (width: number) => void;
    setRightPanelWidth: (width: number) => void;
    setSelectedEntityIds: (ids: string[]) => void;
    toggleEntitySelection: (id: string) => void;
    setActiveRightTab: (tab: 'inspector' | 'script' | 'tilemap' | 'project') => void;
    setShowNewProjectDialog: (show: boolean) => void;
    setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
    setTheme: (theme: 'dark' | 'light') => void;
    setShowShortcuts: (show: boolean) => void;
    setHasSeenWelcome: (seen: boolean) => void;
}

export const useEditorStore = create<EditorState>()(
    persist(
        (set) => ({
            leftPanelWidth: 250,
            rightPanelWidth: 300,
            selectedEntityIds: [],
            activeRightTab: 'inspector',
            showNewProjectDialog: false,
            gizmoMode: 'translate',
            theme: 'dark',
            showShortcuts: false,
            hasSeenWelcome: false,
            setLeftPanelWidth: (leftPanelWidth) => set({ leftPanelWidth }),
            setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth }),
            setSelectedEntityIds: (selectedEntityIds) => set({ selectedEntityIds }),
            toggleEntitySelection: (id) => set((state) => ({
                selectedEntityIds: state.selectedEntityIds.includes(id)
                    ? state.selectedEntityIds.filter(eid => eid !== id)
                    : [...state.selectedEntityIds, id]
            })),
            setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
            setShowNewProjectDialog: (showNewProjectDialog) => set({ showNewProjectDialog }),
            setGizmoMode: (gizmoMode) => set({ gizmoMode }),
            setTheme: (theme) => set({ theme }),
            setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
            setHasSeenWelcome: (hasSeenWelcome) => set({ hasSeenWelcome }),
        }),
        {
            name: 'glix-editor-storage',
            partialize: (state) => ({
                leftPanelWidth: state.leftPanelWidth,
                rightPanelWidth: state.rightPanelWidth,
                theme: state.theme,
                hasSeenWelcome: state.hasSeenWelcome,
            }),
        }
    )
);
