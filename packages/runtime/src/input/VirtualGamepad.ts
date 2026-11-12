/**
 * VirtualGamepad v2 — on-screen touch controls for Glix games.
 *
 * Renders a D-pad (left) + A/B action buttons (right) as a DOM overlay on top
 * of the game canvas. Pressing a button writes DIRECTLY to InputManager's
 * touch-source state (`setTouchSource('pad:a', true)`); the unified InputMap
 * resolves those `{ device: 'touch', source }` bindings into actions
 * (`move_left`, `action_primary`, …) — see ARCHITECTURE.md §4 and
 * MOBILE_SPEC.md §3. No synthetic KeyboardEvent is dispatched anywhere:
 * the v1 event path corrupted justPressed state and double-fired with real
 * keyboards, and is deleted.
 *
 * Mapping is by ACTION NAME, not key code. The pad only knows its control
 * ids (`pad:left`, `pad:a`, …); which action each control drives lives in
 * the InputMap config (defaults in InputMap.ts), so remapping never touches
 * this file.
 *
 * Visibility: 'auto' (default) shows the pad only on touch devices,
 * 'always' forces it (useful for desktop testing), 'never' disables it.
 * The per-project choice lives in `project.settings.mobileController`
 * (legacy: `touchControls`); `VirtualGamepad.fromProjectSettings()` resolves
 * it, including defaults for old projects. A "hide controls" chip lets the
 * player dismiss the pad for the session; a faint "controls" tab brings it back.
 *
 * Layouts (all implemented, MOBILE_SPEC.md §3.2): 'dpad-buttons' (D-pad + A/B),
 * 'joystick-buttons' (floating thumbstick + A/B, outputs the analog
 * `move_x` / `move_y` touch axes as well as digital D-pad sources), and
 * 'dpad-4buttons' (D-pad + A/B/X/Y diamond). `position: 'right'` mirrors
 * the clusters — movement on the right, actions on the left.
 */

import type { InputManager } from './InputManager';

export type VirtualGamepadMode = 'auto' | 'always' | 'never';
export type GamepadLayout = 'dpad-buttons' | 'joystick-buttons' | 'dpad-4buttons';
/** Which side the movement cluster (D-pad / joystick) sits on. */
export type GamepadPosition = 'left' | 'right';

/** Action names each control drives (resolved by InputMap, not by the pad). */
export interface VirtualGamepadMapping {
    left: string;
    right: string;
    up: string;
    down: string;
    /** Primary action — default 'action_primary' (jump / fire in the bundled templates). */
    a: string;
    /** Secondary action — default 'action_secondary'. */
    b: string;
    /** Only used by the 'dpad-4buttons' layout. Default 'action_tertiary'. */
    x: string;
    /** Only used by the 'dpad-4buttons' layout. Default 'action_quaternary'. */
    y: string;
}

export interface VirtualGamepadOptions {
    mode?: VirtualGamepadMode;
    layout?: GamepadLayout;
    mapping?: Partial<VirtualGamepadMapping>;
    /** Diameter of the D-pad buttons in px. Default 60, clamped to 44–88. */
    buttonSize?: number;
    /** Overlay opacity. Default 0.75, clamped to 0.4–1.0. */
    opacity?: number;
    /** navigator.vibrate(10) on press. Default true. */
    haptics?: boolean;
    /** Movement cluster side. Default 'left'. */
    position?: GamepadPosition;
}

const DEFAULT_MAPPING: VirtualGamepadMapping = {
    left: 'move_left',
    right: 'move_right',
    up: 'move_up',
    down: 'move_down',
    a: 'action_primary',
    b: 'action_secondary',
    x: 'action_tertiary',
    y: 'action_quaternary',
};

/** Palette A press colour (raspberry) — never the old indigo. */
const PRESS_BG = 'rgba(233,69,96,0.75)';
const IDLE_BG = 'rgba(12,16,26,0.55)';

/** Fixed control id per button — the `source` in `{ device: 'touch', source }`. */
const BUTTON_SOURCES = {
    left: 'pad:left',
    right: 'pad:right',
    up: 'pad:up',
    down: 'pad:down',
    a: 'pad:a',
    b: 'pad:b',
    x: 'pad:x',
    y: 'pad:y',
} as const;

type PadButton = keyof typeof BUTTON_SOURCES;

/** Joystick travel radius in px (MOBILE_SPEC.md §3.2). */
const JOYSTICK_RADIUS = 96;
/** Directional sources fire once deflection passes this fraction of travel. */
const JOYSTICK_DIGITAL_THRESHOLD = 0.35;

