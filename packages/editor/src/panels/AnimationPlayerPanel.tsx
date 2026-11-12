import React, { useEffect, useRef, useState } from 'react';
import { AnimationPlayer } from '@glix/runtime/src/animation/AnimationPlayer';
import type { GlixAnimation, TrackKind } from '@glix/runtime/src/animation/AnimationPlayer';
import { editorBridge } from '../bridge/EditorBridge';
import { useEditorStore } from '../store/useEditorStore';

/**
 * AnimationPlayer panel (v1) — NEW panel, not wired into Layout yet
 * (the editor team adds it to the dock; that is a one-line Layout change).
 *
 * Lists animations, adds tracks, scrubs the timeline, plays/pauses.
 * It uses the Engine's AnimationPlayer when the core team has wired the
 * Engine hook (`engine.getAnimationPlayer()`); until then it previews
 * against the editor world with a local player and says so in the UI.
 */

const ACCENT = '#E94560';
const PANEL_BG = '#12122A';
const ROW_BG = '#23233F';
const TEXT = '#F5F5F5';
const MUTED = '#A8A8C0';

function demoAnimation(target: string): GlixAnimation {
    return {
        name: 'bounce',
        length: 1,
        loop: 'loop',
        tracks: [
            {
                kind: 'position',
                target,
                keyframes: [
                    { time: 0, value: { x: 0, y: 0 } },
                    { time: 0.5, value: { x: 0, y: -2 }, easing: 'easeOutQuad' },
                    { time: 1, value: { x: 0, y: 0 }, easing: 'easeInQuad' },
                ],
            },
        ],
    };
}

