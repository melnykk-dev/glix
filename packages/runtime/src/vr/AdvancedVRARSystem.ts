import { Vec3, Vec4, Mat4 } from '../math';

// Temporary stubs for deprecated WebVR and WebXR types used in this file
type VRPose = any;
type VRDisplay = any;
type VRGamepad = any;
type XRSession = any;
type XRFrame = any;
type XRInputSourcesChangeEvent = any;
type XRHand = any;
type XRJointPose = any;
type XRRigidTransform = any;

/**
 * Advanced VR/AR System with immersive experiences, hand tracking,
 * spatial audio, haptic feedback, and mixed reality interactions.
 */
export class AdvancedVRARSystem {
    private vrDisplay: VRDisplay | null = null;
    private arSession: XRSession | null = null;
    private gl: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;

    // VR/AR state
    private _isVRActive: boolean = false;
    private _isARActive: boolean = false;
    private currentMode: 'none' | 'vr' | 'ar' = 'none';

    // Public state accessors
    get isVRActive(): boolean { return this._isVRActive; }
    get isARActive(): boolean { return this._isARActive; }

    // Device tracking
    private headsetPose: VRPose | null = null;
    private leftControllerPose: VRGamepad | null = null;
    private rightControllerPose: VRGamepad | null = null;
    private handTrackingData: HandTrackingData | null = null;

    // Rendering
    private leftEyeFBO: WebGLFramebuffer | null = null;
    private rightEyeFBO: WebGLFramebuffer | null = null;
    private leftEyeTexture: WebGLTexture | null = null;
    private rightEyeTexture: WebGLTexture | null = null;
    private vrShader: WebGLProgram | null = null;

    // Spatial audio
    private spatialAudioContext: AudioContext | null = null;
    private audioSources: Map<string, PannerNode> = new Map();

    // Haptic feedback
    private hapticActuators: Map<string, GamepadHapticActuator> = new Map();

    // Interaction
    private interactionManager!: VRInteractionManager; // used lazily
    public get interactionManagerRef(): VRInteractionManager { return this.interactionManager; }
    private gestureRecognizer!: GestureRecognizer;
    private raycasters: Map<string, Raycaster> = new Map();

    private virtualObjects: Map<string, VirtualObject> = new Map();
    private realWorldAnchors: Map<string, RealWorldAnchor> = new Map();

    // Performance
    private renderStats: VRRenderStats = {
        drawCalls: 0,
        triangles: 0,
        gpuMemory: 0,
        latency: 0
    };

    // Comfort and safety
    private comfortManager: VRComfortManager;
    private safetyManager: VRSafetyManager;

    private localFloorRefSpace: any = null;

    constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
        this.gl = gl;
        this.canvas = canvas;

        this.interactionManager = new VRInteractionManager();
        this.gestureRecognizer = new GestureRecognizer();
        this.comfortManager = new VRComfortManager();
        this.safetyManager = new VRSafetyManager();