export class VirtualGamepad {
    private inputManager: InputManager;
    private canvas: HTMLCanvasElement;
    private mode: VirtualGamepadMode;
    private layout: GamepadLayout;
    private mapping: VirtualGamepadMapping;
    private buttonSize: number;
    private opacity: number;
    private haptics: boolean;
    private position: GamepadPosition;
    private overlay: HTMLDivElement | null = null;
    private attached = false;
    /** Active pointer id per button element, so multi-touch just works. */
    private activePointers = new Map<HTMLElement, number>();
    private prevTouchAction = '';
    private hidden = false;
    private reShowTab: HTMLDivElement | null = null;
    /** Joystick state (layout 'joystick-buttons' only). */
    private joystickPointerId: number | null = null;
    private joystickBase: HTMLDivElement | null = null;
    private joystickKnob: HTMLDivElement | null = null;
    private joystickCenter: { x: number; y: number } | null = null;
    private joystickDirs = new Set<'left' | 'right' | 'up' | 'down'>();

    constructor(inputManager: InputManager, canvas: HTMLCanvasElement, options: VirtualGamepadOptions = {}) {
        this.inputManager = inputManager;
        this.canvas = canvas;
        this.mode = options.mode ?? 'auto';
        this.layout = options.layout ?? 'dpad-buttons';
        this.mapping = { ...DEFAULT_MAPPING, ...(options.mapping ?? {}) };
        this.buttonSize = Math.max(44, Math.min(88, options.buttonSize ?? 60));
        this.opacity = Math.max(0.4, Math.min(1, options.opacity ?? 0.75));
        this.haptics = options.haptics ?? true;
        this.position = options.position ?? 'left';
    }

    /**
     * Build options from a project's settings object (v1 or v2 shape).
     * Reads `settings.mobileController`; projects saved before it existed
     * fall back to the legacy `settings.touchControls` visibility. Never
     * throws — bad values resolve to the defaults.
     */
    static fromProjectSettings(settings: {
        touchControls?: string;
        mobileController?: Partial<{
            enabled: boolean; visibility: string; layout: string;
            opacity: number; position: string; haptics: boolean;
        }>;
    } | null | undefined): VirtualGamepadOptions {
        const mc = settings?.mobileController;
        const legacy = settings?.touchControls;
        const visibility = mc?.visibility ??
            (legacy === 'always' || legacy === 'never' || legacy === 'auto' ? legacy : undefined) ??
            'auto';
        const layout = mc?.layout === 'joystick-buttons' || mc?.layout === 'dpad-4buttons'
            ? mc.layout : 'dpad-buttons';
        return {
            mode: mc?.enabled === false || legacy === 'never' && !mc
                ? 'never'
                : (visibility as VirtualGamepadMode),
            layout,
            opacity: typeof mc?.opacity === 'number' ? mc.opacity : 0.75,
            position: mc?.position === 'right' ? 'right' : 'left',
            haptics: mc?.haptics ?? true,
        };
    }

    getLayout(): GamepadLayout {
        return this.layout;
    }

    getMode(): VirtualGamepadMode {
        return this.mode;
    }

    getPosition(): GamepadPosition {
        return this.position;
    }

    getOpacity(): number {
        return this.opacity;
    }

    getOptions(): VirtualGamepadOptions {
        return {
            mode: this.mode, layout: this.layout, mapping: { ...this.mapping },
            buttonSize: this.buttonSize, opacity: this.opacity,
            haptics: this.haptics, position: this.position,
        };
    }

    /**
     * Update options live. Layout / position changes rebuild the overlay;
     * mode / opacity apply in place. Safe to call while detached.
     */
    setOptions(options: Partial<VirtualGamepadOptions>): void {
        const rebuild = (options.layout !== undefined && options.layout !== this.layout) ||
            (options.position !== undefined && options.position !== this.position);
        if (options.mode !== undefined) this.mode = options.mode;
        if (options.layout !== undefined) this.layout = options.layout;
        if (options.mapping !== undefined) this.mapping = { ...this.mapping, ...options.mapping };
        if (options.buttonSize !== undefined) this.buttonSize = Math.max(44, Math.min(88, options.buttonSize));
        if (options.opacity !== undefined) this.opacity = Math.max(0.4, Math.min(1, options.opacity));
        if (options.haptics !== undefined) this.haptics = options.haptics;
        if (options.position !== undefined) this.position = options.position;
        if (this.overlay) this.overlay.style.opacity = String(this.opacity);
        if (rebuild && this.attached) {
            const wasHidden = this.hidden;
            this.detach();
            this.attach();
            if (wasHidden) this.setHidden(true);
        } else if (this.attached && !this.shouldShow()) {
            this.detach();
        } else if (!this.attached && this.shouldShow() && !this.hidden) {
            this.attach();
        }
    }

