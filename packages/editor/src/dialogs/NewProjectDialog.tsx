import React from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { clearAutoSave } from '../storage/AutoSave';

import emptyTemplate from '../templates/empty.glix?raw';
import platformerTemplate from '../templates/platformer.glix?raw';
import topdownTemplate from '../templates/topdown.glix?raw';

interface NewProjectDialogProps {
    onClose: () => void;
}

export const NewProjectDialog: React.FC<NewProjectDialogProps> = ({ onClose }) => {
    const handleSelectTemplate = async (templateRaw: string) => {
        try {
            const projectData = JSON.parse(templateRaw);
            // Clear auto save
            await clearAutoSave();
            // Reset store
            const store = useProjectStore.getState();
            store.setFileHandle(null);
            store.setProject(projectData);
            store.markDirty(); // mark dirty to force autosave on new project
            onClose();
        } catch (e) {
            console.error('Failed to load template', e);
            alert('Failed to load template');
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
        }}>
            <div style={{
                background: '#222',
                padding: '20px',
                borderRadius: '8px',
                color: '#fff',
                width: '400px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
                <h3 style={{ marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px' }}>New Project</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', margin: '20px 0' }}>
                    <button style={btnStyle} onClick={() => handleSelectTemplate(emptyTemplate)}>
                        Empty Project
                    </button>
                    <button style={btnStyle} onClick={() => handleSelectTemplate(platformerTemplate)}>
                        Platformer Template
                    </button>
                    <button style={btnStyle} onClick={() => handleSelectTemplate(topdownTemplate)}>
                        Top-down Template
                    </button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        style={{ padding: '8px 16px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '4px' }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

const btnStyle: React.CSSProperties = {
    padding: '12px',
    background: '#333',
    border: '1px solid #444',
    color: '#fff',
    cursor: 'pointer',
    borderRadius: '4px',
    textAlign: 'left',
    fontSize: '14px'
};
