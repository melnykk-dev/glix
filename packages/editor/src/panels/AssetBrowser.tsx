import React from 'react';
import ReactDOM from 'react-dom';
import { useSceneStore } from '../store/useSceneStore';
import { useProjectStore } from '../store/useProjectStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';
import { Upload, Image as ImageIcon, Box, Grid, Paintbrush, Music } from 'lucide-react';
import { AssetDef } from '@glix/shared';
import { PixelEditor } from '../components/PixelEditor';
import { editorBridge } from '../bridge/EditorBridge';

export const AssetBrowser: React.FC = () => {
    const { prefabs } = useSceneStore();
    const { project, updateProject } = useProjectStore();
    const { pushCommand } = useHistoryStore();
    const [showPixelEditor, setShowPixelEditor] = React.useState(false);
    const [assetCount, setAssetCount] = React.useState(0);
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editName, setEditName] = React.useState('');

    const startRename = (id: string, name: string) => {
        setEditingId(id);
        setEditName(name || 'unnamed');
    };

    const finishRename = (id: string) => {
        if (editingId === id && editName.trim()) {
            updateProject(proj => {
                if (proj.assets[id]) proj.assets[id].name = editName.trim();
                return { ...proj };
            });
        }
        setEditingId(null);
    };

    const handleInstantiate = (prefabName: string) => {
        const prefab = prefabs[prefabName];
        if (prefab) {
            pushCommand(new CreateEntityCommand(prefab.components));
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result as string;
            const id = file.name.split('.')[0] + '_' + Date.now();
            const asset: AssetDef = {
                id,
                name: file.name,
                type: 'texture',
                mimeType: file.type,
                data: dataUrl
            };

            const tilesetId = 'tileset_' + id;
            const tileset: AssetDef = {
                id: tilesetId,
                name: file.name + ' (Tileset)',
                type: 'tileset',
                mimeType: 'application/json',
                data: JSON.stringify({
                    textureId: id,
                    tileWidth: 16,
                    tileHeight: 16,
                    columns: 1,
                    rows: 1,
                    solidTiles: []
                }) as any
            };

            updateProject(proj => {
                proj.assets[id] = asset;
                proj.assets[tilesetId] = tileset;

                const engine = editorBridge.getEngine();
                if (engine) {
                    const assetPreloader = engine.getAssetPreloader();
                    assetPreloader.loadTexture(id, dataUrl);
                    assetPreloader.loadTileset(tilesetId, JSON.parse(tileset.data));
                }

                setAssetCount(prev => prev + 1);
                return { ...proj };
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async () => {
            const dataUrl = reader.result as string;
            const baseName = file.name.split('.')[0];
            const id = baseName + '_' + Date.now();
            const asset: AssetDef = {
                id,
                name: file.name,
                type: 'audio',
                mimeType: file.type,
                data: dataUrl
            };

            updateProject(proj => {
                proj.assets[id] = asset;

                const engine = editorBridge.getEngine();
                if (engine) {
                    engine.getAudioManager().loadSound(id, dataUrl).catch(() => {});
                }

                setAssetCount(prev => prev + 1);
                return { ...proj };
            });
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const assets = project?.assets || {};
    const textures = Object.values(assets).filter(a => a.type === 'texture');
    const tilesets = Object.values(assets).filter(a => a.type === 'tileset');
    const sounds = Object.values(assets).filter(a => a.type === 'audio');

    const handlePixelSave = (dataUrl: string) => {
        const id = 'sprite_' + Date.now();
        const asset: AssetDef = {
            id,
            name: 'New Sprite',
            type: 'texture',
            mimeType: 'image/png',
            data: dataUrl
        };
        const tilesetId = 'tileset_' + id;
        const tileset: AssetDef = {
            id: tilesetId,
            name: 'New Sprite (Tileset)',
            type: 'tileset',
            mimeType: 'application/json',
            data: JSON.stringify({
                textureId: id,
                tileWidth: 16,
                tileHeight: 16,
                columns: 1,
                rows: 1,
                solidTiles: []
            }) as any
        };

        updateProject(proj => {
            const newProj = {
                ...proj,
                assets: {
                    ...proj.assets,
                    [id]: asset,
                    [tilesetId]: tileset
                }
            };
            return newProj;
        });

        const engine = editorBridge.getEngine();
        if (engine) {
            const assetPreloader = engine.getAssetPreloader();
            assetPreloader.loadTexture(id, dataUrl);
            assetPreloader.loadTileset(tilesetId, JSON.parse(tileset.data));
        }

        setShowPixelEditor(false);
        setAssetCount(prev => prev + 1);
    };

    return (
        <div style={{ padding: '10px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--glix-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asset Browser</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowPixelEditor(true)} className="btn-primary" disabled={!project} style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Paintbrush size={10} /> Draw
                    </button>
                    <label className={`btn-primary ${!project ? 'disabled' : ''}`} style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, cursor: project ? 'pointer' : 'not-allowed', opacity: project ? 1 : 0.5 }}>
                        <Upload size={10} /> Image
                        <input type="file" hidden accept="image/*" onChange={handleImageUpload} disabled={!project} />
                    </label>
                    <label className={`btn-primary ${!project ? 'disabled' : ''}`} style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, cursor: project ? 'pointer' : 'not-allowed', opacity: project ? 1 : 0.5 }}>
                        <Music size={10} /> Audio
                        <input type="file" hidden accept="audio/*" onChange={handleAudioUpload} disabled={!project} />
                    </label>
                </div>
            </div>

            {!project ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--glix-text-muted)', fontSize: 11 }}>
                    No project loaded
                </div>
            ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {/* Textures */}
                    <div style={{ fontSize: '10px', color: 'var(--glix-text-muted)', marginBottom: '8px', borderBottom: '1px solid var(--glix-border)', paddingBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ImageIcon size={10} /> Textures
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '8px', marginBottom: 20 }}>
                        {textures.length === 0 && <div style={{ fontSize: '10px', color: '#555', gridColumn: 'span 100' }}>No textures</div>}
                        {textures.map(a => (
                            <div
                                key={a.id}
                                draggable
                                onDragStart={e => {
                                    e.dataTransfer.setData('glix/asset', JSON.stringify({ type: 'texture', id: a.id, name: a.name }));
                                    e.dataTransfer.effectAllowed = 'copy';
                                }}
                                style={{ background: '#222', border: '1px solid #333', borderRadius: '4px', padding: '4px', textAlign: 'center', cursor: 'grab' }}
                                onDoubleClick={() => startRename(a.id, a.name)}
                            >
                                <img src={a.data} style={{ width: '100%', height: 32, objectFit: 'contain', marginBottom: 4, pointerEvents: 'none' }} />
                                {editingId === a.id ? (
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onBlur={() => finishRename(a.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') finishRename(a.id) }}
                                        autoFocus
                                        onFocus={e => e.target.select()}
                                        style={{ width: '100%', fontSize: '9px', background: 'transparent', color: '#fff', border: '1px solid #555', textAlign: 'center' }}
                                    />
                                ) : (
                                    <div style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{a?.name || 'unnamed'}</div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Audio */}
                    <div style={{ fontSize: '10px', color: 'var(--glix-text-muted)', marginBottom: '8px', borderBottom: '1px solid var(--glix-border)', paddingBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Music size={10} /> Audio
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '8px', marginBottom: 20 }}>
                        {sounds.length === 0 && <div style={{ fontSize: '10px', color: '#555', gridColumn: 'span 100' }}>No audio</div>}
                        {sounds.map(a => (
                            <div
                                key={a.id}
                                draggable
                                onDragStart={e => {
                                    e.dataTransfer.setData('glix/asset', JSON.stringify({ type: 'audio', id: a.id, name: a.name }));
                                    e.dataTransfer.effectAllowed = 'copy';
                                }}
                                style={{ background: '#222', border: '1px solid #333', borderRadius: '4px', padding: '4px', textAlign: 'center', cursor: 'grab' }}
                                onDoubleClick={() => startRename(a.id, a.name)}
                            >
                                <div style={{ fontSize: '20px', marginBottom: 4, pointerEvents: 'none' }}>🔊</div>
                                {editingId === a.id ? (
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onBlur={() => finishRename(a.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') finishRename(a.id) }}
                                        autoFocus
                                        onFocus={e => e.target.select()}
                                        style={{ width: '100%', fontSize: '9px', background: 'transparent', color: '#fff', border: '1px solid #555', textAlign: 'center' }}
                                    />
                                ) : (
                                    <div style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{a?.name || 'unnamed'}</div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Tilesets */}
                    <div style={{ fontSize: '10px', color: 'var(--glix-text-muted)', marginBottom: '8px', borderBottom: '1px solid var(--glix-border)', paddingBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Grid size={10} /> Tilesets
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '8px', marginBottom: 20 }}>
                        {tilesets.length === 0 && <div style={{ fontSize: '10px', color: '#555', gridColumn: 'span 100' }}>No tilesets</div>}
                        {tilesets.map(a => (
                            <div
                                key={a.id}
                                draggable
                                onDragStart={e => {
                                    e.dataTransfer.setData('glix/asset', JSON.stringify({ type: 'tileset', id: a.id, name: a.name }));
                                    e.dataTransfer.effectAllowed = 'copy';
                                }}
                                style={{ background: '#222', border: '1px solid #333', borderRadius: '4px', padding: '4px', textAlign: 'center', cursor: 'grab' }}
                                onDoubleClick={() => startRename(a.id, a.name)}
                            >
                                <div style={{ fontSize: '20px', marginBottom: 4, pointerEvents: 'none' }}>🗺️</div>
                                {editingId === a.id ? (
                                    <input
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onBlur={() => finishRename(a.id)}
                                        onKeyDown={e => { if (e.key === 'Enter') finishRename(a.id) }}
                                        autoFocus
                                        onFocus={e => e.target.select()}
                                        style={{ width: '100%', fontSize: '9px', background: 'transparent', color: '#fff', border: '1px solid #555', textAlign: 'center' }}
                                    />
                                ) : (
                                    <div style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{a?.name || 'unnamed'}</div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Prefabs */}
                    <div style={{ fontSize: '10px', color: 'var(--glix-text-muted)', marginBottom: '8px', borderBottom: '1px solid var(--glix-border)', paddingBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Box size={10} /> Prefabs
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '8px' }}>
                        {Object.keys(prefabs).length === 0 && <div style={{ fontSize: '10px', color: '#555', gridColumn: 'span 100' }}>No prefabs</div>}
                        {Object.keys(prefabs).map(name => (
                            <div
                                key={name}
                                draggable
                                onDragStart={e => {
                                    e.dataTransfer.setData('glix/asset', JSON.stringify({ type: 'prefab', id: name, name }));
                                    e.dataTransfer.effectAllowed = 'copy';
                                }}
                                onClick={() => handleInstantiate(name)}
                                style={{ background: '#222', border: '1px solid #333', borderRadius: '4px', padding: '4px', textAlign: 'center', cursor: 'pointer' }}
                            >
                                <div style={{ fontSize: '20px', marginBottom: 4, pointerEvents: 'none' }}>📦</div>
                                <div style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pointerEvents: 'none' }}>{name}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showPixelEditor && ReactDOM.createPortal(
                <PixelEditor
                    onSave={handlePixelSave}
                    onClose={() => setShowPixelEditor(false)}
                />,
                document.body
            )}
        </div>
    );
};