    /** Show the pad (undoes a session hide). */
    show(): void {
        this.setHidden(false);
    }

    /** Hide the pad for the session (re-show tab appears). */
    hide(): void {
        this.setHidden(true);
    }

    /** True when the device has a touch screen / coarse pointer. */
    static isTouchDevice(): boolean {
        if (typeof window === 'undefined') return false;
        try {
            if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        } catch {
            /* matchMedia unavailable — fall through to the other checks */
        }
        return 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0;
    }

    shouldShow(): boolean {
        if (this.mode === 'always') return true;
        if (this.mode === 'never') return false;
        return VirtualGamepad.isTouchDevice();
    }

    isAttached(): boolean {
        return this.attached;
    }

    /** The action each button is intended to drive (InputMap resolves it). */
    getMapping(): VirtualGamepadMapping {
        return { ...this.mapping };
    }

    /** Build the overlay and show it (no-op when it should stay hidden). */
    attach(): void {
        if (this.attached || !this.shouldShow()) return;
        const parent = this.canvas.parentElement;
        if (!parent) return;

        // The overlay is absolutely positioned; make sure the parent can host it.
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }

        // Keep the browser from stealing touches for scroll/zoom/double-tap.
        this.prevTouchAction = this.canvas.style.touchAction;
        this.canvas.style.touchAction = 'none';

        const overlay = document.createElement('div');
        overlay.setAttribute('data-glix-virtual-gamepad', 'true');
        overlay.style.cssText = [
            'position:absolute',
            'inset:0',
            'pointer-events:none',
            'z-index:30',
            'font-family:system-ui,-apple-system,sans-serif',
            '-webkit-user-select:none',
            'user-select:none',
            '-webkit-tap-highlight-color:transparent',
            `opacity:${this.opacity}`,
        ].join(';');

        if (this.layout === 'joystick-buttons') {
            overlay.appendChild(this.buildJoystick());
            overlay.appendChild(this.buildActionButtons());
        } else if (this.layout === 'dpad-4buttons') {
            overlay.appendChild(this.buildDPad());
            overlay.appendChild(this.buildActionButtons4());
        } else {
            overlay.appendChild(this.buildDPad());
            overlay.appendChild(this.buildActionButtons());
        }
        overlay.appendChild(this.buildDismissChip());
        parent.appendChild(overlay);

