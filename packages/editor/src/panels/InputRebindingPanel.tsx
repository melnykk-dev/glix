import React, { useCallback, useEffect, useState } from 'react';
import { editorBridge } from '../bridge/EditorBridge';
import type { Binding, InputMap, InputMapConfigV2 } from '@glix/runtime/src/input/InputMap';
import { DEFAULT_INPUT_MAP } from '@glix/runtime/src/input/InputMap';

/**
 * Input rebinding panel (v1) — DOCKED 2026-11-12 (editor rebuild): right-dock
 * tab "Input" in App.tsx (starter + advanced); overflow-menu entry in
 * Toolbar.tsx opens it on mobile. `onConfigChange` persists keyboard
 * bindings into `project.settings.input` (see App.tsx).
 *
 * Lists every InputMap action with its current bindings. Click "Rebind"
 * on an action, then press a key: the panel replaces that action's first
 * keyboard binding (touch/gamepad bindings are kept). "+" adds a second
 * keyboard binding the same way; "×" removes one; "Reset" restores the
 * action's factory default; "Reset all" restores everything.
 *
 * The live engine's InputMap is used when Play mode is running
 * (editorBridge.getEngine()?.getInputMap()); an explicit `inputMap` prop
 * overrides it (tests / standalone use). Every change calls
 * `onConfigChange` with a copy of the new config so the editor team can
 * persist it into the project — the panel itself does not write files.
 * With no engine running it shows the factory defaults read-only.
 */

const ACCENT = '#E94560';
const PANEL_BG = '#12122A';
const ROW_BG = '#23233F';
const TEXT = '#F5F5F5';
const MUTED = '#A8A8C0';

function friendlyKey(code: string): string {
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    const special: Record<string, string> = {
        Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab',
        ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift',
        ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
        AltLeft: 'Left Alt', AltRight: 'Right Alt',
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        Backspace: 'Backspace', Delete: 'Del', CapsLock: 'Caps Lock',
    };
    return special[code] ?? code;
}

function bindingLabel(b: Binding): string {
    switch (b.device) {
        case 'keyboard': return friendlyKey(b.code);
        case 'mouse': return `Mouse ${b.button}`;
        case 'touch': return `Pad ${b.source.replace('pad:', '')}`;
        case 'gamepad':
            return 'button' in b ? `Gamepad Btn ${b.button}` : `Gamepad Axis ${b.axis} ${b.dir > 0 ? '+' : '−'}`;
    }
}

interface Props {
    inputMap?: InputMap | null;
    onConfigChange?: (config: InputMapConfigV2) => void;
}

export default function InputRebindingPanel({ inputMap: inputMapProp, onConfigChange }: Props) {
    const liveMap = inputMapProp ?? editorBridge.getEngine()?.getInputMap() ?? null;
    const [version, setVersion] = useState(0);
    const [listening, setListening] = useState<{ action: string; mode: 'replace' | 'add' } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(() => setVersion((v) => v + 1), []);

    // Click-to-rebind capture: the next keydown (not Escape = cancel) lands
    // on the listening action.
    useEffect(() => {
        if (!listening || !liveMap) return;
        const onKey = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat) return;
            if (e.code === 'Escape') {
                setListening(null);
                return;
            }
            try {
                const current = liveMap.getActionBindings(listening.action);
                const next: Binding[] = [...current];
                const kbIdx = next.findIndex((b) => b.device === 'keyboard');
                if (listening.mode === 'replace' && kbIdx >= 0) {
                    next[kbIdx] = { device: 'keyboard', code: e.code };
                } else {
                    next.push({ device: 'keyboard', code: e.code });
                }
                liveMap.setActionBindings(listening.action, next);
                onConfigChange?.(liveMap.getConfig());
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            }
            setListening(null);
            refresh();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [listening, liveMap, onConfigChange, refresh]);

    const actions: string[] = liveMap ? liveMap.listActions() : Object.keys(DEFAULT_INPUT_MAP.actions);
    const bindingsFor = (action: string): Binding[] =>
        liveMap ? liveMap.getActionBindings(action) : DEFAULT_INPUT_MAP.actions[action]?.bindings ?? [];

    const removeBinding = (action: string, idx: number) => {
        if (!liveMap) return;
        try {
            const next = liveMap.getActionBindings(action).filter((_, i) => i !== idx);
            liveMap.setActionBindings(action, next);
            onConfigChange?.(liveMap.getConfig());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        refresh();
    };

    const resetAction = (action: string) => {
        if (!liveMap) return;
        try {
            liveMap.resetActionToDefaults(action);
            onConfigChange?.(liveMap.getConfig());
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        refresh();
    };

    const resetAll = () => {
        if (!liveMap) return;
        liveMap.resetAllToDefaults();
        onConfigChange?.(liveMap.getConfig());
        refresh();
    };

    return (
        <div style={{ background: PANEL_BG, color: TEXT, padding: 12, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 14 }}>Input Rebinding</h3>
                <button
                    onClick={resetAll}
                    disabled={!liveMap}
                    style={{ background: 'transparent', color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 6, padding: '4px 10px', cursor: liveMap ? 'pointer' : 'not-allowed', opacity: liveMap ? 1 : 0.5 }}
                >
                    Reset all
                </button>
            </div>
            <p style={{ color: MUTED, margin: '8px 0 12px', lineHeight: 1.5 }}>
                {liveMap
                    ? 'Click Rebind, then press a key. Touch and gamepad bindings are kept.'
                    : 'No engine running — showing factory defaults (read-only). Start Play mode to rebind live input.'}
            </p>
            {error && (
                <div style={{ background: '#3A1520', color: '#FF9AA8', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>
                    {error} <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#FF9AA8', cursor: 'pointer', float: 'right' }}>×</button>
                </div>
            )}
            {actions.map((action) => (
                <div key={`${action}-${version}`} style={{ background: ROW_BG, borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>{action}</strong>
                        <button
                            onClick={() => resetAction(action)}
                            disabled={!liveMap}
                            style={{ background: 'none', border: 'none', color: MUTED, cursor: liveMap ? 'pointer' : 'not-allowed', fontSize: 12 }}
                        >
                            Reset
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' }}>
                        {bindingsFor(action).map((b, i) => (
                            <span key={i} style={{ background: '#12122A', border: '1px solid #3A3A55', borderRadius: 6, padding: '3px 8px', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                {bindingLabel(b)}
                                {liveMap && (
                                    <button
                                        onClick={() => removeBinding(action, i)}
                                        title="Remove binding"
                                        style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 0, lineHeight: 1 }}
                                    >
                                        ×
                                    </button>
                                )}
                            </span>
                        ))}
                        {bindingsFor(action).length === 0 && <span style={{ color: MUTED }}>No bindings</span>}
                    </div>
                    {liveMap && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {listening?.action === action ? (
                                <span style={{ color: ACCENT }}>Press a key… (Esc to cancel)</span>
                            ) : (
                                <>
                                    <button
                                        onClick={() => setListening({ action, mode: 'replace' })}
                                        style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                                    >
                                        Rebind
                                    </button>
                                    <button
                                        onClick={() => setListening({ action, mode: 'add' })}
                                        style={{ background: 'transparent', color: TEXT, border: '1px solid #3A3A55', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                                    >
                                        + Add key
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
