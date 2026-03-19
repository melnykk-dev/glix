import { z } from 'zod';

export const AssetSchema = z.object({
    id: z.string(),
    type: z.enum(['texture', 'audio', 'spriteatlas', 'tileset']),
    name: z.string(),
    mimeType: z.string(),
    data: z.string(), // base64 data URL
});

export const EntitySchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    components: z.record(z.any()), // Map of ComponentType -> ComponentData
});

export const SceneSchema = z.object({
    id: z.string(),
    name: z.string(),
    entities: z.array(EntitySchema),
});

export const MgexSchema = z.object({
    version: z.string(),
    meta: z.object({
        name: z.string(),
        resolution: z.object({
            width: z.number(),
            height: z.number(),
        }),
    }),
    assets: z.record(AssetSchema),
    prefabs: z.record(EntitySchema).default({}),
    scenes: z.record(SceneSchema),
    settings: z.object({
        startScene: z.string(),
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
    }),
});

export type AssetDef = z.infer<typeof AssetSchema>;
export type EntityDef = z.infer<typeof EntitySchema>;
export type SceneDef = z.infer<typeof SceneSchema>;
export type MgexFile = z.infer<typeof MgexSchema>;
