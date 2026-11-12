import { InputManager } from './InputManager';

/**
 * Unified input map (ARCHITECTURE.md §4, PROJECT_FORMAT_v2.md §4).
 *
 * Actions resolve from bindings across devices — keyboard, mouse, gamepad,
 * and touch (virtual controls). VirtualGamepad v2 feeds
 * `{ device: 'touch', source: 'pad:a' }` bindings through InputManager's
 * direct input-state path; no synthetic KeyboardEvents exist anywhere in
 * this input stack.
 *
 * Config shapes accepted:
 * - v2: `{ actions: { [action]: { bindings: Binding[] } },
 *         axes: { [axis]: { positive, negative, deadzone } } }`
 * - v1 (legacy, migrated on load): `{ [action]: string[] }` where each
 *   string is a keyboard code → `{ device: 'keyboard', code }`.
 */

export type Binding =
    | { device: 'keyboard'; code: string } // e.code, e.g. 'KeyW', 'Space'
    | { device: 'mouse'; button: number } // 0/1/2
    | { device: 'gamepad'; button: number; pad?: number }
    | { device: 'gamepad'; axis: number; dir: 1 | -1; pad?: number }
    | { device: 'touch'; source: string }; // virtual-control id, e.g. 'pad:a'

export interface ActionDef {
    bindings: Binding[];
}

export interface AxisDef {
    positive: Binding[];
    negative: Binding[];
    deadzone?: number;
}

export interface InputMapConfigV2 {
    actions: Record<string, ActionDef>;
    axes: Record<string, AxisDef>;
}

/** v1 config: action → keyboard codes. */
export type InputMapConfigV1 = Record<string, string[]>;

export type InputMapConfig = InputMapConfigV1 | InputMapConfigV2;

const K = (code: string): Binding => ({ device: 'keyboard', code });
const T = (source: string): Binding => ({ device: 'touch', source });

/**
 * Default actions every template ships (ARCHITECTURE.md §4). Each action
 * binds its keyboard keys AND the VirtualGamepad control that drives it,
 * so touch works with zero project configuration.
 */
const G = (button: number): Binding => ({ device: 'gamepad', button });
const GA = (axis: number, dir: 1 | -1): Binding => ({ device: 'gamepad', axis, dir });

export const DEFAULT_INPUT_MAP: InputMapConfigV2 = {
    actions: {
        move_left: { bindings: [K('ArrowLeft'), K('KeyA'), T('pad:left'), GA(0, -1)] },
        move_right: { bindings: [K('ArrowRight'), K('KeyD'), T('pad:right'), GA(0, 1)] },
        move_up: { bindings: [K('ArrowUp'), K('KeyW'), T('pad:up'), GA(1, -1)] },
        move_down: { bindings: [K('ArrowDown'), K('KeyS'), T('pad:down'), GA(1, 1)] },
        action_primary: { bindings: [K('Space'), T('pad:a'), G(0)] },
        action_secondary: { bindings: [K('ShiftLeft'), T('pad:b'), G(2)] },
        // Named game verbs the quick-action behaviours drive (Behaviors.ts).
        // Keeping them as actions (not raw keys) means a player rebind in
        // Input settings flows into every behaviour and template script
        // that uses them — no behaviour hard-codes a key.
        interact: { bindings: [K('KeyE'), T('pad:a'), G(0)] },
        jump: { bindings: [K('Space'), K('ArrowUp'), K('KeyW'), T('pad:a'), G(0)] },
        fire: { bindings: [K('Space'), K('KeyF'), { device: 'mouse', button: 0 }, T('pad:b'), G(2)] },
        action_tertiary: { bindings: [K('KeyC'), T('pad:x')] },
        action_quaternary: { bindings: [K('KeyV'), T('pad:y')] },
        pause: { bindings: [K('Escape'), K('KeyP'), G(9)] },
        confirm: { bindings: [K('Enter'), K('Space'), T('pad:a'), G(0)] },
        cancel: { bindings: [K('Escape'), T('pad:b'), G(1)] },
    },
    axes: {
        move_x: {
            positive: [K('ArrowRight'), K('KeyD'), T('pad:right'), GA(0, 1)],
            negative: [K('ArrowLeft'), K('KeyA'), T('pad:left'), GA(0, -1)],
            deadzone: 0.2,
        },
        move_y: {
            positive: [K('ArrowUp'), K('KeyW'), T('pad:up'), GA(1, -1)],
            negative: [K('ArrowDown'), K('KeyS'), T('pad:down'), GA(1, 1)],
            deadzone: 0.2,
        },
    },
};

function isV2Config(config: InputMapConfig): config is InputMapConfigV2 {
    const c = config as InputMapConfigV2;
    return !!c && typeof c === 'object' && ('actions' in c || 'axes' in c);
}

