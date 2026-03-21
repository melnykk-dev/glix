import React, { useRef, useEffect, useState } from 'react';
import { Engine, SceneLoader, Mat4 } from '@glix/runtime';
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
import { GizmoRenderer } from '../gizmos/GizmoRenderer';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';
import { AddComponentCommand } from '../history/commands/AddComponentCommand';
import { MoveEntityCommand } from '../history/commands/MoveEntityCommand';

export const Viewport: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { setSelectedEntityIds, setSelectionRect } = useEditorStore();
    const { undo, redo, pushCommand } = useHistoryStore();
    const [scriptErrors, setScriptErrors] = useState<ScriptError[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    // ── Engine bootstrap ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const gl = canvas.getContext('webgl2', { antialias: true });
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
            if (useSceneStore.getState().playState === 'stopped') engine.render(0);
        };
        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(containerRef.current!);
        resize();

        // Editor Tools
        const gizmoRenderer = new GizmoRenderer(gl);
        const translateGizmo = new TranslateGizmo(engine);
        const rotateGizmo = new RotateGizmo(engine);
        const scaleGizmo = new ScaleGizmo(engine);

        // Render Hook
        const originalRender = engine.render.bind(engine);
        engine.render = (dt) => {
            originalRender(dt);
            if (useSceneStore.getState().playState === 'stopped') {
                const aspect = canvas.width / canvas.height;
                const worldSize = 10 / engine.cameraZoom;
                const projection = Mat4.create();
                Mat4.ortho(projection, -worldSize * aspect, worldSize * aspect, -worldSize, worldSize, -1, 1);
                const view = Mat4.create();
                Mat4.translate(view, view, [-engine.cameraPosition[0], -engine.cameraPosition[1], 0]);

                gizmoRenderer.begin(projection, view);

                // 1. Draw Selection Outlines
                const selectedIds = useEditorStore.getState().selectedEntityIds;
                selectedIds.forEach(id => {
                    const transform = engine.getWorld().getComponent(id, 'transform');
                    const sprite = engine.getWorld().getComponent(id, 'sprite');
                    if (transform) {
                        const w = sprite?.width || 1;
                        const h = sprite?.height || 1;
                        gizmoRenderer.drawRect(transform.x, transform.y, w * transform.scaleX, h * transform.scaleY, [1, 1, 1, 0.4], true, transform.rotation);
                    }
                });

                // 2. Draw Marquee
                const rect = useEditorStore.getState().selectionRect;
                if (rect) {
                    const x = (rect.x1 + rect.x2) / 2;
                    const y = (rect.y1 + rect.y2) / 2;
                    const w = Math.abs(rect.x2 - rect.x1);
                    const h = Math.abs(rect.y2 - rect.y1);
                    gizmoRenderer.drawRect(x, y, w, h, [0.4, 0.6, 1, 0.3], false);
                    gizmoRenderer.drawRect(x, y, w, h, [0.4, 0.6, 1, 0.8], true);
                }

                // 3. Draw Gizmos
                const mode = useEditorStore.getState().gizmoMode;
                if (selectedIds.length > 0) {
                    if (mode === 'translate') translateGizmo.render(gizmoRenderer);
                    else if (mode === 'rotate') rotateGizmo.render(gizmoRenderer);
                    else if (mode === 'scale') scaleGizmo.render(gizmoRenderer);
                }
            }
        };

        let isPanning = false;
        let isDraggingSelection = false;
        let isMarquee = false;
        let startPositions: { x: number, y: number }[] = [];
        let dragStartWorldPos = { x: 0, y: 0 };
        let lastMouseX = 0;
        let lastMouseY = 0;

        const spacePressed = { current: false };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') spacePressed.current = true;
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') spacePressed.current = false;
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

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
            if (isPlaying) return;

            if (e.button === 0 && !spacePressed.current) {
                const mode = useEditorStore.getState().gizmoMode;
                const activeGizmo = mode === 'translate' ? translateGizmo : mode === 'rotate' ? rotateGizmo : scaleGizmo;

                if (activeGizmo.handleMouseDown(downWorldX, downWorldY)) return;

                const hit = editorBridge.raycast(downWorldX, downWorldY);
                if (hit) {
                    if (e.shiftKey) {
                        const current = useEditorStore.getState().selectedEntityIds;
                        setSelectedEntityIds(current.includes(hit)
                            ? current.filter(id => id !== hit)
                            : [...current, hit]);
                    } else {
                        const current = useEditorStore.getState().selectedEntityIds;
                        if (!current.includes(hit)) {
                            setSelectedEntityIds([hit]);
                        }

                        // Handle Alt-drag duplication
                        if (e.altKey) {
                            const world = engine.getWorld();
                            const selected = useEditorStore.getState().selectedEntityIds;
                            const newIds: string[] = [];
                            selected.forEach(id => {
                                const allComponents = world.getEntityComponents(id);
                                if (allComponents) {
                                    const duplicatedComponents = JSON.parse(JSON.stringify(allComponents));
                                    const cmd = new CreateEntityCommand(duplicatedComponents);
                                    pushCommand(cmd);
                                    if (cmd.entityId) newIds.push(cmd.entityId);
                                }
                            });
                            if (newIds.length > 0) {
                                setSelectedEntityIds(newIds);
                                engine.render(0);
                            }
                        }

                        // Start direct drag for all selected
                        isDraggingSelection = true;
                        dragStartWorldPos = { x: downWorldX, y: downWorldY };
                        const world = engine.getWorld();
                        const selected = useEditorStore.getState().selectedEntityIds;
                        startPositions = selected.map(id => {
                            const t = world.getComponent(id, 'transform');
                            return { x: t?.x || 0, y: t?.y || 0 };
                        });
                    }
                } else {
                    // Start Marquee
                    setSelectedEntityIds([]);
                    isMarquee = true;
                    setSelectionRect({ x1: downWorldX, y1: downWorldY, x2: downWorldX, y2: downWorldY });
                }
                engine.render(0);
            } else if (e.button === 1 || (e.button === 0 && spacePressed.current)) {
                isPanning = true;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
            }
        };

        const onMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const clipX = (x / canvas.width) * 2 - 1;
            const clipY = -((y / canvas.height) * 2 - 1);
            const aspect = canvas.width / canvas.height;
            const worldSize = 10 / engine.cameraZoom;
            const worldX = clipX * worldSize * aspect + engine.cameraPosition[0];
            const worldY = clipY * worldSize + engine.cameraPosition[1];

            if (isPanning) {
                const dx = e.clientX - lastMouseX;
                const dy = e.clientY - lastMouseY;
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                engine.cameraPosition[0] -= (dx / canvas.width) * worldSize * 2 * aspect;
                engine.cameraPosition[1] += (dy / canvas.height) * worldSize * 2;
                engine.render(0);
            } else if (isMarquee) {
                const rect = useEditorStore.getState().selectionRect;
                if (rect) {
                    setSelectionRect({ ...rect, x2: worldX, y2: worldY });
                    engine.render(0);
                }
            } else {
                const mode = useEditorStore.getState().gizmoMode;
                const activeGizmo = mode === 'translate' ? translateGizmo : mode === 'rotate' ? rotateGizmo : scaleGizmo;
                const gizmoActive = (activeGizmo as any).dragging;

                if (gizmoActive) {
                    activeGizmo.handleMouseMove(worldX, worldY);
                    const selected = useEditorStore.getState().selectedEntityIds;
                    selected.forEach(id => {
                        const t = engine.getWorld().getComponent(id, 'transform');
                        if (t) editorBridge.updateTransform(id, { x: t.x, y: t.y, rotation: t.rotation, scaleX: t.scaleX, scaleY: t.scaleY });
                    });
                } else if (isDraggingSelection) {
                    const dx = worldX - dragStartWorldPos.x;
                    const dy = worldY - dragStartWorldPos.y;
                    const selected = useEditorStore.getState().selectedEntityIds;
                    const { snappingEnabled, snapSize } = useEditorStore.getState();

                    selected.forEach((id, index) => {
                        const t = engine.getWorld().getComponent(id, 'transform');
                        if (t) {
                            let newX = startPositions[index].x + dx;
                            let newY = startPositions[index].y + dy;
                            if (snappingEnabled) {
                                newX = Math.round(newX / snapSize) * snapSize;
                                newY = Math.round(newY / snapSize) * snapSize;
                            }
                            t.x = newX;
                            t.y = newY;
                            editorBridge.updateTransform(id, { x: t.x, y: t.y });
                        }
                    });
                } else {
                    activeGizmo.handleMouseMove(worldX, worldY);
                }

                if (useSceneStore.getState().playState === 'stopped') engine.render(0);
            }
        };

        const onMouseUp = () => {
            const wasPanning = isPanning;
            isPanning = false;

            if (isMarquee) {
                const rect = useEditorStore.getState().selectionRect;
                if (rect) {
                    const xMin = Math.min(rect.x1, rect.x2);
                    const xMax = Math.max(rect.x1, rect.x2);
                    const yMin = Math.min(rect.y1, rect.y2);
                    const yMax = Math.max(rect.y1, rect.y2);

                    const world = engine.getWorld();
                    const entities = world.getEntitiesWithComponents('transform');
                    const within = entities.filter(id => {
                        const t = world.getComponent(id, 'transform')!;
                        return t.x >= xMin && t.x <= xMax && t.y >= yMin && t.y <= yMax;
                    });
                    setSelectedEntityIds(within);
                }
                isMarquee = false;
                setSelectionRect(null);
            }

            const wasDragged = isDraggingSelection;
            if (isDraggingSelection) {
                const world = engine.getWorld();
                const selected = useEditorStore.getState().selectedEntityIds;
                const currentPositions = selected.map(id => {
                    const t = world.getComponent(id, 'transform');
                    return { x: t?.x || 0, y: t?.y || 0 };
                });

                pushCommand(new MoveEntityCommand([...selected], [...startPositions], currentPositions));
            }
            isDraggingSelection = false;

            const translateWasActive = (translateGizmo as any).dragging;
            const rotateWasActive = (rotateGizmo as any).dragging;
            const scaleWasActive = (scaleGizmo as any).dragging;

            translateGizmo.handleMouseUp();
            rotateGizmo.handleMouseUp();
            scaleGizmo.handleMouseUp();

            if (!wasPanning && (translateWasActive || rotateWasActive || scaleWasActive || wasDragged)) {
                syncWorldToProject();
            }
            engine.render(0);
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
        const unsubPlayState = useSceneStore.subscribe((state, prev) => {
            if (state.playState === prev.playState) return;
            if (state.playState === 'stopped') {
                requestAnimationFrame(() => engine.render(0));
            }
        });

        // ── Sync project → engine ─────────────────────────────────────────────
        const unsubProject = useProjectStore.subscribe((state, prevState) => {
            if (state.project && state.project !== prevState.project) {
                if (useSceneStore.getState().playState === 'stopped') {
                    const world = engine.getWorld();
                    world.clear();
                    engine.setProject(state.project);
                    new SceneLoader(world).loadScene(state.project);
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
            canvas.removeEventListener('wheel', onWheel, { passive: false } as any);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('glix-focus-selection', onFocusSelection);
        };
    }, [undo, redo, setSelectedEntityIds, setSelectionRect, pushCommand]);

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

                const { snappingEnabled, snapSize } = useEditorStore.getState();
                if (e.shiftKey || snappingEnabled) {
                    const step = e.shiftKey ? 1 : snapSize;
                    worldX = Math.round(worldX / step) * step;
                    worldY = Math.round(worldY / step) * step;
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
