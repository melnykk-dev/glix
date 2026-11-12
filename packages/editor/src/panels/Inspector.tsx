import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { editorBridge } from '../bridge/EditorBridge';
import { ComponentType } from '@glix/shared';
import { ComponentRegistry } from '@glix/shared/src/ComponentRegistry';
import { ComponentSection } from '../inspector/ComponentSection';
import { useHistoryStore } from '../store/useHistoryStore';
import { AddComponentCommand } from '../history/commands/AddComponentCommand';
import { RemoveComponentCommand } from '../history/commands/RemoveComponentCommand';
import { RenameEntityCommand } from '../history/commands/RenameEntityCommand';
import { SlidersHorizontal, Plus, Zap, Box, Fence, Code, Archive } from 'lucide-react';
import { useProjectStore } from '../store/useProjectStore';
import { useSceneStore } from '../store/useSceneStore';

const STARTER_COMPONENTS: ComponentType[] = [
    'transform',
    'sprite',
    'rigidBody',
    'boxCollider',
    'circleCollider',
    'script',
    'sortingLayer'
];

export const Inspector: React.FC = () => {
    const { selectedEntityIds } = useEditorStore();
    const { pushCommand } = useHistoryStore();
    const [sharedComponents, setSharedComponents] = useState<any>({});
    const [addOpen, setAddOpen] = useState(false);

    useEffect(() => {
        const update = () => {
            if (selectedEntityIds.length === 0) { setSharedComponents({}); return; }
            const engine = editorBridge.getEngine();
            if (!engine) return;
            const world = engine.getWorld();
            const allComps = selectedEntityIds.map(id => world.getEntityComponents(id));
            const sharedTypes = (Object.keys(ComponentRegistry) as ComponentType[]).filter(t =>
                allComps.every(c => c[t] !== undefined)
            );
            const shared: any = {};
            sharedTypes.forEach(t => { shared[t] = allComps[0][t]; });
            setSharedComponents(shared);
        };
        const id = setInterval(update, 100);
        update();
        return () => clearInterval(id);
    }, [selectedEntityIds]);

    const { editorMode } = useEditorStore();
    const available = (Object.keys(ComponentRegistry) as ComponentType[]).filter(t => {
        if (sharedComponents[t]) return false;
        if (editorMode === 'starter' && !STARTER_COMPONENTS.includes(t)) return false;
        return true;
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="panel-label">
                <SlidersHorizontal size={11} />
                Inspector
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {selectedEntityIds.length === 0 ? (
                    <div style={{ padding: 16, color: 'var(--glix-text-dim)', fontSize: 11, textAlign: 'center', lineHeight: 1.7 }}>
                        Select an entity<br />to inspect it
                    </div>
                ) : (
                    <>
                        {/* Quick Actions */}
                        <div style={{ padding: '8px 10px', display: 'flex', gap: 6, borderBottom: '1px solid var(--glix-border)' }}>
                            <button
                                className="icon-btn-text"
                                onClick={() => {
                                    selectedEntityIds.forEach(id => {
                                        const world = editorBridge.getEngine()?.getWorld();
                                        const sprite = world?.getComponent(id, 'sprite') as any;

                                        const rb = { ...ComponentRegistry.rigidBody, type: 'dynamic', fixedRotation: true };
                                        const collider = {
                                            ...ComponentRegistry.boxCollider,
                                            width: sprite?.width ?? 1,
                                            height: sprite?.height ?? 1
                                        };

                                        pushCommand(new AddComponentCommand(id, 'rigidBody', rb));
                                        pushCommand(new AddComponentCommand(id, 'boxCollider', collider));
                                    });
                                }}
                                title="Add Smart Dynamic Physics"
                            >
                                <Box size={10} /> Physics Actor
                            </button>
                            <button
                                className="icon-btn-text"
                                onClick={() => {
                                    selectedEntityIds.forEach(id => {
                                        const world = editorBridge.getEngine()?.getWorld();
                                        const sprite = world?.getComponent(id, 'sprite') as any;

                                        const rb = { ...ComponentRegistry.rigidBody, type: 'static' };
                                        const collider = {
                                            ...ComponentRegistry.boxCollider,
                                            width: sprite?.width ?? 1,
                                            height: sprite?.height ?? 1
                                        };

                                        pushCommand(new AddComponentCommand(id, 'rigidBody', rb));
                                        pushCommand(new AddComponentCommand(id, 'boxCollider', collider));
                                    });
                                }}
                                title="Add Smart Static Physics"
                            >
                                <Fence size={10} /> Static Obstacle
                            </button>
                            <button
                                className="icon-btn-text"
                                onClick={() => {
                                    selectedEntityIds.forEach(id => pushCommand(new AddComponentCommand(id, 'script')));
                                    useEditorStore.getState().setActiveRightTab('script');
                                }}
                                title="Add Script and Edit"
                            >
                                <Code size={10} /> Add Script
                            </button>
                        </div>

                        {/* Entity header */}
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--glix-border)', marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--glix-text-dim)', marginBottom: 2 }}>
                                {selectedEntityIds.length === 1 ? 'Entity' : `${selectedEntityIds.length} selected`}
                            </div>
                            {selectedEntityIds.length === 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <input
                                        className="input-full"
                                        style={{
                                            fontSize: 13, color: 'var(--glix-text)', fontWeight: 600,
                                            letterSpacing: '0.02em', background: 'transparent', border: 'none',
                                            padding: '4px 0', borderBottom: '2px solid transparent', flex: 1,
                                            outline: 'none', transition: 'all 0.2s'
                                        }}
                                        value={editorBridge.getEngine()?.getWorld().getName(selectedEntityIds[0]) || selectedEntityIds[0]}
                                        onChange={e => {
                                            const world = editorBridge.getEngine()?.getWorld();
                                            if (world) {
                                                const oldName = world.getName(selectedEntityIds[0]) || selectedEntityIds[0];
                                                pushCommand(new RenameEntityCommand(selectedEntityIds[0], oldName, e.target.value));
                                            }
                                        }}
                                        onFocus={e => {
                                            e.currentTarget.style.borderBottomColor = 'var(--glix-accent)';
                                            e.target.select();
                                        }}
                                        onBlur={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                                    />
                                    <button
                                        className="icon-btn"
                                        onClick={() => {
                                            const engine = editorBridge.getEngine();
                                            const entityId = selectedEntityIds[0];
                                            if (!engine) return;

                                            const name = prompt('Enter prefab name:', engine.getWorld().getName(entityId) || 'NewPrefab');
                                            if (!name) return;

                                            const components = engine.getWorld().getEntityComponents(entityId);
                                            // Deep copy to remove runtime references if any
                                            const prefabData = JSON.parse(JSON.stringify(components));

                                            useSceneStore.getState().addPrefab(name, { id: 'prefab_' + Date.now(), name, components: prefabData });
                                            useProjectStore.getState().updateProject(proj => ({
                                                ...proj,
                                                prefabs: {
                                                    ...proj.prefabs,
                                                    [name]: { id: 'prefab_' + Date.now(), name, components: prefabData }
                                                }
                                            }));
                                        }}
                                        title="Save as Prefab"
                                    >
                                        <Archive size={12} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Components */}
                        {Object.entries(sharedComponents).map(([type, data]) => (
                            <ComponentSection
                                key={type}
                                entityId={selectedEntityIds[0]}
                                type={type as ComponentType}
                                data={data}
                                onRemove={() => selectedEntityIds.forEach(id => pushCommand(new RemoveComponentCommand(id, type as ComponentType)))}
                            />
                        ))}

                        {/* Add component */}
                        <div style={{ padding: '10px 10px 16px' }}>
                            {addOpen ? (
                                <select
                                    className="select-full"
                                    autoFocus
                                    onBlur={() => setAddOpen(false)}
                                    onChange={e => {
                                        if (e.target.value) {
                                            selectedEntityIds.forEach(id => pushCommand(new AddComponentCommand(id, e.target.value as ComponentType)));
                                            setAddOpen(false);
                                        }
                                    }}
                                >
                                    <option value="">Select component...</option>
                                    {available.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            ) : (
                                <button
                                    onClick={() => setAddOpen(true)}
                                    style={{
                                        width: '100%', padding: '6px', fontSize: 11, fontWeight: 700,
                                        background: 'transparent', border: '1px dashed var(--glix-border-md)',
                                        color: 'var(--glix-text-muted)', borderRadius: 'var(--glix-radius)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        transition: 'border-color 0.15s, color 0.15s',
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--glix-accent)'; e.currentTarget.style.color = 'var(--glix-accent)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--glix-border-md)'; e.currentTarget.style.color = 'var(--glix-text-muted)'; }}
                                >
                                    <Plus size={11} /> Add Component
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
