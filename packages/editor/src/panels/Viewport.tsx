import React, { useRef, useEffect, useState } from 'react';
import { Engine, SceneLoader } from '@glix/runtime';
import type { ScriptError } from '@glix/runtime';
import { editorBridge } from '../bridge/EditorBridge';
import { useEditorStore } from '../store/useEditorStore';
import { useHistoryStore } from '../store/useHistoryStore';
import { useSceneStore } from '../store/useSceneStore';
import { useProjectStore } from '../store/useProjectStore';
import { syncWorldToProject } from '../history/syncWorldToProject';
import { TranslateGizmo } from '../gizmos/TranslateGizmo';
import { RotateGizmo } from '../gizmos/RotateGizmo';
import { ScaleGizmo } from '../gizmos/ScaleGizmo';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';
import { AddComponentCommand } from '../history/commands/AddComponentCommand';

export const Viewport: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { setSelectedEntityIds } = useEditorStore();
    const { undo, redo } = useHistoryStore();
    const [scriptErrors, setScriptErrors] = useState<ScriptError[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    // ── Engine bootstrap ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl2');
        if (!gl) return;

        const engine = new Engine({ gl });
        editorBridge.setEngine(engine);

        // Resize
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

        // Gizmos
        const translateGizmo = new TranslateGizmo(engine);
        const rotateGizmo = new RotateGizmo(engine);
        const scaleGizmo = new ScaleGizmo(engine);

        let isPanning = false;
        let isDraggingEntity = false;
        let dragEntityOffset = { x: 0, y: 0 };
        let lastMouseX = 0;
        let lastMouseY = 0;

        const onMouseDown = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const clipX = (x / canvas.width) * 2 - 1;
            const clipY = -((y / canvas.height) * 2 - 1);
            const aspect = canvas.width / canvas.height;
            const worldSize = 10 / engine.cameraZoom;
            const downWorldX = clipX * worldSize * aspect + engine.cameraPosition[0];
            const downWorldY = clipY * worldSize + engine.cameraPosition[1];

            const isPlaying = useSceneStore.getState().playState !== 'stopped';

            if (e.button === 0 && !isPlaying) {
                const mode = useEditorStore.getState().gizmoMode;
                const activeGizmo = mode === 'translate' ? translateGizmo : mode === 'rotate' ? rotateGizmo : scaleGizmo;

                if (activeGizmo.handleMouseDown(downWorldX, downWorldY)) return;

                const hit = editorBridge.raycast(downWorldX, downWorldY);
                if (e.shiftKey && hit) {
                    const current = useEditorStore.getState().selectedEntityIds;
                    setSelectedEntityIds(current.includes(hit)
                        ? current.filter(id => id !== hit)
                        : [...current, hit]);
                } else {
                    setSelectedEntityIds(hit ? [hit] : []);

                    if (hit && mode === 'translate') {
                        isDraggingEntity = true;
                        const t = engine.getWorld().getComponent(hit, 'transform');
                        if (t) {
                            dragEntityOffset = { x: t.x - downWorldX, y: t.y - downWorldY };
                        }
                    }
                }
                engine.render(0);
            } else if (e.button === 1) {
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
                engine.render(0);
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
                const wasDragging = (activeGizmo as any).dragging;
                activeGizmo.handleMouseMove(worldX, worldY);

                if (wasDragging) {
                    const selected = useEditorStore.getState().selectedEntityIds;
                    selected.forEach(id => {
                        const t = engine.getWorld().getComponent(id, 'transform');
                        if (t) editorBridge.updateTransform(id, { x: t.x, y: t.y });
                    });
                } else if (isDraggingEntity && mode === 'translate') {
                    const selected = useEditorStore.getState().selectedEntityIds;
                    if (selected.length > 0) {
                        const id = selected[0];
                        const t = engine.getWorld().getComponent(id, 'transform');
                        if (t) {
                            t.x = worldX + dragEntityOffset.x;
                            t.y = worldY + dragEntityOffset.y;
                            editorBridge.updateTransform(id, { x: t.x, y: t.y });
                        }
                    }
                }
                if (useSceneStore.getState().playState === 'stopped') engine.render(0);
            }
        };

        const onMouseUp = () => {
            const wasPanning = isPanning;
            isPanning = false;

            const entityWasDragged = isDraggingEntity;
            isDraggingEntity = false;

            const translateWasActive = (translateGizmo as any).dragging;
            const rotateWasActive = (rotateGizmo as any).dragging;
            const scaleWasActive = (scaleGizmo as any).dragging;

            translateGizmo.handleMouseUp();
            rotateGizmo.handleMouseUp();
            scaleGizmo.handleMouseUp();

            if (!wasPanning && (translateWasActive || rotateWasActive || scaleWasActive || entityWasDragged)) {
                syncWorldToProject();
            }
        };

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            engine.cameraZoom *= delta;
            engine.cameraZoom = Math.max(0.05, Math.min(engine.cameraZoom, 20));
            engine.render(0);
        };

        canvas.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });

        const onFocusSelection = () => {
            const selectedIds = useEditorStore.getState().selectedEntityIds;
            if (selectedIds.length > 0) {
                const world = engine.getWorld();
                const transform = world.getComponent(selectedIds[0], 'transform');
                if (transform) {
                    engine.cameraPosition[0] = transform.x;
                    engine.cameraPosition[1] = transform.y;
                    engine.render(0);
                }
            }
        };
        window.addEventListener('glix-focus-selection', onFocusSelection);

        // ── React to playState changes ────────────────────────────────────────
        // NOTE: The actual play/pause/stop calls come from editorBridge (triggered
        // by the Toolbar). We subscribe here only so we can do a final re-render
        // on stop to restore the editor view.
        const unsubPlayState = useSceneStore.subscribe((state, prev) => {
            if (state.playState === prev.playState) return;
            if (state.playState === 'stopped') {
                // After stop, the world has been restored — render one frame
                requestAnimationFrame(() => engine.render(0));
            }
        });

        // ── Sync project → engine ─────────────────────────────────────────────
        const unsubProject = useProjectStore.subscribe((state, prevState) => {
            if (state.project && state.project !== prevState.project) {
                // Only reload if we're not playing (during play, engine owns the world)
                if (useSceneStore.getState().playState === 'stopped') {
                    const world = engine.getWorld();
                    world.clear();
                    engine.setProject(state.project);
                    new SceneLoader(world).loadScene(state.project);

                    // Preload assets for proper rendering in Editor Mode
                    editorBridge.preloadProjectAssets(state.project).then(() => {
                        engine.render(0);
                    });
                }
            }
        });

        const initialProject = useProjectStore.getState().project;
        if (initialProject) {
            engine.setProject(initialProject);
            new SceneLoader(engine.getWorld()).loadScene(initialProject);
            editorBridge.preloadProjectAssets(initialProject).then(() => {
                engine.render(0);
            });
        }

        const unsubEditor = useEditorStore.subscribe((state) => {
            translateGizmo.setSelected(state.selectedEntityIds);
            rotateGizmo.setSelected(state.selectedEntityIds);
            scaleGizmo.setSelected(state.selectedEntityIds);
        });

        return () => {
            resizeObserver.disconnect();
            unsubEditor();
            unsubProject();
            unsubPlayState();
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            canvas.removeEventListener('wheel', onWheel);
            window.removeEventListener('glix-focus-selection', onFocusSelection);
        };
    }, [undo, redo, setSelectedEntityIds]);

    // ── Script error overlay ─────────────────────────────────────────────────
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
        <div
            ref={containerRef}
            style={{
                width: '100%', height: '100%', position: 'relative',
                outline: isDraggingOver ? '2px dashed var(--glix-accent)' : 'none',
                outlineOffset: -4,
                background: isDraggingOver ? 'rgba(99,102,241,0.05)' : 'transparent',
                transition: 'all 0.15s ease',
            }}
            onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); e.dataTransfer.dropEffect = 'copy'; }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={e => {
                e.preventDefault();
                setIsDraggingOver(false);

                const engine = editorBridge.getEngine();
                if (!engine || !canvasRef.current) return;

                const rect = canvasRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const clipX = (x / canvasRef.current.width) * 2 - 1;
                const clipY = -((y / canvasRef.current.height) * 2 - 1);
                const aspect = canvasRef.current.width / canvasRef.current.height;
                const worldSize = 10 / engine.cameraZoom;
                let worldX = clipX * worldSize * aspect + engine.cameraPosition[0];
                let worldY = clipY * worldSize + engine.cameraPosition[1];

                if (e.shiftKey) {
                    worldX = Math.round(worldX);
                    worldY = Math.round(worldY);
                }

                const assetData = e.dataTransfer.getData('glix/asset');
                const behaviorData = e.dataTransfer.getData('glix/behavior');

                if (assetData) {
                    try {
                        const { type, id } = JSON.parse(assetData);
                        if (type === 'texture') {
                            const components = {
                                transform: { x: worldX, y: worldY, rotation: 0, scaleX: 1, scaleY: 1 },
                                sprite: { textureId: id, width: 1, height: 1, pivotX: 0.5, pivotY: 0.5 }
                            };
                            useHistoryStore.getState().pushCommand(new CreateEntityCommand(components as any));
                        } else if (type === 'prefab') {
                            const { prefabs } = useSceneStore.getState();
                            const prefab = prefabs[id];
                            if (prefab) {
                                const components = JSON.parse(JSON.stringify(prefab.components));
                                if (components.transform) {
                                    components.transform.x = worldX;
                                    components.transform.y = worldY;
                                }
                                useHistoryStore.getState().pushCommand(new CreateEntityCommand(components));
                            }
                        } else if (type === 'tileset') {
                            const components = {
                                transform: { x: worldX, y: worldY, rotation: 0, scaleX: 1, scaleY: 1 },
                                tilemap: { tilesetId: id, layers: [[]], tileWidth: 1, tileHeight: 1 }
                            };
                            useHistoryStore.getState().pushCommand(new CreateEntityCommand(components as any));
                        }
                    } catch (err) {
                        console.error('Failed to parse asset data', err);
                    }
                } else if (behaviorData) {
                    try {
                        const behavior = JSON.parse(behaviorData);
                        const hitId = editorBridge.raycast(worldX, worldY);
                        if (hitId) {
                            useHistoryStore.getState().pushCommand(new AddComponentCommand(hitId, 'script', {
                                src: behavior.script,
                                compiledJs: ''
                            }));
                            useEditorStore.getState().setActiveRightTab('inspector');
                        }
                    } catch (err) {
                        console.error('Failed to parse behavior data', err);
                    }
                }
            }}
        >
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

            {scriptErrors.length > 0 && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'rgba(180,0,0,0.88)', color: '#fff',
                    padding: '8px 12px', fontSize: 12, fontFamily: 'monospace',
                    maxHeight: '40%', overflowY: 'auto', zIndex: 1000,
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
