import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { editorBridge } from '../bridge/EditorBridge';
import { useHistoryStore } from '../store/useHistoryStore';
import { UpdatePropertyCommand } from '../history/commands/UpdatePropertyCommand';
import { CreateEntityCommand } from '../history/commands/CreateEntityCommand';
import { TilemapComponent, TilemapLayer } from '@glix/shared';

export const TilemapEditor: React.FC = () => {
    const { selectedEntityIds } = useEditorStore();
    const { pushCommand } = useHistoryStore();

    const [tilemap, setTilemap] = useState<TilemapComponent | null>(null);
    const [textureSrc, setTextureSrc] = useState<string | null>(null);
    const [tilesetScale, setTilesetScale] = useState(2);

    const [activeTool, setActiveTool] = useState<'paint' | 'erase' | 'fill' | 'rect'>('paint');
    const [selectedTile, setSelectedTile] = useState<number>(0);
    const [selectedLayerIdx, setSelectedLayerIdx] = useState<number>(0);

    const paletteCanvasRef = useRef<HTMLCanvasElement>(null);
    const mapCanvasRef = useRef<HTMLCanvasElement>(null);

    const [tilesetData, setTilesetData] = useState<any>(null);

    // Grid tracking
    const isPainting = useRef(false);
    const paintStartCoord = useRef<{ r: number, c: number } | null>(null);

    const engine = editorBridge.getEngine();

    useEffect(() => {
        const interval = setInterval(() => {
            if (!engine) return;
            const selectedId = selectedEntityIds[0];
            if (!selectedId) {
                setTilemap(null);
                setTilesetData(null);
                return;
            }

            const tm = engine.getWorld().getComponent(selectedId, 'tilemap') as TilemapComponent;
            if (tm) {
                // deep clone to avoid react mutation issues if needed, but for now we just reference
                setTilemap(tm);
                const tset = engine.getAssetPreloader().tilesets.get(tm.tilesetId);
                setTilesetData(tset);
                if (tset) {
                    const textureAsset = engine.getAssetPreloader().assetDefs[tset.textureId];
                    if (textureAsset && textureAsset.data !== textureSrc) {
                        setTextureSrc(textureAsset.data);
                    }
                }
            } else {
                setTilemap(null);
                setTilesetData(null);
            }
        }, 100);
        return () => clearInterval(interval);
    }, [selectedEntityIds, engine, textureSrc]);

    // Draw Palette
    useEffect(() => {
        if (!paletteCanvasRef.current || !textureSrc || !tilesetData) return;
        const ctx = paletteCanvasRef.current.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            const width = img.width * tilesetScale;
            const height = img.height * tilesetScale;
            paletteCanvasRef.current!.width = width;
            paletteCanvasRef.current!.height = height;

            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, width, height);

            // Draw grid
            const tw = (img.width / tilesetData.columns) * tilesetScale;
            const th = (img.height / tilesetData.rows) * tilesetScale;

            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let c = 0; c <= tilesetData.columns; c++) {
                ctx.moveTo(c * tw, 0);
                ctx.lineTo(c * tw, height);
            }
            for (let r = 0; r <= tilesetData.rows; r++) {
                ctx.moveTo(0, r * th);
                ctx.lineTo(width, r * th);
            }
            ctx.stroke();

            // Highlight selected
            const sr = Math.floor(selectedTile / tilesetData.columns);
            const sc = selectedTile % tilesetData.columns;
            ctx.strokeStyle = '#0f0';
            ctx.lineWidth = 2;
            ctx.strokeRect(sc * tw, sr * th, tw, th);
        };
        img.src = textureSrc;
    }, [textureSrc, tilesetData, tilesetScale, selectedTile]);

    // Draw Map
    useEffect(() => {
        if (!mapCanvasRef.current || !tilemap || !textureSrc || !tilesetData) return;
        const ctx = mapCanvasRef.current.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            const COLS = 20; // arbitrary viewport size for editor
            const ROWS = 15;

            const renderSize = 32; // size of tile on screen

            mapCanvasRef.current!.width = COLS * renderSize;
            mapCanvasRef.current!.height = ROWS * renderSize;

            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, COLS * renderSize, ROWS * renderSize);

            // Draw grid
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let c = 0; c <= COLS; c++) {
                ctx.moveTo(c * renderSize, 0);
                ctx.lineTo(c * renderSize, ROWS * renderSize);
            }
            for (let r = 0; r <= ROWS; r++) {
                ctx.moveTo(0, r * renderSize);
                ctx.lineTo(COLS * renderSize, r * renderSize);
            }
            ctx.stroke();

            // Draw layers
            for (const layer of tilemap.layers) {
                if (!layer.visible) continue;
                ctx.globalAlpha = layer.opacity;

                for (let r = 0; r < Math.min(layer.tiles.length, ROWS); r++) {
                    const row = layer.tiles[r];
                    if (!row) continue;
                    for (let c = 0; c < Math.min(row.length, COLS); c++) {
                        const tileIdx = row[c];
                        if (tileIdx === -1 || tileIdx === undefined) continue;

                        const sr = Math.floor(tileIdx / tilesetData.columns);
                        const sc = tileIdx % tilesetData.columns;

                        const tw = img.width / tilesetData.columns;
                        const th = img.height / tilesetData.rows;

                        ctx.drawImage(img, sc * tw, sr * th, tw, th, c * renderSize, r * renderSize, renderSize, renderSize);
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        };
        img.src = textureSrc;
    }, [tilemap, textureSrc, tilesetData]);

    const handlePaletteClick = (e: React.MouseEvent) => {
        if (!paletteCanvasRef.current || !tilesetData) return;
        const rect = paletteCanvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const tw = (paletteCanvasRef.current.width / tilesetData.columns);
        const th = (paletteCanvasRef.current.height / tilesetData.rows);

        const c = Math.floor(x / tw);
        const r = Math.floor(y / th);
        if (c >= 0 && c < tilesetData.columns && r >= 0 && r < tilesetData.rows) {
            setSelectedTile(r * tilesetData.columns + c);
            if (activeTool === 'erase') setActiveTool('paint');
        }
    };

    const commitLayerUpdate = (newLayers: TilemapLayer[]) => {
        if (!selectedEntityIds[0] || !tilemap) return;
        pushCommand(new UpdatePropertyCommand(selectedEntityIds[0], 'tilemap', 'layers', tilemap.layers, newLayers));
    };

    const paintCell = (r: number, c: number, layers: TilemapLayer[]) => {
        const layer = layers[selectedLayerIdx];
        if (!layer) return;

        // expand dynamically
        while (layer.tiles.length <= r) layer.tiles.push([]);
        while (layer.tiles[r].length <= c) layer.tiles[r].push(-1);

        const fillVal = activeTool === 'erase' ? -1 : selectedTile;
        layer.tiles[r][c] = fillVal;
    };

    const [previewLayers, setPreviewLayers] = useState<TilemapLayer[] | null>(null);

    const handleMapPointerDown = (e: React.PointerEvent) => {
        if (!mapCanvasRef.current || !tilemap) return;
        isPainting.current = true;
        mapCanvasRef.current.setPointerCapture(e.pointerId);

        const rect = mapCanvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = Math.floor(x / 32);
        const r = Math.floor(y / 32);

        paintStartCoord.current = { r, c };

        const layersClone = JSON.parse(JSON.stringify(tilemap.layers));
        if (activeTool === 'paint' || activeTool === 'erase') {
            paintCell(r, c, layersClone);
            setPreviewLayers(layersClone);
            tilemap.layers = layersClone; // direct mutation for realtime preview
        } else if (activeTool === 'fill') {
            const layer = layersClone[selectedLayerIdx];
            if (!layer) return;
            const targetColor = layer.tiles[r]?.[c] ?? -1;
            const fillVal = selectedTile;
            if (targetColor === fillVal) return;

            const toVisit = [{ r, c }];
            while (toVisit.length > 0) {
                const curr = toVisit.pop()!;
                if (curr.r < 0 || curr.c < 0 || curr.r > 20 || curr.c > 20) continue;
                while (layer.tiles.length <= curr.r) layer.tiles.push([]);
                while (layer.tiles[curr.r].length <= curr.c) layer.tiles[curr.r].push(-1);

                if (layer.tiles[curr.r][curr.c] === targetColor) {
                    layer.tiles[curr.r][curr.c] = fillVal;
                    toVisit.push({ r: curr.r + 1, c: curr.c });
                    toVisit.push({ r: curr.r - 1, c: curr.c });
                    toVisit.push({ r: curr.r, c: curr.c + 1 });
                    toVisit.push({ r: curr.r, c: curr.c - 1 });
                }
            }
            commitLayerUpdate(layersClone);
            isPainting.current = false;
        }
    };

    const handleMapPointerMove = (e: React.PointerEvent) => {
        if (!isPainting.current || !mapCanvasRef.current || !tilemap) return;
        if (activeTool === 'fill') return;

        const rect = mapCanvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = Math.floor(x / 32);
        const r = Math.floor(y / 32);

        if (activeTool === 'rect') {
            // we could draw preview over here, but skip for complexity constraint
        } else {
            const layersClone = previewLayers || JSON.parse(JSON.stringify(tilemap.layers));
            paintCell(r, c, layersClone);
            setPreviewLayers(layersClone);
            tilemap.layers = layersClone;
        }
    };

    const handleMapPointerUp = (e: React.PointerEvent) => {
        if (!isPainting.current || !tilemap) return;
        isPainting.current = false;

        const rect = mapCanvasRef.current!.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const endC = Math.floor(x / 32);
        const endR = Math.floor(y / 32);

        const layersClone = JSON.parse(JSON.stringify(tilemap.layers));

        if (activeTool === 'rect' && paintStartCoord.current) {
            const minR = Math.min(paintStartCoord.current.r, endR);
            const maxR = Math.max(paintStartCoord.current.r, endR);
            const minC = Math.min(paintStartCoord.current.c, endC);
            const maxC = Math.max(paintStartCoord.current.c, endC);

            for (let r = minR; r <= maxR; r++) {
                for (let c = minC; c <= maxC; c++) {
                    paintCell(r, c, layersClone);
                }
            }
        } else if (previewLayers) {
            Object.assign(layersClone, previewLayers);
        }

        commitLayerUpdate(layersClone);
        setPreviewLayers(null);
    };

    const runAutoCollision = () => {
        if (!tilemap || !tilesetData) return;
        const engine = editorBridge.getEngine();
        if (!engine) return;

        const solidTiles = tilesetData.solidTiles || []; // Needs solidTiles array definition
        // For fallback if not defined, assume tile 0 is solid for demo
        const isSolid = (i: number) => solidTiles.includes(i) || i === 0;

        const layer = tilemap.layers[selectedLayerIdx];
        if (!layer) return;

        // Very basic AABB gen: 1 collider per solid block. We'll simply spawn BoxCollider entities
        const visited = new Set<string>();

        for (let r = 0; r < layer.tiles.length; r++) {
            if (!layer.tiles[r]) continue;
            for (let c = 0; c < layer.tiles[r].length; c++) {
                const t = layer.tiles[r][c];
                const key = r + ',' + c;
                if (t !== -1 && isSolid(t) && !visited.has(key)) {
                    // Try to expand horizontally
                    let widthC = 1;
                    while (layer.tiles[r][c + widthC] !== -1 && isSolid(layer.tiles[r][c + widthC]) && !visited.has(r + ',' + (c + widthC))) {
                        widthC++;
                    }

                    // Try to expand vertically
                    let heightR = 1;
                    let canExpandDesc = true;
                    while (canExpandDesc) {
                        for (let scanC = c; scanC < c + widthC; scanC++) {
                            const ny = r + heightR;
                            if (!layer.tiles[ny] || layer.tiles[ny][scanC] === -1 || !isSolid(layer.tiles[ny][scanC]) || visited.has(ny + ',' + scanC)) {
                                canExpandDesc = false;
                                break;
                            }
                        }
                        if (canExpandDesc) heightR++;
                    }

                    for (let vr = r; vr < r + heightR; vr++) {
                        for (let vc = c; vc < c + widthC; vc++) {
                            visited.add(vr + ',' + vc);
                        }
                    }

                    // Spawn BoxCollider
                    const cx = (c + widthC / 2) * tilemap.tileWidth;
                    const cy = (-r - heightR / 2) * tilemap.tileHeight;

                    const pEntityComponents = engine.getWorld().getEntityComponents(selectedEntityIds[0]);
                    const bx = (pEntityComponents.transform?.x || 0) + cx;
                    const by = (pEntityComponents.transform?.y || 0) + cy;

                    pushCommand(new CreateEntityCommand({
                        transform: { x: bx, y: by, rotation: 0, scaleX: 1, scaleY: 1 },
                        rigidBody: { type: 'static', fixedRotation: true },
                        boxCollider: { width: widthC * tilemap.tileWidth, height: heightR * tilemap.tileHeight, offset: [0, 0] }
                    }));
                }
            }
        }
    };

    if (!tilemap) {
        return <div style={{ padding: 10, color: '#aaa' }}>No Tilemap component on selected entity.</div>;
    }

    return (
        <div style={{ display: 'flex', width: '100%', height: '100%', color: '#fff' }}>
            {/* Left Canvas (Map View) */}
            <div style={{ flex: 1, padding: 10, overflow: 'auto' }}>
                <div style={{ marginBottom: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <select value={selectedLayerIdx} onChange={e => setSelectedLayerIdx(Number(e.target.value))} style={{ background: '#333', color: '#fff', border: 'none', padding: 4 }}>
                        {tilemap.layers.map((l, i) => <option key={i} value={i}>{l.name}</option>)}
                    </select>

                    <button style={{ ...btnStyle, background: activeTool === 'paint' ? '#555' : '#333' }} onClick={() => setActiveTool('paint')}>Paint</button>
                    <button style={{ ...btnStyle, background: activeTool === 'erase' ? '#555' : '#333' }} onClick={() => setActiveTool('erase')}>Erase</button>
                    <button style={{ ...btnStyle, background: activeTool === 'fill' ? '#555' : '#333' }} onClick={() => setActiveTool('fill')}>Fill</button>
                    <button style={{ ...btnStyle, background: activeTool === 'rect' ? '#555' : '#333' }} onClick={() => setActiveTool('rect')}>Rect</button>

                    <button style={{ ...btnStyle, background: '#262', marginLeft: 'auto' }} onClick={runAutoCollision}>Auto-Collision</button>
                </div>

                <canvas
                    ref={mapCanvasRef}
                    style={{ background: '#111', border: '1px solid #333', cursor: 'crosshair', imageRendering: 'pixelated' }}
                    onPointerDown={handleMapPointerDown}
                    onPointerMove={handleMapPointerMove}
                    onPointerUp={handleMapPointerUp}
                    onPointerLeave={handleMapPointerUp}
                />
            </div>

            {/* Right Sidebar (Palette) */}
            <div style={{ width: 250, borderLeft: '1px solid #333', padding: 10, background: '#222', overflow: 'auto' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 10 }}>Tileset Palette</div>
                {!textureSrc && <div style={{ color: '#888', fontSize: 12 }}>Loading tileset...</div>}

                <div style={{ overflow: 'auto', border: '1px solid #333', background: '#000', maxHeight: 300 }}>
                    <canvas
                        ref={paletteCanvasRef}
                        onClick={handlePaletteClick}
                        style={{ cursor: 'pointer' }}
                    />
                </div>

                <div style={{ marginTop: 15 }}>
                    <label style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Palette Zoom: {tilesetScale}x</label>
                    <input type="range" min="1" max="4" value={tilesetScale} onChange={e => setTilesetScale(Number(e.target.value))} />
                </div>

                <div style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 6 }}>Layers</div>
                    {tilemap.layers.map((l, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: 4, background: i === selectedLayerIdx ? '#333' : 'transparent', padding: 4 }}>
                            <input
                                type="checkbox"
                                checked={l.visible}
                                onChange={(e) => {
                                    const c = JSON.parse(JSON.stringify(tilemap.layers));
                                    c[i].visible = e.target.checked;
                                    commitLayerUpdate(c);
                                }}
                            />
                            <span style={{ fontSize: 12, marginLeft: 6, flex: 1, cursor: 'pointer' }} onClick={() => setSelectedLayerIdx(i)}>
                                <input
                                    style={{
                                        background: 'transparent', border: 'none', color: '#fff',
                                        fontSize: 12, width: '100%', outline: 'none'
                                    }}
                                    value={l.name}
                                    onChange={(e) => {
                                        const c = JSON.parse(JSON.stringify(tilemap.layers));
                                        c[i].name = e.target.value;
                                        commitLayerUpdate(c);
                                    }}
                                />
                            </span>
                        </div>
                    ))}
                    <button style={{ ...btnStyle, width: '100%', marginTop: 10 }} onClick={() => {
                        const newLayers = [...tilemap.layers, { name: 'New Layer', tiles: [], visible: true, opacity: 1 }];
                        commitLayerUpdate(newLayers);
                    }}>+ Add Layer</button>
                </div>
            </div>
        </div>
    );
};

const btnStyle: React.CSSProperties = {
    padding: '4px 8px',
    background: '#333',
    color: '#fff',
    border: '1px solid #444',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 12
};
