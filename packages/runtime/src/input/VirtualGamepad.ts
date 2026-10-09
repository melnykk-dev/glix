/**
 * VirtualGamepad — on-screen touch controls for Glix games.
 *
 * Renders a D-pad (left) + A/B action buttons (right) as a DOM overlay on top
 * of the game canvas. Pressing a button dispatches synthetic KeyboardEvents on
 * `window`, so existing game scripts that read `input.isKeyDown('ArrowLeft')`
 * or `input.isJustPressed('Space')` work unchanged — no script changes needed.
 *
 * Visibility: 'auto' (default) shows the pad only on touch devices,
 * 'always' forces it (useful for desktop testing), 'never' disables it.
 * The per-project choice lives in `project.settings.touchControls`.
 * A "hide controls" chip lets the player dismiss the pad for the session;
 * a faint "controls" tab brings it back.
 */

export type VirtualGamepadMode = 'auto' | 'always' | 'never';

export interface VirtualGamepadMapping {
    left: string;
    right: string;
    up: string;
    down: string;
    /** Primary action — default 'Space' (jump / fire in the bundled templates). */
    a: string;
    /** Secondary action — default 'ShiftLeft'. */
    b: string;
}

export interface VirtualGamepadOptions {
    mode?: VirtualGamepadMode;
    mapping?: Partial<VirtualGamepadMapping>;
    /** Diameter of the D-pad buttons in px. Default 60. */
    buttonSize?: number;
}

const DEFAULT_MAPPING: VirtualGamepadMapping = {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    a: 'Space',
    b: 'ShiftLeft',
};

export class VirtualGamepad {
    private canvas: HTMLCanvasElement;
    private mode: VirtualGamepadMode;
    private mapping: VirtualGamepadMapping;
    private buttonSize: number;
    private overlay: HTMLDivElement | null = null;
    private attached = false;
    /** Active pointer id per button element, so multi-touch just works. */
    private activePointers = new Map<HTMLElement, number>();
    private prevTouchAction = '';
    private hidden = false;
    private reShowTab: HTMLDivElement | null = null;

    constructor(canvas: HTMLCanvasElement, options: VirtualGamepadOptions = {}) {
        this.canvas = canvas;
        this.mode = options.mode ?? 'auto';
        this.mapping = { ...DEFAULT_MAPPING, ...(options.mapping ?? {}) };
        this.buttonSize = options.buttonSize ?? 60;
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
        ].join(';');

        overlay.appendChild(this.buildDPad());
        overlay.appendChild(this.buildActionButtons());
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
        this.canvas.style.touchAction = this.prevTouchAction;
        this.attached = false;
        this.hidden = false;
    }

    /** Release every pressed button so no synthetic key stays stuck down. */
    private releaseAll(): void {
        this.activePointers.forEach((pointerId, el) => {
            const code = el.getAttribute('data-glix-key');
            if (code) this.dispatchKey('keyup', code);
            el.style.background = 'rgba(12,16,26,0.55)';
        });
        this.activePointers.clear();
    }

    // ── Construction ─────────────────────────────────────────────────────────

    private buildDPad(): HTMLDivElement {
        const s = this.buttonSize;
        const pad = document.createElement('div');
        pad.style.cssText = [
            'position:absolute',
            'left:max(18px, env(safe-area-inset-left))',
            'bottom:max(18px, env(safe-area-inset-bottom))',
            'display:grid',
            'grid-template-columns:repeat(3, auto)',
            'grid-template-rows:repeat(3, auto)',
            'gap:6px',
            'pointer-events:none',
        ].join(';');

        const mk = (label: string, code: string, col: number, row: number): HTMLDivElement => {
            const b = this.buildButton(label, code, s);
            b.style.gridColumn = String(col);
            b.style.gridRow = String(row);
            return b;
        };

        pad.appendChild(mk('▲', this.mapping.up, 2, 1));
        pad.appendChild(mk('◀', this.mapping.left, 1, 2));
        pad.appendChild(mk('▶', this.mapping.right, 3, 2));
        pad.appendChild(mk('▼', this.mapping.down, 2, 3));
        return pad;
    }

    private buildActionButtons(): HTMLDivElement {
        const wrap = document.createElement('div');
        wrap.style.cssText = [
            'position:absolute',
            'right:max(18px, env(safe-area-inset-right))',
            'bottom:max(18px, env(safe-area-inset-bottom))',
            'display:flex',
            'align-items:flex-end',
            'gap:14px',
            'pointer-events:none',
        ].join(';');

        wrap.appendChild(this.buildButton('B', this.mapping.b, this.buttonSize));
        wrap.appendChild(this.buildButton('A', this.mapping.a, this.buttonSize + 12));
        return wrap;
    }

    private buildButton(label: string, code: string, size: number): HTMLDivElement {
        const b = document.createElement('div');
        b.textContent = label;
        b.setAttribute('role', 'button');
        b.setAttribute('aria-label', `Gamepad ${label}`);
        b.setAttribute('data-glix-key', code);
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
            b.style.background = 'rgba(99,102,241,0.75)';
            this.dispatchKey('keydown', code);
        };
        const release = (e: PointerEvent) => {
            if (this.activePointers.get(b) !== e.pointerId) return;
            this.activePointers.delete(b);
            b.style.background = 'rgba(12,16,26,0.55)';
            this.dispatchKey('keyup', code);
        };

        b.addEventListener('pointerdown', press);
        b.addEventListener('pointerup', release);
        b.addEventListener('pointercancel', release);
        // Finger slid off the button: release so keys can't stick.
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

    private dispatchKey(type: 'keydown' | 'keyup', code: string): void {
        window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    }
}