        this._initializeVRAR();
        console.log('[AdvancedVRARSystem] Advanced VR/AR system initialized');
    }

    private async _initializeVRAR(): Promise<void> {
        // Check for WebXR support
        if ('xr' in navigator) {
            try {
                const xr = (navigator as any).xr;
                const supported = await xr.isSessionSupported('immersive-vr');

                if (supported) {
                    console.log('[AdvancedVRARSystem] WebXR VR supported');
                }

                const arSupported = await xr.isSessionSupported('immersive-ar');
                if (arSupported) {
                    console.log('[AdvancedVRARSystem] WebXR AR supported');
                }
            } catch (error) {
                console.warn('[AdvancedVRARSystem] WebXR not fully supported:', error);
            }
        }

        // Fallback to WebVR API
        if ('getVRDisplays' in navigator) {
            const displays = await (navigator as any).getVRDisplays();
            if (displays.length > 0) {
                this.vrDisplay = displays[0];
                console.log(`[AdvancedVRARSystem] WebVR display found: ${this.vrDisplay.displayName}`);
            }
        }

        // Initialize audio context for spatial audio
        try {
            this.spatialAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        } catch (error) {
            console.warn('[AdvancedVRARSystem] Spatial audio not supported:', error);
        }

        // Initialize haptic feedback
        this.initializeHaptics();

        // Set up rendering
        this.initializeVRRendering();
    }

    private initializeVRRendering(): void {
        // Create VR shader
        const vertexShader = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec3 a_normal;
            layout(location = 2) in vec2 a_texCoord;

            uniform mat4 u_modelViewProjection;
            uniform mat4 u_model;
            uniform mat3 u_normalMatrix;

            out vec3 v_worldPos;
            out vec3 v_normal;
            out vec2 v_texCoord;

            void main() {
                gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
                v_worldPos = (u_model * vec4(a_position, 1.0)).xyz;
                v_normal = normalize(u_normalMatrix * a_normal);
                v_texCoord = a_texCoord;
            }
        `;

        const fragmentShader = `#version 300 es
            precision mediump float;

            in vec3 v_worldPos;
            in vec3 v_normal;
            in vec2 v_texCoord;

            uniform sampler2D u_texture;
            uniform vec3 u_color;
            uniform float u_opacity;

            out vec4 outColor;

            void main() {
                vec4 texColor = texture(u_texture, v_texCoord);
                outColor = vec4(texColor.rgb * u_color, texColor.a * u_opacity);
            }
        `;

        this.vrShader = this.createShaderProgram(vertexShader, fragmentShader);

        // Create eye framebuffers
        this.createEyeFramebuffers();
    }

    private createEyeFramebuffers(): void {
        const gl = this.gl;

        // Get recommended render target size
        let renderWidth = gl.canvas.width;
        let renderHeight = gl.canvas.height;

        if (this.vrDisplay) {
            const leftEye = this.vrDisplay.getEyeParameters('left');
            const rightEye = this.vrDisplay.getEyeParameters('right');

            renderWidth = Math.max(leftEye.renderWidth, rightEye.renderWidth);
            renderHeight = Math.max(leftEye.renderHeight, rightEye.renderHeight);
        }

        // Create left eye FBO
        this.leftEyeFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.leftEyeFBO);

        this.leftEyeTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.leftEyeTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, renderWidth, renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.leftEyeTexture, 0);

        const leftDepthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, leftDepthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, renderWidth, renderHeight);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, leftDepthBuffer);

        // Create right eye FBO
        this.rightEyeFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.rightEyeFBO);

        this.rightEyeTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.rightEyeTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, renderWidth, renderHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rightEyeTexture, 0);

        const rightDepthBuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, rightDepthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, renderWidth, renderHeight);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rightDepthBuffer);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private createShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
        const gl = this.gl;
        const program = gl.createProgram()!;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vertexShader, vertexSource);
        gl.compileShader(vertexShader);

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fragmentShader, fragmentSource);
        gl.compileShader(fragmentShader);

        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        return program;
    }

    private initializeHaptics(): void {
        // Initialize haptic feedback for controllers
        if (navigator.getGamepads) {
            const gamepads = navigator.getGamepads();
            for (const gamepad of gamepads) {
                if (gamepad && (gamepad as any).hapticActuators && (gamepad as any).hapticActuators.length > 0) {
                    this.hapticActuators.set(`controller_${gamepad.index}`, (gamepad as any).hapticActuators[0]);
                }
            }
        }
    }

    // VR/AR session management
    async startVRSession(): Promise<void> {
        if (!this.vrDisplay && !('xr' in navigator)) {
            throw new Error('VR not supported');
        }

        try {
            if ('xr' in navigator) {
                // WebXR path
                const xr = (navigator as any).xr;
                this.arSession = await xr.requestSession('immersive-vr', {
                    requiredFeatures: ['local-floor', 'bounded-floor'],
                    optionalFeatures: ['hand-tracking']
                });

                this.setupXRSession();
            } else if (this.vrDisplay) {
                // WebVR path
                await this.vrDisplay.requestPresent([{
                    source: this.canvas
                }]);
            }

            this._isVRActive = true;
            this.currentMode = 'vr';
            console.log('[AdvancedVRARSystem] VR session started');

        } catch (error) {
            console.error('[AdvancedVRARSystem] Failed to start VR session:', error);
            throw error;
        }
    }

    async startARSession(): Promise<void> {
        if (!('xr' in navigator)) {
            throw new Error('AR not supported');
        }

        try {
            const xr = (navigator as any).xr;
            this.arSession = await xr.requestSession('immersive-ar', {
                requiredFeatures: ['local-floor', 'hit-test'],
                optionalFeatures: ['dom-overlay', 'hand-tracking']
            });

            this.setupXRSession();

            this._isARActive = true;
            this.currentMode = 'ar';
            console.log('[AdvancedVRARSystem] AR session started');

        } catch (error) {
            console.error('[AdvancedVRARSystem] Failed to start AR session:', error);
            throw error;
        }
    }

    private setupXRSession(): void {
        if (!this.arSession) return;

        // Set up reference spaces
        this.arSession.requestReferenceSpace('local-floor').then((refSpace: any) => {
            this.localFloorRefSpace = refSpace;
        });

        // Set up frame callback
        this.arSession.requestAnimationFrame(this.onXRFrame.bind(this));

        // Set up input sources
        this.arSession.addEventListener('inputsourceschange', this.onInputSourcesChange.bind(this));

        // Set up layers
        const glLayer = new (window as any).XRWebGLLayer(this.arSession, this.gl);
        this.arSession.updateRenderState({ baseLayer: glLayer });
    }

    private onXRFrame(_time: number, frame: XRFrame): void {
        if (!this.arSession) return;

        // Get poses
        if (this.localFloorRefSpace) {
            this.headsetPose = frame.getViewerPose(this.localFloorRefSpace);

            // Get controller poses
            const inputSources = this.arSession.inputSources;
            for (const inputSource of inputSources) {
                if (inputSource.targetRayMode === 'tracked-pointer') {
                    const pose = frame.getPose(inputSource.targetRaySpace, this.localFloorRefSpace);
                    if (pose) {
                        if (inputSource.handedness === 'left') {
                            this.leftControllerPose = pose;
                        } else if (inputSource.handedness === 'right') {
                            this.rightControllerPose = pose;
                        }
                    }
                }
            }

            // Get hand tracking data
            for (const inputSource of inputSources) {
                if (inputSource.hand) {
                    this.handTrackingData = this.getHandTrackingData(inputSource.hand);
                }
            }
        }

        // Update interactions
        this.updateInteractions();

        // Render frame
        this.renderVRFrame(frame);

        // Request next frame
        this.arSession.requestAnimationFrame(this.onXRFrame.bind(this));
    }

    private onInputSourcesChange(event: XRInputSourcesChangeEvent): void {
        // Handle input source changes
        console.log('[AdvancedVRARSystem] Input sources changed:', event.added, event.removed);
    }

    private getHandTrackingData(hand: XRHand): HandTrackingData {
        const joints = new Map<string, XRJointPose>();

        for (const jointName of Object.keys(hand)) {
            const joint = (hand as any)[jointName];
            if (joint && this.localFloorRefSpace) {
                const pose = joint;
                if (pose) {
                    joints.set(jointName, pose);
                }
            }
        }

        return {
            joints,
            pinchStrength: this.calculatePinchStrength(hand),
            gesture: this.recognizeHandGesture(hand)
        };
    }

    private calculatePinchStrength(hand: XRHand): number {
        // Calculate pinch strength between thumb and index finger
        const thumbTip = (hand as any).thumbTip;
        const indexTip = (hand as any).indexTip;

        if (!thumbTip || !indexTip) return 0;

        const distance = Vec3.distance(
            Vec3.fromValues(thumbTip.position.x, thumbTip.position.y, thumbTip.position.z),
            Vec3.fromValues(indexTip.position.x, indexTip.position.y, indexTip.position.z)
        );

        // Normalize to 0-1 range (pinch distance of 0.02 = full pinch)
        return Math.max(0, Math.min(1, (0.1 - distance) / 0.08));
    }

    private recognizeHandGesture(hand: XRHand): HandGesture {
        // Simple gesture recognition
        const pinchStrength = this.calculatePinchStrength(hand);

        if (pinchStrength > 0.8) {
            return 'pinch';
        }

        // Check for other gestures (thumbs up, peace sign, etc.)
        return 'open';
    }

    // Rendering
    private renderVRFrame(frame: XRFrame): void {
        const gl = this.gl;
        const session = this.arSession;
        if (!session || !this.headsetPose) return;

        const layer = session.renderState.baseLayer;
        if (!layer) return;

        // Clear frame
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Render for each eye
        for (const view of this.headsetPose.views) {
            const viewport = layer.getViewport(view);
            gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);

            // Set up view-projection matrix
            const viewMatrix = this.matrixFromPose(view.transform);
            const projectionMatrix = view.projectionMatrix;

            // Render scene for this eye
            this.renderEye(viewMatrix, projectionMatrix, view.eye === 'left');
        }

        // Handle AR camera passthrough if needed
        if (this.currentMode === 'ar') {
            this.renderARPassThrough(frame);
        }
    }

    private renderEye(viewMatrix: Float32Array, projectionMatrix: Float32Array, isLeftEye: boolean): void {
        const gl = this.gl;

        // Bind appropriate framebuffer
        const fbo = isLeftEye ? this.leftEyeFBO : this.rightEyeFBO;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Set up camera
        const viewProjMatrix = Mat4.create();
        Mat4.multiply(viewProjMatrix, projectionMatrix, viewMatrix);

        // Render virtual objects
        for (const [_id, object] of this.virtualObjects) {
            this.renderVirtualObject(object, viewProjMatrix);
        }

        // Render VR UI elements
        this.renderVRUI(viewProjMatrix);

        // Render hands/controllers
        this.renderHands(viewMatrix);
    }

    private renderVirtualObject(object: VirtualObject, viewProjMatrix: Mat4): void {
        const gl = this.gl;

        if (!this.vrShader) return;

        gl.useProgram(this.vrShader);

        // Set uniforms
        const mvpLoc = gl.getUniformLocation(this.vrShader, 'u_modelViewProjection');
        const modelLoc = gl.getUniformLocation(this.vrShader, 'u_model');
        const colorLoc = gl.getUniformLocation(this.vrShader, 'u_color');
        const opacityLoc = gl.getUniformLocation(this.vrShader, 'u_opacity');

        // Calculate model matrix
        const modelMatrix = Mat4.create();
        Mat4.fromRotationTranslationScale(modelMatrix, object.rotation, object.position, object.scale);

        gl.uniformMatrix4fv(mvpLoc, false, Mat4.multiply(Mat4.create(), viewProjMatrix, modelMatrix));
        gl.uniformMatrix4fv(modelLoc, false, modelMatrix);
        gl.uniform3fv(colorLoc, object.color);
        gl.uniform1f(opacityLoc, object.opacity);

        // Bind texture
        if (object.texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, object.texture);
        }

        // Render geometry
        gl.bindVertexArray(object.vao);
        gl.drawElements(gl.TRIANGLES, object.indexCount, gl.UNSIGNED_INT, 0);

        this.renderStats.drawCalls++;
        this.renderStats.triangles += object.indexCount / 3;
    }

    private renderVRUI(_viewProjMatrix: Mat4): void {
        // Render VR-specific UI elements (menus, crosshairs, etc.)
    }

    private renderHands(viewMatrix: Float32Array): void {
        // Render hand meshes and controller models
        if (this.handTrackingData) {
            this.renderTrackedHands(viewMatrix);
        } else {
            this.renderControllerModels(viewMatrix);
        }
    }

    private renderTrackedHands(viewMatrix: Float32Array): void {
        if (!this.handTrackingData) return;

        // Render hand joints and connections
        for (const [_jointName, jointPose] of this.handTrackingData.joints) {
            this.renderHandJoint(jointPose, viewMatrix);
        }

        // Render hand mesh
        this.renderHandMesh(this.handTrackingData, viewMatrix);
    }

    private renderHandJoint(jointPose: XRJointPose, _viewMatrix: Float32Array): void {
        // Render small sphere at joint position
        const jointObject: VirtualObject = {
            id: `joint_${Math.random()}`,
            position: Vec3.fromValues(jointPose.transform.position.x, jointPose.transform.position.y, jointPose.transform.position.z),
            rotation: [0, 0, 0, 1], // Identity quaternion
            scale: Vec3.fromValues(0.01, 0.01, 0.01),
            color: Vec3.fromValues(1, 1, 1),
            opacity: 1,
            vao: null as any, // Would create sphere VAO
            indexCount: 0,
            texture: null
        };

        const viewProjMatrix = Mat4.create();
        // Convert viewMatrix to Mat4 and multiply with projection
        this.renderVirtualObject(jointObject, viewProjMatrix);
    }

    private renderHandMesh(_handData: HandTrackingData, _viewMatrix: Float32Array): void {
        // Render triangulated hand mesh
        // This would use the joint positions to deform a hand mesh
    }

    private renderControllerModels(viewMatrix: Float32Array): void {
        // Render controller models for traditional VR controllers
        if (this.leftControllerPose) {
            this.renderController(this.leftControllerPose, viewMatrix, true);
        }

        if (this.rightControllerPose) {
            this.renderController(this.rightControllerPose, viewMatrix, false);
        }
    }

    private renderController(_pose: any, _viewMatrix: Float32Array, _isLeft: boolean): void {
        // Render controller model at pose position
    }

    private renderARPassThrough(_frame: XRFrame): void {
        // Handle AR camera passthrough
        // This would composite virtual objects with camera feed
    }

    private matrixFromPose(transform: XRRigidTransform): Float32Array {
        const matrix = Mat4.create();
        const position = transform.position;
        const orientation = transform.orientation;

        const translation = Mat4.fromTranslation(Mat4.create(), Vec3.fromValues(position.x, position.y, position.z));
        const rotation = Mat4.fromQuat(Mat4.create(), [orientation.x, orientation.y, orientation.z, orientation.w]);

        Mat4.multiply(matrix, translation, rotation);
        return matrix as any;
    }

    // Spatial audio
    createSpatialAudioSource(audioId: string, position: Vec3): void {
        if (!this.spatialAudioContext) return;

        const panner = this.spatialAudioContext.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1;
        panner.maxDistance = 100;
        panner.rolloffFactor = 1;

        this.applyAudioSourcePosition(panner, position);
        this.audioSources.set(audioId, panner);
    }

    updateAudioSourcePosition(audioId: string, position: Vec3): void {
        const panner = this.audioSources.get(audioId);
        if (!panner) return;

        this.applyAudioSourcePosition(panner, position);
    }

    private applyAudioSourcePosition(panner: PannerNode, position: Vec3): void {
        if ((panner as any).positionX !== undefined) {
            // Modern Audio API
            (panner as any).positionX.value = position[0];
            (panner as any).positionY.value = position[1];
            (panner as any).positionZ.value = position[2];
        } else {
            // Legacy Audio API
            (panner as any).setPosition(position[0], position[1], position[2]);
        }
    }

    playSpatialAudio(audioId: string, audioBuffer: AudioBuffer): void {
        const panner = this.audioSources.get(audioId);
        if (!panner || !this.spatialAudioContext) return;

        const source = this.spatialAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(panner);
        panner.connect(this.spatialAudioContext.destination);

        source.start();
    }

    // Haptic feedback
    triggerHapticFeedback(controllerId: string, intensity: number, duration: number): void {
        const actuator = this.hapticActuators.get(controllerId);
        if (!actuator) return;

        actuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: duration * 1000, // Convert to milliseconds
            weakMagnitude: intensity,
            strongMagnitude: intensity
        });
    }

    triggerHandHaptic(_finger: string, _intensity: number): void {
        // Trigger haptic feedback on specific fingers
        // This would require haptic glove hardware
    }

    // Interactions
    private updateInteractions(): void {
        // Update raycasters for controllers/hands
        this.updateRaycasters();

        // Check for interactions
        this.checkObjectInteractions();

        // Process gestures
        this.processGestures();
    }

    private updateRaycasters(): void {
        // Update raycasters from controller/hand positions
        if (this.leftControllerPose) {
            this.updateControllerRaycaster('left', this.leftControllerPose);
        }

        if (this.rightControllerPose) {
            this.updateControllerRaycaster('right', this.rightControllerPose);
        }

        if (this.handTrackingData) {
            this.updateHandRaycasters(this.handTrackingData);
        }
    }

    private updateControllerRaycaster(hand: string, _pose: any): void {
        const raycaster = this.raycasters.get(`${hand}_controller`) || new Raycaster();
        // Set raycaster origin and direction from controller pose
        this.raycasters.set(`${hand}_controller`, raycaster);
    }

    private updateHandRaycasters(handData: HandTrackingData): void {
        // Update raycasters from hand poses
        for (const [jointName, _jointPose] of handData.joints) {
            if (jointName.includes('index') && jointName.includes('tip')) {
                const raycaster = this.raycasters.get('index_finger') || new Raycaster();
                // Set raycaster from index finger tip
                this.raycasters.set('index_finger', raycaster);
            }
        }
    }

    private checkObjectInteractions(): void {
        // Check for raycaster intersections with virtual objects
        for (const [raycasterId, raycaster] of this.raycasters) {
            for (const [_objectId, object] of this.virtualObjects) {
                const intersection = raycaster.intersectObject(object);
                if (intersection) {
                    this.handleObjectInteraction(object, intersection, raycasterId);
                }
            }
        }
    }

    private handleObjectInteraction(object: VirtualObject, _intersection: any, raycasterId: string): void {
        // Handle different interaction types (grab, touch, etc.)
        const interactionType = this.determineInteractionType(raycasterId);

        switch (interactionType) {
            case 'grab':
                this.handleGrabInteraction(object, _intersection);
                break;
            case 'touch':
                this.handleTouchInteraction(object, _intersection);
                break;
            case 'point':
                this.handlePointInteraction(object, _intersection);
                break;
        }
    }

    private determineInteractionType(raycasterId: string): string {
        if (raycasterId.includes('controller')) {
            return 'grab'; // Controller trigger
        } else if (raycasterId.includes('finger')) {
            return 'touch'; // Finger touch
        }
        return 'point';
    }

    private handleGrabInteraction(object: VirtualObject, _intersection: any): void {
        // Handle grabbing objects with controllers
        console.log(`[AdvancedVRARSystem] Grabbing object ${object.id}`);
        // Implement grab logic
    }

    private handleTouchInteraction(object: VirtualObject, _intersection: any): void {
        // Handle touching objects with hands
        console.log(`[AdvancedVRARSystem] Touching object ${object.id}`);
        // Implement touch logic
    }

    private handlePointInteraction(object: VirtualObject, _intersection: any): void {
        // Handle pointing at objects
        console.log(`[AdvancedVRARSystem] Pointing at object ${object.id}`);
        // Implement point logic
    }

    private processGestures(): void {
        if (!this.handTrackingData) return;

        const gesture = this.handTrackingData.gesture;
        this.gestureRecognizer.processGesture(gesture, this.handTrackingData);

        // Handle recognized gestures
        const recognizedGestures = this.gestureRecognizer.getRecognizedGestures();
        for (const recognizedGesture of recognizedGestures) {
            this.handleGesture(recognizedGesture);
        }
    }

    private handleGesture(gesture: RecognizedGesture): void {
        switch (gesture.type) {
            case 'thumbs_up':
                // Handle thumbs up gesture
                break;
            case 'peace_sign':
                // Handle peace sign gesture
                break;
            case 'fist':
                // Handle fist gesture
                break;
            case 'open_palm':
                // Handle open palm gesture
                break;
        }
    }

    // Virtual objects management
    createVirtualObject(config: VirtualObjectConfig): string {
        const objectId = `virtual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const object: VirtualObject = {
            id: objectId,
            position: Vec3.clone(config.position),
            rotation: config.rotation || [0, 0, 0, 1],
            scale: config.scale || Vec3.fromValues(1, 1, 1),
            color: config.color || Vec3.fromValues(1, 1, 1),
            opacity: config.opacity || 1,
            geometry: config.geometry,
            material: config.material,
            physics: config.physics || null,
            interactions: config.interactions || [],
            vao: null,
            indexCount: 0,
            texture: null
        };

        // Create geometry
        if (config.geometry) {
            const geometryData = this.createGeometry(config.geometry);
            object.vao = geometryData.vao;
            object.indexCount = geometryData.indexCount;
        }

        // Load texture
        if (config.texture) {
            object.texture = this.loadTexture(config.texture);
        }

        this.virtualObjects.set(objectId, object);
        return objectId;
    }

    private createGeometry(geometryConfig: GeometryConfig): { vao: WebGLVertexArrayObject; indexCount: number } {
        const gl = this.gl;

        // Create geometry based on type
        let vertices: Float32Array;
        let indices: Uint16Array;

        switch (geometryConfig.type) {
            case 'cube':
                ({ vertices, indices } = this.createCubeGeometry(geometryConfig.size || 1));
                break;
            case 'sphere':
                ({ vertices, indices } = this.createSphereGeometry(geometryConfig.radius || 1, geometryConfig.segments || 16));
                break;
            case 'cylinder':
                ({ vertices, indices } = this.createCylinderGeometry(geometryConfig.radius || 1, geometryConfig.height || 2, geometryConfig.segments || 16));
                break;
            case 'plane':
                ({ vertices, indices } = this.createPlaneGeometry(geometryConfig.width || 1, geometryConfig.height || 1));
                break;
            default:
                ({ vertices, indices } = this.createCubeGeometry(1));
        }

        // Create VAO
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Position buffer
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 8 * 4, 0); // 3 pos + 3 normal + 2 uv = 8 floats

        // Normal buffer
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 8 * 4, 3 * 4);

        // UV buffer
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 8 * 4, 6 * 4);

        // Index buffer
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        return { vao, indexCount: indices.length };
    }

    private createCubeGeometry(size: number): { vertices: Float32Array; indices: Uint16Array } {
        const halfSize = size / 2;
        const vertices = new Float32Array([
            // Front face
            -halfSize, -halfSize, halfSize, 0, 0, 1, 0, 0,
            halfSize, -halfSize, halfSize, 0, 0, 1, 1, 0,
            halfSize, halfSize, halfSize, 0, 0, 1, 1, 1,
            -halfSize, halfSize, halfSize, 0, 0, 1, 0, 1,

            // Back face
            -halfSize, -halfSize, -halfSize, 0, 0, -1, 1, 0,
            -halfSize, halfSize, -halfSize, 0, 0, -1, 1, 1,
            halfSize, halfSize, -halfSize, 0, 0, -1, 0, 1,
            halfSize, -halfSize, -halfSize, 0, 0, -1, 0, 0,

            // Top face
            -halfSize, halfSize, -halfSize, 0, 1, 0, 0, 1,
            -halfSize, halfSize, halfSize, 0, 1, 0, 0, 0,
            halfSize, halfSize, halfSize, 0, 1, 0, 1, 0,
            halfSize, halfSize, -halfSize, 0, 1, 0, 1, 1,

            // Bottom face
            -halfSize, -halfSize, -halfSize, 0, -1, 0, 1, 1,
            halfSize, -halfSize, -halfSize, 0, -1, 0, 0, 1,
            halfSize, -halfSize, halfSize, 0, -1, 0, 0, 0,
            -halfSize, -halfSize, halfSize, 0, -1, 0, 1, 0,

            // Right face
            halfSize, -halfSize, -halfSize, 1, 0, 0, 1, 0,
            halfSize, halfSize, -halfSize, 1, 0, 0, 1, 1,
            halfSize, halfSize, halfSize, 1, 0, 0, 0, 1,
            halfSize, -halfSize, halfSize, 1, 0, 0, 0, 0,

            // Left face
            -halfSize, -halfSize, -halfSize, -1, 0, 0, 0, 0,
            -halfSize, -halfSize, halfSize, -1, 0, 0, 1, 0,
            -halfSize, halfSize, halfSize, -1, 0, 0, 1, 1,
            -halfSize, halfSize, -halfSize, -1, 0, 0, 0, 1
        ]);

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,       // Front
            4, 5, 6, 4, 6, 7,       // Back
            8, 9, 10, 8, 10, 11,    // Top
            12, 13, 14, 12, 14, 15, // Bottom
            16, 17, 18, 16, 18, 19, // Right
            20, 21, 22, 20, 22, 23  // Left
        ]);

        return { vertices, indices };
    }

    private createSphereGeometry(_radius: number, _segments: number): { vertices: Float32Array; indices: Uint16Array } {
        // Implement sphere geometry generation
        return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
    }

    private createCylinderGeometry(_radius: number, _height: number, _segments: number): { vertices: Float32Array; indices: Uint16Array } {
        // Implement cylinder geometry generation
        return { vertices: new Float32Array(0), indices: new Uint16Array(0) };
    }

    private createPlaneGeometry(width: number, height: number): { vertices: Float32Array; indices: Uint16Array } {
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        const vertices = new Float32Array([
            -halfWidth, 0, -halfHeight, 0, 1, 0, 0, 0,
            halfWidth, 0, -halfHeight, 0, 1, 0, 1, 0,
            halfWidth, 0, halfHeight, 0, 1, 0, 1, 1,
            -halfWidth, 0, halfHeight, 0, 1, 0, 0, 1
        ]);

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3
        ]);

        return { vertices, indices };
    }

    private loadTexture(_url: string): WebGLTexture {
        const gl = this.gl;
        const texture = gl.createTexture();
        // Implement texture loading
        return texture!;
    }

    removeVirtualObject(objectId: string): void {
        const object = this.virtualObjects.get(objectId);
        if (!object) return;

        // Clean up geometry
        if (object.vao) {
            this.gl.deleteVertexArray(object.vao);
        }

        // Clean up texture
        if (object.texture) {
            this.gl.deleteTexture(object.texture);
        }

        this.virtualObjects.delete(objectId);
    }

    // Real world anchors (for AR)
    createRealWorldAnchor(position: Vec3, rotation: Vec4): string {
        const anchorId = `anchor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const anchor: RealWorldAnchor = {
            id: anchorId,
            position: Vec3.clone(position),
            rotation: [...rotation],
            tracked: true,
            confidence: 1.0
        };

        this.realWorldAnchors.set(anchorId, anchor);
        return anchorId;
    }

    // Comfort and safety
    getComfortRating(): number {
        return this.comfortManager.getCurrentComfortRating();
    }

    checkSafety(): SafetyStatus {
        return this.safetyManager.checkSafety(this.headsetPose, this.virtualObjects);
    }

    // Performance monitoring
    getRenderStats(): VRRenderStats {
        return { ...this.renderStats };
    }

    // Session management
    endSession(): void {
        if (this.arSession) {
            this.arSession.end();
            this.arSession = null;
        }

        if (this.vrDisplay) {
            this.vrDisplay.exitPresent();
        }

        this._isVRActive = false;
        this._isARActive = false;
        this.currentMode = 'none';

        console.log('[AdvancedVRARSystem] Session ended');
    }

    // Cleanup
    dispose(): void {
        this.endSession();

        // Clean up framebuffers
        if (this.leftEyeFBO) this.gl.deleteFramebuffer(this.leftEyeFBO);
        if (this.rightEyeFBO) this.gl.deleteFramebuffer(this.rightEyeFBO);
        if (this.leftEyeTexture) this.gl.deleteTexture(this.leftEyeTexture);
        if (this.rightEyeTexture) this.gl.deleteTexture(this.rightEyeTexture);

        // Clean up shaders
        if (this.vrShader) this.gl.deleteProgram(this.vrShader);

        // Clean up audio
        if (this.spatialAudioContext) {
            this.spatialAudioContext.close();
        }

        // Clean up virtual objects
        for (const object of this.virtualObjects.values()) {
            this.removeVirtualObject(object.id);
        }

        console.log('[AdvancedVRARSystem] Disposed');
    }
}

// Supporting classes and interfaces
interface VRRenderStats {
    drawCalls: number;
    triangles: number;
    gpuMemory: number;
    latency: number;
}

interface HandTrackingData {
    joints: Map<string, XRJointPose>;
    pinchStrength: number;
    gesture: HandGesture;
}

type HandGesture = 'open' | 'fist' | 'pinch' | 'thumbs_up' | 'peace_sign' | 'point';

interface VirtualObject {
    id: string;
    position: Vec3;
    rotation: Vec4;
    scale: Vec3;
    color: Vec3;
    opacity: number;
    geometry?: GeometryConfig;
    material?: Material;
    physics?: any;
    interactions?: Interaction[];
    vao: WebGLVertexArrayObject | null;
    indexCount: number;
    texture: WebGLTexture | null;
}

interface VirtualObjectConfig {
    position: Vec3;
    rotation?: Vec4;
    scale?: Vec3;
    color?: Vec3;
    opacity?: number;
    geometry?: GeometryConfig;
    material?: Material;
    physics?: any;
    interactions?: Interaction[];
    texture?: string;
}

interface GeometryConfig {
    type: 'cube' | 'sphere' | 'cylinder' | 'plane';
    size?: number;
    radius?: number;
    height?: number;
    width?: number;
    segments?: number;
}

interface Material {
    baseColor: number[];
    metallic: number;
    roughness: number;
    emissive: number[];
    albedoTexture?: WebGLTexture;
    normalTexture?: WebGLTexture;
    metallicRoughnessTexture?: WebGLTexture;
    emissiveTexture?: WebGLTexture;
    occlusionTexture?: WebGLTexture;
    occlusionStrength: number;
    normalScale: number;
    transparent: boolean;
}

interface Interaction {
    type: 'grab' | 'touch' | 'point';
    callback: (object: VirtualObject, interaction: any) => void;
}

interface RealWorldAnchor {
    id: string;
    position: Vec3;
    rotation: Vec4;
    tracked: boolean;
    confidence: number;
}

interface Raycaster {
    origin: Vec3;
    direction: Vec3;
    intersectObject(object: VirtualObject): any;
}

interface VRInteractionManager {
    // Interaction management methods
}

interface GestureRecognizer {
    processGesture(gesture: HandGesture, handData: HandTrackingData): void;
    getRecognizedGestures(): RecognizedGesture[];
}

interface RecognizedGesture {
    type: string;
    confidence: number;
    data: any;
}

interface VRComfortManager {
    getCurrentComfortRating(): number;
}

interface VRSafetyManager {
    checkSafety(headsetPose: VRPose | null, objects: Map<string, VirtualObject>): SafetyStatus;
}

interface SafetyStatus {
    isSafe: boolean;
    warnings: string[];
    recommendations: string[];
}


// Stub implementations
class Raycaster {
    origin: Vec3 = Vec3.create();
    direction: Vec3 = Vec3.create();

    intersectObject(_object: VirtualObject): any {
        // Implement ray-object intersection
        return null;
    }
}

class VRInteractionManager {
    // Implementation
}

class GestureRecognizer {
    processGesture(_gesture: HandGesture, _handData: HandTrackingData): void {
        // Implementation
    }

    getRecognizedGestures(): RecognizedGesture[] {
        return [];
    }
}

class VRComfortManager {
    getCurrentComfortRating(): number {
        return 0.8; // Placeholder
    }
}

class VRSafetyManager {
    checkSafety(_headsetPose: VRPose | null, _objects: Map<string, VirtualObject>): SafetyStatus {
        return {
            isSafe: true,
            warnings: [],
            recommendations: []
        };
    }
}
