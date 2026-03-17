import React from 'react';
import { useProjectStore } from '../store/useProjectStore';

export const ProjectSettings: React.FC = () => {
    const { project, updateProject } = useProjectStore();

    if (!project) return <div style={{ padding: '10px', color: '#888' }}>No project loaded</div>;

    const handleMetaChange = (field: string, value: any) => {
        updateProject((draft) => {
            (draft as any).meta[field] = value;
            return { ...draft, meta: { ...draft.meta } };
        });
    };

    const handleResolutionChange = (field: 'width' | 'height', value: number) => {
        updateProject((draft) => {
            draft.meta.resolution[field] = value;
            return { ...draft, meta: { ...draft.meta, resolution: { ...draft.meta.resolution } } };
        });
    };

    const handleSettingChange = (field: string, value: any) => {
        updateProject((draft) => {
            (draft as any).settings[field] = value;
            return { ...draft, settings: { ...draft.settings } };
        });
    };

    const handleGravityChange = (field: 'x' | 'y', value: number) => {
        updateProject((draft) => {
            if (!draft.settings.physics) draft.settings.physics = { gravity: { x: 0, y: 9.8 } };
            draft.settings.physics.gravity[field] = value;
            return {
                ...draft,
                settings: {
                    ...draft.settings,
                    physics: { gravity: { ...draft.settings.physics.gravity } }
                }
            };
        });
    };

    const sceneIds = Object.keys(project.scenes || {});
    const gravity = project.settings.physics?.gravity || { x: 0, y: 9.8 };

    return (
        <div style={{ padding: '10px', color: '#eee', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
                <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Meta</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={labelStyle}>
                        Name
                        <input
                            type="text"
                            value={project.meta.name}
                            onChange={(e) => handleMetaChange('name', e.target.value)}
                            style={inputStyle}
                        />
                    </label>
                    <label style={labelStyle}>
                        Resolution Width
                        <input
                            type="number"
                            value={project.meta.resolution.width}
                            onChange={(e) => handleResolutionChange('width', parseInt(e.target.value) || 0)}
                            style={inputStyle}
                        />
                    </label>
                    <label style={labelStyle}>
                        Resolution Height
                        <input
                            type="number"
                            value={project.meta.resolution.height}
                            onChange={(e) => handleResolutionChange('height', parseInt(e.target.value) || 0)}
                            style={inputStyle}
                        />
                    </label>
                </div>
            </div>

            <div>
                <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Settings</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={labelStyle}>
                        Start Scene
                        <select
                            value={project.settings.startScene}
                            onChange={(e) => handleSettingChange('startScene', e.target.value)}
                            style={inputStyle}
                        >
                            <option value="">-- Select Scene --</option>
                            {sceneIds.map(id => (
                                <option key={id} value={id}>{project.scenes[id]?.name || id}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </div>

            <div>
                <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Physics</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={labelStyle}>
                        Gravity X
                        <input
                            type="number"
                            step="0.1"
                            value={gravity.x}
                            onChange={(e) => handleGravityChange('x', parseFloat(e.target.value) || 0)}
                            style={inputStyle}
                        />
                    </label>
                    <label style={labelStyle}>
                        Gravity Y
                        <input
                            type="number"
                            step="0.1"
                            value={gravity.y}
                            onChange={(e) => handleGravityChange('y', parseFloat(e.target.value) || 0)}
                            style={inputStyle}
                        />
                    </label>
                </div>
            </div>

            {/* Input map could be expanded into a more complex UI, adding simple placeholder indicator for now */}
            <div>
                <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Input Map</h3>
                <div style={{ fontSize: '12px', color: '#888' }}>
                    Input configuration will be managed here.
                </div>
            </div>
        </div>
    );
};

const labelStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px'
};

const inputStyle: React.CSSProperties = {
    background: '#111',
    border: '1px solid #333',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: '4px',
    width: '120px'
};
