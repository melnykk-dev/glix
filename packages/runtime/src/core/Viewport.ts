/**
 * Viewport framing (Viewport, 2026-11-12) — pure math, no GL, so the
 * harness can test it in plain Node and the editor can reuse it for its
 * screen-to-world conversion (Viewport.tsx) without duplicating the rules.
 *
 * Design rect: 20 world units tall (`DESIGN_HALF_HEIGHT` = 10, the
 * `size = 10 / cameraZoom` the engine has always used) at the design
 * aspect 16:9, i.e. 35.6 world units wide. The design rect is always
 * fully visible; the modes differ in what happens with the extra space:
 *
 * - 'expand' (default, Godot-style): the visible world grows in the
 *   direction the screen is longer — a tall phone sees more of the world
 *   vertically, a wide screen more horizontally. Fills the screen, never
 *   distorts. On a 390x844 phone the visible world is 35.6 wide x ~77
 *   tall; sprites are smaller than in the old fixed-height framing, and
 *   games that want a closer phone view should raise `cameraZoom`.
 * - 'fit': the design rect is shown whole, centred in the largest 16:9
 *   rectangle inside the canvas; the leftover bands are left to the
 *   scene background colour (never black unless the scene colour is).
 * - 'stretch': the design rect is squeezed to fill the whole canvas;
 *   fills everywhere but distorts whenever the aspect differs from 16:9.
 *
 * All coordinates are in canvas pixels (the export canvas and the editor
 * viewport both size their backing store in CSS pixels). The output rect
 * (`outX/outY/outWidth/outHeight`) is the screen region the scene is
 * drawn into — full canvas except in 'fit' mode.
 */

import type { ViewportMode } from '@glix/shared';

/** Design aspect: the engine's desktop framing target. */
export const DESIGN_ASPECT = 16 / 9;

/** Half of the design world height, at cameraZoom 1. */
export const DESIGN_HALF_HEIGHT = 10;

export interface ComputedViewport {
    mode: ViewportMode;
    /** Half of the visible world width, in world units. */
    halfWidth: number;
    /** Half of the visible world height, in world units. */
    halfHeight: number;
    /** Screen region the scene is drawn into, in canvas pixels. */
    outX: number;
    outY: number;
    outWidth: number;
    outHeight: number;
}

export function computeViewport(
    canvasWidth: number,
    canvasHeight: number,
    cameraZoom: number,
    mode: ViewportMode
): ComputedViewport {
    const w = Math.max(1, Math.floor(canvasWidth) || 1);
    const h = Math.max(1, Math.floor(canvasHeight) || 1);
    const zoom = Number.isFinite(cameraZoom) && cameraZoom > 0 ? cameraZoom : 1;
    const size = DESIGN_HALF_HEIGHT / zoom;
    const aspect = w / h;

    if (mode === 'expand') {
        // Taller than the design aspect → grow the visible height so the
        // design width stays fully visible; wider → grow the width.
        const halfHeight = size * Math.max(1, DESIGN_ASPECT / aspect);
        return {
            mode,
            halfWidth: halfHeight * aspect,
            halfHeight,
            outX: 0, outY: 0, outWidth: w, outHeight: h,
        };
    }

    if (mode === 'fit') {
        // Design rect whole, centred in the largest 16:9 rect that fits.
        const halfHeight = size;
        const halfWidth = size * DESIGN_ASPECT;
        let outWidth = w;
        let outHeight = Math.round(w / DESIGN_ASPECT);
        if (outHeight > h) {
            outHeight = h;
            outWidth = Math.round(h * DESIGN_ASPECT);
        }
        return {
            mode,
            halfWidth,
            halfHeight,
            outX: Math.round((w - outWidth) / 2),
            outY: Math.round((h - outHeight) / 2),
            outWidth,
            outHeight,
        };
    }

    // 'stretch': design rect squeezed onto the full canvas (distorts when
    // the aspect differs from 16:9 — that is the documented cost of it).
    return {
        mode,
        halfWidth: size * DESIGN_ASPECT,
        halfHeight: size,
        outX: 0, outY: 0, outWidth: w, outHeight: h,
    };
}

/**
 * Screen pixel → world coordinate, honouring the computed viewport
 * (in 'fit' mode clicks in the letterbox bands map outside the design
 * rect, exactly as they look). `cameraX/cameraY` is the camera centre.
 */
export function screenToWorld(
    screenX: number,
    screenY: number,
    viewport: ComputedViewport,
    cameraX: number,
    cameraY: number
): { x: number; y: number } {
    const nx = ((screenX - viewport.outX) / viewport.outWidth) * 2 - 1;
    const ny = -(((screenY - viewport.outY) / viewport.outHeight) * 2 - 1);
    return {
        x: nx * viewport.halfWidth + cameraX,
        y: ny * viewport.halfHeight + cameraY,
    };
}
