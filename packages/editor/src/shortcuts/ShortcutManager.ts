export type ShortcutAction = () => void;

export interface Shortcut {
    id: string;
    keys: string; // e.g., "ctrl+s", "f", "delete"
    description: string;
    action: ShortcutAction;
}

export class ShortcutManager {
    private shortcuts: Map<string, Shortcut> = new Map();

    constructor() {
        window.addEventListener('keydown', this.handleKeyDown);
    }

    registerShortcut(shortcut: Shortcut) {
        this.shortcuts.set(shortcut.id, shortcut);
    }

    unregisterShortcut(id: string) {
        this.shortcuts.delete(id);
    }

    getShortcuts(): Shortcut[] {
        return Array.from(this.shortcuts.values());
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        // Prevent shortcuts if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return;
        }

        const keys: string[] = [];
        if (e.ctrlKey || e.metaKey) keys.push('ctrl');
        if (e.shiftKey) keys.push('shift');
        if (e.altKey) keys.push('alt');

        const keyName = e.key.toLowerCase();
        if (['control', 'meta', 'shift', 'alt'].indexOf(keyName) === -1) {
            keys.push(keyName);
        }

        const combo = keys.join('+');

        for (const shortcut of this.shortcuts.values()) {
            if (shortcut.keys.toLowerCase() === combo) {
                e.preventDefault();
                shortcut.action();
                break;
            }
        }
    };

    destroy() {
        window.removeEventListener('keydown', this.handleKeyDown);
    }
}

export const shortcutManager = new ShortcutManager();
