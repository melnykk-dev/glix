import { z } from 'zod';
import { AssetRefSchema } from '../assets/AssetRecord';
import { EntitySchema, MobileControllerSchema, ViewportModeSchema } from '../scene/MgexSchema';

export { MobileControllerSchema, DEFAULT_MOBILE_CONTROLLER, resolveMobileController } from '../scene/MgexSchema';
export type { MobileControllerSettings } from '../scene/MgexSchema';

/**
 * Format v2 — `project.json` schema (PROJECT_FORMAT_v2.md §2–§5, binding).
 *
 * The font gap is closed here by construction: this file does NOT define its
 * own AssetRef enum. It imports the single AssetRefSchema from
 * `assets/AssetRecord`, whose `type` enum is
 * `texture | audio | spriteatlas | tileset | font` — so font records
 * validate in `project.json` and there is no second enum to drift.
 * It is deliberately NOT re-exported here: `export *` from both this module
 * and `assets/AssetRecord` would make the name ambiguous and drop it from
 * `@glix/shared` entirely. Import AssetRefSchema from `@glix/shared`
 * (via AssetRecord) as before.
 */
export type { AssetRef } from '../assets/AssetRecord';

/** One key / mouse / gamepad / touch binding (PROJECT_FORMAT_v2.md §4). */
export const BindingSchema = z.union([
    z.object({ device: z.literal('keyboard'), code: z.string().min(1) }),
    z.object({ device: z.literal('mouse'), button: z.number().int().min(0) }),
    z.object({ device: z.literal('gamepad'), button: z.number().int().min(0), pad: z.number().int().min(0).optional() }),
    z.object({ device: z.literal('gamepad'), axis: z.number().int().min(0), dir: z.union([z.literal(1), z.literal(-1)]), pad: z.number().int().min(0).optional() }),
    z.object({ device: z.literal('touch'), source: z.string().min(1) }),
]);
export type BindingV2 = z.infer<typeof BindingSchema>;

export const InputMapConfigV2Schema = z.object({
    actions: z.record(z.object({ bindings: z.array(BindingSchema).default([]) })).default({}),
    axes: z.record(z.object({
        positive: z.array(BindingSchema).default([]),
        negative: z.array(BindingSchema).default([]),
        deadzone: z.number().min(0).max(1).default(0.2),
    })).default({}),
});
export type InputMapConfigV2 = z.infer<typeof InputMapConfigV2Schema>;

/** Default actions shipped in every template (PROJECT_FORMAT_v2.md §4). */
export const DEFAULT_ACTIONS = [
    'move_left', 'move_right', 'move_up', 'move_down',
    'action_primary', 'action_secondary', 'action_tertiary', 'action_quaternary',
    'pause', 'confirm', 'cancel',
] as const;

/** Default input map: keyboard bindings + VirtualGamepad touch sources. */
export function defaultInputMap(): InputMapConfigV2 {
    const kb = (...codes: string[]): { bindings: BindingV2[] } => ({
        bindings: codes.map((code) => ({ device: 'keyboard' as const, code })),
    });
    const touch = (source: string): BindingV2 => ({ device: 'touch', source });
    return {
        actions: {
            move_left: { bindings: [...kb('ArrowLeft', 'KeyA').bindings, touch('pad:left')] },
            move_right: { bindings: [...kb('ArrowRight', 'KeyD').bindings, touch('pad:right')] },
            move_up: { bindings: [...kb('ArrowUp', 'KeyW').bindings, touch('pad:up')] },
            move_down: { bindings: [...kb('ArrowDown', 'KeyS').bindings, touch('pad:down')] },
            action_primary: { bindings: [...kb('Space', 'KeyZ').bindings, touch('pad:a')] },
            action_secondary: { bindings: [...kb('KeyX', 'ShiftLeft').bindings, touch('pad:b')] },
            action_tertiary: { bindings: [...kb('KeyC').bindings, touch('pad:x')] },
            action_quaternary: { bindings: [...kb('KeyV').bindings, touch('pad:y')] },
            pause: { bindings: kb('Escape', 'KeyP').bindings },
            confirm: { bindings: kb('Enter', 'Space').bindings },
            cancel: { bindings: kb('Escape').bindings },
        },
        axes: {
            move_x: {
                positive: [{ device: 'keyboard', code: 'ArrowRight' }, { device: 'keyboard', code: 'KeyD' }],
                negative: [{ device: 'keyboard', code: 'ArrowLeft' }, { device: 'keyboard', code: 'KeyA' }],
                deadzone: 0.2,
            },
            move_y: {
                positive: [{ device: 'keyboard', code: 'ArrowDown' }, { device: 'keyboard', code: 'KeyS' }],
                negative: [{ device: 'keyboard', code: 'ArrowUp' }, { device: 'keyboard', code: 'KeyW' }],
                deadzone: 0.2,
            },
        },
    };
}

/** One scene file: `scenes/<id>.json` (PROJECT_FORMAT_v2.md §5). */
export const SceneDefV2Schema = z.object({
    id: z.string().min(1),
    name: z.string().default('Scene'),
    entities: z.array(EntitySchema).default([]),
});
export type SceneDefV2 = z.infer<typeof SceneDefV2Schema>;

