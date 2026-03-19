import { Vec2, Vec3 } from '../math';

/**
 * Advanced Input System with gamepad support, touch controls, gesture recognition,
 * advanced input mapping, and haptic feedback.
 */
export class AdvancedInputSystem {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;

    // Mouse and keyboard state
    private mousePosition: Vec2 = Vec2.fromValues(0, 0);
    private mouseDelta: Vec2 = Vec2.fromValues(0, 0);
    private mouseButtons: boolean[] = new Array(5).fill(false);
    private mouseButtonPressed: boolean[] = new Array(5).fill(false);
    private mouseButtonReleased: boolean[] = new Array(5).fill(false);
    private mouseWheelDelta: number = 0;

    private keys: boolean[] = new Array(256).fill(false);
    private keyPressed: boolean[] = new Array(256).fill(false);
    private keyReleased: boolean[] = new Array(256).fill(false);

    // Gamepad support
    private gamepads: (Gamepad | null)[] = new Array(4).fill(null);
    private gamepadButtons: boolean[][] = Array.from({ length: 4 }, () => new Array(16).fill(false));
    private gamepadButtonPressed: boolean[][] = Array.from({ length: 4 }, () => new Array(16).fill(false));
    private gamepadButtonReleased: boolean[][] = Array.from({ length: 4 }, () => new Array(16).fill(false));
    private gamepadAxes: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    private gamepadAxesDelta: number[][] = Array.from({ length: 4 }, () => new Array(4).fill(0));
    private gamepadConnected: boolean[] = new Array(4).fill(false);
    private gamepadHaptics: GamepadHapticActuator[] = [];

    // Touch support
    private touches: TouchInput[] = [];
    private touchStartPositions: Map<number, Vec2> = new Map();
    private touchVelocities: Map<number, Vec2> = new Map();
    private maxTouches: number = 10;

    // Gesture recognition
    private gestureRecognizers: GestureRecognizer[] = [];
    private activeGestures: Gesture[] = [];
    private gestureHistory: Gesture[] = [];

    // Advanced input mapping
    private inputMaps: Map<string, InputMap> = new Map();
    private activeInputMap: string = 'default';
    private inputActions: Map<string, InputAction> = new Map();
    private actionStates: Map<string, ActionState> = new Map();

    // Input recording and playback
    private recording: boolean = false;
    private playback: boolean = false;
    private recordedInputs: RecordedInput[] = [];
    private playbackIndex: number = 0;
    private playbackStartTime: number = 0;

    // Haptic feedback
    private hapticPatterns: Map<string, HapticPattern> = new Map();

    // Input smoothing and deadzones
    private mouseSmoothing: number = 0.1;
    private gamepadDeadzone: number = 0.1;
    private gamepadSensitivity: number = 1.0;
    private keyRepeatDelay: number = 500;
    private keyRepeatRate: number = 50;

    // Advanced features
    private inputPrediction: boolean = false;
    private predictedInputs: PredictedInput[] = [];
    private inputBuffering: boolean = false;
    private inputBuffer: BufferedInput[] = [];
    private bufferSize: number = 60; // 1 second at 60fps

    // Accessibility
    private stickyKeys: boolean = false;
    private slowKeys: boolean = false;
    private slowKeysDelay: number = 1000;
    private bounceKeys: boolean = false;
    private bounceKeysDelay: number = 500;

    // Text input
    private textInputBuffer: string = '';
    private textComposition: string = '';
    private imeActive: boolean = false;

    constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
        this.canvas = canvas;
        this.gl = gl;
        this.initializeEventListeners();
        this.initializeDefaultInputMap();
        this.initializeGestureRecognizers();
        console.log('[AdvancedInputSystem] Advanced input system initialized');
    }

    private initializeEventListeners(): void {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Keyboard events
        window.addEventListener('keydown', this.onKeyDown.bind(this));
        window.addEventListener('keyup', this.onKeyUp.bind(this));
        window.addEventListener('keypress', this.onKeyPress.bind(this));

        // Gamepad events
        window.addEventListener('gamepadconnected', this.onGamepadConnected.bind(this));
        window.addEventListener('gamepaddisconnected', this.onGamepadDisconnected.bind(this));

        // Touch events
        this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
        this.canvas.addEventListener('touchcancel', this.onTouchCancel.bind(this), { passive: false });

        // Pointer events (for better touch/mouse unification)
        this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
        this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this));

        // Focus and visibility events
        window.addEventListener('focus', this.onWindowFocus.bind(this));
        window.addEventListener('blur', this.onWindowBlur.bind(this));
        document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));

        // Text input events
        window.addEventListener('compositionstart', this.onCompositionStart.bind(this));
        window.addEventListener('compositionupdate', this.onCompositionUpdate.bind(this));
        window.addEventListener('compositionend', this.onCompositionEnd.bind(this));
    }

    private initializeDefaultInputMap(): void {
        const defaultMap: InputMap = {
            name: 'default',
            actions: new Map([
                ['move_left', { keys: ['KeyA', 'ArrowLeft'], gamepadButtons: [14], gamepadAxes: [{ axis: 0, negative: true }] }],
                ['move_right', { keys: ['KeyD', 'ArrowRight'], gamepadButtons: [15], gamepadAxes: [{ axis: 0, negative: false }] }],
                ['move_up', { keys: ['KeyW', 'ArrowUp'], gamepadButtons: [12], gamepadAxes: [{ axis: 1, negative: true }] }],
                ['move_down', { keys: ['KeyS', 'ArrowDown'], gamepadButtons: [13], gamepadAxes: [{ axis: 1, negative: false }] }],
                ['jump', { keys: ['Space'], gamepadButtons: [0] }],
                ['attack', { keys: ['KeyJ', 'Enter'], gamepadButtons: [2] }],
                ['pause', { keys: ['Escape'], gamepadButtons: [9] }],
                ['interact', { keys: ['KeyE'], gamepadButtons: [1] }],
                ['sprint', { keys: ['ShiftLeft'], gamepadButtons: [4] }],
                ['crouch', { keys: ['ControlLeft'], gamepadButtons: [6] }]
            ]),
            axes: new Map([
                ['look_x', { mouseAxis: 0, gamepadAxes: [2], sensitivity: 1.0, deadzone: 0.1 }],
                ['look_y', { mouseAxis: 1, gamepadAxes: [3], sensitivity: 1.0, deadzone: 0.1, invert: true }],
                ['move_x', { keys: ['KeyA', 'KeyD'], gamepadAxes: [0], sensitivity: 1.0 }],
                ['move_y', { keys: ['KeyW', 'KeyS'], gamepadAxes: [1], sensitivity: 1.0, invert: true }]
            ])
        };

        this.inputMaps.set('default', defaultMap);
    }

    private initializeGestureRecognizers(): void {
        // Tap gesture
        this.gestureRecognizers.push({
            type: 'tap',
            minTouches: 1,
            maxTouches: 1,
            maxDuration: 300,
            maxMovement: 10,
            onRecognized: (gesture) => {
                this.activeGestures.push({ ...gesture, recognized: true });
            }
        });

        // Double tap gesture
        this.gestureRecognizers.push({
            type: 'double_tap',
            minTouches: 1,
            maxTouches: 1,
            maxDuration: 500,
            maxMovement: 20,
            requireDouble: true,
            onRecognized: (gesture) => {
                this.activeGestures.push({ ...gesture, recognized: true });
            }
        });

        // Pinch gesture
        this.gestureRecognizers.push({
            type: 'pinch',
            minTouches: 2,
            maxTouches: 2,
            onRecognized: (gesture) => {
                this.activeGestures.push({ ...gesture, recognized: true });
            }
        });

        // Swipe gesture
        this.gestureRecognizers.push({
            type: 'swipe',
            minTouches: 1,
            maxTouches: 1,
            minVelocity: 500,
            onRecognized: (gesture) => {
                this.activeGestures.push({ ...gesture, recognized: true });
            }
        });

        // Pan gesture
        this.gestureRecognizers.push({
            type: 'pan',
            minTouches: 1,
            maxTouches: 1,
            onRecognized: (gesture) => {
                this.activeGestures.push({ ...gesture, recognized: true });
            }
        });

        // Long press gesture
        this.gestureRecognizers.push({
            type: 'long_press',
            minTouches: 1,
            maxTouches: 1,
            minDuration: 1000,
            maxMovement: 10,
            onRecognized: (gesture) => {
                this.activeGestures.push({ ...gesture, recognized: true });
            }
        });
    }

    // Update method called every frame
    update(deltaTime: number): void {
        // Update gamepad state
        this.updateGamepads();

        // Process input buffering
        if (this.inputBuffering) {
            this.updateInputBuffer(deltaTime);
        }

        // Process input prediction
        if (this.inputPrediction) {
            this.updateInputPrediction(deltaTime);
        }

        // Update gesture recognition
        this.updateGestureRecognition(deltaTime);

        // Update input actions
        this.updateInputActions();

        // Handle recording/playback
        if (this.recording) {
            this.recordInput();
        } else if (this.playback) {
            this.playbackInput();
        }

        // Update haptic feedback
        this.updateHaptics(deltaTime);

        // Handle accessibility features
        this.updateAccessibility(deltaTime);

        // Reset per-frame state
        this.resetPerFrameState();
    }

    private updateGamepads(): void {
        const gamepads = navigator.getGamepads();

        for (let i = 0; i < 4; i++) {
            const gamepad = gamepads[i];

            if (gamepad) {
                if (!this.gamepadConnected[i]) {
                    this.gamepadConnected[i] = true;
                    this.gamepadHaptics[i] = gamepad.hapticActuators ? gamepad.hapticActuators[0] : null;
                }

                // Update button states
                for (let j = 0; j < Math.min(gamepad.buttons.length, 16); j++) {
                    const button = gamepad.buttons[j];
                    const wasPressed = this.gamepadButtons[i][j];

                    this.gamepadButtons[i][j] = button.pressed;

                    if (button.pressed && !wasPressed) {
                        this.gamepadButtonPressed[i][j] = true;
                    } else if (!button.pressed && wasPressed) {
                        this.gamepadButtonReleased[i][j] = true;
                    }
                }

                // Update axes with deadzone and smoothing
                for (let j = 0; j < Math.min(gamepad.axes.length, 4); j++) {
                    let value = gamepad.axes[j];

                    // Apply deadzone
                    if (Math.abs(value) < this.gamepadDeadzone) {
                        value = 0;
                    } else {
                        // Scale the value to account for deadzone
                        const sign = Math.sign(value);
                        value = sign * (Math.abs(value) - this.gamepadDeadzone) / (1 - this.gamepadDeadzone);
                    }

                    // Apply sensitivity
                    value *= this.gamepadSensitivity;

                    // Calculate delta
                    this.gamepadAxesDelta[i][j] = value - this.gamepadAxes[i][j];
                    this.gamepadAxes[i][j] = value;
                }
            } else {
                this.gamepadConnected[i] = false;
            }
        }
    }

    private updateInputBuffer(deltaTime: number): void {
        // Add current input state to buffer
        const bufferedInput: BufferedInput = {
            timestamp: performance.now(),
            mousePosition: Vec2.clone(this.mousePosition),
            mouseButtons: [...this.mouseButtons],
            keys: [...this.keys],
            gamepadButtons: this.gamepadButtons.map(buttons => [...buttons]),
            gamepadAxes: this.gamepadAxes.map(axes => [...axes]),
            touches: this.touches.map(touch => ({ ...touch }))
        };

        this.inputBuffer.push(bufferedInput);

        // Maintain buffer size
        if (this.inputBuffer.length > this.bufferSize) {
            this.inputBuffer.shift();
        }
    }

    private updateInputPrediction(deltaTime: number): void {
        // Simple linear prediction for smooth input
        if (this.inputBuffer.length >= 2) {
            const current = this.inputBuffer[this.inputBuffer.length - 1];
            const previous = this.inputBuffer[this.inputBuffer.length - 2];

            // Predict mouse position
            const mouseVelocity = Vec2.create();
            Vec2.subtract(mouseVelocity, current.mousePosition, previous.mousePosition);
            Vec2.scale(mouseVelocity, mouseVelocity, 1 / deltaTime);

            const predictedMousePos = Vec2.create();
            Vec2.scale(mouseVelocity, mouseVelocity, deltaTime);
            Vec2.add(predictedMousePos, current.mousePosition, mouseVelocity);

            this.predictedInputs.push({
                type: 'mouse_position',
                predictedValue: predictedMousePos,
                confidence: 0.8
            });
        }
    }

    private updateGestureRecognition(deltaTime: number): void {
        // Update active touches for gesture recognition
        for (const gestureRecognizer of this.gestureRecognizers) {
            this.checkGesture(gestureRecognizer);
        }

        // Clean up completed gestures
        this.activeGestures = this.activeGestures.filter(gesture => {
            if (gesture.completed) {
                this.gestureHistory.push(gesture);
                return false;
            }
            return true;
        });

        // Maintain gesture history size
        if (this.gestureHistory.length > 50) {
            this.gestureHistory.shift();
        }
    }

    private checkGesture(recognizer: GestureRecognizer): void {
        const relevantTouches = this.touches.filter(touch =>
            touch.active && touch.touchCount >= recognizer.minTouches && touch.touchCount <= recognizer.maxTouches
        );

        if (relevantTouches.length === 0) return;

        // Check gesture conditions based on type
        switch (recognizer.type) {
            case 'tap':
                this.checkTapGesture(recognizer, relevantTouches);
                break;
            case 'double_tap':
                this.checkDoubleTapGesture(recognizer, relevantTouches);
                break;
            case 'pinch':
                this.checkPinchGesture(recognizer, relevantTouches);
                break;
            case 'swipe':
                this.checkSwipeGesture(recognizer, relevantTouches);
                break;
            case 'pan':
                this.checkPanGesture(recognizer, relevantTouches);
                break;
            case 'long_press':
                this.checkLongPressGesture(recognizer, relevantTouches);
                break;
        }
    }

    private checkTapGesture(recognizer: GestureRecognizer, touches: TouchInput[]): void {
        for (const touch of touches) {
            const duration = performance.now() - touch.startTime;
            const movement = Vec2.distance(touch.position, touch.startPosition);

            if (duration <= recognizer.maxDuration && movement <= recognizer.maxMovement) {
                const gesture: Gesture = {
                    type: 'tap',
                    startTime: touch.startTime,
                    position: Vec2.clone(touch.position),
                    touches: [touch],
                    completed: true,
                    recognized: false
                };

                recognizer.onRecognized(gesture);
            }
        }
    }

    private checkDoubleTapGesture(recognizer: GestureRecognizer, touches: TouchInput[]): void {
        // Check for two taps within time window
        const recentTaps = this.gestureHistory.filter(g =>
            g.type === 'tap' && (performance.now() - g.startTime) < 300
        );

        if (recentTaps.length >= 2) {
            const gesture: Gesture = {
                type: 'double_tap',
                startTime: performance.now(),
                position: Vec2.clone(touches[0].position),
                touches: touches,
                completed: true,
                recognized: false
            };

            recognizer.onRecognized(gesture);
        }
    }

    private checkPinchGesture(recognizer: GestureRecognizer, touches: TouchInput[]): void {
        if (touches.length !== 2) return;

        const touch1 = touches[0];
        const touch2 = touches[1];

        const initialDistance = Vec2.distance(touch1.startPosition, touch2.startPosition);
        const currentDistance = Vec2.distance(touch1.position, touch2.position);

        const scale = currentDistance / initialDistance;

        const gesture: Gesture = {
            type: 'pinch',
            startTime: Math.min(touch1.startTime, touch2.startTime),
            position: Vec2.clone(touch1.position),
            touches: touches,
            scale: scale,
            completed: false,
            recognized: false
        };

        // Check if this is a new pinch or update existing
        const existingPinch = this.activeGestures.find(g => g.type === 'pinch');
        if (!existingPinch) {
            recognizer.onRecognized(gesture);
        } else {
            existingPinch.scale = scale;
        }
    }

    private checkSwipeGesture(recognizer: GestureRecognizer, touches: TouchInput[]): void {
        for (const touch of touches) {
            if (!touch.velocity) continue;

            const speed = Vec2.length(touch.velocity);
            if (speed >= recognizer.minVelocity) {
                const gesture: Gesture = {
                    type: 'swipe',
                    startTime: touch.startTime,
                    position: Vec2.clone(touch.position),
                    touches: [touch],
                    velocity: Vec2.clone(touch.velocity),
                    completed: true,
                    recognized: false
                };

                recognizer.onRecognized(gesture);
            }
        }
    }

    private checkPanGesture(recognizer: GestureRecognizer, touches: TouchInput[]): void {
        for (const touch of touches) {
            const movement = Vec2.distance(touch.position, touch.startPosition);
            if (movement > 10) { // Minimum movement threshold
                const gesture: Gesture = {
                    type: 'pan',
                    startTime: touch.startTime,
                    position: Vec2.clone(touch.position),
                    touches: [touch],
                    delta: Vec2.clone(this.mouseDelta),
                    completed: false,
                    recognized: false
                };

                const existingPan = this.activeGestures.find(g => g.type === 'pan');
                if (!existingPan) {
                    recognizer.onRecognized(gesture);
                } else {
                    Vec2.copy(existingPan.delta, this.mouseDelta);
                }
            }
        }
    }

    private checkLongPressGesture(recognizer: GestureRecognizer, touches: TouchInput[]): void {
        for (const touch of touches) {
            const duration = performance.now() - touch.startTime;
            const movement = Vec2.distance(touch.position, touch.startPosition);

            if (duration >= recognizer.minDuration && movement <= recognizer.maxMovement) {
                const gesture: Gesture = {
                    type: 'long_press',
                    startTime: touch.startTime,
                    position: Vec2.clone(touch.position),
                    touches: [touch],
                    completed: true,
                    recognized: false
                };

                recognizer.onRecognized(gesture);
            }
        }
    }

    private updateInputActions(): void {
        const inputMap = this.inputMaps.get(this.activeInputMap);
        if (!inputMap) return;

        // Update action states
        for (const [actionName, actionConfig] of inputMap.actions) {
            let actionPressed = false;
            let actionDown = false;
            let actionReleased = false;
            let actionValue = 0;

            // Check keyboard inputs
            if (actionConfig.keys) {
                for (const key of actionConfig.keys) {
                    const keyCode = this.getKeyCode(key);
                    if (this.keys[keyCode]) {
                        actionDown = true;
                        actionValue = Math.max(actionValue, 1);
                    }
                    if (this.keyPressed[keyCode]) {
                        actionPressed = true;
                    }
                    if (this.keyReleased[keyCode]) {
                        actionReleased = true;
                    }
                }
            }

            // Check gamepad inputs
            if (actionConfig.gamepadButtons) {
                for (let gamepadIndex = 0; gamepadIndex < 4; gamepadIndex++) {
                    for (const buttonIndex of actionConfig.gamepadButtons) {
                        if (this.gamepadButtons[gamepadIndex][buttonIndex]) {
                            actionDown = true;
                            actionValue = Math.max(actionValue, 1);
                        }
                        if (this.gamepadButtonPressed[gamepadIndex][buttonIndex]) {
                            actionPressed = true;
                        }
                        if (this.gamepadButtonReleased[gamepadIndex][buttonIndex]) {
                            actionReleased = true;
                        }
                    }
                }
            }

            // Check gamepad axes
            if (actionConfig.gamepadAxes) {
                for (let gamepadIndex = 0; gamepadIndex < 4; gamepadIndex++) {
                    for (const axisConfig of actionConfig.gamepadAxes) {
                        const axisValue = this.gamepadAxes[gamepadIndex][axisConfig.axis];
                        const adjustedValue = axisConfig.negative ? -axisValue : axisValue;

                        if (Math.abs(adjustedValue) > this.gamepadDeadzone) {
                            actionDown = true;
                            actionValue = Math.max(actionValue, Math.abs(adjustedValue));
                        }
                    }
                }
            }

            // Update action state
            const currentState = this.actionStates.get(actionName) || {
                pressed: false,
                down: false,
                released: false,
                value: 0
            };

            currentState.pressed = actionPressed;
            currentState.down = actionDown;
            currentState.released = actionReleased;
            currentState.value = actionValue;

            this.actionStates.set(actionName, currentState);
        }

        // Update axis states
        for (const [axisName, axisConfig] of inputMap.axes) {
            let axisValue = 0;

            // Mouse axis
            if (axisConfig.mouseAxis !== undefined) {
                if (axisConfig.mouseAxis === 0) {
                    axisValue += this.mouseDelta[0] * axisConfig.sensitivity;
                } else if (axisConfig.mouseAxis === 1) {
                    axisValue += this.mouseDelta[1] * axisConfig.sensitivity;
                    if (axisConfig.invert) axisValue *= -1;
                }
            }

            // Gamepad axes
            if (axisConfig.gamepadAxes) {
                for (let gamepadIndex = 0; gamepadIndex < 4; gamepadIndex++) {
                    for (const axisIndex of axisConfig.gamepadAxes) {
                        const rawValue = this.gamepadAxes[gamepadIndex][axisIndex];
                        if (Math.abs(rawValue) > axisConfig.deadzone) {
                            axisValue += rawValue * axisConfig.sensitivity;
                        }
                    }
                }
            }

            // Key-based axes
            if (axisConfig.keys && axisConfig.keys.length >= 2) {
                const negativeKey = this.getKeyCode(axisConfig.keys[0]);
                const positiveKey = this.getKeyCode(axisConfig.keys[1]);

                if (this.keys[negativeKey]) axisValue -= 1;
                if (this.keys[positiveKey]) axisValue += 1;
            }

            // Store axis value
            this.actionStates.set(axisName, {
                pressed: false,
                down: axisValue !== 0,
                released: false,
                value: axisValue
            });
        }
    }

    private updateHaptics(deltaTime: number): void {
        // Update haptic patterns
        for (const [gamepadIndex, haptic] of this.gamepadHaptics.entries()) {
            if (!haptic) continue;

            // Apply active haptic patterns
            // This would be more complex in a real implementation
        }
    }

    private updateAccessibility(deltaTime: number): void {
        // Handle sticky keys
        if (this.stickyKeys) {
            // Sticky keys logic would go here
        }

        // Handle slow keys
        if (this.slowKeys) {
            // Slow keys logic would go here
        }

        // Handle bounce keys
        if (this.bounceKeys) {
            // Bounce keys logic would go here
        }
    }

    private resetPerFrameState(): void {
        // Reset pressed/released states
        this.keyPressed.fill(false);
        this.keyReleased.fill(false);
        this.mouseButtonPressed.fill(false);
        this.mouseButtonReleased.fill(false);

        for (let i = 0; i < 4; i++) {
            this.gamepadButtonPressed[i].fill(false);
            this.gamepadButtonReleased[i].fill(false);
        }

        // Reset deltas
        Vec2.set(this.mouseDelta, 0, 0);
        this.mouseWheelDelta = 0;

        for (let i = 0; i < 4; i++) {
            this.gamepadAxesDelta[i].fill(0);
        }

        // Clear predicted inputs
        this.predictedInputs.length = 0;
    }

    // Event handlers
    private onMouseDown(e: MouseEvent): void {
        const button = e.button;
        if (button < 5) {
            this.mouseButtons[button] = true;
            this.mouseButtonPressed[button] = true;
        }
        e.preventDefault();
    }

    private onMouseUp(e: MouseEvent): void {
        const button = e.button;
        if (button < 5) {
            this.mouseButtons[button] = false;
            this.mouseButtonReleased[button] = true;
        }
        e.preventDefault();
    }

    private onMouseMove(e: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const newX = e.clientX - rect.left;
        const newY = e.clientY - rect.top;

        // Apply smoothing
        const smoothedX = this.mousePosition[0] + (newX - this.mousePosition[0]) * this.mouseSmoothing;
        const smoothedY = this.mousePosition[1] + (newY - this.mousePosition[1]) * this.mouseSmoothing;

        Vec2.set(this.mouseDelta, smoothedX - this.mousePosition[0], smoothedY - this.mousePosition[1]);
        Vec2.set(this.mousePosition, smoothedX, smoothedY);

        e.preventDefault();
    }

    private onWheel(e: WheelEvent): void {
        this.mouseWheelDelta = e.deltaY;
        e.preventDefault();
    }

    private onKeyDown(e: KeyboardEvent): void {
        const keyCode = this.getKeyCode(e.code);
        if (keyCode < 256) {
            if (!this.keys[keyCode]) {
                this.keyPressed[keyCode] = true;
            }
            this.keys[keyCode] = true;
        }
    }

    private onKeyUp(e: KeyboardEvent): void {
        const keyCode = this.getKeyCode(e.code);
        if (keyCode < 256) {
            this.keys[keyCode] = false;
            this.keyReleased[keyCode] = true;
        }
    }

    private onKeyPress(e: KeyboardEvent): void {
        if (e.key.length === 1) {
            this.textInputBuffer += e.key;
        }
    }

    private onGamepadConnected(e: GamepadEvent): void {
        const gamepad = e.gamepad;
        if (gamepad.index < 4) {
            this.gamepads[gamepad.index] = gamepad;
            this.gamepadConnected[gamepad.index] = true;
            this.gamepadHaptics[gamepad.index] = gamepad.hapticActuators ? gamepad.hapticActuators[0] : null;
            console.log(`[AdvancedInputSystem] Gamepad ${gamepad.index} connected: ${gamepad.id}`);
        }
    }

    private onGamepadDisconnected(e: GamepadEvent): void {
        const gamepadIndex = e.gamepad.index;
        if (gamepadIndex < 4) {
            this.gamepads[gamepadIndex] = null;
            this.gamepadConnected[gamepadIndex] = false;
            this.gamepadHaptics[gamepadIndex] = null;
            console.log(`[AdvancedInputSystem] Gamepad ${gamepadIndex} disconnected`);
        }
    }

    private onTouchStart(e: TouchEvent): void {
        for (let i = 0; i < e.changedTouches.length && this.touches.length < this.maxTouches; i++) {
            const touch = e.changedTouches[i];
            const rect = this.canvas.getBoundingClientRect();

            const touchInput: TouchInput = {
                id: touch.identifier,
                position: Vec2.fromValues(touch.clientX - rect.left, touch.clientY - rect.top),
                startPosition: Vec2.fromValues(touch.clientX - rect.left, touch.clientY - rect.top),
                startTime: performance.now(),
                active: true,
                touchCount: e.touches.length
            };

            this.touches.push(touchInput);
            this.touchStartPositions.set(touch.identifier, Vec2.clone(touchInput.position));
        }
        e.preventDefault();
    }

    private onTouchMove(e: TouchEvent): void {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const rect = this.canvas.getBoundingClientRect();
            const newPosition = Vec2.fromValues(touch.clientX - rect.left, touch.clientY - rect.top);

            const existingTouch = this.touches.find(t => t.id === touch.identifier);
            if (existingTouch) {
                const delta = Vec2.create();
                Vec2.subtract(delta, newPosition, existingTouch.position);

                const velocity = Vec2.create();
                Vec2.scale(velocity, delta, 1000 / (performance.now() - existingTouch.startTime));

                Vec2.copy(existingTouch.position, newPosition);
                this.touchVelocities.set(touch.identifier, velocity);
            }
        }
        e.preventDefault();
    }

    private onTouchEnd(e: TouchEvent): void {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const touchIndex = this.touches.findIndex(t => t.id === touch.identifier);

            if (touchIndex !== -1) {
                this.touches[touchIndex].active = false;
                this.touchVelocities.delete(touch.identifier);
            }
        }

        // Clean up inactive touches
        this.touches = this.touches.filter(touch => touch.active);
        e.preventDefault();
    }

    private onTouchCancel(e: TouchEvent): void {
        this.onTouchEnd(e);
    }

    private onPointerDown(e: PointerEvent): void {
        // Unified pointer handling
    }

    private onPointerUp(e: PointerEvent): void {
        // Unified pointer handling
    }

    private onPointerMove(e: PointerEvent): void {
        // Unified pointer handling
    }

    private onWindowFocus(): void {
        // Reset input state on focus
        this.resetInputState();
    }

    private onWindowBlur(): void {
        // Clear input state on blur
        this.resetInputState();
    }

    private onVisibilityChange(): void {
        if (document.hidden) {
            this.resetInputState();
        }
    }

    private onCompositionStart(e: CompositionEvent): void {
        this.imeActive = true;
        this.textComposition = '';
    }

    private onCompositionUpdate(e: CompositionEvent): void {
        this.textComposition = e.data;
    }

    private onCompositionEnd(e: CompositionEvent): void {
        this.imeActive = false;
        this.textInputBuffer += e.data;
        this.textComposition = '';
    }

    private resetInputState(): void {
        this.keys.fill(false);
        this.keyPressed.fill(false);
        this.keyReleased.fill(false);
        this.mouseButtons.fill(false);
        this.mouseButtonPressed.fill(false);
        this.mouseButtonReleased.fill(false);

        for (let i = 0; i < 4; i++) {
            this.gamepadButtons[i].fill(false);
            this.gamepadButtonPressed[i].fill(false);
            this.gamepadButtonReleased[i].fill(false);
            this.gamepadAxes[i].fill(0);
            this.gamepadAxesDelta[i].fill(0);
        }

        this.touches.length = 0;
        this.touchVelocities.clear();
        this.activeGestures.length = 0;
    }

    // Utility methods
    private getKeyCode(code: string): number {
        // Simple key code mapping
        const keyMap: { [key: string]: number } = {
            'KeyA': 65, 'KeyB': 66, 'KeyC': 67, 'KeyD': 68, 'KeyE': 69, 'KeyF': 70, 'KeyG': 71,
            'KeyH': 72, 'KeyI': 73, 'KeyJ': 74, 'KeyK': 75, 'KeyL': 76, 'KeyM': 77, 'KeyN': 78,
            'KeyO': 79, 'KeyP': 80, 'KeyQ': 81, 'KeyR': 82, 'KeyS': 83, 'KeyT': 84, 'KeyU': 85,
            'KeyV': 86, 'KeyW': 87, 'KeyX': 88, 'KeyY': 89, 'KeyZ': 90,
            'Digit0': 48, 'Digit1': 49, 'Digit2': 50, 'Digit3': 51, 'Digit4': 52,
            'Digit5': 53, 'Digit6': 54, 'Digit7': 55, 'Digit8': 56, 'Digit9': 57,
            'Space': 32, 'Enter': 13, 'Escape': 27, 'Backspace': 8, 'Tab': 9,
            'ShiftLeft': 16, 'ControlLeft': 17, 'AltLeft': 18,
            'ArrowLeft': 37, 'ArrowUp': 38, 'ArrowRight': 39, 'ArrowDown': 40
        };
        return keyMap[code] || 0;
    }

    // Public API methods
    getMousePosition(): Vec2 {
        return Vec2.clone(this.mousePosition);
    }

    getMouseDelta(): Vec2 {
        return Vec2.clone(this.mouseDelta);
    }

    isMouseButtonDown(button: number): boolean {
        return button < 5 ? this.mouseButtons[button] : false;
    }

    isMouseButtonPressed(button: number): boolean {
        return button < 5 ? this.mouseButtonPressed[button] : false;
    }

    isMouseButtonReleased(button: number): boolean {
        return button < 5 ? this.mouseButtonReleased[button] : false;
    }

    getMouseWheelDelta(): number {
        return this.mouseWheelDelta;
    }

    isKeyDown(keyCode: number): boolean {
        return keyCode < 256 ? this.keys[keyCode] : false;
    }

    isKeyPressed(keyCode: number): boolean {
        return keyCode < 256 ? this.keyPressed[keyCode] : false;
    }

    isKeyReleased(keyCode: number): boolean {
        return keyCode < 256 ? this.keyReleased[keyCode] : false;
    }

    isGamepadConnected(gamepadIndex: number): boolean {
        return gamepadIndex < 4 ? this.gamepadConnected[gamepadIndex] : false;
    }

    getGamepadButton(gamepadIndex: number, buttonIndex: number): boolean {
        if (gamepadIndex >= 4 || buttonIndex >= 16) return false;
        return this.gamepadButtons[gamepadIndex][buttonIndex];
    }

    getGamepadAxis(gamepadIndex: number, axisIndex: number): number {
        if (gamepadIndex >= 4 || axisIndex >= 4) return 0;
        return this.gamepadAxes[gamepadIndex][axisIndex];
    }

    getTouches(): TouchInput[] {
        return [...this.touches];
    }

    getActiveGestures(): Gesture[] {
        return [...this.activeGestures];
    }

    getGestureHistory(): Gesture[] {
        return [...this.gestureHistory];
    }

    isActionDown(actionName: string): boolean {
        const state = this.actionStates.get(actionName);
        return state ? state.down : false;
    }

    isActionPressed(actionName: string): boolean {
        const state = this.actionStates.get(actionName);
        return state ? state.pressed : false;
    }

    isActionReleased(actionName: string): boolean {
        const state = this.actionStates.get(actionName);
        return state ? state.released : false;
    }

    getActionValue(actionName: string): number {
        const state = this.actionStates.get(actionName);
        return state ? state.value : 0;
    }

    setInputMap(name: string): void {
        if (this.inputMaps.has(name)) {
            this.activeInputMap = name;
        }
    }

    addInputMap(name: string, inputMap: InputMap): void {
        this.inputMaps.set(name, inputMap);
    }

    createHapticPattern(name: string, pattern: HapticPattern): void {
        this.hapticPatterns.set(name, pattern);
    }

    playHapticPattern(name: string, gamepadIndex: number = 0): void {
        const pattern = this.hapticPatterns.get(name);
        if (!pattern || !this.gamepadHaptics[gamepadIndex]) return;

        // Play haptic pattern
        // This would use the GamepadHapticActuator API
    }

    startRecording(): void {
        this.recording = true;
        this.recordedInputs.length = 0;
        console.log('[AdvancedInputSystem] Started input recording');
    }

    stopRecording(): void {
        this.recording = false;
        console.log(`[AdvancedInputSystem] Stopped input recording (${this.recordedInputs.length} frames)`);
    }

    startPlayback(): void {
        if (this.recordedInputs.length === 0) return;

        this.playback = true;
        this.playbackIndex = 0;
        this.playbackStartTime = performance.now();
        console.log('[AdvancedInputSystem] Started input playback');
    }

    stopPlayback(): void {
        this.playback = false;
        this.playbackIndex = 0;
        console.log('[AdvancedInputSystem] Stopped input playback');
    }

    private recordInput(): void {
        const recordedInput: RecordedInput = {
            timestamp: performance.now(),
            mousePosition: Vec2.clone(this.mousePosition),
            mouseButtons: [...this.mouseButtons],
            keys: [...this.keys],
            gamepadButtons: this.gamepadButtons.map(buttons => [...buttons]),
            gamepadAxes: this.gamepadAxes.map(axes => [...axes]),
            touches: this.touches.map(touch => ({ ...touch }))
        };

        this.recordedInputs.push(recordedInput);
    }

    private playbackInput(): void {
        if (this.playbackIndex >= this.recordedInputs.length) {
            this.stopPlayback();
            return;
        }

        const recordedInput = this.recordedInputs[this.playbackIndex];

        // Apply recorded input state
        Vec2.copy(this.mousePosition, recordedInput.mousePosition);
        this.mouseButtons.splice(0, this.mouseButtons.length, ...recordedInput.mouseButtons);
        this.keys.splice(0, this.keys.length, ...recordedInput.keys);

        for (let i = 0; i < 4; i++) {
            if (recordedInput.gamepadButtons[i]) {
                this.gamepadButtons[i].splice(0, this.gamepadButtons[i].length, ...recordedInput.gamepadButtons[i]);
            }
            if (recordedInput.gamepadAxes[i]) {
                this.gamepadAxes[i].splice(0, this.gamepadAxes[i].length, ...recordedInput.gamepadAxes[i]);
            }
        }

        this.touches.splice(0, this.touches.length, ...recordedInput.touches.map(t => ({ ...t })));

        this.playbackIndex++;
    }

    getRecordedInputs(): RecordedInput[] {
        return [...this.recordedInputs];
    }

    loadRecordedInputs(inputs: RecordedInput[]): void {
        this.recordedInputs.splice(0, this.recordedInputs.length, ...inputs);
    }

    // Configuration methods
    setMouseSmoothing(smoothing: number): void {
        this.mouseSmoothing = Math.max(0.1, Math.min(1.0, smoothing));
    }

    setGamepadDeadzone(deadzone: number): void {
        this.gamepadDeadzone = Math.max(0, Math.min(0.5, deadzone));
    }

    setGamepadSensitivity(sensitivity: number): void {
        this.gamepadSensitivity = Math.max(0.1, Math.max(5.0, sensitivity));
    }

    enableInputBuffering(enabled: boolean): void {
        this.inputBuffering = enabled;
        if (!enabled) {
            this.inputBuffer.length = 0;
        }
    }

    enableInputPrediction(enabled: boolean): void {
        this.inputPrediction = enabled;
        if (!enabled) {
            this.predictedInputs.length = 0;
        }
    }

    // Accessibility methods
    enableStickyKeys(enabled: boolean): void {
        this.stickyKeys = enabled;
    }

    enableSlowKeys(enabled: boolean): void {
        this.slowKeys = enabled;
    }

    setSlowKeysDelay(delay: number): void {
        this.slowKeysDelay = Math.max(100, delay);
    }

    enableBounceKeys(enabled: boolean): void {
        this.bounceKeys = enabled;
    }

    setBounceKeysDelay(delay: number): void {
        this.bounceKeysDelay = Math.max(100, delay);
    }

    // Text input methods
    getTextInput(): string {
        const input = this.textInputBuffer;
        this.textInputBuffer = '';
        return input;
    }

    getTextComposition(): string {
        return this.textComposition;
    }

    isIMEActive(): boolean {
        return this.imeActive;
    }

    // Debug methods
    getDebugInfo(): any {
        return {
            mouse: {
                position: [this.mousePosition[0], this.mousePosition[1]],
                delta: [this.mouseDelta[0], this.mouseDelta[1]],
                buttons: [...this.mouseButtons],
                wheelDelta: this.mouseWheelDelta
            },
            keyboard: {
                activeKeys: this.keys.reduce((count, pressed) => count + (pressed ? 1 : 0), 0),
                pressedKeys: this.keyPressed.reduce((count, pressed) => count + (pressed ? 1 : 0), 0)
            },
            gamepads: this.gamepadConnected.map((connected, index) => ({
                connected,
                buttons: connected ? this.gamepadButtons[index].reduce((count, pressed) => count + (pressed ? 1 : 0), 0) : 0,
                axes: connected ? [...this.gamepadAxes[index]] : []
            })),
            touch: {
                activeTouches: this.touches.length,
                activeGestures: this.activeGestures.length
            },
            inputActions: Object.fromEntries(
                Array.from(this.actionStates.entries()).map(([name, state]) => [
                    name,
                    { down: state.down, pressed: state.pressed, released: state.released, value: state.value }
                ])
            ),
            recording: {
                active: this.recording,
                playback: this.playback,
                recordedFrames: this.recordedInputs.length,
                playbackIndex: this.playbackIndex
            },
            accessibility: {
                stickyKeys: this.stickyKeys,
                slowKeys: this.slowKeys,
                bounceKeys: this.bounceKeys
            }
        };
    }

    dispose(): void {
        // Clean up event listeners
        this.canvas.removeEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.removeEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.removeEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.removeEventListener('wheel', this.onWheel.bind(this));

        window.removeEventListener('keydown', this.onKeyDown.bind(this));
        window.removeEventListener('keyup', this.onKeyUp.bind(this));
        window.removeEventListener('keypress', this.onKeyPress.bind(this));

        window.removeEventListener('gamepadconnected', this.onGamepadConnected.bind(this));
        window.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected.bind(this));

        this.canvas.removeEventListener('touchstart', this.onTouchStart.bind(this));
        this.canvas.removeEventListener('touchmove', this.onTouchMove.bind(this));
        this.canvas.removeEventListener('touchend', this.onTouchEnd.bind(this));
        this.canvas.removeEventListener('touchcancel', this.onTouchCancel.bind(this));

        this.canvas.removeEventListener('pointerdown', this.onPointerDown.bind(this));
        this.canvas.removeEventListener('pointerup', this.onPointerUp.bind(this));
        this.canvas.removeEventListener('pointermove', this.onPointerMove.bind(this));

        window.removeEventListener('focus', this.onWindowFocus.bind(this));
        window.removeEventListener('blur', this.onWindowBlur.bind(this));
        document.removeEventListener('visibilitychange', this.onVisibilityChange.bind(this));

        window.removeEventListener('compositionstart', this.onCompositionStart.bind(this));
        window.removeEventListener('compositionupdate', this.onCompositionUpdate.bind(this));
        window.removeEventListener('compositionend', this.onCompositionEnd.bind(this));

        // Clear all state
        this.resetInputState();
        this.inputBuffer.length = 0;
        this.recordedInputs.length = 0;
        this.predictedInputs.length = 0;
        this.hapticPatterns.clear();
        this.inputMaps.clear();
        this.actionStates.clear();
        this.eventListeners.clear();

        console.log('[AdvancedInputSystem] Disposed');
    }
}

