import React from 'react';
import { useSceneStore } from '../store/useSceneStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useProjectStore } from '../store/useProjectStore';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';
import { Upload, Image as ImageIcon, Box, Grid, Paintbrush } from 'lucide-react';
import { AssetDef } from '@glix/shared';
import { PixelEditor } from '../components/PixelEditor';

export const AssetBrowser: React.FC = () => {
    const { prefabs } = useSceneStore();
    const { project, updateProject } = useProjectStore();
    const { pushCommand } = useHistoryStore();
    const [showPixelEditor, setShowPixelEditor] = React.useState(false);

    const handleInstantiate = (prefabName: string) => {
        const prefab = prefabs[prefabName];
        if (prefab) {
            pushCommand(new CreateEntityCommand(prefab.components));
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

            updateProject(proj => {
                proj.assets[id] = asset;
                return { ...proj };
            });
        };
        reader.readAsDataURL(file);
    };

    const assets = project?.assets || {};
    const textures = Object.values(assets).filter(a => a.type === 'texture');
    const tilesets = Object.values(assets).filter(a => a.type === 'tileset');

    const handlePixelSave = (dataUrl: string) => {
        const id = 'sprite_' + Date.now();
        const asset: AssetDef = {
            id,
            name: 'New Sprite',
            type: 'texture',
            mimeType: 'image/png',
            data: dataUrl
        };
        updateProject(proj => ({
            ...proj,
            assets: { ...proj.assets, [id]: asset }
        }));
        setShowPixelEditor(false);
    };

    return (
        <div style={{ padding: '10px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--glix-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asset Browser</div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setShowPixelEditor(true)} className="btn-primary" style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Paintbrush size={10} /> Draw
                    </button>
                    <label className="btn-primary" style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <Upload size={10} /> Upload
                        <input type="file" hidden accept="image/*" onChange={handleUpload} />
                    </label>
                </div>
            </div>

            {showPixelEditor && (
                <PixelEditor
                    onSave={handlePixelSave}
                    onClose={() => setShowPixelEditor(false)}
                />
            )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Textures */}
                <div style={{ fontSize: '10px', color: 'var(--glix-text-muted)', marginBottom: '8px', borderBottom: '1px solid var(--glix-border)', paddingBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ImageIcon size={10} /> Textures
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: '8px', marginBottom: 20 }}>
                    {textures.length === 0 && <div style={{ fontSize: '10px', color: '#555', gridColumn: 'span 100' }}>No textures</div>}
                    {textures.map(a => (
                        <div key={a.id} style={{ background: '#222', border: '1px solid #333', borderRadius: '4px', padding: '4px', textAlign: 'center', cursor: 'default' }}>
                            <img src={a.data} style={{ width: '100%', height: 32, objectFit: 'contain', marginBottom: 4 }} />
                            <div style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
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
                        <div key={a.id} style={{ background: '#222', border: '1px solid #333', borderRadius: '4px', padding: '4px', textAlign: 'center', cursor: 'default' }}>
                            <div style={{ fontSize: '20px', marginBottom: 4 }}>🗺️</div>
                            <div style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
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
                            onClick={() => handleInstantiate(name)}
                            style={{ background: '#222', border: '1px solid #333', borderRadius: '4px', padding: '4px', textAlign: 'center', cursor: 'pointer' }}
                        >
                            <div style={{ fontSize: '20px', marginBottom: 4 }}>📦</div>
                            <div style={{ fontSize: '9px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
