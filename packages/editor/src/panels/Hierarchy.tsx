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

const EntityNode: React.FC<{
    id: string;
    depth: number;
    isSelected: boolean;
    onSelect: (id: string, multi: boolean) => void;
    onRename: (id: string, name: string) => void;
    onCtx: (e: React.MouseEvent, id: string) => void;
    children: React.ReactNode;
}> = ({ id, depth, isSelected, onSelect, onRename, onCtx, children }) => {
    const engine = editorBridge.getEngine();
    const displayName = engine?.getWorld().getName(id) || id;
    const isGroup = id.startsWith('group_');

    return (
        <div>
            <div
                onClick={e => onSelect(id, e.shiftKey)}
                onDoubleClick={() => onRename(id, displayName)}
                onContextMenu={e => onCtx(e, id)}
                draggable
                onDragStart={e => {
                    e.dataTransfer.setData('glix/hierarchy-entity', id);
                }}
                onDragOver={e => {
                    e.preventDefault();
                    e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                }}
                onDragLeave={e => {
                    e.currentTarget.style.background = isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent';
                }}
                onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.style.background = '';
                    const draggedId = e.dataTransfer.getData('glix/hierarchy-entity');
                    if (draggedId && draggedId !== id) {
                        const engine = editorBridge.getEngine();
                        const world = engine?.getWorld();
                        const transform = world?.getComponent(draggedId, 'transform');
                        if (transform) {
                            // Check for circular dependency
                            let p = id;
                            let circular = false;
                            while (p) {
                                if (p === draggedId) { circular = true; break; }
                                p = world?.getComponent(p, 'transform')?.parent || '';
                            }
                            if (!circular) {
                                (transform as any).parent = id;
                                editorBridge.getEngine()?.render(0);
                            }
                        }
                    }
                }}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: `6px 10px 6px ${depth * 16 + 10}px`,
                    borderRadius: 'var(--glix-radius)',
                    cursor: 'pointer',
                    fontSize: 13,
                    background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    color: isSelected ? 'var(--glix-accent)' : 'var(--glix-text)',
                    transition: 'all 0.1s',
                    marginBottom: 1,
                    borderLeft: isSelected ? '2px solid var(--glix-accent)' : '2px solid transparent'
                }}
            >
                <span style={{
                    width: 6, height: 6, borderRadius: 1.5, flexShrink: 0,
                    background: isGroup ? 'var(--glix-accent)' : isSelected ? 'var(--glix-accent)' : 'var(--glix-text-dim)',
                }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: isSelected ? 600 : 400 }}>{displayName}</span>
            </div>
            {children}
        </div>
    );
};

const EntityTree: React.FC<{
    entities: string[];
    selectedIds: string[];
    onSelect: (id: string, multi: boolean) => void;
    onRename: (id: string, name: string) => void;
    onCtx: (e: React.MouseEvent, id: string) => void;
    depth?: number;
    parentId?: string | null;
}> = ({ entities, selectedIds, onSelect, onRename, onCtx, depth = 0, parentId = null }) => {
    const engine = editorBridge.getEngine();
    const world = engine?.getWorld();

    const levelEntities = entities.filter(id => {
        const t = world?.getComponent(id, 'transform');
        return (t?.parent || null) === parentId;
    });

    return (
        <>
            {levelEntities.map(id => (
                <EntityNode
                    key={id}
                    id={id}
                    depth={depth}
                    isSelected={selectedIds.includes(id)}
                    onSelect={onSelect}
                    onRename={onRename}
                    onCtx={onCtx}
                >
                    <EntityTree
                        entities={entities}
                        selectedIds={selectedIds}
                        onSelect={onSelect}
                        onRename={onRename}
                        onCtx={onCtx}
                        depth={depth + 1}
                        parentId={id}
                    />
                </EntityNode>
            ))}
        </>
    );
};