        this.overlay = overlay;
        this.attached = true;
    }

    /**
     * Hide or show the pad without detaching it. A small dismiss chip on the
     * overlay hides the pad for the session; a faint re-show tab brings it
     * back. The per-project touchControls setting remains the durable toggle.
     */
    setHidden(hide: boolean): void {
        this.hidden = hide;
        if (this.overlay) {
            this.overlay.style.display = hide ? 'none' : '';
        }
        const tab = this.reShowTab;
        if (tab) tab.style.display = hide && this.attached ? 'flex' : 'none';
        if (hide) this.releaseAll();
    }

    isHidden(): boolean {
        return this.hidden;
    }

    /** Remove the overlay and restore the canvas touch-action. */
    detach(): void {
        if (!this.attached) return;
        this.releaseAll();
        this.activePointers.clear();
        if (this.overlay && this.overlay.parentElement) {
            this.overlay.parentElement.removeChild(this.overlay);
        }
        if (this.reShowTab && this.reShowTab.parentElement) {
            this.reShowTab.parentElement.removeChild(this.reShowTab);
        }
        this.overlay = null;
        this.reShowTab = null;
        this.joystickBase = null;
        this.joystickKnob = null;
        this.joystickPointerId = null;
        this.joystickCenter = null;
        this.canvas.style.touchAction = this.prevTouchAction;
        this.attached = false;
        this.hidden = false;
    }

    /** Release every pressed button so no virtual control stays stuck down. */
    private releaseAll(): void {
        this.activePointers.forEach((_pointerId, el) => {
            const source = el.getAttribute('data-glix-source');
            if (source) this.inputManager.setTouchSource(source, false);
            el.style.background = IDLE_BG;
        });
        this.activePointers.clear();
        this.inputManager.releaseAllTouchSources();
        this.releaseJoystick();
    }

    /** Centre the joystick and clear its axes + directional sources. */
    private releaseJoystick(): void {
        if (this.joystickPointerId === null && this.joystickDirs.size === 0) {
            if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
            return;
        }
        this.joystickPointerId = null;
        this.joystickCenter = null;
        for (const dir of this.joystickDirs) {
            this.inputManager.setTouchSource(BUTTON_SOURCES[dir], false);
        }
        this.joystickDirs.clear();
        this.inputManager.setTouchAxis('move_x', 0);
        this.inputManager.setTouchAxis('move_y', 0);
        if (this.joystickBase) this.joystickBase.style.opacity = '0';
        if (this.joystickKnob) this.joystickKnob.style.transform = 'translate(-50%, -50%)';
    }

    // ── Construction ─────────────────────────────────────────────────────────

    /** 'left'/'right' edge CSS for the movement cluster vs the action cluster. */
    private clusterSide(which: 'move' | 'action'): string {
        const moveLeft = this.position === 'left';
        const left = which === 'move' ? moveLeft : !moveLeft;
        return left
            ? 'left:max(18px, env(safe-area-inset-left))'
            : 'right:max(18px, env(safe-area-inset-right))';
    }

    private buildDPad(): HTMLDivElement {
        const s = this.buttonSize;
        const pad = document.createElement('div');
        pad.setAttribute('data-glix-layout', 'dpad');
        pad.style.cssText = [
            'position:absolute',
            this.clusterSide('move'),
            'bottom:max(18px, env(safe-area-inset-bottom))',
            'display:grid',
            'grid-template-columns:repeat(3, auto)',
            'grid-template-rows:repeat(3, auto)',
            'gap:6px',
            'pointer-events:none',
        ].join(';');

        const mk = (label: string, button: PadButton, col: number, row: number): HTMLDivElement => {
            const b = this.buildButton(label, button, s);
            b.style.gridColumn = String(col);
            b.style.gridRow = String(row);
            return b;
        };

        pad.appendChild(mk('▲', 'up', 2, 1));
        pad.appendChild(mk('◀', 'left', 1, 2));
        pad.appendChild(mk('▶', 'right', 3, 2));
        pad.appendChild(mk('▼', 'down', 2, 3));
        return pad;
    }

    private buildActionButtons(): HTMLDivElement {
        const wrap = document.createElement('div');
        wrap.setAttribute('data-glix-layout', 'actions');
        wrap.style.cssText = [
            'position:absolute',
            this.clusterSide('action'),
            'bottom:max(18px, env(safe-area-inset-bottom))',
            'display:flex',
            'align-items:flex-end',
            'gap:14px',
            'pointer-events:none',
        ].join(';');

        wrap.appendChild(this.buildButton('B', 'b', this.buttonSize));
        wrap.appendChild(this.buildButton('A', 'a', this.buttonSize + 12));
        return wrap;
    }

    /** D-pad + A/B/X/Y diamond (Y top, X left, B bottom, A right). */
    private buildActionButtons4(): HTMLDivElement {
        const s = this.buttonSize;
        const wrap = document.createElement('div');
        wrap.setAttribute('data-glix-layout', 'actions-4');
        wrap.style.cssText = [
            'position:absolute',
            this.clusterSide('action'),
            'bottom:max(18px, env(safe-area-inset-bottom))',
            'display:grid',
            'grid-template-columns:repeat(3, auto)',
            'grid-template-rows:repeat(3, auto)',
            'gap:8px',
            'pointer-events:none',
        ].join(';');

        const mk = (label: string, button: PadButton, col: number, row: number, size: number): HTMLDivElement => {
            const b = this.buildButton(label, button, size);
            b.style.gridColumn = String(col);
            b.style.gridRow = String(row);
            return b;
        };

        wrap.appendChild(mk('Y', 'y', 2, 1, s));
        wrap.appendChild(mk('X', 'x', 1, 2, s));
        wrap.appendChild(mk('A', 'a', 3, 2, s + 12));
        wrap.appendChild(mk('B', 'b', 2, 3, s));
        return wrap;
    }

    /**
     * Floating joystick (MOBILE_SPEC.md §3.2): a touch zone on the movement
     * side; the stick base appears where the thumb lands and the knob follows
     * within a 96px travel radius. Outputs the analog `move_x` / `move_y`
     * touch axes, plus digital D-pad sources past 35% deflection so games
     * bound either way keep working. Multi-touch: the stick tracks one
     * pointer id; action buttons track their own.
     */
    private buildJoystick(): HTMLDivElement {
        const zone = document.createElement('div');
        zone.setAttribute('data-glix-layout', 'joystick');
        const side = this.position === 'left' ? 'left:0' : 'right:0';
        zone.style.cssText = [
            'position:absolute',
            side,
            'bottom:0',
            'width:45%',
            'height:65%',
            'pointer-events:auto',
            'touch-action:none',
        ].join(';');

        const base = document.createElement('div');
        base.setAttribute('data-glix-joystick-base', 'true');
        base.style.cssText = [
            'position:absolute',
            'width:110px',
            'height:110px',
            'border-radius:50%',
            'transform:translate(-50%, -50%)',
            'background:rgba(12,16,26,0.45)',
            'border:1.5px solid rgba(255,255,255,0.38)',
            'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
            'opacity:0',
            'pointer-events:none',
            'transition:opacity 0.12s',
        ].join(';');

        const knob = document.createElement('div');
        knob.setAttribute('data-glix-joystick-knob', 'true');
        knob.style.cssText = [
            'position:absolute',
            'left:50%',
            'top:50%',
            'width:48px',
            'height:48px',
            'border-radius:50%',
            'transform:translate(-50%, -50%)',
            `background:${PRESS_BG}`,
            'border:1.5px solid rgba(255,255,255,0.5)',
            'pointer-events:none',
        ].join(';');
        base.appendChild(knob);
        zone.appendChild(base);
        this.joystickBase = base;
        this.joystickKnob = knob;

        const updateStick = (clientX: number, clientY: number): void => {
            if (!this.joystickCenter) return;
            const rect = zone.getBoundingClientRect();
            let dx = clientX - rect.left - this.joystickCenter.x;
            let dy = clientY - rect.top - this.joystickCenter.y;
            const len = Math.hypot(dx, dy);
            if (len > JOYSTICK_RADIUS) {
                dx = (dx / len) * JOYSTICK_RADIUS;
                dy = (dy / len) * JOYSTICK_RADIUS;
            }
            knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            const nx = dx / JOYSTICK_RADIUS;
            const ny = -dy / JOYSTICK_RADIUS; // screen up = +move_y
            this.inputManager.setTouchAxis('move_x', nx);
            this.inputManager.setTouchAxis('move_y', ny);
            const dirs: Array<'left' | 'right' | 'up' | 'down'> = [];
            if (nx < -JOYSTICK_DIGITAL_THRESHOLD) dirs.push('left');
            if (nx > JOYSTICK_DIGITAL_THRESHOLD) dirs.push('right');
            if (ny > JOYSTICK_DIGITAL_THRESHOLD) dirs.push('up');
            if (ny < -JOYSTICK_DIGITAL_THRESHOLD) dirs.push('down');
            for (const dir of ['left', 'right', 'up', 'down'] as const) {
                const on = dirs.includes(dir);
                const was = this.joystickDirs.has(dir);
                if (on && !was) {
                    this.joystickDirs.add(dir);
                    this.inputManager.setTouchSource(BUTTON_SOURCES[dir], true);
                } else if (!on && was) {
                    this.joystickDirs.delete(dir);
                    this.inputManager.setTouchSource(BUTTON_SOURCES[dir], false);
                }
            }
        };

        zone.addEventListener('pointerdown', (e: PointerEvent) => {
            e.preventDefault();
            if (this.joystickPointerId !== null) return;
            const rect = zone.getBoundingClientRect();
            this.joystickPointerId = e.pointerId;
            this.joystickCenter = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            base.style.left = `${this.joystickCenter.x}px`;
            base.style.top = `${this.joystickCenter.y}px`;
            base.style.opacity = '1';
            try { zone.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
            if (this.haptics && navigator.vibrate) {
                try { navigator.vibrate(10); } catch { /* best-effort */ }
            }
        });
        zone.addEventListener('pointermove', (e: PointerEvent) => {
            if (e.pointerId !== this.joystickPointerId) return;
            e.preventDefault();
            updateStick(e.clientX, e.clientY);
        });
        const endStick = (e: PointerEvent) => {
            if (e.pointerId !== this.joystickPointerId) return;
            this.releaseJoystick();
        };
        zone.addEventListener('pointerup', endStick);
        zone.addEventListener('pointercancel', endStick);
        zone.addEventListener('contextmenu', (e) => e.preventDefault());
        return zone;
    }

    private buildButton(label: string, button: PadButton, size: number): HTMLDivElement {
        const source = BUTTON_SOURCES[button];
        const action = this.mapping[button];
        const b = document.createElement('div');
        b.textContent = label;
        b.setAttribute('role', 'button');
        b.setAttribute('aria-label', `Gamepad ${label} (${action})`);
        b.setAttribute('data-glix-source', source);
        b.setAttribute('data-glix-action', action);
        b.style.cssText = [
            `width:${size}px`,
            `height:${size}px`,
            'border-radius:50%',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'font-size:20px',
            'font-weight:700',
            'color:rgba(255,255,255,0.92)',
            'background:rgba(12,16,26,0.55)',
            'border:1.5px solid rgba(255,255,255,0.38)',
            'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
            'pointer-events:auto',
            'touch-action:none',
            'cursor:pointer',
        ].join(';');

        const press = (e: PointerEvent) => {
            e.preventDefault();
            if (this.activePointers.has(b)) return;
            this.activePointers.set(b, e.pointerId);
            b.style.background = PRESS_BG;
            // Direct input-state write — no synthetic KeyboardEvent.
            this.inputManager.setTouchSource(source, true);
            if (this.haptics && navigator.vibrate) {
                try { navigator.vibrate(10); } catch { /* haptics are best-effort */ }
            }
        };
        const release = (e: PointerEvent) => {
            if (this.activePointers.get(b) !== e.pointerId) return;
            this.activePointers.delete(b);
            b.style.background = IDLE_BG;
            this.inputManager.setTouchSource(source, false);
        };

        b.addEventListener('pointerdown', press);
        b.addEventListener('pointerup', release);
        b.addEventListener('pointercancel', release);
        // Finger slid off the button: release so controls can't stick.
        b.addEventListener('pointerleave', (e: PointerEvent) => {
            if (this.activePointers.get(b) === e.pointerId) release(e);
        });
        b.addEventListener('contextmenu', (e) => e.preventDefault());
        return b;
    }

    /** Small chip that hides the pad for the session (re-show tab appears). */
    private buildDismissChip(): HTMLDivElement {
        const chip = document.createElement('div');
        chip.textContent = 'hide controls';
        chip.setAttribute('role', 'button');
        chip.setAttribute('aria-label', 'Hide touch controls');
        chip.style.cssText = [
            'position:absolute',
            'top:max(10px, env(safe-area-inset-top))',
            'left:50%',
            'transform:translateX(-50%)',
            'padding:6px 12px',
            'border-radius:999px',
            'font-size:11px',
            'font-weight:600',
            'letter-spacing:0.06em',
            'text-transform:uppercase',
            'color:rgba(255,255,255,0.65)',
            'background:rgba(12,16,26,0.45)',
            'border:1px solid rgba(255,255,255,0.22)',
            'pointer-events:auto',
            'touch-action:manipulation',
            'cursor:pointer',
        ].join(';');
        chip.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.setHidden(true);
        });
        chip.addEventListener('contextmenu', (e) => e.preventDefault());

        // Faint re-show tab, lives outside the overlay so it survives hiding.
        const tab = document.createElement('div');
        tab.textContent = 'controls';
        tab.setAttribute('role', 'button');
        tab.setAttribute('aria-label', 'Show touch controls');
        tab.style.cssText = [
            'position:absolute',
            'right:max(10px, env(safe-area-inset-right))',
            'bottom:max(10px, env(safe-area-inset-bottom))',
            'display:none',
            'align-items:center',
            'justify-content:center',
            'padding:8px 12px',
            'border-radius:999px',
            'font-size:11px',
            'font-weight:600',
            'letter-spacing:0.06em',
            'text-transform:uppercase',
            'color:rgba(255,255,255,0.6)',
            'background:rgba(12,16,26,0.45)',
            'border:1px solid rgba(255,255,255,0.22)',
            'z-index:31',
            'pointer-events:auto',
            'touch-action:manipulation',
            'cursor:pointer',
        ].join(';');
        tab.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.setHidden(false);
        });
        tab.addEventListener('contextmenu', (e) => e.preventDefault());
        this.reShowTab = tab;
        const parent = this.canvas.parentElement;
        if (parent) parent.appendChild(tab);

        return chip;
    }
}
