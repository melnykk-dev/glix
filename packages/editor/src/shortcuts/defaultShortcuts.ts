import { shortcutManager } from './ShortcutManager';
import { useHistoryStore } from '../store/useHistoryStore';
import { useEditorStore } from '../store/useEditorStore';

export const registerDefaultShortcuts = () => {
    // History
    shortcutManager.registerShortcut({
        id: 'undo',
        keys: 'ctrl+z',
        description: 'Undo last action',
        action: () => useHistoryStore.getState().undo()
    });

    shortcutManager.registerShortcut({
        id: 'redo',
        keys: 'ctrl+shift+z',
        description: 'Redo last action',
        action: () => useHistoryStore.getState().redo()
    });

    // File ops
    shortcutManager.registerShortcut({
        id: 'save',
        keys: 'ctrl+s',
        description: 'Save project',
        action: () => console.log('Saving...') // Placeholder for actual save trigger
    });

    // Entity ops
    shortcutManager.registerShortcut({
        id: 'delete',
        keys: 'delete',
        description: 'Delete selected entities',
        action: () => {
            if (useEditorStore.getState().selectedEntityIds.length > 0) {
                // delete logic
            }
        }
    });

    shortcutManager.registerShortcut({
        id: 'duplicate',
        keys: 'ctrl+d',
        description: 'Duplicate selected entities',
        action: () => {
            // duplicate logic
        }
    });

    // Gizmos
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
        description: 'Play/Pause',
        action: () => {
            // This should trigger the same logic as the Toolbar Play button
            window.dispatchEvent(new CustomEvent('glix-toggle-play'));
        }
    });

    shortcutManager.registerShortcut({
        id: 'stop',
        keys: 'escape',
        description: 'Stop',
        action: () => {
            window.dispatchEvent(new CustomEvent('glix-stop'));
        }
    });

    shortcutManager.registerShortcut({
        id: 'focus',
        keys: 'f',
        description: 'Focus on selection',
        action: () => {
            // Viewport should listen for this
            window.dispatchEvent(new CustomEvent('glix-focus-selection'));
        }
    });

    shortcutManager.registerShortcut({
        id: 'show-shortcuts',
        keys: '?',
        description: 'Show shortcuts',
        action: () => {
            window.dispatchEvent(new CustomEvent('glix-toggle-shortcuts'));
        }
    });
};
