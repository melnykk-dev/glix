import React, { useEffect, useRef, useState } from 'react';
import type { InstalledExtension } from '@glix/runtime';
import type { ExtensionPermission } from '@glix/runtime/src/plugins/ExtensionManifest';
import {
    confirmExtensionInstall,
    disableExtension,
    enableExtension,
    getExtensionLoader,
    listExtensions,
    prepareExtensionInstall,
    uninstallExtension,
} from '../extensions/extensionLoader';
import type { PreparedInstall } from '../extensions/extensionLoader';
import { getOpenV2Plugins } from '../storage/FileIO';

/**
 * Extensions panel (Phase 3) — GODOT_PARITY.md item 10.
 *
 * Lists installed `.glixext` extensions, installs new ones from a file
 * through the loader's permission grant screen, and enables / disables /
 * uninstalls them. The loader itself lives in `packages/runtime/src/plugins/`
 * (sandbox team's directory); this panel only drives it.
 *
 * Install is always two steps: pick a `.glixext` file → the grant screen
 * shows exactly what it asks for → the user picks which permissions to
 * grant → Install. Installed extensions start DISABLED (spec §6); enable
 * them from the list. Uninstall is two-click, never one-click.
 */

const ACCENT = '#E94560';
const PANEL_BG = '#12122A';
const ROW_BG = '#23233F';
const TEXT = '#F5F5F5';
const MUTED = '#A8A8C0';

