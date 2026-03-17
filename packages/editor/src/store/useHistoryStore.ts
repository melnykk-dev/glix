import { create } from 'zustand';
import { Command } from '../history/Command';

interface HistoryState {
    undoStack: Command[];
    redoStack: Command[];
    pushCommand: (command: Command) => void;
    undo: () => void;
    redo: () => void;
    clear: () => void;
}

const MAX_HISTORY = 100;

export const useHistoryStore = create<HistoryState>((set, get) => ({
    undoStack: [],
    redoStack: [],

    pushCommand: (command: Command) => {
        command.execute();
        set((state) => ({
            undoStack: [...state.undoStack, command].slice(-MAX_HISTORY),
            redoStack: [], // Clear redo stack on new command
        }));
    },

    undo: () => {
        const { undoStack, redoStack } = get();
        if (undoStack.length === 0) return;

        const command = undoStack[undoStack.length - 1];
        command.undo();

        set({
            undoStack: undoStack.slice(0, -1),
            redoStack: [...redoStack, command],
        });
    },

    redo: () => {
        const { undoStack, redoStack } = get();
        if (redoStack.length === 0) return;

        const command = redoStack[redoStack.length - 1];
        command.execute();

        set({
            undoStack: [...undoStack, command],
            redoStack: redoStack.slice(0, -1),
        });
    },

    clear: () => {
        set({ undoStack: [], redoStack: [] });
    },
}));
