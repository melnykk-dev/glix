import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface EditorState {
    leftPanelWidth: number;
    rightPanelWidth: number;
    selectedEntityIds: string[];
    activeRightTab: 'inspector' | 'hierarchy' | 'assets' | 'script' | 'logic' | 'render' | 'tilemap' | 'project' | 'profiler';
    showNewProjectDialog: boolean;
    gizmoMode: 'translate' | 'rotate' | 'scale';
    theme: 'dark' | 'light';
    showShortcuts: boolean;
    hasSeenWelcome: boolean;
    hasEnteredEditor: boolean;
    editorMode: 'starter' | 'advanced';
    showProfiler: boolean;
    snappingEnabled: boolean;
    snapSize: number;
    selectionRect: { x1: number, y1: number, x2: number, y2: number } | null;

    setLeftPanelWidth: (width: number) => void;
    setRightPanelWidth: (width: number) => void;
    setSelectedEntityIds: (ids: string[]) => void;
    toggleEntitySelection: (id: string) => void;
    setActiveRightTab: (tab: 'inspector' | 'logic' | 'render' | 'script' | 'tilemap' | 'project' | 'profiler') => void;
    setShowNewProjectDialog: (show: boolean) => void;
    setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void;
    setTheme: (theme: 'dark' | 'light') => void;
    setShowShortcuts: (show: boolean) => void;
    setHasSeenWelcome: (seen: boolean) => void;
    setHasEnteredEditor: (entered: boolean) => void;
    setEditorMode: (mode: 'starter' | 'advanced') => void;
    setShowProfiler: (show: boolean) => void;
    setSnappingEnabled: (enabled: boolean) => void;
    setSnapSize: (size: number) => void;
    setSelectionRect: (rect: { x1: number, y1: number, x2: number, y2: number } | null) => void;
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
            hasEnteredEditor: false,
            editorMode: 'starter',
            showProfiler: false,
            snappingEnabled: true,
            snapSize: 0.5,
            selectionRect: null,

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
            setHasEnteredEditor: (hasEnteredEditor) => set({ hasEnteredEditor }),
            setEditorMode: (mode) => {
                if (mode === 'starter') {
                    set({ editorMode: mode, activeRightTab: 'logic' });
                } else {
                    set({ editorMode: mode });
                }
            },
            setShowProfiler: (showProfiler) => set({ showProfiler }),
            setSnappingEnabled: (snappingEnabled) => set({ snappingEnabled }),
            setSnapSize: (snapSize) => set({ snapSize }),
            setSelectionRect: (selectionRect) => set({ selectionRect }),
        }),
        {
            name: 'glix-editor-storage',
            partialize: (state) => ({
                leftPanelWidth: state.leftPanelWidth,
                rightPanelWidth: state.rightPanelWidth,
                theme: state.theme,
                hasSeenWelcome: state.hasSeenWelcome,
                hasEnteredEditor: state.hasEnteredEditor,
                editorMode: state.editorMode,
                snappingEnabled: state.snappingEnabled,
                snapSize: state.snapSize,
            }),
        }
    )
);
