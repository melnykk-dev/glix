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
import { SlidersHorizontal, Plus } from 'lucide-react';

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

    const available = (Object.keys(ComponentRegistry) as ComponentType[]).filter(t => !sharedComponents[t]);

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
                        {/* Entity header */}
                        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--glix-border)', marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: 'var(--glix-text-dim)', marginBottom: 2 }}>
                                {selectedEntityIds.length === 1 ? 'Entity' : `${selectedEntityIds.length} selected`}
                            </div>
                            {selectedEntityIds.length === 1 && (
                                <input
                                    className="input-full"
                                    style={{
                                        fontSize: 12, color: 'var(--glix-accent)', fontWeight: 700,
                                        letterSpacing: '0.02em', background: 'transparent', border: 'none',
                                        padding: '2px 0', borderBottom: '1px solid transparent'
                                    }}
                                    value={editorBridge.getEngine()?.getWorld().getName(selectedEntityIds[0]) || selectedEntityIds[0]}
                                    onChange={e => {
                                        const world = editorBridge.getEngine()?.getWorld();
                                        if (world) {
                                            const oldName = world.getName(selectedEntityIds[0]) || selectedEntityIds[0];
                                            pushCommand(new RenameEntityCommand(selectedEntityIds[0], oldName, e.target.value));
                                        }
                                    }}
                                    onFocus={e => e.currentTarget.style.borderBottomColor = 'var(--glix-accent)'}
                                    onBlur={e => e.currentTarget.style.borderBottomColor = 'transparent'}
                                />
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
