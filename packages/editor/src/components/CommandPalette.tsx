import React, { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useSceneStore } from '../store/useSceneStore';
import { editorBridge } from '../bridge/EditorBridge';
import { Search, Zap, Box, FileText, Command } from 'lucide-react';

export const CommandPalette: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
                e.preventDefault();
                setIsOpen(prev => !prev);
                setQuery('');
                setSelectedIndex(0);
            }
            if (e.key === 'Escape') setIsOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 10);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const engine = editorBridge.getEngine();
    const world = engine?.getWorld();
    const entities = world ? world.getEntitiesWithComponents().map(id => ({
        id,
        name: world.getName(id) || id,
        type: 'entity' as const
    })) : [];

    const actions = [
        { id: 'play', name: 'Play Scene', type: 'action' as const, icon: <Zap size={14} /> },
        { id: 'stop', name: 'Stop Scene', type: 'action' as const, icon: <Zap size={14} /> },
        { id: 'new-entity', name: 'Create New Entity', type: 'action' as const, icon: <Box size={14} /> },
    ];

    const results = [
        ...actions.filter(a => a.name.toLowerCase().includes(query.toLowerCase())),
        ...entities.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
    ].slice(0, 10);

    const handleAction = (item: any) => {
        if (item.type === 'entity') {
            useEditorStore.getState().setSelectedEntityIds([item.id]);
            // Focus camera on entity
            window.dispatchEvent(new CustomEvent('glix-focus-selection'));
        } else if (item.id === 'play') {
            useSceneStore.getState().setPlayState('playing');
        } else if (item.id === 'stop') {
            useSceneStore.getState().setPlayState('stopped');
        } else if (item.id === 'new-entity') {
            const id = `entity_${Date.now()}`;
            const engine = editorBridge.getEngine();
            if (engine) {
                engine.getWorld().createEntity(id);
                engine.getWorld().addComponent(id, 'transform', { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
            }
            useEditorStore.getState().setSelectedEntityIds([id]);
        }
        setIsOpen(false);
    };

    return (
        <div className="dialog-overlay" style={{ alignItems: 'flex-start', paddingTop: '15vh' }} onClick={() => setIsOpen(false)}>
            <div
                className="glass anim-fade-in"
                style={{ width: 600, borderRadius: 12, overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', gap: 12, borderBottom: '1px solid var(--glix-border)' }}>
                    <Search size={20} color="var(--glix-accent)" />
                    <input
                        ref={inputRef}
                        className="input-full"
                        style={{ border: 'none', background: 'transparent', fontSize: 18, color: 'var(--glix-text)', padding: 0 }}
                        placeholder="Search entities, actions, files..."
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
                        onKeyDown={e => {
                            if (e.key === 'ArrowDown') setSelectedIndex(s => Math.min(results.length - 1, s + 1));
                            if (e.key === 'ArrowUp') setSelectedIndex(s => Math.max(0, s - 1));
                            if (e.key === 'Enter' && results[selectedIndex]) handleAction(results[selectedIndex]);
                        }}
                    />
                    <div style={{ fontSize: 10, color: 'var(--glix-text-dim)', border: '1px solid var(--glix-border)', padding: '2px 6px', borderRadius: 4 }}>ESC</div>
                </div>

                <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px' }}>
                    {results.length === 0 && (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--glix-text-dim)' }}>No results found</div>
                    )}
                    {results.map((res, i) => (
                        <div
                            key={res.id}
                            onClick={() => handleAction(res)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                                background: i === selectedIndex ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                                transition: 'all 0.1s'
                            }}
                            onMouseEnter={() => setSelectedIndex(i)}
                        >
                            <div style={{ color: i === selectedIndex ? 'var(--glix-accent)' : 'var(--glix-text-muted)' }}>
                                {res.type === 'entity' ? <Box size={16} /> : <Command size={16} />}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, color: i === selectedIndex ? 'var(--glix-text)' : 'var(--glix-text-muted)' }}>{res.name}</div>
                                <div style={{ fontSize: 10, color: 'var(--glix-text-dim)', textTransform: 'uppercase' }}>{res.type}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
