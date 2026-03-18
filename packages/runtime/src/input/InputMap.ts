import { InputManager } from './InputManager';

export interface InputMapConfig {
    [action: string]: string[];
}

export class InputMap {
    private config: InputMapConfig = {};
    private inputManager: InputManager;

    constructor(inputManager: InputManager, config?: InputMapConfig) {
        this.inputManager = inputManager;
        if (config) {
            this.config = config;
        }
    }

    public setConfig(config: InputMapConfig) {
        this.config = config;
    }

    public isActionDown(action: string): boolean {
        const keys = this.config[action];
        if (!keys) return false;
        return keys.some((key) => this.inputManager.isKeyDown(key));
    }

    public isActionJustPressed(action: string): boolean {
        const keys = this.config[action];
        if (!keys) return false;
        return keys.some((key) => this.inputManager.isJustPressed(key));
    }

    public isActionJustReleased(action: string): boolean {
        const keys = this.config[action];
        if (!keys) return false;
        return keys.some((key) => this.inputManager.isJustReleased(key));
    }
}