export const Hierarchy: React.FC = () => {
    const { selectedEntityIds, setSelectedEntityIds, toggleEntitySelection } = useEditorStore();
    const { addPrefab } = useSceneStore();
    const { pushCommand } = useHistoryStore();
    const { updateProject, project } = useProjectStore();
    const [entities, setEntities] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [ctx, setCtx] = useState<CtxMenu | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [tick, setTick] = useState(0);
    const ctxRef = useRef<HTMLDivElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const update = () => {
            const engine = editorBridge.getEngine();
            if (engine) setEntities(engine.getWorld().getEntitiesWithComponents());
            setTick(t => t + 1);
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
        } else if (action === 'delete') {
            const engine = editorBridge.getEngine();
            if (engine) {
                const world = engine.getWorld();

                const deleteRecursive = (id: string) => {
                    const children = world.getEntitiesWithComponents().filter(eid => {
                        const t = world.getComponent(eid, 'transform');
                        return t?.parent === id;
                    });
                    children.forEach(deleteRecursive);
                    world.removeEntity(id);
                };

                deleteRecursive(entityId);
                setSelectedEntityIds([]);

                // Sync with project store
                updateProject(project => {
                    const startSceneId = project.settings.startScene;
                    if (!startSceneId) return project;
                    const scene = project.scenes[startSceneId];
                    if (scene) {
                        const idsToDelete = new Set<string>();
                        const collectIds = (id: string) => {
                            idsToDelete.add(id);
                            // We don't have a child map in project yet, so we just use the world's children we just deleted
                            // Actually, let's just use the set we built or similar logic
                        };
                        // Simplified: just filter by what's still in the world
                        const remaining = world.getEntitiesWithComponents();
                        scene.entities = scene.entities.filter((e: any) => remaining.includes(e.id));
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
                <button className="icon-btn" style={{ padding: '2px 4px' }} title="Add entity" disabled={!project} onClick={() => {
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
                            if (!startSceneId) return project;
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
                        {search ? 'No matches' : (!project ? 'No project loaded' : 'Empty scene')}
                    </div>
                )}
                <EntityTree
                    entities={filtered}
                    selectedIds={selectedEntityIds}
                    onSelect={(id, multi) => multi ? toggleEntitySelection(id) : setSelectedEntityIds([id])}
                    onRename={(id, name) => { setEditingId(id); setEditValue(name); }}
                    onCtx={handleCtx}
                />
            </div>

            {/* Editing overlay */}
            {editingId && (
                <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div className="glass" style={{ padding: 12, borderRadius: 8, width: '80%' }}>
                        <div style={{ fontSize: 10, color: 'var(--glix-text-dim)', marginBottom: 6 }}>RENAME ENTITY</div>
                        <input
                            ref={editInputRef}
                            className="input-full"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => {
                                if (editValue.trim()) {
                                    const engine = editorBridge.getEngine();
                                    const oldName = engine?.getWorld().getName(editingId) || editingId;
                                    pushCommand(new RenameEntityCommand(editingId, oldName, editValue.trim()));
                                }
                                setEditingId(null);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') setEditingId(null);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Context menu */}
            {ctx && (
                <div className="ctx-menu" ref={ctxRef} style={{ top: ctx.y, left: ctx.x }}>
                    <div style={{ padding: '4px 10px 6px', fontSize: 10, color: 'var(--glix-text-dim)', borderBottom: '1px solid var(--glix-border)', marginBottom: 3 }}>
                        {ctx.entityId}
                    </div>
                    {multiSel && <div className="ctx-item" onClick={() => ctxAction('group')}>Group selected</div>}
                    {isGroup && <div className="ctx-item" onClick={() => ctxAction('ungroup')}>Ungroup</div>}
                    <div className="ctx-item" onClick={() => ctxAction('rename')}>Rename</div>
                    <div className="ctx-item" onClick={() => {
                        const engine = editorBridge.getEngine();
                        const world = engine?.getWorld();
                        const transform = world?.getComponent(ctx.entityId, 'transform');
                        if (transform) {
                            (transform as any).parent = undefined;
                            engine?.render(0);
                        }
                        setCtx(null);
                    }}>Unparent</div>
                    <div className="ctx-item" onClick={() => ctxAction('prefab')}>Save as prefab</div>
                    <div className="ctx-sep" />
                    <div className="ctx-item danger" onClick={() => ctxAction('delete')}>Delete</div>
                </div>
            )}
        </div>
    );
};
