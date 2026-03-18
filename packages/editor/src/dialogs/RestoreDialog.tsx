import React, { useEffect, useState } from 'react';
import { readAutoSave, clearAutoSave, AutoSaveData } from '../storage/AutoSave';
import { getLastSaveTime } from '../storage/FileIO';
import { useProjectStore } from '../store/useProjectStore';

export const RestoreDialog: React.FC = () => {
    const [autoSaveData, setAutoSaveData] = useState<AutoSaveData | null>(null);

    useEffect(() => {
        const checkAutoSave = async () => {
            const data = await readAutoSave();
            if (data) {
                const lastSave = getLastSaveTime();
                // If the auto-save is newer than the last explicit save
                if (data.timestamp > lastSave) {
                    setAutoSaveData(data);
                } else {
                    // It's old, discard
                    await clearAutoSave();
                }
            }
        };
        checkAutoSave();
    }, []);

    if (!autoSaveData) return null;

    const handleRestore = async () => {
        useProjectStore.getState().setProject(autoSaveData.project);
        useProjectStore.getState().markDirty();
        setAutoSaveData(null);
    };

    const handleDiscard = async () => {
        await clearAutoSave();
        setAutoSaveData(null);
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
                maxWidth: '400px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}>
                <h3 style={{ marginTop: 0 }}>Restore Project?</h3>
                <p>
                    An unsaved project recovery file was found.
                    <br /><br />
                    <strong>Project:</strong> {autoSaveData.project?.meta?.name || 'Unknown'}
                    <br />
                    <strong>Date:</strong> {new Date(autoSaveData.timestamp).toLocaleString()}
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleDiscard}
                        style={{ padding: '8px 16px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '4px' }}
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleRestore}
                        style={{ padding: '8px 16px', background: '#0066cc', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: '4px' }}
                    >
                        Restore
                    </button>
                </div>
            </div>
        </div>
    );
};
