import React, { useEffect, useRef, useCallback, useState } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { useEditorStore } from '../store/useEditorStore';
import { editorBridge } from '../bridge/EditorBridge';
import { ENGINE_TYPES_DTS, ENGINE_TYPES_FILENAME } from '../monaco/engineTypes';
import type { CompileRequest, CompileResponse } from '../workers/compiler.worker';

// Lazily instantiate the worker — only created when the panel first mounts
let workerInstance: Worker | null = null;
function getWorker(): Worker {
    if (!workerInstance) {
        workerInstance = new Worker(
            new URL('../workers/compiler.worker.ts', import.meta.url),
            { type: 'module' }
        );
    }
    return workerInstance;
}

/** Compile TypeScript via the esbuild-wasm worker. */
function compile(src: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        const worker = getWorker();

        const handler = (evt: MessageEvent<CompileResponse>) => {
            if (evt.data.id !== id) return;
            worker.removeEventListener('message', handler);
            if (evt.data.compiledJs !== undefined) {
                resolve(evt.data.compiledJs);
            } else {
                reject(new Error(evt.data.error ?? 'Unknown compile error'));
            }
        };

        worker.addEventListener('message', handler);
        const req: CompileRequest = { src, id };
        worker.postMessage(req);
    });
}

// ──────────────────────────────────────────────────────────────────────────────

export const ScriptEditor: React.FC = () => {
    const { selectedEntityIds } = useEditorStore();
    const entityId = selectedEntityIds.length === 1 ? selectedEntityIds[0] : null;

    /** Current TypeScript source shown in the editor */
    const [src, setSrc] = useState<string>('');
    /** Status / error message shown in the status bar */
    const [status, setStatus] = useState<string>('');
    const [isError, setIsError] = useState(false);
    const [isCompiling, setIsCompiling] = useState(false);

    const monacoRef = useRef<Monaco | null>(null);

    // When selected entity changes, load that entity's script src
    useEffect(() => {
        if (!entityId) {
            setSrc('');
            setStatus('');
            return;
        }
        const engine = editorBridge.getEngine();
        if (!engine) return;

        const script = engine.getWorld().getComponent(entityId, 'script');
        if (script) {
            setSrc(script.src);
            setStatus('');
        } else {
            setSrc('');
            setStatus('Entity has no Script component');
        }
    }, [entityId]);

    // Configure Monaco with engine type declarations once
    const handleMonacoMount = useCallback((monacoInstance: Monaco) => {
        monacoRef.current = monacoInstance;

        // Register engine types as global ambient declarations
        // Cast to `any` since the `languages.typescript` API shape differs
        // across monaco-editor versions and the typings are unsettled
        const ts = (monacoInstance.languages as any).typescript;
        if (ts) {
            ts.typescriptDefaults.addExtraLib(
                ENGINE_TYPES_DTS,
                ENGINE_TYPES_FILENAME
            );

            ts.typescriptDefaults.setCompilerOptions({
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                strict: true,
                noUnusedLocals: false,
                noUnusedParameters: false,
                allowNonTsExtensions: true,
            });
        }
    }, []);

    const handleSave = useCallback(async () => {
        if (!entityId || !src) return;

        const engine = editorBridge.getEngine();
        if (!engine) return;

        const world = engine.getWorld();
        const script = world.getComponent(entityId, 'script');
        if (!script) {
            setStatus('Entity has no Script component');
            setIsError(true);
            return;
        }

        setIsCompiling(true);
        setStatus('Compiling…');
        setIsError(false);

        try {
            const compiledJs = await compile(src);

            // Persist both src and compiledJs into the component
            script.src = src;
            script.compiledJs = compiledJs;

            setStatus('Compiled successfully ✓');
            setIsError(false);

            // Hot reload: if game is running, ScriptSystem will detect the
            // compiledJs change on its next update tick automatically
        } catch (e: any) {
            setStatus(`Compile error: ${e.message}`);
            setIsError(true);
        } finally {
            setIsCompiling(false);
        }
    }, [entityId, src]);

    // Ctrl+S / Cmd+S handler — attached to the wrapper div
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                e.stopPropagation();
                handleSave();
            }
        },
        [handleSave]
    );

    if (!entityId) {
        return (
            <div style={containerStyle}>
                <div style={emptyStyle}>Select a single entity with a Script component to edit.</div>
            </div>
        );
    }

    const engine = editorBridge.getEngine();
    const hasScript = engine?.getWorld().getComponent(entityId, 'script') !== undefined;

    if (!hasScript) {
        return (
            <div style={containerStyle}>
                <div style={emptyStyle}>
                    No Script component on this entity.
                    <br />
                    Add one via the Inspector.
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle} onKeyDown={handleKeyDown}>
            {/* Header bar */}
            <div style={headerStyle}>
                <span style={{ fontWeight: 'bold', fontSize: 12 }}>Script Editor</span>
                <span style={{ fontSize: 11, color: '#888' }}>{entityId}</span>
                <button
                    style={saveButtonStyle}
                    onClick={handleSave}
                    disabled={isCompiling}
                    title="Save & Compile (Ctrl+S)"
                >
                    {isCompiling ? 'Compiling…' : 'Save & Compile'}
                </button>
            </div>

            {/* Monaco editor */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
                <Editor
                    language="typescript"
                    theme="vs-dark"
                    value={src}
                    onChange={(val) => setSrc(val ?? '')}
                    options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        tabSize: 2,
                        automaticLayout: true,
                    }}
                    beforeMount={handleMonacoMount}
                />
            </div>

            {/* Status bar */}
            {status && (
                <div style={{ ...statusStyle, color: isError ? '#f87171' : '#4ade80' }}>
                    {status}
                </div>
            )}
        </div>
    );
};

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#1e1e1e',
    color: '#ccc',
};

const emptyStyle: React.CSSProperties = {
    padding: 16,
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '6px 10px',
    background: '#252526',
    borderBottom: '1px solid #333',
    flexShrink: 0,
};

const saveButtonStyle: React.CSSProperties = {
    marginLeft: 'auto',
    background: '#0e639c',
    border: 'none',
    color: '#fff',
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 3,
    cursor: 'pointer',
};

const statusStyle: React.CSSProperties = {
    padding: '4px 10px',
    fontSize: 11,
    background: '#181818',
    borderTop: '1px solid #333',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
};
