export class InputManager {
    private keys: Map<string, boolean> = new Map();
    private keysJustPressed: Set<string> = new Set();
    private keysJustReleased: Set<string> = new Set();

    private mouseButtons: Map<number, boolean> = new Map();
    private mouseButtonsJustPressed: Set<number> = new Set();
    private mouseButtonsJustReleased: Set<number> = new Set();

    private mousePosition: { x: number; y: number } = { x: 0, y: 0 };
    private canvas: HTMLCanvasElement;

    /**
     * Mouse-wheel delta accumulated since the last consume. UISystem drains
     * it with consumeWheelDeltaY() (scroll views only); anything else that
     * reads it must consume it too, or one wheel notch would scroll on
     * every fixed step of the frame. Cleared on reset().
     */
    private wheelDeltaY = 0;

    /**
     * Virtual-control state, written directly by VirtualGamepad v2
     * (`{ device: 'touch', source: 'pad:a' }`). This is the ONLY path by
     * which on-screen controls feed input: no synthetic KeyboardEvents are
     * dispatched anywhere (ARCHITECTURE.md §4 — synthetic events corrupt
     * justPressed state and double-fire with real keyboards). Semantics
     * mirror the keyboard maps exactly (justPressed only on the
     * false → true transition, cleared every frame in update()).
     */
    private touchSources: Map<string, boolean> = new Map();
    private touchJustPressed: Set<string> = new Set();
    private touchJustReleased: Set<string> = new Set();

    /**
     * Analog touch axes, written by the floating joystick (`setTouchAxis('move_x', 0.6)`).
     * Values are continuous in [-1, 1]; `InputMap.axisValue` reads them with
     * the axis deadzone applied. Digital D-pad sources are separate — a
     * joystick writes both, so games bound either way keep working.
     */
    private touchAxes: Map<string, number> = new Map();

    // Set by Engine so scripts can call getMouseWorldPosition()
    public cameraPosition: [number, number] = [0, 0];
    public cameraZoom: number = 1;

    // ── Gamepad (ported from the input merge) ───────────────────────────────
    // Standard mapping, polled in update(). Deadzone default 0.2 per
    // ARCHITECTURE.md §4; values are rescaled past the deadzone.
    private gamepadConnected: boolean[] = new Array(4).fill(false);
    private gamepadButtons: boolean[][] = Array.from({ length: 4 }, () => new Array(16).fill(false));
    private gamepadButtonPressed: boolean[][] = Array.from({ length: 4 }, () => new Array(16).fill(false));
    private gamepadButtonReleased: boolean[][] = Array.from({ length: 4 }, () => new Array(16).fill(false));
    private gamepadAxes: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    private gamepadAxesPrev: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    private gamepadAxesDelta: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    private gamepadHaptics: (GamepadHapticActuator | null)[] = new Array(4).fill(null);
    private gamepadDeadzone = 0.2;
    private gamepadSensitivity = 1.0;
    private hapticPatterns: Map<string, HapticPattern> = new Map();

