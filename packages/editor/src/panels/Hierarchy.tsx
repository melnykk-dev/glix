import React, { useEffect, useState, useRef } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useSceneStore } from '../store/useSceneStore';
import { editorBridge } from '../bridge/EditorBridge';
import { useHistoryStore } from '../store/useHistoryStore';
import { useProjectStore } from '../store/useProjectStore';
import { RenameEntityCommand } from '../history/commands/RenameEntityCommand';
import { GroupEntitiesCommand } from '../history/commands/GroupEntitiesCommand';
import { UngroupEntitiesCommand } from '../history/commands/UngroupEntitiesCommand';
import { Search, Plus, Layers, Edit2 } from 'lucide-react';

interface CtxMenu { x: number; y: number; entityId: string; }

export const Hierarchy: React.FC = () => {
    const { selectedEntityIds, setSelectedEntityIds, toggleEntitySelection } = useEditorStore();
    const { addPrefab } = useSceneStore();
    const { pushCommand } = useHistoryStore();
    const { updateProject } = useProjectStore();
    const [entities, setEntities] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [ctx, setCtx] = useState<CtxMenu | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const ctxRef = useRef<HTMLDivElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const update = () => {
            const engine = editorBridge.getEngine();
            if (engine) setEntities(engine.getWorld().getEntitiesWithComponents());
        };
        const id = setInterval(update, 400);
        update();
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const close = (e: MouseEvent) => {
            if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtx(null);
        };
        window.addEventListener('mousedown', close);
        return () => window.removeEventListener('mousedown', close);
    }, []);

    const filtered = entities.filter(id => id.toLowerCase().includes(search.toLowerCase()));

    const handleCtx = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        setCtx({ x: e.clientX, y: e.clientY, entityId: id });
    };

    const ctxAction = (action: string) => {
        if (!ctx) return;
        const { entityId } = ctx;
        const selected = useEditorStore.getState().selectedEntityIds;
        setCtx(null);

        if (action === 'group' && selected.length > 1) {
            pushCommand(new GroupEntitiesCommand(selected));
        } else if (action === 'ungroup') {
            pushCommand(new UngroupEntitiesCommand(entityId));
        } else if (action === 'prefab') {
            const engine = editorBridge.getEngine();
            if (engine) {
                const components = engine.getWorld().getEntityComponents(entityId);
                addPrefab(entityId, { id: entityId, components: components as any });
            }
        } else if (action === 'rename') {
            const engine = editorBridge.getEngine();
            const name = engine?.getWorld().getName(entityId) || entityId;
            setEditingId(entityId);
            setEditValue(name);
        } else if (action === 'delete') {
            const engine = editorBridge.getEngine();
            if (engine) {
                engine.getWorld().removeEntity(entityId);
                setSelectedEntityIds([]);

                // Sync with project store
                updateProject(project => {
                    const startSceneId = project.settings.startScene;
                    const scene = project.scenes[startSceneId];
                    if (scene) {
                        scene.entities = scene.entities.filter(e => e.id !== entityId);
                    }
                    return { ...project };
                });
            }
        }
    };

    const isGroup = ctx?.entityId.startsWith('group_');
    const multiSel = useEditorStore.getState().selectedEntityIds.length > 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="panel-label">
                <Layers size={11} />
                Hierarchy
                <span style={{ flex: 1 }} />
                <button className="icon-btn" style={{ padding: '2px 4px' }} title="Add entity" onClick={() => {
                    const engine = editorBridge.getEngine();
                    if (engine) {
                        const id = `entity_${Date.now()}`;
                        const transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

                        engine.getWorld().createEntity(id);
                        engine.getWorld().addComponent(id, 'transform', transform);
                        setSelectedEntityIds([id]);

                        // Sync with project store
                        updateProject(project => {
                            const startSceneId = project.settings.startScene;
                            const scene = project.scenes[startSceneId];
                            if (scene) {
                                scene.entities.push({ id, components: { transform } as any });
                            }
                            return { ...project };
                        });
                    }
                }}>
                    <Plus size={11} />
                </button>
            </div>

            {/* Search */}
            <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--glix-border)' }}>
                <div style={{ position: 'relative' }}>
                    <Search size={10} style={{ position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--glix-text-dim)' }} />
                    <input
                        className="input-full"
                        placeholder="Search..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ paddingLeft: 22 }}
                    />
                </div>
            </div>

            {/* Entity list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
                {filtered.length === 0 && (
                    <div style={{ padding: '16px', color: 'var(--glix-text-dim)', fontSize: 11, textAlign: 'center' }}>
                        {search ? 'No matches' : 'Empty scene'}
                    </div>
                )}
                {filtered.map(id => {
                    const isSelected = selectedEntityIds.includes(id);
                    const isGroup = id.startsWith('group_');
                    const engine = editorBridge.getEngine();
                    const displayName = engine?.getWorld().getName(id) || id;

                    if (editingId === id) {
                        return (
                            <div key={id} style={{ padding: '2px 8px' }}>
                                <input
                                    ref={editInputRef}
                                    className="input-full"
                                    autoFocus
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    onBlur={() => {
                                        if (editValue.trim() && editValue !== displayName) {
                                            pushCommand(new RenameEntityCommand(id, displayName, editValue.trim()));
                                        }
                                        setEditingId(null);
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                        if (e.key === 'Escape') setEditingId(null);
                                    }}
                                    style={{ fontSize: 11, height: 22 }}
                                />
                            </div>
                        );
                    }

                    return (
                        <div
                            key={id}
                            onClick={e => e.shiftKey ? toggleEntitySelection(id) : setSelectedEntityIds([id])}
                            onDoubleClick={() => {
                                setEditingId(id);
                                setEditValue(displayName);
                            }}
                            onContextMenu={e => handleCtx(e, id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '5px 8px',
                                borderRadius: 'var(--glix-radius)',
                                cursor: 'pointer',
                                fontSize: 12,
                                background: isSelected ? 'var(--glix-select-bg)' : 'transparent',
                                color: isSelected ? 'var(--glix-accent)' : 'var(--glix-text)',
                                borderLeft: isSelected ? '2px solid var(--glix-accent)' : '2px solid transparent',
                                transition: 'background 0.1s',
                                marginBottom: 1,
                            }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--glix-hover-bg)'; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <span style={{
                                width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                                background: isGroup ? 'var(--glix-accent-2)' : isSelected ? 'var(--glix-accent)' : 'var(--glix-text-dim)'
                            }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{displayName}</span>
                        </div>
                    );
                })}
            </div>

            {/* Context menu */}
            {ctx && (
                <div className="ctx-menu" ref={ctxRef} style={{ top: ctx.y, left: ctx.x }}>
                    <div style={{ padding: '4px 10px 6px', fontSize: 10, color: 'var(--glix-text-dim)', borderBottom: '1px solid var(--glix-border)', marginBottom: 3 }}>
                        {ctx.entityId}
                    </div>
                    {multiSel && <div className="ctx-item" onClick={() => ctxAction('group')}>Group selected</div>}
                    {isGroup && <div className="ctx-item" onClick={() => ctxAction('ungroup')}>Ungroup</div>}
                    <div className="ctx-item" onClick={() => ctxAction('rename')}>Rename</div>
                    <div className="ctx-item" onClick={() => ctxAction('prefab')}>Save as prefab</div>
                    <div className="ctx-sep" />
                    <div className="ctx-item danger" onClick={() => ctxAction('delete')}>Delete</div>
                </div>
            )}
        </div>
    );
};
