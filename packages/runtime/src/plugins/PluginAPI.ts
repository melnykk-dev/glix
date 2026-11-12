import type { InstalledExtension } from './ExtensionLoader';

export type { InstalledExtension } from './ExtensionLoader';

/**
 * The editor-facing view of an installed extension (PLUGIN_SPEC.md §5).
 * The v1 GlixPlugin interface (install/uninstall hooks taking the raw
 * Engine) is deleted; `PluginAPI` keeps `getPlugins()` with the loader's
 * `InstalledExtension` shape, and the install/enable/disable/uninstall
 * lifecycle lives in `ExtensionLoader`.
 */
export class PluginAPI {
    private plugins: Map<string, InstalledExtension> = new Map();

    /** Replaces the installed-extension list (called by the loader /
     * editor when extensions change). */
    sync(installed: InstalledExtension[]): void {
        this.plugins = new Map(installed.map((ext) => [ext.id, { ...ext }]));
    }

    /** Gets all installed extensions. */
    getPlugins(): InstalledExtension[] {
        return Array.from(this.plugins.values());
    }

    getPlugin(id: string): InstalledExtension | undefined {
        return this.plugins.get(id);
    }
}
