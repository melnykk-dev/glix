import React, { useRef, useEffect, useState } from 'react';
import { Engine, SceneLoader } from '@glix/runtime';
import type { ScriptError } from '@glix/runtime';
import { editorBridge } from '../bridge/EditorBridge';
import { useEditorStore } from '../store/useEditorStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useProjectStore } from '../store/useProjectStore';
import { TranslateGizmo } from '../gizmos/TranslateGizmo';
import { RotateGizmo } from '../gizmos/RotateGizmo';
import { ScaleGizmo } from '../gizmos/ScaleGizmo';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';

export const Viewport: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { setSelectedEntityIds } = useEditorStore();
    const { undo, redo } = useHistoryStore();
    const [scriptErrors, setScriptErrors] = useState<ScriptError[]>([]);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl2');
        if (!gl) return;

        const engine = new Engine({ gl });
        editorBridge.setEngine(engine);

        // Resize logic
        const resize = () => {
            if (!containerRef.current) return;
            const { width, height } = containerRef.current.getBoundingClientRect();
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(containerRef.current!);
        resize();

        let isPanning = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        const translateGizmo = new TranslateGizmo(engine);
        const rotateGizmo = new RotateGizmo(engine);
        const scaleGizmo = new ScaleGizmo(engine);

        const onMouseDown = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const clipX = (x / canvas.width) * 2 - 1;
            const clipY = -((y / canvas.height) * 2 - 1);

            const aspect = canvas.width / canvas.height;
            const worldSize = 10 / engine.cameraZoom;
            const worldX = clipX * worldSize * aspect + engine.cameraPosition[0];
            const worldY = clipY * worldSize + engine.cameraPosition[1];

            if (e.button === 0) { // Left click
                const mode = useEditorStore.getState().gizmoMode;
                const activeGizmo = mode === 'translate' ? translateGizmo : mode === 'rotate' ? rotateGizmo : scaleGizmo;

                if (activeGizmo.handleMouseDown(worldX, worldY)) {
                    return;
                }

                const hit = editorBridge.raycast(worldX, worldY);
                if (e.shiftKey && hit) {
                    const current = useEditorStore.getState().selectedEntityIds;
                    if (current.includes(hit)) {
                        setSelectedEntityIds(current.filter(id => id !== hit));
                    } else {
                        setSelectedEntityIds([...current, hit]);
                    }
                } else {
                    setSelectedEntityIds(hit ? [hit] : []);
                }
                (engine as any).render();
            } else if (e.button === 1) { // Middle click
                isPanning = true;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            if (isPanning) {
                const dx = e.clientX - lastMouseX;
                const dy = e.clientY - lastMouseY;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;

                const worldSize = 10 / engine.cameraZoom;
                const aspect = canvas.width / canvas.height;

                engine.cameraPosition[0] -= (dx / canvas.width) * worldSize * 2 * aspect;
                engine.cameraPosition[1] += (dy / canvas.height) * worldSize * 2;
                (engine as any).render();
            } else {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const clipX = (x / canvas.width) * 2 - 1;
                const clipY = -((y / canvas.height) * 2 - 1);
                const aspect = canvas.width / canvas.height;
                const worldSize = 10 / engine.cameraZoom;
                const worldX = clipX * worldSize * aspect + engine.cameraPosition[0];
                const worldY = clipY * worldSize + engine.cameraPosition[1];

                const mode = useEditorStore.getState().gizmoMode;
                const activeGizmo = mode === 'translate' ? translateGizmo : mode === 'rotate' ? rotateGizmo : scaleGizmo;
                activeGizmo.handleMouseMove(worldX, worldY);
                (engine as any).render();
            }
        };

        const onMouseUp = () => {
            isPanning = false;
            translateGizmo.handleMouseUp();
            rotateGizmo.handleMouseUp();
            scaleGizmo.handleMouseUp();
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            engine.cameraZoom *= delta;
            engine.cameraZoom = Math.max(0.1, Math.min(engine.cameraZoom, 10));
            (engine as any).render();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            const ctrl = e.ctrlKey || e.metaKey;

            if (ctrl && e.key === 'z') {
                if (e.shiftKey) redo();
                else undo();
                (engine as any).render();
            } else if (ctrl && e.key.toLowerCase() === 'y') {
                redo();
                (engine as any).render();
            } else if (ctrl && e.key.toLowerCase() === 'c') {
                const selected = useEditorStore.getState().selectedEntityIds;
                if (selected.length > 0) {
                    const world = engine.getWorld();
                    const data = selected.map(id => ({ id, components: world.getEntityComponents(id) }));
                    localStorage.setItem('glix-clipboard', JSON.stringify(data));
                }
            } else if (ctrl && e.key.toLowerCase() === 'v') {
                const dataStr = localStorage.getItem('glix-clipboard');
                if (dataStr) {
                    const data = JSON.parse(dataStr);
                    data.forEach((entry: any) => {
                        const components = JSON.parse(JSON.stringify(entry.components));
                        if (components.transform) {
                            components.transform.x += 16 / 10;
                            components.transform.y -= 16 / 10;
                        }
                        useHistoryStore.getState().pushCommand(new CreateEntityCommand(components));
                    });
                    (engine as any).render();
                }
            }
        };

        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        window.addEventListener('keydown', onKeyDown);

        const onFocusSelection = () => {
            const selectedIds = useEditorStore.getState().selectedEntityIds;
            if (selectedIds.length > 0) {
                const world = engine.getWorld();
                const transform = world.getComponent(selectedIds[0], 'transform');
                if (transform) {
                    engine.cameraPosition[0] = transform.x;
                    engine.cameraPosition[1] = transform.y;
                    (engine as any).render();
                }
            }
        };
        window.addEventListener('glix-focus-selection', onFocusSelection);

        // Sync with Project Store
        const unsubProject = useProjectStore.subscribe((state, prevState) => {
            if (state.project && state.project !== prevState.project) {
                const world = engine.getWorld();
                world.clear();
                new SceneLoader(world).loadScene(state.project);
                (engine as any).render();
            }
        });

        // Initial load if project already exists
        const initialProject = useProjectStore.getState().project;
        if (initialProject) {
            new SceneLoader(engine.getWorld()).loadScene(initialProject);
            (engine as any).render();
        }

        const unsubscribeEditor = useEditorStore.subscribe(
            (state) => {
                translateGizmo.setSelected(state.selectedEntityIds);
                rotateGizmo.setSelected(state.selectedEntityIds);
                scaleGizmo.setSelected(state.selectedEntityIds);
            }
        );

        return () => {
            resizeObserver.disconnect();
            unsubscribeEditor();
            unsubProject();
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('wheel', onWheel);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('glix-focus-selection', onFocusSelection);
        };
    }, [undo, redo, setSelectedEntityIds]);

    useEffect(() => {
        const interval = setInterval(() => {
            const engine = editorBridge.getEngine();
            if (!engine) return;
            const errors = engine.getScriptSystem().getErrors();
            setScriptErrors(errors);
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <canvas ref={canvasRef} style={{ display: 'block' }} />

            {scriptErrors.length > 0 && (
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: 'rgba(180,0,0,0.88)',
                    color: '#fff',
                    padding: '8px 12px',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    maxHeight: '40%',
                    overflowY: 'auto',
                    zIndex: 1000,
                    pointerEvents: 'none',
                }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 6 }}>⚠ Script Errors</div>
                    {scriptErrors.map(err => (
                        <div key={err.entityId} style={{ marginBottom: 8 }}>
                            <span style={{ opacity: 0.7 }}>[{err.entityId}]</span>{' '}
                            <span>{err.message}</span>
                            {err.stack && (
                                <pre style={{ margin: '4px 0 0', opacity: 0.6, fontSize: 10, whiteSpace: 'pre-wrap' }}>
                                    {err.stack}
                                </pre>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