// Type definitions
interface TouchInput {
    id: number;
    position: Vec2;
    startPosition: Vec2;
    startTime: number;
    active: boolean;
    touchCount: number;
    velocity?: Vec2;
}

interface Gesture {
    type: 'tap' | 'double_tap' | 'pinch' | 'swipe' | 'pan' | 'long_press';
    startTime: number;
    position: Vec2;
    touches: TouchInput[];
    velocity?: Vec2;
    delta?: Vec2;
    scale?: number;
    completed: boolean;
    recognized: boolean;
}

interface GestureRecognizer {
    type: 'tap' | 'double_tap' | 'pinch' | 'swipe' | 'pan' | 'long_press';
    minTouches: number;
    maxTouches: number;
    maxDuration?: number;
    minDuration?: number;
    maxMovement?: number;
    minVelocity?: number;
    requireDouble?: boolean;
    onRecognized: (gesture: Gesture) => void;
}

interface InputMap {
    name: string;
    actions: Map<string, InputAction>;
    axes: Map<string, InputAxis>;
}

interface InputAction {
    keys?: string[];
    mouseButtons?: number[];
    gamepadButtons?: number[];
    gamepadAxes?: { axis: number; negative: boolean; threshold?: number }[];
}

interface InputAxis {
    mouseAxis?: number;
    gamepadAxes?: number[];
    keys?: string[];
    sensitivity?: number;
    deadzone?: number;
    invert?: boolean;
}

interface ActionState {
    pressed: boolean;
    down: boolean;
    released: boolean;
    value: number;
}

interface HapticPattern {
    duration: number;
    intensity: number;
    frequency?: number;
    type: 'constant' | 'pulse' | 'ramp';
}

interface RecordedInput {
    timestamp: number;
    mousePosition: Vec2;
    mouseButtons: boolean[];
    keys: boolean[];
    gamepadButtons: boolean[][];
    gamepadAxes: number[][];
    touches: TouchInput[];
}

interface BufferedInput {
    timestamp: number;
    mousePosition: Vec2;
    mouseButtons: boolean[];
    keys: boolean[];
    gamepadButtons: boolean[][];
    gamepadAxes: number[][];
    touches: TouchInput[];
}

interface PredictedInput {
    type: string;
    predictedValue: any;
    confidence: number;
}
