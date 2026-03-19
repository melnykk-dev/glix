export class InputManager {
    private keys: Map<string, boolean> = new Map();
    private keysJustPressed: Set<string> = new Set();
    private keysJustReleased: Set<string> = new Set();

    private mouseButtons: Map<number, boolean> = new Map();
    private mouseButtonsJustPressed: Set<number> = new Set();
    private mouseButtonsJustReleased: Set<number> = new Set();

    private mousePosition: { x: number; y: number } = { x: 0, y: 0 };
    private canvas: HTMLCanvasElement;

    // Set by Engine so scripts can call getMouseWorldPosition()
    public cameraPosition: [number, number] = [0, 0];
    public cameraZoom: number = 1;

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
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
    }

    public reset() {
        this.keys.clear();
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
        this.mouseButtons.clear();
        this.mouseButtonsJustPressed.clear();
        this.mouseButtonsJustReleased.clear();
    }

    public update() {
        this.keysJustPressed.clear();
        this.keysJustReleased.clear();
        this.mouseButtonsJustPressed.clear();
        this.mouseButtonsJustReleased.clear();
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        if (!this.keys.get(e.code)) {
            this.keysJustPressed.add(e.code);
        }
        this.keys.set(e.code, true);
    };

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
        this.mouseButtons.set(0, false);
        this.mouseButtonsJustReleased.add(0);
    };

    private handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
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
