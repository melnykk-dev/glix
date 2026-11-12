import React, { useEffect, useRef, useState } from 'react';
import { InputManager, VirtualGamepad } from '@glix/runtime';
import type { GamepadLayout, GamepadPosition, VirtualGamepadMode } from '@glix/runtime';
import { DEFAULT_MOBILE_CONTROLLER, resolveMobileController } from '@glix/shared';
import type { MobileControllerSettings } from '@glix/shared';
import { useProjectStore } from '../store/useProjectStore';

const ACCENT = '#E94560';
const PANEL_BG = '#12122A';
const ROW_BG = '#23233F';
const TEXT = '#F5F5F5';
const MUTED = '#A8A8C0';

const LAYOUT_LABELS: Array<{ value: GamepadLayout; label: string }> = [
    { value: 'dpad-buttons', label: 'D-pad + buttons' },
    { value: 'joystick-buttons', label: 'Joystick' },
    { value: 'dpad-4buttons', label: 'D-pad + 4 buttons' },
];

const VISIBILITY_LABELS: Array<{ value: VirtualGamepadMode; label: string }> = [
    { value: 'auto', label: 'Auto (touch devices)' },
    { value: 'always', label: 'Always show' },
    { value: 'never', label: 'Hidden' },
];

/**
 * Mobile Controller panel — the user-facing editor for the on-screen
 * touch controller (VirtualGamepad). Writes `settings.mobileController`
 * on the project (v1 + v2 schemas share the section); the runtime reads
 * it in Viewport Play mode and in exported games.
 *
 * DOCKED 2026-11-12 (editor rebuild): right-dock tab "Controller" in
 * App.tsx (starter + advanced) and bottom-nav item in Layout.tsx.
 * The panel reads/writes the project store directly.
 *
 * LIVE PREVIEW: the preview box renders the REAL VirtualGamepad overlay
 * (same class, same layout code as Play/export), scaled to the panel
 * width via `transform: scale(...)` on a 390px-wide stage. It is driven
 * by a real InputManager on a dummy canvas; presses animate and light
 * up, but drive no game (there is no running scene in the panel).
 * `visibility: 'never'` and `enabled: false` show the preview greyed
 * out with a note instead of mounting the pad.
 */
