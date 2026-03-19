import { Engine } from '../core/Engine';
import { GlixPlugin } from './GlixPlugin';

export class PluginAPI {
    private plugins: Map<string, GlixPlugin> = new Map();

    constructor(private engine: Engine) { }

    /**
     * Registers a plugin with the engine.
     * @param plugin The plugin to register.
     */
    registerPlugin(plugin: GlixPlugin): void {
        if (this.plugins.has(plugin.name)) {
            console.warn(`Plugin "${plugin.name}" is already registered.`);
            return;
        }

        this.plugins.set(plugin.name, plugin);
        plugin.onInstall(this.engine);

        console.log(`Plugin "${plugin.name}" (v${plugin.version}) registered.`);
    }

    /**
     * Unregisters a plugin from the engine.
     * @param name The name of the plugin to unregister.
     */
    unregisterPlugin(name: string): void {
        const plugin = this.plugins.get(name);
        if (plugin) {
            plugin.onUninstall(this.engine);
            this.plugins.delete(name);
            console.log(`Plugin "${name}" unregistered.`);
        }
    }

    /**
     * Gets all registered plugins.
     */
    getPlugins(): GlixPlugin[] {
        return Array.from(this.plugins.values());
    }
}