export const AnimationPlayerPanel: React.FC = () => {
    const playerRef = useRef<AnimationPlayer | null>(null);
    if (!playerRef.current) playerRef.current = new AnimationPlayer();
    const player = playerRef.current;

    const selectedEntityIds = useEditorStore((s) => s.selectedEntityIds);
    const [animations, setAnimations] = useState<string[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState(1);
    const [newName, setNewName] = useState('');
    const [newLength, setNewLength] = useState('1');
    const [trackKind, setTrackKind] = useState<TrackKind>('property');
    const [trackTarget, setTrackTarget] = useState('');
    const [trackProperty, setTrackProperty] = useState('transform.x');
    const [error, setError] = useState<string | null>(null);

    const engine = editorBridge.getEngine();
    // The Engine hook is owed by the core team; until it lands this is undefined
    // and the panel previews with its local player instead.
    const enginePlayer = (engine as unknown as { getAnimationPlayer?: () => AnimationPlayer } | null)
        ?.getAnimationPlayer?.();
    const activePlayer = enginePlayer ?? player;

    const selectedAnim = selected ? activePlayer.getAnimation(selected) : undefined;
    const length = selectedAnim?.length ?? 0;

    const refresh = () => {
        setAnimations(activePlayer.listAnimations());
        setTime(activePlayer.currentTime);
    };

    // Playback loop: step the player against the editor world while playing.
    useEffect(() => {
        if (!playing || !selected) return;
        let raf = 0;
        let last = performance.now();
        const step = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            const world = editorBridge.getEngine()?.getWorld();
            if (world) activePlayer.update(world as never, dt);
            setTime(activePlayer.currentTime);
            if (activePlayer.isPlaying) {
                raf = requestAnimationFrame(step);
            } else {
                setPlaying(false);
            }
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, selected]);

    const addAnimation = () => {
        const name = newName.trim();
        const len = parseFloat(newLength);
        if (!name) { setError('Give the animation a name.'); return; }
        if (!(len > 0)) { setError('Length must be > 0 seconds.'); return; }
        try {
            activePlayer.addAnimation({ name, length: len, loop: 'once', tracks: [] });
            setError(null);
            setNewName('');
            setSelected(name);
            refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const loadDemo = () => {
        const target = selectedEntityIds[0] ?? trackTarget.trim() ?? 'entity_0';
        try {
            activePlayer.addAnimation(demoAnimation(target));
            setError(null);
            setSelected('bounce');
            refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const addTrack = () => {
        if (!selectedAnim || !selected) return;
        const target = (trackTarget.trim() || selectedEntityIds[0] || '').trim();
        if (!target) { setError('Pick a target entity (select one in the Hierarchy, or type its id).'); return; }
        try {
            const track = {
                kind: trackKind,
                target,
                ...(trackKind === 'property' ? { property: trackProperty.trim() || 'transform.x' } : {}),
                keyframes:
                    trackKind === 'position'
                        ? [{ time: 0, value: { x: 0, y: 0 } }, { time: length, value: { x: 1, y: 0 } }]
                        : trackKind === 'sprite-frame'
                            ? [{ time: 0, value: 0 }, { time: length, value: 1 }]
                            : trackKind === 'visibility'
                                ? [{ time: 0, value: true }, { time: length, value: true }]
                                : [{ time: 0, value: 0 }, { time: length, value: 100 }],
            };
            activePlayer.addAnimation({ ...selectedAnim, tracks: [...selectedAnim.tracks, track] });
            setError(null);
            refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
    };

    const playPause = () => {
        if (!selected) return;
        const world = editorBridge.getEngine()?.getWorld();
        if (playing) {
            activePlayer.pause();
            setPlaying(false);
        } else {
            if (activePlayer.currentAnimation !== selected || activePlayer.playerState === 'stopped') {
                activePlayer.setSpeed(speed);
                activePlayer.play(selected);
            } else {
                activePlayer.resume();
            }
            if (world) activePlayer.update(world as never, 0);
            setPlaying(true);
        }
        refresh();
    };

    const scrub = (t: number) => {
        if (!selected) return;
        activePlayer.seek(t);
        const world = editorBridge.getEngine()?.getWorld();
        if (world) activePlayer.update(world as never, 0);
        setTime(activePlayer.currentTime);
    };

    const inputStyle: React.CSSProperties = {
        background: ROW_BG, color: TEXT, border: '1px solid rgba(245,245,245,0.12)',
        borderRadius: 6, padding: '6px 8px', fontSize: 12, width: '100%', boxSizing: 'border-box',
    };
    const buttonStyle: React.CSSProperties = {
        background: ACCENT, color: '#fff', border: 'none', borderRadius: 6,
        padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 700,
    };
    const ghostButtonStyle: React.CSSProperties = {
        ...buttonStyle, background: ROW_BG, color: TEXT, fontWeight: 400,
    };

    return (
        <div style={{ padding: 12, fontSize: 12, color: TEXT, background: PANEL_BG, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Animation Player</h3>
            {!enginePlayer && (
                <p style={{ margin: '0 0 10px', color: MUTED }}>
                    Engine hook not wired yet — preview runs against the editor world with a local player.
                </p>
            )}

            {error && <p style={{ color: ACCENT, margin: '0 0 8px' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input style={inputStyle} placeholder="Animation name" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input style={{ ...inputStyle, width: 64 }} placeholder="Len" value={newLength} onChange={(e) => setNewLength(e.target.value)} />
                <button style={buttonStyle} onClick={addAnimation}>Add</button>
                <button style={ghostButtonStyle} onClick={loadDemo}>Demo</button>
            </div>

            {animations.length === 0 && (
                <p style={{ color: MUTED }}>No animations yet. Add one, or load the demo bounce.</p>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {animations.map((name) => (
                    <li
                        key={name}
                        onClick={() => { setSelected(name); setTime(0); }}
                        style={{
                            padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                            background: name === selected ? ROW_BG : 'transparent',
                            borderLeft: name === selected ? `3px solid ${ACCENT}` : '3px solid transparent',
                        }}
                    >
                        {name} <span style={{ color: MUTED }}>({activePlayer.getAnimation(name)?.length ?? 0}s, {activePlayer.getAnimation(name)?.tracks.length ?? 0} tracks)</span>
                    </li>
                ))}
            </ul>

            {selectedAnim && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                        <button style={buttonStyle} onClick={playPause}>{playing ? 'Pause' : 'Play'}</button>
                        <button style={ghostButtonStyle} onClick={() => { activePlayer.stop(); setPlaying(false); setTime(0); }}>Stop</button>
                        <select
                            style={{ ...inputStyle, width: 70 }}
                            value={speed}
                            onChange={(e) => { const s = parseFloat(e.target.value); setSpeed(s); activePlayer.setSpeed(s); }}
                        >
                            <option value={0.25}>0.25x</option>
                            <option value={0.5}>0.5x</option>
                            <option value={1}>1x</option>
                            <option value={2}>2x</option>
                        </select>
                        <span style={{ color: MUTED }}>{time.toFixed(2)}s / {length.toFixed(2)}s</span>
                    </div>
                    <input
                        type="range" min={0} max={length} step={0.01} value={time}
                        onChange={(e) => scrub(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: ACCENT }}
                    />

                    <h4 style={{ margin: '12px 0 6px', fontSize: 12 }}>Tracks</h4>
                    {selectedAnim.tracks.length === 0 && <p style={{ color: MUTED }}>No tracks yet.</p>}
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {selectedAnim.tracks.map((t, i) => (
                            <li key={i} style={{ padding: '4px 0', borderBottom: '1px solid rgba(245,245,245,0.06)' }}>
                                <strong>{t.kind}</strong> → {t.target}
                                {t.property ? ` · ${t.property}` : ''} · {t.keyframes.length} keyframes
                            </li>
                        ))}
                    </ul>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                        <select style={inputStyle} value={trackKind} onChange={(e) => setTrackKind(e.target.value as TrackKind)}>
                            <option value="property">property</option>
                            <option value="position">position</option>
                            <option value="sprite-frame">sprite-frame</option>
                            <option value="visibility">visibility</option>
                        </select>
                        <input
                            style={inputStyle}
                            placeholder={selectedEntityIds[0] ? `Target entity (default ${selectedEntityIds[0]})` : 'Target entity id'}
                            value={trackTarget}
                            onChange={(e) => setTrackTarget(e.target.value)}
                        />
                        {trackKind === 'property' && (
                            <input style={inputStyle} placeholder="Property path, e.g. transform.x" value={trackProperty} onChange={(e) => setTrackProperty(e.target.value)} />
                        )}
                        <button style={ghostButtonStyle} onClick={addTrack}>Add track (2 keyframes)</button>
                        <p style={{ color: MUTED, margin: 0 }}>Keyframes are edited in code for v1 — the track list above shows what each track animates.</p>
                    </div>
                </div>
            )}
        </div>
    );
};