export const MobileControllerPanel: React.FC = () => {
    const { project, updateProject } = useProjectStore();
    const previewHostRef = useRef<HTMLDivElement | null>(null);
    const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const gamepadRef = useRef<VirtualGamepad | null>(null);
    const inputRef = useRef<InputManager | null>(null);
    const [previewScale, setPreviewScale] = useState(1);

    // Hooks must run unconditionally — the no-project return is after them.
    const settings: MobileControllerSettings = resolveMobileController(
        project ? (project.settings as any) : undefined,
    );

    const update = (patch: Partial<MobileControllerSettings>) => {
        updateProject((draft) => {
            const current = resolveMobileController(draft.settings as any);
            const next = { ...current, ...patch };
            return {
                ...draft,
                settings: {
                    ...draft.settings,
                    mobileController: next,
                    // Keep the legacy v1 field in sync so old readers agree.
                    touchControls: next.enabled ? next.visibility : 'never',
                },
            };
        });
    };

    const resetDefaults = () => update({ ...DEFAULT_MOBILE_CONTROLLER });

    // Live preview: mount the real VirtualGamepad into the preview stage
    // whenever the effective settings change. 'always' mode forces it
    // visible on desktop; the stage itself is a fixed 390px phone-width
    // frame, scaled down to fit the panel.
    useEffect(() => {
        const host = previewHostRef.current;
        const canvas = previewCanvasRef.current;
        if (!host || !canvas) return;
        gamepadRef.current?.detach();
        inputRef.current?.destroy();
        gamepadRef.current = null;
        inputRef.current = null;
        if (!settings.enabled || settings.visibility === 'never') return;

        const input = new InputManager(canvas);
        inputRef.current = input;
        const pad = new VirtualGamepad(input, canvas, {
            mode: 'always', // preview always shows, regardless of visibility
            layout: settings.layout,
            opacity: settings.opacity,
            position: settings.position,
            haptics: false, // no vibration while previewing in the editor
        });
        gamepadRef.current = pad;
        pad.attach();
        return () => {
            pad.detach();
            input.destroy();
            gamepadRef.current = null;
            inputRef.current = null;
        };
    }, [settings.enabled, settings.visibility, settings.layout, settings.opacity, settings.position]);

    // Fit the 390px stage into the panel width.
    useEffect(() => {
        const host = previewHostRef.current;
        if (!host) return;
        const measure = () => setPreviewScale(Math.min(1, host.clientWidth / 390));
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(host);
        return () => ro.disconnect();
    }, []);

    if (!project) {
        return <div style={{ padding: 12, color: MUTED, fontSize: 12 }}>No project loaded.</div>;
    }

    const previewHidden = !settings.enabled || settings.visibility === 'never';

    const rowStyle: React.CSSProperties = {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(245,245,245,0.08)',
    };
    const labelStyle: React.CSSProperties = { color: TEXT, fontSize: 12 };
    const selectStyle: React.CSSProperties = {
        background: ROW_BG, color: TEXT, border: '1px solid rgba(245,245,245,0.15)',
        borderRadius: 6, padding: '4px 6px', fontSize: 12, maxWidth: 170,
    };
    const toggleStyle = (on: boolean): React.CSSProperties => ({
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
        background: on ? ACCENT : '#3A3A55', position: 'relative', padding: 0, flexShrink: 0,
    });

    return (
        <div style={{ padding: 12, fontSize: 12, color: TEXT, background: PANEL_BG, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 13 }}>Mobile Controller</h3>
                <button
                    onClick={resetDefaults}
                    style={{ background: 'transparent', color: MUTED, border: '1px solid rgba(245,245,245,0.2)', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer' }}
                >
                    Reset defaults
                </button>
            </div>
            <p style={{ margin: '0 0 10px', color: MUTED, lineHeight: 1.5 }}>
                On-screen controls for touch devices, in Play mode and exported games.
                Defaults: enabled, Auto visibility, D-pad + buttons, 75% opacity.
            </p>

            <div style={rowStyle}>
                <span style={labelStyle}>Enabled</span>
                <button
                    aria-label="Enable mobile controller"
                    onClick={() => update({ enabled: !settings.enabled })}
                    style={toggleStyle(settings.enabled)}
                >
                    <span style={{
                        position: 'absolute', top: 2, left: settings.enabled ? 18 : 2,
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.15s',
                    }} />
                </button>
            </div>

            <div style={rowStyle}>
                <span style={labelStyle}>Visibility</span>
                <select
                    aria-label="Controller visibility"
                    value={settings.visibility}
                    disabled={!settings.enabled}
                    onChange={(e) => update({ visibility: e.target.value as VirtualGamepadMode })}
                    style={selectStyle}
                >
                    {VISIBILITY_LABELS.map((v) => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                </select>
            </div>

            <div style={rowStyle}>
                <span style={labelStyle}>Layout</span>
                <select
                    aria-label="Controller layout"
                    value={settings.layout}
                    disabled={!settings.enabled}
                    onChange={(e) => update({ layout: e.target.value as GamepadLayout })}
                    style={selectStyle}
                >
                    {LAYOUT_LABELS.map((l) => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                </select>
            </div>

            <div style={rowStyle}>
                <span style={labelStyle}>Opacity ({Math.round(settings.opacity * 100)}%)</span>
                <input
                    type="range"
                    aria-label="Controller opacity"
                    min={0.4}
                    max={1}
                    step={0.05}
                    value={settings.opacity}
                    disabled={!settings.enabled}
                    onChange={(e) => update({ opacity: Number(e.target.value) })}
                    style={{ width: 150, accentColor: ACCENT }}
                />
            </div>

            <div style={rowStyle}>
                <span style={labelStyle}>Movement cluster</span>
                <select
                    aria-label="Movement cluster position"
                    value={settings.position}
                    disabled={!settings.enabled}
                    onChange={(e) => update({ position: e.target.value as GamepadPosition })}
                    style={selectStyle}
                >
                    <option value="left">Left (D-pad / stick left)</option>
                    <option value="right">Right (D-pad / stick right)</option>
                </select>
            </div>

            <div style={rowStyle}>
                <span style={labelStyle}>Haptics (vibrate on press)</span>
                <button
                    aria-label="Toggle haptics"
                    onClick={() => update({ haptics: !settings.haptics })}
                    disabled={!settings.enabled}
                    style={toggleStyle(settings.haptics)}
                >
                    <span style={{
                        position: 'absolute', top: 2, left: settings.haptics ? 18 : 2,
                        width: 16, height: 16, borderRadius: '50%', background: '#fff',
                        transition: 'left 0.15s',
                    }} />
                </button>
            </div>

            <h4 style={{ margin: '14px 0 6px', fontSize: 12, color: MUTED, fontWeight: 600 }}>
                Live preview (phone-width, press the controls)
            </h4>
            <div
                ref={previewHostRef}
                style={{
                    position: 'relative', width: '100%', maxWidth: 390, margin: '0 auto',
                    border: '1px solid rgba(245,245,245,0.15)', borderRadius: 10, overflow: 'hidden',
                    background: '#0B0B1E',
                }}
            >
                <div style={{
                    width: 390, height: 220, transform: `scale(${previewScale})`,
                    transformOrigin: 'top left', position: 'absolute', top: 0, left: 0,
                    opacity: previewHidden ? 0.35 : 1,
                }}>
                    {/* Dummy canvas the preview InputManager attaches to. */}
                    <canvas ref={previewCanvasRef} width={390} height={220} style={{ width: 390, height: 220, display: 'block' }} />
                    {previewHidden && (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: TEXT, fontSize: 12, textAlign: 'center',
                            padding: 16, background: 'rgba(11,11,30,0.6)',
                        }}>
                            Controller hidden — set Visibility to Auto or Always show to preview it.
                        </div>
                    )}
                </div>
                {/* Reserve the scaled height so the panel layout does not jump. */}
                <div style={{ height: 220 * previewScale }} />
            </div>
            <p style={{ margin: '8px 0 0', color: MUTED, lineHeight: 1.5 }}>
                The preview is the real controller overlay at phone width — buttons press
                and the joystick floats where you touch. In a real game the controls
                drive the project's InputMap actions.
            </p>
        </div>
    );
};
