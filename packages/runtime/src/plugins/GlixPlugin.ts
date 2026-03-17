import { Engine } from '../core/Engine';

export interface ComponentDefinition {
    type: string;
    schema: any;
}

export interface SystemDefinition {
    name: string;
    update(world: any, dt: number): void;
}

export interface PanelDefinition {
    name: string;
    component: any;
}

/**
 * GlixPlugin interface for extending the engine and editor.
 */
export interface GlixPlugin {
    name: string;
    version: string;
    onInstall(engine: Engine): void;
    onUninstall(engine: Engine): void;
    components?: ComponentDefinition[];
    systems?: SystemDefinition[];
    editorPanels?: PanelDefinition[];
}
