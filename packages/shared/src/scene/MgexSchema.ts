import { z } from 'zod';

export const AssetSchema = z.object({
    id: z.string(),
    type: z.enum(['texture', 'audio', 'spriteatlas', 'tileset']),
    name: z.string().default('unnamed'),
    mimeType: z.string().optional(),
    data: z.string(), // base64 data URL
});

export const EntitySchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    components: z.record(z.any()), // Map of ComponentType -> ComponentData
});

export const SceneSchema = z.object({
    id: z.string(),
    name: z.string().default('Scene'),
    entities: z.array(EntitySchema).default([]),
});

/**
 * On-screen mobile controller setting — single source of truth, shared by
 * the v1 schema below and the v2 schema (`project/ProjectV2.ts`, which
 * imports it from here so the two formats can never drift apart).
 * `touchControls` is the legacy v1 visibility-only setting; `mobileController`
 * supersedes it, and the resolver below derives it from `touchControls`
 * for projects saved before this section existed.
 */
export const MobileControllerSchema = z.object({
    /** Master switch. False hides the controller everywhere. */
    enabled: z.boolean().default(true),
    /** 'auto' = touch devices only, 'always' = also on desktop (preview/dev), 'never' = hidden. */
    visibility: z.enum(['auto', 'always', 'never']).default('auto'),
    layout: z.enum(['dpad-buttons', 'joystick-buttons', 'dpad-4buttons']).default('dpad-buttons'),
    /** Overlay opacity, clamped 0.4–1.0. */
    opacity: z.number().min(0.4).max(1).default(0.75),
    /** Which side the movement cluster (D-pad / joystick) sits on. */
    position: z.enum(['left', 'right']).default('left'),
    /** navigator.vibrate(10) on press. */
    haptics: z.boolean().default(true),
});
export type MobileControllerSettings = z.infer<typeof MobileControllerSchema>;

export const DEFAULT_MOBILE_CONTROLLER: MobileControllerSettings = {
    enabled: true,
    visibility: 'auto',
    layout: 'dpad-buttons',
    opacity: 0.75,
    position: 'left',
    haptics: true,
};

/**
 * Effective mobile-controller settings for any settings object (v1 or v2).
 * Missing section → defaults; legacy `touchControls` fills visibility when
 * the section is absent. Never throws — bad values fall back to defaults.
 */
export function resolveMobileController(settings: {
    touchControls?: string;
    mobileController?: Partial<MobileControllerSettings>;
} | null | undefined): MobileControllerSettings {
    const mc = settings?.mobileController;
    const legacy = settings?.touchControls;
    const visibility = (mc?.visibility ??
        (legacy === 'always' || legacy === 'never' || legacy === 'auto' ? legacy : undefined) ??
        'auto') as MobileControllerSettings['visibility'];
    const layout = (mc?.layout ?? 'dpad-buttons') as MobileControllerSettings['layout'];
    const position = (mc?.position ?? 'left') as MobileControllerSettings['position'];
    const opacity = typeof mc?.opacity === 'number'
        ? Math.max(0.4, Math.min(1, mc.opacity)) : 0.75;
    return {
        enabled: mc?.enabled ?? (legacy !== 'never'),
        visibility,
        layout: layout === 'joystick-buttons' || layout === 'dpad-4buttons' ? layout : 'dpad-buttons',
        opacity,
        position: position === 'right' ? 'right' : 'left',
        haptics: mc?.haptics ?? true,
    };
}

/**
 * How the camera frames the world on screens whose aspect differs from the
 * design aspect (16:9) — single source of truth, shared by the v1 schema
 * below and the v2 schema (`project/ProjectV2.ts`, which imports it from
 * here so the two formats can never drift apart).
 *
 * - 'expand' (default, Godot-style): the visible world grows in the
 *   direction the screen is longer — tall phones see more of the world
 *   vertically, wide screens more horizontally. Never letterboxes, never
 *   distorts; the design rect (20 world units tall at 16:9) is always
 *   fully visible, plus extra.
 * - 'fit': the design rect is shown whole, centred, with the scene
 *   background colour filling the leftover bands (never black unless the
 *   scene colour is black).
 * - 'stretch': the design rect is squeezed to fill the screen; fills
 *   everywhere but distorts when the aspect differs from 16:9.
 */
export const ViewportModeSchema = z.enum(['expand', 'fit', 'stretch']);
export type ViewportMode = z.infer<typeof ViewportModeSchema>;

export const DEFAULT_VIEWPORT_MODE: ViewportMode = 'expand';

/**
 * Effective viewport mode for any settings object (v1 or v2).
 * Missing/unknown value → 'expand'. Never throws.
 */
export function resolveViewportMode(settings: {
    viewportMode?: string;
} | null | undefined): ViewportMode {
    const m = settings?.viewportMode;
    if (m === 'expand' || m === 'fit' || m === 'stretch') return m;
    return 'expand';
}

export const MgexSchema = z.object({
    version: z.string().default('0.1.0'),
    meta: z.object({
        name: z.string().default('Untitled'),
        resolution: z.object({
            width: z.number().default(1280),
            height: z.number().default(720),
        }).default({ width: 1280, height: 720 }),
    }).default({ name: 'Untitled', resolution: { width: 1280, height: 720 } }),
    assets: z.record(AssetSchema).default({}),
    prefabs: z.record(EntitySchema).default({}),
    scenes: z.record(SceneSchema).default({}),
    settings: z.object({
        startScene: z.string().optional(),
        physics: z.object({
            gravity: z.object({
                x: z.number(),
                y: z.number(),
            }),
        }).default({ gravity: { x: 0, y: 9.8 } }),
        postProcess: z.object({
            bloom: z.boolean().default(true),
            vignette: z.boolean().default(false),
            crt: z.boolean().default(false),
            bloomThreshold: z.number().default(0.8),
            vignetteStrength: z.number().default(0.3),
        }).default({ bloom: true, vignette: false, crt: false, bloomThreshold: 0.8, vignetteStrength: 0.3 }),
        input: z.record(z.array(z.string())).default({}),
        touchControls: z.enum(['auto', 'always', 'never']).default('auto'),
        // Optional on purpose (no .default): a filled-in default would erase
        // the distinction between "project predates the section" and "project
        // explicitly chose auto". resolveMobileController() derives the
        // legacy touchControls value when the section is absent.
        mobileController: MobileControllerSchema.optional(),
        // Scene background fill (Layering, 2026-11-12). Must live here too:
        // migrateV1ToV2 parses v1 through this schema first, and zod strips
        // unknown keys — without this field the colour would be silently
        // lost before migrate.ts ever sees it.
        backgroundColor: z.string().default('#12122A'),
        // Viewport framing (Viewport, 2026-11-12). Optional on purpose (no
        // .default), same reason as mobileController above: a filled-in
        // default would erase "project predates the setting" — and the
        // resolver returns 'expand' for absent values anyway.
        viewportMode: ViewportModeSchema.optional(),
    }).default({ physics: { gravity: { x: 0, y: 9.8 } } }),
});

export type AssetDef = z.infer<typeof AssetSchema>;
export type EntityDef = z.infer<typeof EntitySchema>;
export type SceneDef = z.infer<typeof SceneSchema>;
export type MgexFile = z.infer<typeof MgexSchema>;