    // ── Gestures (ported from the input merge) ──────────────────────────────
    // Tracked independently of the mouse-emulation path above: every touch
    // identifier gets start position/time, velocity, and movement.
    private gestureTouches: Map<number, TouchInput> = new Map();
    private activeGestures: Gesture[] = [];
    private gestureHistory: Gesture[] = [];
    private lastTapEnd = 0;
    private lastTapPosition: { x: number; y: number } | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.attachListeners();
    }

    private attachListeners() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
        this.canvas.addEventListener('wheel', this.handleWheel, { passive: true });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('gamepadconnected', this.handleGamepadConnected);
        window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }

    public destroy() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('touchstart', this.handleTouchStart);
        this.canvas.removeEventListener('touchend', this.handleTouchEnd);
        this.canvas.removeEventListener('touchmove', this.handleTouchMove);
        this.canvas.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
        window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
    }

    public reset() {
        this.keys.clear();
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
        this.wheelDeltaY = 0;
        this.mouseButtons.clear();
        this.mouseButtonsJustPressed.clear();
        this.mouseButtonsJustReleased.clear();
        this.touchSources.clear();
        this.touchJustPressed.clear();
        this.touchJustReleased.clear();
        this.touchAxes.clear();
        for (let i = 0; i < 4; i++) {
            this.gamepadButtonPressed[i].fill(false);
            this.gamepadButtonReleased[i].fill(false);
        }
        this.gestureTouches.clear();
        this.activeGestures = [];
    }

    public update() {
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
        this.mouseButtonsJustPressed.clear();
        this.mouseButtonsJustReleased.clear();
        this.touchJustPressed.clear();
        this.touchJustReleased.clear();
        for (let i = 0; i < 4; i++) {
            this.gamepadButtonPressed[i].fill(false);
            this.gamepadButtonReleased[i].fill(false);
        }
        this.activeGestures = [];
        this.updateGamepads();
        this.checkLongPressGestures();
    }

    // ── Virtual controls (touch sources) ──────────────────────────────────────

    /**
     * Direct input-state write for a virtual control, e.g.
     * `setTouchSource('pad:a', true)`. Called by VirtualGamepad only — never
     * by game code. Mirrors handleKeyDown/handleKeyUp semantics so
     * justPressed/justReleased behave identically to keyboard input.
     */
    public setTouchSource(source: string, down: boolean): void {
        if (down) {
            if (!this.touchSources.get(source)) {
                this.touchJustPressed.add(source);
            }
            this.touchSources.set(source, true);
        } else {
            this.touchSources.set(source, false);
            this.touchJustReleased.add(source);
        }
    }

    /** Release every held virtual control (hide/detach/scene switch) — no stuck keys. */
    public releaseAllTouchSources(): void {
        this.touchSources.forEach((down, source) => {
            if (down) {
                this.touchSources.set(source, false);
                this.touchJustReleased.add(source);
            }
        });
    }

    public isTouchSourceDown(source: string): boolean {
        return !!this.touchSources.get(source);
    }

    public isTouchSourceJustPressed(source: string): boolean {
        return this.touchJustPressed.has(source);
    }

    public isTouchSourceJustReleased(source: string): boolean {
        return this.touchJustReleased.has(source);
    }

    /** Write an analog touch axis value (joystick), clamped to [-1, 1]. */
    public setTouchAxis(name: string, value: number): void {
        const v = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
        if (v === 0) this.touchAxes.delete(name);
        else this.touchAxes.set(name, v);
    }

    /** Current analog touch axis value, 0 when untouched. */
    public getTouchAxis(name: string): number {
        return this.touchAxes.get(name) ?? 0;
    }

    /** Release every analog touch axis (joystick released / hidden / detached). */
    public releaseAllTouchAxes(): void {
        this.touchAxes.clear();
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!this.keys.get(e.code)) {
            this.keysJustPressed.add(e.code);
        }
        this.keys.set(e.code, true);
    };

    private handleWheel = (e: WheelEvent) => {
        this.wheelDeltaY += e.deltaY;
    };

    /**
     * Drain the accumulated wheel delta (0 when nothing scrolled) and reset
     * it, so a single wheel notch is applied exactly once even when several
     * fixed steps run in one frame.
     */
    public consumeWheelDeltaY(): number {
        const d = this.wheelDeltaY;
        this.wheelDeltaY = 0;
        return d;
    }

    /**
     * True once when the key was just pressed, and removes it from the
     * just-pressed set — so a consumer (e.g. a focused textbox) that runs
     * in the fixed step cannot insert the same keystroke on every step of
     * the frame. Other readers keep using isJustPressed().
     */
    public consumeJustPressed(code: string): boolean {
        if (!this.keysJustPressed.has(code)) return false;
        this.keysJustPressed.delete(code);
        return true;
    }

    private handleKeyUp = (e: KeyboardEvent) => {
        this.keys.set(e.code, false);
        this.keysJustReleased.add(e.code);
    };

    private handleMouseDown = (e: MouseEvent) => {
        if (!this.mouseButtons.get(e.button)) {
            this.mouseButtonsJustPressed.add(e.button);
        }
        this.mouseButtons.set(e.button, true);
        this.updateMousePosition(e.clientX, e.clientY);
    };

    private handleMouseUp = (e: MouseEvent) => {
        this.mouseButtons.set(e.button, false);
        this.mouseButtonsJustReleased.add(e.button);
    };

    private handleMouseMove = (e: MouseEvent) => {
        this.updateMousePosition(e.clientX, e.clientY);
    };

    private handleTouchStart = (e: TouchEvent) => {
        e.preventDefault();
        for (const touch of Array.from(e.changedTouches)) {
            this.trackTouchStart(touch);
        }
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            this.updateMousePosition(touch.clientX, touch.clientY);
            if (!this.mouseButtons.get(0)) {
                this.mouseButtonsJustPressed.add(0);
            }
            this.mouseButtons.set(0, true);
        }
    };

    private handleTouchEnd = (e: TouchEvent) => {
        e.preventDefault();
        for (const touch of Array.from(e.changedTouches)) {
            this.trackTouchEnd(touch);
        }
        this.mouseButtons.set(0, false);
        this.mouseButtonsJustReleased.add(0);
    };

    private handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        for (const touch of Array.from(e.changedTouches)) {
            this.trackTouchMove(touch);
        }
        if (e.touches.length > 0) {
            const touch = e.touches[0];
            this.updateMousePosition(touch.clientX, touch.clientY);
        }
    };

    private updateMousePosition(clientX: number, clientY: number) {
        const rect = this.canvas.getBoundingClientRect();
        this.mousePosition.x = clientX - rect.left;
        this.mousePosition.y = clientY - rect.top;
    }


    // ── Gamepad ─────────────────────────────────────────────────────────────

    private handleGamepadConnected = (e: GamepadEvent): void => {
        const pad = e.gamepad;
        if (pad.index < 4) {
            this.gamepadConnected[pad.index] = true;
            this.gamepadHaptics[pad.index] = pad.vibrationActuator ?? null;
        }
    };

    private handleGamepadDisconnected = (e: GamepadEvent): void => {
        const pad = e.gamepad;
        if (pad.index < 4) {
            this.gamepadConnected[pad.index] = false;
            this.gamepadHaptics[pad.index] = null;
            this.gamepadButtons[pad.index].fill(false);
            this.gamepadAxes[pad.index].fill(0);
        }
    };

    /** Poll all gamepads (standard mapping). Runs once per frame in update(). */
    private updateGamepads(): void {
        const gamepads = navigator.getGamepads();
        for (let i = 0; i < 4; i++) {
            const gamepad = gamepads[i];
            if (!gamepad) {
                this.gamepadConnected[i] = false;
                continue;
            }
            if (!this.gamepadConnected[i]) {
                this.gamepadConnected[i] = true;
                this.gamepadHaptics[i] = gamepad.vibrationActuator ?? null;
            }
            for (let j = 0; j < Math.min(gamepad.buttons.length, 16); j++) {
                const pressed = gamepad.buttons[j].pressed;
                const wasPressed = this.gamepadButtons[i][j];
                this.gamepadButtons[i][j] = pressed;
                if (pressed && !wasPressed) this.gamepadButtonPressed[i][j] = true;
                else if (!pressed && wasPressed) this.gamepadButtonReleased[i][j] = true;
            }
            for (let j = 0; j < Math.min(gamepad.axes.length, 4); j++) {
                this.gamepadAxesPrev[i][j] = this.gamepadAxes[i][j];
                let value = gamepad.axes[j];
                if (Math.abs(value) < this.gamepadDeadzone) {
                    value = 0;
                } else {
                    // Rescale past the deadzone so full deflection is still 1.
                    const sign = Math.sign(value);
                    value = sign * (Math.abs(value) - this.gamepadDeadzone) / (1 - this.gamepadDeadzone);
                }
                value *= this.gamepadSensitivity;
                this.gamepadAxesDelta[i][j] = value - this.gamepadAxes[i][j];
                this.gamepadAxes[i][j] = value;
            }
        }
    }

    public isGamepadConnected(gamepadIndex: number): boolean {
        return !!this.gamepadConnected[gamepadIndex];
    }

    public isGamepadButtonDown(gamepadIndex: number, buttonIndex: number): boolean {
        return !!this.gamepadButtons[gamepadIndex]?.[buttonIndex];
    }

    public isGamepadButtonJustPressed(gamepadIndex: number, buttonIndex: number): boolean {
        return !!this.gamepadButtonPressed[gamepadIndex]?.[buttonIndex];
    }

    public isGamepadButtonJustReleased(gamepadIndex: number, buttonIndex: number): boolean {
        return !!this.gamepadButtonReleased[gamepadIndex]?.[buttonIndex];
    }

    /**
     * Gamepad axis in [-1, 1] with the default deadzone applied (and
     * rescaled). Pass `deadzone` to honour a per-axis override.
     */
    public getGamepadAxis(gamepadIndex: number, axisIndex: number, deadzone?: number): number {
        const raw = this.gamepadAxes[gamepadIndex]?.[axisIndex] ?? 0;
        if (deadzone === undefined || deadzone === this.gamepadDeadzone) return raw;
        if (Math.abs(raw) < deadzone) return 0;
        const sign = Math.sign(raw);
        return sign * (Math.abs(raw) - deadzone) / (1 - deadzone);
    }

    public getGamepadAxisDelta(gamepadIndex: number, axisIndex: number): number {
        return this.gamepadAxesDelta[gamepadIndex]?.[axisIndex] ?? 0;
    }

    /** Just crossed the deadzone in the given direction this frame. */
    public isGamepadAxisJustPressed(gamepadIndex: number, axisIndex: number, dir: 1 | -1): boolean {
        const prev = this.gamepadAxesPrev[gamepadIndex]?.[axisIndex] ?? 0;
        const cur = this.gamepadAxes[gamepadIndex]?.[axisIndex] ?? 0;
        return cur * dir > 0 && prev * dir <= 0;
    }

    public isGamepadAxisJustReleased(gamepadIndex: number, axisIndex: number, dir: 1 | -1): boolean {
        const prev = this.gamepadAxesPrev[gamepadIndex]?.[axisIndex] ?? 0;
        const cur = this.gamepadAxes[gamepadIndex]?.[axisIndex] ?? 0;
        return cur * dir <= 0 && prev * dir > 0;
    }

    public setGamepadDeadzone(deadzone: number): void {
        this.gamepadDeadzone = Math.max(0, Math.min(0.9, deadzone));
    }

    public setGamepadSensitivity(sensitivity: number): void {
        this.gamepadSensitivity = sensitivity;
    }

    // ── Haptics ─────────────────────────────────────────────────────────────

    public createHapticPattern(name: string, pattern: HapticPattern): void {
        this.hapticPatterns.set(name, pattern);
    }

    /**
     * Rumble via the standard dual-rumble actuator. `intensity` maps to both
     * motors; `pulse`/`ramp` repeat the effect over `duration`.
     */
    public playHapticPattern(name: string, gamepadIndex = 0): void {
        const pattern = this.hapticPatterns.get(name);
        if (!pattern) return;
        this.vibrateGamepad(gamepadIndex, pattern.intensity, pattern.intensity, pattern.duration);
    }

    public vibrateGamepad(gamepadIndex: number, weakMagnitude: number, strongMagnitude: number, durationMs: number): void {
        const actuator = this.gamepadHaptics[gamepadIndex];
        if (!actuator || typeof actuator.playEffect !== 'function') return;
        actuator.playEffect('dual-rumble', {
            duration: durationMs,
            weakMagnitude: Math.max(0, Math.min(1, weakMagnitude)),
            strongMagnitude: Math.max(0, Math.min(1, strongMagnitude)),
        }).catch(() => { /* actuator busy / unsupported */ });
    }

    // ── Gestures ────────────────────────────────────────────────────────────

    public getActiveGestures(): Gesture[] {
        return [...this.activeGestures];
    }

    public getGestureHistory(): Gesture[] {
        return [...this.gestureHistory];
    }

    private pushGesture(gesture: Gesture): void {
        gesture.recognized = true;
        this.activeGestures.push(gesture);
        this.gestureHistory.push(gesture);
        if (this.gestureHistory.length > 20) this.gestureHistory.shift();
    }

    private trackTouchStart(touch: Touch): void {
        this.gestureTouches.set(touch.identifier, {
            id: touch.identifier,
            position: { x: touch.clientX, y: touch.clientY },
            startPosition: { x: touch.clientX, y: touch.clientY },
            startTime: performance.now(),
            active: true,
            touchCount: this.gestureTouches.size + 1,
            velocity: { x: 0, y: 0 },
        });
    }

    private trackTouchMove(touch: Touch): void {
        const tracked = this.gestureTouches.get(touch.identifier);
        if (!tracked) return;
        const now = performance.now();
        const dt = Math.max(1, now - (tracked.lastMoveTime ?? tracked.startTime));
        tracked.velocity = {
            x: ((touch.clientX - tracked.position.x) / dt) * 1000,
            y: ((touch.clientY - tracked.position.y) / dt) * 1000,
        };
        tracked.position = { x: touch.clientX, y: touch.clientY };
        tracked.lastMoveTime = now;

        // Pan: sustained movement past 10px.
        const moved = Math.hypot(
            tracked.position.x - tracked.startPosition.x,
            tracked.position.y - tracked.startPosition.y);
        if (moved > 10 && !this.activeGestures.some((g) => g.type === 'pan')) {
            this.pushGesture({
                type: 'pan',
                startTime: tracked.startTime,
                position: { ...tracked.position },
                touches: [tracked],
                delta: { x: tracked.position.x - tracked.startPosition.x, y: tracked.position.y - tracked.startPosition.y },
                completed: false,
                recognized: false,
            });
        }

        // Pinch: two active touches, scale from start distance.
        if (this.gestureTouches.size === 2) {
            const [a, b] = [...this.gestureTouches.values()];
            const startDist = Math.hypot(
                a.startPosition.x - b.startPosition.x,
                a.startPosition.y - b.startPosition.y);
            const curDist = Math.hypot(
                a.position.x - b.position.x,
                a.position.y - b.position.y);
            if (startDist > 0) {
                const scale = curDist / startDist;
                const existing = this.activeGestures.find((g) => g.type === 'pinch');
                if (existing) {
                    existing.scale = scale;
                } else {
                    this.pushGesture({
                        type: 'pinch',
                        startTime: Math.min(a.startTime, b.startTime),
                        position: { ...a.position },
                        touches: [a, b],
                        scale,
                        completed: false,
                        recognized: false,
                    });
                }
            }
        }
    }

    private trackTouchEnd(touch: Touch): void {
        const tracked = this.gestureTouches.get(touch.identifier);
        if (!tracked) return;
        this.gestureTouches.delete(touch.identifier);
        const now = performance.now();
        const duration = now - tracked.startTime;
        const movement = Math.hypot(
            tracked.position.x - tracked.startPosition.x,
            tracked.position.y - tracked.startPosition.y);
        const speed = Math.hypot(tracked.velocity?.x ?? 0, tracked.velocity?.y ?? 0);

        if (duration <= 300 && movement <= 10) {
            // Tap — and a second tap within 300ms near the same spot is a double tap.
            if (this.lastTapPosition && now - this.lastTapEnd < 300 &&
                Math.hypot(tracked.position.x - this.lastTapPosition.x,
                           tracked.position.y - this.lastTapPosition.y) <= 20) {
                this.pushGesture({
                    type: 'double_tap',
                    startTime: now,
                    position: { ...tracked.position },
                    touches: [tracked],
                    completed: true,
                    recognized: false,
                });
                this.lastTapEnd = 0;
                this.lastTapPosition = null;
            } else {
                this.pushGesture({
                    type: 'tap',
                    startTime: tracked.startTime,
                    position: { ...tracked.position },
                    touches: [tracked],
                    completed: true,
                    recognized: false,
                });
                this.lastTapEnd = now;
                this.lastTapPosition = { ...tracked.position };
            }
        } else if (speed >= 500) {
            this.pushGesture({
                type: 'swipe',
                startTime: tracked.startTime,
                position: { ...tracked.position },
                touches: [tracked],
                velocity: { ...(tracked.velocity ?? { x: 0, y: 0 }) },
                completed: true,
                recognized: false,
            });
        }
    }

    /** Long press is time-based, so it is checked every frame in update(). */
    private checkLongPressGestures(): void {
        const now = performance.now();
        for (const tracked of this.gestureTouches.values()) {
            if (this.activeGestures.some((g) => g.type === 'long_press')) continue;
            const duration = now - tracked.startTime;
            const movement = Math.hypot(
                tracked.position.x - tracked.startPosition.x,
                tracked.position.y - tracked.startPosition.y);
            if (duration >= 1000 && movement <= 10) {
                this.pushGesture({
                    type: 'long_press',
                    startTime: tracked.startTime,
                    position: { ...tracked.position },
                    touches: [tracked],
                    completed: true,
                    recognized: false,
                });
            }
        }
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────

    public isKeyDown(code: string): boolean {
        return !!this.keys.get(code);
    }

    public isJustPressed(code: string): boolean {
        return this.keysJustPressed.has(code);
    }

    public isJustReleased(code: string): boolean {
        return this.keysJustReleased.has(code);
    }

    // ── Mouse ─────────────────────────────────────────────────────────────────

    public isMouseButtonDown(button: number): boolean {
        return !!this.mouseButtons.get(button);
    }

    /** Alias: is mouse button currently held */
    public isMouseDown(button: number): boolean {
        return this.isMouseButtonDown(button);
    }

    public isMouseButtonJustPressed(button: number): boolean {
        return this.mouseButtonsJustPressed.has(button);
    }

    /** Alias used by many behavior scripts */
    public isMousePressed(button: number): boolean {
        return this.isMouseButtonJustPressed(button);
    }

    public isMouseButtonJustReleased(button: number): boolean {
        return this.mouseButtonsJustReleased.has(button);
    }

    /** Mouse position in canvas pixels */
    public getMousePosition() {
        return { ...this.mousePosition };
    }

    /**
     * Mouse position in world space.
     * Engine must keep cameraPosition and cameraZoom on this instance in sync.
     */
    public getMouseWorldPosition(): { x: number; y: number } {
        const canvas = this.canvas;
        const aspect = canvas.width / canvas.height;
        const worldSize = 10 / this.cameraZoom;

        const clipX = (this.mousePosition.x / canvas.width) * 2 - 1;
        const clipY = -((this.mousePosition.y / canvas.height) * 2 - 1);

        return {
            x: clipX * worldSize * aspect + this.cameraPosition[0],
            y: clipY * worldSize + this.cameraPosition[1],
        };
    }
}

interface TouchInput {
    id: number;
    position: { x: number; y: number };
    startPosition: { x: number; y: number };
    startTime: number;
    lastMoveTime?: number;
    active: boolean;
    touchCount: number;
    velocity?: { x: number; y: number };
}

export type GestureType = 'tap' | 'double_tap' | 'pinch' | 'swipe' | 'pan' | 'long_press';

export interface Gesture {
    type: GestureType;
    startTime: number;
    position: { x: number; y: number };
    touches: TouchInput[];
    velocity?: { x: number; y: number };
    delta?: { x: number; y: number };
    scale?: number;
    completed: boolean;
    recognized: boolean;
}

export interface HapticPattern {
    duration: number;
    intensity: number;
    frequency?: number;
    type: 'constant' | 'pulse' | 'ramp';
}