/** Editor workspace layout saved per project (PROJECT_FORMAT_v2.md §7). */
export const WorkspaceLayoutSchema = z.object({
    activeWorkspace: z.string().default('2d'),
    dockedPanels: z.array(z.string()).default([]),
});
export type WorkspaceLayout = z.infer<typeof WorkspaceLayoutSchema>;

/**
 * The 12 permissions an extension can be granted (PLUGIN_SPEC.md §3).
 * Duplicated here because shared must not import from runtime — keep in
 * sync with `ExtensionPermission` in
 * `packages/runtime/src/plugins/ExtensionManifest.ts`. The v1 flat names
 * (`components`, `systems`, `storage`, `network`, `editorPanels`) are
 * NOT valid here; the zod enum rejects them on parse.
 */
export const ExtensionPermissionSchema = z.enum([
    'systems.register',
    'components.register',
    'assets.read',
    'assets.write',
    'storage.local',
    'network.fetch',
    'ui.panels',
    'ui.menus',
    'events.emit',
    'events.listen',
    'input.read',
    'scripts.register',
]);
export type ExtensionPermissionV2 = z.infer<typeof ExtensionPermissionSchema>;

export const PluginEntrySchema = z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    enabled: z.boolean().default(true),
    // Granted permissions (2026-11-12): the grant list lives in the
    // project itself, so a v2 round-trip keeps it — this replaces the
    // `plugins.json` stopgap (`ExtensionPersistence.ts`, deleted).
    // Defaults to [] so projects saved before this field still parse.
    grantedPermissions: z.array(ExtensionPermissionSchema).default([]),
});
export type PluginEntry = z.infer<typeof PluginEntrySchema>;

export const GlixProjectV2Schema = z.object({
    formatVersion: z.literal('2.0.0'),
    meta: z.object({
        name: z.string().default('Untitled'),
        id: z.string().uuid(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
        engineVersion: z.string().min(1),
        resolution: z.object({
            width: z.number().int().positive().default(1280),
            height: z.number().int().positive().default(720),
        }).default({ width: 1280, height: 720 }),
    }),
    settings: z.object({
        startScene: z.string().min(1),
        physics: z.object({
            gravity: z.object({ x: z.number(), y: z.number() }),
        }).default({ gravity: { x: 0, y: 9.8 } }),
        postProcess: z.object({
            bloom: z.boolean().default(true),
            vignette: z.boolean().default(false),
            crt: z.boolean().default(false),
            bloomThreshold: z.number().default(0.8),
            vignetteStrength: z.number().default(0.3),
        }).default({}),
        touchControls: z.enum(['auto', 'always', 'never']).default('auto'),
        mobileController: MobileControllerSchema.default({}),
        renderer: z.enum(['auto', 'webgl2', 'canvas2d']).default('auto'),
        // Scene background fill (Layering, 2026-11-12): the colour the
        // engine clears to and the exporter uses. Templates set a tone
        // matching their ground (farm grass, sky, deep space) so nothing
        // ever shows transparent void. v1 templates carry the same key in
        // settings and migrate.ts passes it through.
        backgroundColor: z.string().default('#12122A'),
        // Viewport framing (Viewport, 2026-11-12): 'expand' (default,
        // Godot-style), 'fit' (letterbox in the scene background colour),
        // 'stretch' (fill by stretching). Optional — the resolver in
        // MgexSchema returns 'expand' when absent.
        viewportMode: ViewportModeSchema.optional(),
    }),
    input: InputMapConfigV2Schema.default({ actions: {}, axes: {} }),
    scenes: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        file: z.string().min(1),
        isStartScene: z.boolean().default(false),
    })).min(1, 'A project needs at least one scene.'),
    prefabs: z.array(z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        file: z.string().min(1),
    })).default([]),
    assets: z.record(AssetRefSchema).default({}),
    plugins: z.array(PluginEntrySchema).default([]),
    workspace: WorkspaceLayoutSchema.default({ activeWorkspace: '2d', dockedPanels: [] }),
}).superRefine((project, ctx) => {
    const starts = project.scenes.filter((s) => s.isStartScene);
    if (starts.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'No start scene is marked. Mark exactly one scene with isStartScene: true.',
            path: ['scenes'],
        });
    } else if (starts.length > 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `More than one start scene is marked (${starts.map((s) => s.id).join(', ')}). Mark exactly one.`,
            path: ['scenes'],
        });
    } else if (starts[0].id !== project.settings.startScene) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `settings.startScene is "${project.settings.startScene}" but the marked start scene is "${starts[0].id}". They must match.`,
            path: ['settings', 'startScene'],
        });
    }
});
export type GlixProjectV2 = z.infer<typeof GlixProjectV2Schema>;

/**
 * Parse `project.json` text. Throws a plain-language Error (never a raw
 * ZodError) so the editor can show it as-is.
 */
export function parseProjectJson(text: string): GlixProjectV2 {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        throw new Error('project.json is not valid JSON. Open the file and fix the syntax, then try again.');
    }
    const result = GlixProjectV2Schema.safeParse(raw);
    if (!result.success) {
        const first = result.error.issues[0];
        const where = first.path.length > 0 ? ` (${first.path.join('.')})` : '';
        throw new Error(`This project file is not a valid Glix v2 project${where}: ${first.message}`);
    }
    return result.data;
}

/** Whole-project size cap (PROJECT_FORMAT_v2.md §1). */
export const MAX_PROJECT_BYTES = 500 * 1024 * 1024;