export const ExtensionsPanel: React.FC = () => {
    const [extensions, setExtensions] = useState<InstalledExtension[]>([]);
    const [missing, setMissing] = useState<Array<{ id: string; version: string; enabled: boolean }>>([]);
    const [noEngine, setNoEngine] = useState(false);
    const [pending, setPending] = useState<PreparedInstall | null>(null);
    const [granted, setGranted] = useState<ExtensionPermission[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirmUninstall, setConfirmUninstall] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const refresh = () => {
        const loader = getExtensionLoader();
        setNoEngine(loader === null);
        const list = listExtensions();
        setExtensions(list);
        const installedIds = new Set(list.map((e) => e.id));
        setMissing(getOpenV2Plugins().filter((p) => !installedIds.has(p.id)));
    };

    useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const run = async (fn: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
            refresh();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
        }
    };

    const onPickFile = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            const prepared = await prepareExtensionInstall(file);
            setPending(prepared);
            setGranted(prepared.grant.requested.map((r) => r.permission));
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const toggleGranted = (permission: ExtensionPermission) => {
        setGranted((prev) =>
            prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission],
        );
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
        <div
            data-ext-drop
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void onPickFile(file);
            }}
            style={{
                padding: 12, fontSize: 12, color: TEXT, background: PANEL_BG, height: '100%',
                overflowY: 'auto', boxSizing: 'border-box',
                outline: isDragging ? `2px dashed ${ACCENT}` : undefined,
                outlineOffset: -2,
            }}
        >
            <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Extensions</h3>
            <p style={{ margin: '0 0 10px', color: MUTED }}>
                Extensions are <code>.glixext</code> packages. Installs always ask for
                permissions first, and start disabled — enable them below.
                You can also drop a <code>.glixext</code> file anywhere on this panel.
            </p>
            {isDragging && (
                <p style={{ color: ACCENT, margin: '0 0 10px', fontWeight: 700 }}>
                    Drop the .glixext file to install it.
                </p>
            )}

            {noEngine && (
                <p style={{ color: MUTED }}>
                    The editor engine is not running yet, so extensions cannot be listed.
                    Open a project and enter the editor, then press Refresh.
                </p>
            )}
            {error && <p style={{ color: ACCENT, margin: '0 0 8px' }}>{error}</p>}

            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input
                    ref={fileRef}
                    type="file"
                    accept=".glixext"
                    style={{ display: 'none' }}
                    onChange={(e) => void onPickFile(e.target.files?.[0])}
                />
                <button style={buttonStyle} disabled={busy} onClick={() => fileRef.current?.click()}>
                    Install from file…
                </button>
                <button style={ghostButtonStyle} disabled={busy} onClick={refresh}>Refresh</button>
            </div>

            {pending && (
                <div style={{ background: ROW_BG, borderRadius: 8, padding: 10, marginBottom: 12 }}>
                    <strong>Install “{pending.grant.name}” ({pending.grant.id} v{pending.grant.version})?</strong>
                    <p style={{ color: MUTED, margin: '6px 0' }}>It asks for these permissions — grant only the ones you trust:</p>
                    {pending.grant.requested.length === 0 && (
                        <p style={{ color: MUTED, margin: '6px 0' }}>(none — it asks for no permissions)</p>
                    )}
                    {pending.grant.requested.map((r) => (
                        <label key={r.permission} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={granted.includes(r.permission)}
                                onChange={() => toggleGranted(r.permission)}
                                style={{ accentColor: ACCENT, marginTop: 2 }}
                            />
                            <span>
                                <code>{r.permission}</code>
                                <br />
                                <span style={{ color: MUTED }}>{r.description}</span>
                            </span>
                        </label>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button
                            style={buttonStyle}
                            disabled={busy}
                            onClick={() => void run(async () => {
                                await confirmExtensionInstall(pending, granted);
                                setPending(null);
                            })}
                        >
                            Install ({granted.length} permission{granted.length === 1 ? '' : 's'} granted)
                        </button>
                        <button style={ghostButtonStyle} onClick={() => setPending(null)}>Cancel</button>
                    </div>
                </div>
            )}

            {extensions.length === 0 && !pending && (
                <p style={{ color: MUTED }}>No extensions installed. Install a .glixext package to add one.</p>
            )}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {extensions.map((ext) => (
                    <li key={ext.id} style={{ background: ROW_BG, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong>{ext.name}</strong>
                            <span style={{ color: MUTED }}>v{ext.version}</span>
                            <span
                                style={{
                                    marginLeft: 'auto', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                    color: ext.status === 'enabled' ? ACCENT : MUTED,
                                }}
                            >
                                {ext.status}
                            </span>
                        </div>
                        <div style={{ color: MUTED, margin: '4px 0' }}>{ext.id}</div>
                        <div style={{ color: MUTED }}>
                            {ext.components.length} component{ext.components.length === 1 ? '' : 's'} ·{' '}
                            {ext.systems.length} system{ext.systems.length === 1 ? '' : 's'} ·{' '}
                            {ext.panels.length} panel{ext.panels.length === 1 ? '' : 's'} ·{' '}
                            {ext.permissions.length} permission{ext.permissions.length === 1 ? '' : 's'} granted
                        </div>
                        {ext.warnings.length > 0 && (
                            <ul style={{ margin: '6px 0 0', paddingLeft: 16, color: '#FFB224' }}>
                                {ext.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        )}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            {ext.status !== 'enabled' && (
                                <button style={buttonStyle} disabled={busy} onClick={() => void run(() => enableExtension(ext.id))}>
                                    Enable
                                </button>
                            )}
                            {ext.status === 'enabled' && (
                                <button style={ghostButtonStyle} disabled={busy} onClick={() => void run(() => disableExtension(ext.id))}>
                                    Disable
                                </button>
                            )}
                            {confirmUninstall === ext.id ? (
                                <>
                                    <button style={{ ...buttonStyle, background: '#C22E47' }} disabled={busy} onClick={() => void run(async () => { await uninstallExtension(ext.id); setConfirmUninstall(null); })}>
                                        Confirm uninstall
                                    </button>
                                    <button style={ghostButtonStyle} onClick={() => setConfirmUninstall(null)}>Keep it</button>
                                </>
                            ) : (
                                <button style={ghostButtonStyle} disabled={busy} onClick={() => setConfirmUninstall(ext.id)}>
                                    Uninstall
                                </button>
                            )}
                        </div>
                    </li>
                ))}
            </ul>

            {missing.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <h4 style={{ margin: '0 0 6px', fontSize: 12 }}>Recorded in this project, package not loaded</h4>
                    {missing.map((p) => (
                        <p key={p.id} style={{ color: MUTED, margin: '4px 0' }}>
                            {p.id} v{p.version} {p.enabled ? '(was enabled)' : '(was disabled)'} — install its
                            .glixext package to restore it. Its data stays in the project until then.
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
};