function normalizeConfig(config: InputMapConfig): InputMapConfigV2 {
    if (isV2Config(config)) {
        return {
            actions: { ...(config.actions ?? {}) },
            axes: { ...(config.axes ?? {}) },
        };
    }
    // v1 migration: each string code becomes { device: 'keyboard', code }.
    const actions: Record<string, ActionDef> = {};
    for (const [action, codes] of Object.entries(config as InputMapConfigV1)) {
        actions[action] = { bindings: (codes ?? []).map((code) => K(code)) };
    }
    return { actions, axes: {} };
}

export class InputMap {
    private config: InputMapConfigV2;
    private inputManager: InputManager;

    constructor(inputManager: InputManager, config?: InputMapConfig) {
        this.inputManager = inputManager;
        // Project config wins per action; any default action the project
        // does not define falls back to DEFAULT_INPUT_MAP (so touch bindings
        // survive unless the project explicitly overrides that action).
        this.config = config ? this.mergeWithDefaults(normalizeConfig(config)) : { ...DEFAULT_INPUT_MAP, actions: { ...DEFAULT_INPUT_MAP.actions }, axes: { ...DEFAULT_INPUT_MAP.axes } };
    }

    private mergeWithDefaults(project: InputMapConfigV2): InputMapConfigV2 {
        return {
            actions: { ...DEFAULT_INPUT_MAP.actions, ...project.actions },
            axes: { ...DEFAULT_INPUT_MAP.axes, ...project.axes },
        };
    }

    public setConfig(config: InputMapConfig) {
        this.config = this.mergeWithDefaults(normalizeConfig(config));
    }

    /** All bindings currently driving an action (empty array when undefined). */
    public getActionBindings(action: string): Binding[] {
        return this.config.actions[action]?.bindings ?? [];
    }

    /** Action names in the current config (defaults included). */
    public listActions(): string[] {
        return Object.keys(this.config.actions);
    }

    /** Axis names in the current config (defaults included). */
    public listAxes(): string[] {
        return Object.keys(this.config.axes);
    }

    /** A copy of the current config (for the editor / saving to a project). */
    public getConfig(): InputMapConfigV2 {
        const copyBindings = (bs: Binding[]): Binding[] => bs.map((b) => ({ ...b }));
        return {
            actions: Object.fromEntries(
                Object.entries(this.config.actions).map(([k, v]) => [k, { bindings: copyBindings(v.bindings) }]),
            ),
            axes: Object.fromEntries(
                Object.entries(this.config.axes).map(([k, v]) => [
                    k,
                    { positive: copyBindings(v.positive), negative: copyBindings(v.negative), deadzone: v.deadzone },
                ]),
            ),
        };
    }

    /**
     * Replace one action's bindings. Throws a plain-language error on an
     * unknown action name. Used by the InputRebindingPanel.
     */
    public setActionBindings(action: string, bindings: Binding[]): void {
        if (!this.config.actions[action]) {
            throw new Error(`InputMap: no action named "${action}".`);
        }
        this.config.actions[action] = { bindings: bindings.map((b) => ({ ...b })) };
        this.syncAxisSide(action);
    }

    /** Restore one action to its factory default (throws when it has none). */
    public resetActionToDefaults(action: string): void {
        const def = DEFAULT_INPUT_MAP.actions[action];
        if (!def) {
            throw new Error(`InputMap: action "${action}" has no default binding.`);
        }
        this.config.actions[action] = { bindings: def.bindings.map((b) => ({ ...b })) };
        this.syncAxisSide(action);
    }

    /**
     * The move_* actions are the keyboard/touch face of the move_x/move_y
     * axes: the rebinding panel only ever edits actions, never axes. An
     * action rebind must therefore mirror into the matching axis side, or
     * axisValue() would keep answering to the old key while isActionDown()
     * answers to the new one. The axis and its actions carry the same
     * binding set by construction, so the mirror is an exact copy (the
     * axis deadzone is untouched).
     */
    private static readonly ACTION_TO_AXIS: Record<string, { axis: string; side: 'positive' | 'negative' }> = {
        move_left: { axis: 'move_x', side: 'negative' },
        move_right: { axis: 'move_x', side: 'positive' },
        move_up: { axis: 'move_y', side: 'positive' },
        move_down: { axis: 'move_y', side: 'negative' },
    };

    private syncAxisSide(action: string): void {
        const link = InputMap.ACTION_TO_AXIS[action];
        if (!link) return;
        const axis = this.config.axes[link.axis];
        if (!axis) return;
        const bindings = this.config.actions[action]?.bindings ?? [];
        this.config.axes[link.axis] = {
            ...axis,
            [link.side]: bindings.map((b) => ({ ...b })),
        };
    }

