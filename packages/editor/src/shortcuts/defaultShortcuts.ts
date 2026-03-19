import { shortcutManager } from './ShortcutManager';
import { useHistoryStore } from '../store/useHistoryStore';
import { useEditorStore } from '../store/useEditorStore';
import { useProjectStore } from '../store/useProjectStore';
import { useSceneStore } from '../store/useSceneStore';
import { saveProject } from '../storage/FileIO';
import { editorBridge } from '../bridge/EditorBridge';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';

export const registerDefaultShortcuts = () => {
    // History
    shortcutManager.registerShortcut({
        id: 'undo',
        keys: 'ctrl+z',
        description: 'Undo last action',
        action: () => {
            useHistoryStore.getState().undo();
            editorBridge.getEngine()?.render(0);
        }
    });

    shortcutManager.registerShortcut({
        id: 'redo',
        keys: 'ctrl+shift+z',
        description: 'Redo last action',
        action: () => {
            useHistoryStore.getState().redo();
            editorBridge.getEngine()?.render(0);
        }
    });

    shortcutManager.registerShortcut({
        id: 'redo-y',
        keys: 'ctrl+y',
        description: 'Redo last action (alt)',
        action: () => {
            useHistoryStore.getState().redo();
            editorBridge.getEngine()?.render(0);
        }
    });

    shortcutManager.registerShortcut({
        id: 'copy',
        keys: 'ctrl+c',
        description: 'Copy selected entities',
        action: () => {
            const selected = useEditorStore.getState().selectedEntityIds;
            const engine = editorBridge.getEngine();
            if (selected.length > 0 && engine) {
                const world = engine.getWorld();
                const data = selected.map(id => ({ id, name: world.getName(id), components: world.getEntityComponents(id) }));
                localStorage.setItem('glix-clipboard', JSON.stringify(data));
            }
        }
    });

    shortcutManager.registerShortcut({
        id: 'paste',
        keys: 'ctrl+v',
        description: 'Paste selected entities',
        action: () => {
            const dataStr = localStorage.getItem('glix-clipboard');
            const engine = editorBridge.getEngine();
            if (dataStr && engine) {
                const data = JSON.parse(dataStr);
                data.forEach((entry: any) => {
                    const components = JSON.parse(JSON.stringify(entry.components));
                    if (components.transform) {
                        components.transform.x += 16 / 10; // offset
                        components.transform.y -= 16 / 10;
                    }
                    useHistoryStore.getState().pushCommand(new CreateEntityCommand(components));
                });
                engine.render(0);
            }
        }
    });

    // File ops
    shortcutManager.registerShortcut({
        id: 'save',
        keys: 'ctrl+s',
        description: 'Save project',
        action: () => {
            const { project, fileHandle } = useProjectStore.getState();
            if (project) saveProject(project, fileHandle);
        }
    });

    // Entity ops
    shortcutManager.registerShortcut({
        id: 'delete',
        keys: 'delete',
        description: 'Delete selected entities',
        action: () => {
            const { selectedEntityIds, setSelectedEntityIds } = useEditorStore.getState();
            if (selectedEntityIds.length === 0) return;

            const { updateProject } = useProjectStore.getState();
            const engine = editorBridge.getEngine();
            if (!engine) return;

            const world = engine.getWorld();

            const deleteRecursive = (id: string) => {
                const children = world.getEntitiesWithComponents().filter(eid => {
                    const t = world.getComponent(eid, 'transform');
                    return t?.parent === id;
                });
                children.forEach(deleteRecursive);
                world.removeEntity(id);
            };

            selectedEntityIds.forEach(deleteRecursive);
            setSelectedEntityIds([]);

            updateProject(project => {
                const startSceneId = project.settings.startScene;
                const scene = project.scenes[startSceneId];
                if (scene) {
                    const remaining = world.getEntitiesWithComponents();
                    scene.entities = scene.entities.filter(e => remaining.includes(e.id));
                }
                return { ...project };
            });

            engine.render(0);
        }
    });

    shortcutManager.registerShortcut({
        id: 'duplicate',
        keys: 'ctrl+d',
        description: 'Duplicate selected entities',
        action: () => {
            const { selectedEntityIds } = useEditorStore.getState();
            if (selectedEntityIds.length === 0) return;

            const engine = editorBridge.getEngine();
            if (!engine) return;

            const world = engine.getWorld();
            selectedEntityIds.forEach(id => {
                const components = JSON.parse(JSON.stringify(world.getEntityComponents(id)));
                if (components.transform) {
                    components.transform.x += 0.5;
                    components.transform.y -= 0.5;
                }
                useHistoryStore.getState().pushCommand(new CreateEntityCommand(components));
            });

            engine.render(0);
        }
    });

    // Gizmo mode — only when not typing in an input
    shortcutManager.registerShortcut({
        id: 'gizmo-translate',
        keys: 'g',
        description: 'Translate tool',
        action: () => useEditorStore.getState().setGizmoMode('translate')
    });

    shortcutManager.registerShortcut({
        id: 'gizmo-rotate',
        keys: 'r',
        description: 'Rotate tool',
        action: () => useEditorStore.getState().setGizmoMode('rotate')
    });

    shortcutManager.registerShortcut({
        id: 'gizmo-scale',
        keys: 's',
        description: 'Scale tool',
        action: () => useEditorStore.getState().setGizmoMode('scale')
    });

    // Playback
    shortcutManager.registerShortcut({
        id: 'play-stop',
        keys: 'ctrl+p',
        description: 'Play / Pause',
        action: () => {
            window.dispatchEvent(new CustomEvent('glix-toggle-play'));
        }
    });

    shortcutManager.registerShortcut({
        id: 'stop',
        keys: 'escape',
        description: 'Stop playback',
        action: () => {
            const playState = useSceneStore.getState().playState;
            if (playState !== 'stopped') {
                window.dispatchEvent(new CustomEvent('glix-stop'));
            }
        }
    });

    shortcutManager.registerShortcut({
        id: 'focus',
        keys: 'f',
        description: 'Focus camera on selection',
        action: () => {
            window.dispatchEvent(new CustomEvent('glix-focus-selection'));
        }
    });

    shortcutManager.registerShortcut({
        id: 'show-shortcuts',
        keys: '?',
        description: 'Show keyboard shortcuts',
        action: () => {
            window.dispatchEvent(new CustomEvent('glix-toggle-shortcuts'));
        }
    });
};
