/**
 * Draw ordering for the sprite/tilemap/particle pass (Layering, 2026-11-12).
 *
 * Pure functions over a minimal world interface so they can be unit-tested
 * without a WebGL context. RenderSystem.update() sorts its drawables with
 * sortDrawables(); the template preview renderer mirrors the same rule.
 *
 * Order (painter's algorithm, back to front):
 *   1. sortingLayer.layer ascending (Background < Ground < Objects <
 *      Foreground < UI). Entities without a sortingLayer default to layer 0.
 *   2. Y-sort tiebreak, only when BOTH entities have ySort enabled:
 *      bottom edge DESCENDING — in Glix Y grows upward, so a larger bottom
 *      edge sits further north on screen (further away) and must draw
 *      first. A player south of a tree (smaller bottom edge) draws after
 *      the tree and appears in front of it; north of the tree, the reverse.
 *   3. orderInLayer ascending.
 *   4. Stable: equal keys keep insertion order (Array.sort is stable).
 *
 * Bottom edge ("feet") of an entity, in world units:
 *   sprite   -> worldY - (height * worldScaleY) / 2  (pivot is centred)
 *   tilemap  -> worldY - (tallest layer rows * tileHeight * worldScaleY)
 *              (tilemap origin is its top-left; rows run downward)
 *   anything else -> worldY
 * worldY / worldScaleY walk the transform.parent chain (rotation ignored
 * for sorting — a rotated sprite's feet are ill-defined anyway).
 */

export interface DrawOrderWorld {
    // unknown (not Record) so the real World type is assignable: its
    // getComponent returns a union of component interfaces, which have
    // no index signature.
    getComponent(entity: string, type: string): unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
}

function getTransform(world: DrawOrderWorld, entity: string): Record<string, unknown> | undefined {
    return asRecord(world.getComponent(entity, 'transform'));
}

/** World-space Y of an entity (parent chain summed, rotation ignored). */
export function getWorldY(world: DrawOrderWorld, entity: string): number {
    let y = 0;
    let current: string | undefined = entity;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
        seen.add(current);
        const t = getTransform(world, current);
        if (!t) break;
        y += typeof t.y === 'number' ? t.y : 0;
        current = typeof t.parent === 'string' ? t.parent : undefined;
    }
    return y;
}

/** World-space vertical scale (parent chain multiplied). */
function getWorldScaleY(world: DrawOrderWorld, entity: string): number {
    let s = 1;
    let current: string | undefined = entity;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
        seen.add(current);
        const t = getTransform(world, current);
        if (!t) break;
        if (typeof t.scaleY === 'number') s *= t.scaleY;
        current = typeof t.parent === 'string' ? t.parent : undefined;
    }
    return s;
}

export function getBottomEdge(world: DrawOrderWorld, entity: string): number {
    const y = getWorldY(world, entity);
    const sy = getWorldScaleY(world, entity);
    const sprite = asRecord(world.getComponent(entity, 'sprite'));
    if (sprite && typeof sprite.height === 'number') {
        return y - (sprite.height * sy) / 2;
    }
    const tilemap = asRecord(world.getComponent(entity, 'tilemap'));
    if (tilemap && Array.isArray(tilemap.layers)) {
        const rows = Math.max(0, ...tilemap.layers.map((l: unknown) =>
            Array.isArray((l as { tiles?: unknown[] }).tiles)
                ? (l as { tiles: unknown[] }).tiles.length : 0));
        const th = typeof tilemap.tileHeight === 'number' ? tilemap.tileHeight : 1;
        return y - rows * th * sy;
    }
    return y;
}

function getLayer(world: DrawOrderWorld, entity: string): { layer: number; order: number; ySort: boolean } {
    const sl = asRecord(world.getComponent(entity, 'sortingLayer'));
    return {
        layer: typeof sl?.layer === 'number' ? sl.layer : 0,
        order: typeof sl?.orderInLayer === 'number' ? sl.orderInLayer : 0,
        ySort: sl?.ySort === true,
    };
}

/** Comparator implementing the order above. Returns 0 for equal keys. */
export function compareDrawOrder(world: DrawOrderWorld, a: string, b: string): number {
    const A = getLayer(world, a);
    const B = getLayer(world, b);
    if (A.layer !== B.layer) return A.layer - B.layer;
    if (A.ySort && B.ySort) {
        const bottomA = getBottomEdge(world, a);
        const bottomB = getBottomEdge(world, b);
        if (bottomA !== bottomB) return bottomB - bottomA;
    }
    if (A.order !== B.order) return A.order - B.order;
    return 0;
}

/** Stable sorted copy of an entity list (does not mutate the input). */
export function sortDrawables(world: DrawOrderWorld, entities: string[]): string[] {
    return [...entities].sort((a, b) => compareDrawOrder(world, a, b));
}