    /** Restore every action and axis to factory defaults. */
    public resetAllToDefaults(): void {
        const copyBindings = (bs: Binding[]): Binding[] => bs.map((b) => ({ ...b }));
        this.config = {
            actions: Object.fromEntries(
                Object.entries(DEFAULT_INPUT_MAP.actions).map(([k, v]) => [k, { bindings: copyBindings(v.bindings) }]),
            ),
            axes: Object.fromEntries(
                Object.entries(DEFAULT_INPUT_MAP.axes).map(([k, v]) => [
                    k,
                    { positive: copyBindings(v.positive), negative: copyBindings(v.negative), deadzone: v.deadzone },
                ]),
            ),
        };
    }

    public isActionDown(action: string): boolean {
        return this.getActionBindings(action).some((b) => this.isBindingDown(b));
    }

    public isActionJustPressed(action: string): boolean {
        return this.getActionBindings(action).some((b) => this.isBindingJustPressed(b));
    }

    public isActionJustReleased(action: string): boolean {
        return this.getActionBindings(action).some((b) => this.isBindingJustReleased(b));
    }

    /**
     * Axis value in [-1, 1]: +1 when any positive binding is down, -1 when
     * any negative binding is down (positive wins on conflict). Keyboard and
     * touch bindings are digital; the deadzone applies to gamepad axes only.
     */
    public axisValue(name: string): number {
        const axis = this.config.axes[name];
        if (!axis) return 0;
        // Analog touch axis (floating joystick) wins when deflected past the
        // deadzone — it is continuous, unlike the digital bindings below.
        const touchValue = this.inputManager.getTouchAxis(name);
        const deadzone = axis.deadzone ?? 0.2;
        if (Math.abs(touchValue) > deadzone) {
            const sign = touchValue > 0 ? 1 : -1;
            const scaled = (Math.abs(touchValue) - deadzone) / (1 - deadzone);
            return Math.max(-1, Math.min(1, sign * scaled));
        }
        // Analog gamepad axes contribute their value (deadzone from the def).
        // A binding's activation is axis * dir; positive-list and
        // negative-list activations both read as magnitudes.
        const analog = (bindings: Binding[]): number => {
            let best = 0;
            for (const b of bindings) {
                if (b.device === 'gamepad' && 'axis' in b) {
                    const v = this.inputManager.getGamepadAxis(b.pad ?? 0, b.axis, axis.deadzone) * b.dir;
                    best = Math.max(best, v);
                }
            }
            return best;
        };
        const posAnalog = analog(axis.positive);
        const negAnalog = analog(axis.negative);
        if (posAnalog > 0 || negAnalog > 0) {
            return Math.max(-1, Math.min(1, posAnalog - negAnalog));
        }
        const pos = axis.positive.some((b) => this.isBindingDown(b));
        const neg = axis.negative.some((b) => this.isBindingDown(b));
        if (pos && !neg) return 1;
        if (neg && !pos) return -1;
        return 0;
    }

    // ── Binding evaluation ────────────────────────────────────────────────────

    public isBindingDown(binding: Binding): boolean {
        switch (binding.device) {
            case 'keyboard':
                return this.inputManager.isKeyDown(binding.code);
            case 'mouse':
                return this.inputManager.isMouseButtonDown(binding.button);
            case 'touch':
                return this.inputManager.isTouchSourceDown(binding.source);
            case 'gamepad':
                if ('button' in binding) {
                    return this.inputManager.isGamepadButtonDown(binding.pad ?? 0, binding.button);
                }
                return this.inputManager.getGamepadAxis(binding.pad ?? 0, binding.axis) * binding.dir > 0;
        }
    }

    public isBindingJustPressed(binding: Binding): boolean {
        switch (binding.device) {
            case 'keyboard':
                return this.inputManager.isJustPressed(binding.code);
            case 'mouse':
                return this.inputManager.isMouseButtonJustPressed(binding.button);
            case 'touch':
                return this.inputManager.isTouchSourceJustPressed(binding.source);
            case 'gamepad':
                if ('button' in binding) {
                    return this.inputManager.isGamepadButtonJustPressed(binding.pad ?? 0, binding.button);
                }
                return this.inputManager.isGamepadAxisJustPressed(binding.pad ?? 0, binding.axis, binding.dir);
        }
    }

    public isBindingJustReleased(binding: Binding): boolean {
        switch (binding.device) {
            case 'keyboard':
                return this.inputManager.isJustReleased(binding.code);
            case 'mouse':
                return this.inputManager.isMouseButtonJustReleased(binding.button);
            case 'touch':
                return this.inputManager.isTouchSourceJustReleased(binding.source);
            case 'gamepad':
                if ('button' in binding) {
                    return this.inputManager.isGamepadButtonJustReleased(binding.pad ?? 0, binding.button);
                }
                return this.inputManager.isGamepadAxisJustReleased(binding.pad ?? 0, binding.axis, binding.dir);
        }
    }
}
