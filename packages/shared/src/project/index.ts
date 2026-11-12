/**
 * Format v2 project files (PROJECT_FORMAT_v2.md, binding).
 * `project.json` schema + v1→v2 migrator + `.glix` zip pack/unpack.
 * Note: AssetRefSchema is NOT re-exported here — it lives in
 * `assets/AssetRecord` (the single source of truth, `font` included) and
 * is already exported from `@glix/shared` through that module.
 */
export * from './ProjectV2';
export * from './migrate';
export * from './zip';
