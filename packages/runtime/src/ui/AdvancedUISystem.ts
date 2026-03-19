import { Vec2, Vec3, Mat4 } from '../math';
import { World } from '../core/World';
import { Entity } from '@glix/shared';

/**
 * Advanced UI System with layout engine, themes, animations, and complex widgets.
 * Supports hierarchical UI elements, flexible layouts, styling, and interaction handling.
 */
export class AdvancedUISystem {
    private gl: WebGL2RenderingContext;
    private canvas: HTMLCanvasElement;
    private uiElements: Map<string, UIElement> = new Map();
    private themes: Map<string, UITheme> = new Map();
    private animations: Map<string, UIAnimation> = new Map();
    private activeTheme: string = 'default';
    private rootElement: UIElement | null = null;
    private focusedElement: UIElement | null = null;
    private hoveredElement: UIElement | null = null;
    private inputManager: any; // Reference to input system

    // Layout engine
    private layoutConstraints: Map<string, LayoutConstraint[]> = new Map();
    private layoutGroups: Map<string, LayoutGroup> = new Map();

    // Rendering
    private uiShader: WebGLProgram | null = null;
    private quadVAO: WebGLVertexArrayObject | null = null;
    private quadVBO: WebGLBuffer | null = null;
    private textureAtlas: WebGLTexture | null = null;

    // Text rendering
    private fontTextures: Map<string, WebGLTexture> = new Map();
    private textShader: WebGLProgram | null = null;
    private glyphCache: Map<string, GlyphInfo> = new Map();

    // Animation system
    private activeAnimations: Map<string, ActiveAnimation> = new Map();
    private animationQueue: AnimationFrame[] = [];

    // Event system
    private eventListeners: Map<string, UIEventCallback[]> = new Map();
    private eventQueue: UIEvent[] = [];

    // Accessibility
    private screenReader: ScreenReader | null = null;
    private focusRing: UIFocusRing | null = null;

    // Performance
    private dirtyElements: Set<string> = new Set();
    private renderBatches: UIRenderBatch[] = [];
    private vertexBuffer: Float32Array;
    private indexBuffer: Uint16Array;
    private maxVertices: number = 16384;
    private maxIndices: number = 24576;

    constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
        this.gl = gl;
        this.canvas = canvas;
        this.initializeShaders();
        this.initializeBuffers();
        this.initializeDefaultTheme();
        this.initializeDefaultElements();
        console.log('[AdvancedUISystem] Advanced UI system initialized');
    }

    private initializeShaders(): void {
        // UI shader for rendering quads, borders, gradients
        const uiVertexShader = `#version 300 es
            layout(location = 0) in vec2 a_position;
            layout(location = 1) in vec2 a_texCoord;
            layout(location = 2) in vec4 a_color;
            layout(location = 3) in float a_borderWidth;
            layout(location = 4) in vec4 a_borderColor;

            uniform mat4 u_projection;
            uniform mat4 u_model;

            out vec2 v_texCoord;
            out vec4 v_color;
            out float v_borderWidth;
            out vec4 v_borderColor;

            void main() {
                gl_Position = u_projection * u_model * vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
                v_color = a_color;
                v_borderWidth = a_borderWidth;
                v_borderColor = a_borderColor;
            }
        `;

        const uiFragmentShader = `#version 300 es
            precision mediump float;

            in vec2 v_texCoord;
            in vec4 v_color;
            in float v_borderWidth;
            in vec4 v_borderColor;

            uniform sampler2D u_texture;
            uniform int u_renderMode; // 0 = solid, 1 = gradient, 2 = border, 3 = image

            out vec4 outColor;

            void main() {
                if (u_renderMode == 0) {
                    // Solid color
                    outColor = v_color;
                } else if (u_renderMode == 1) {
                    // Gradient (simplified)
                    float gradient = v_texCoord.y;
                    outColor = mix(v_color, v_borderColor, gradient);
                } else if (u_renderMode == 2) {
                    // Border
                    float border = min(v_texCoord.x, min(v_texCoord.y, min(1.0 - v_texCoord.x, 1.0 - v_texCoord.y)));
                    outColor = border < v_borderWidth ? v_borderColor : v_color;
                } else if (u_renderMode == 3) {
                    // Image
                    vec4 texColor = texture(u_texture, v_texCoord);
                    outColor = texColor * v_color;
                }
            }
        `;

        this.uiShader = this.createShaderProgram(uiVertexShader, uiFragmentShader);

        // Text shader
        const textVertexShader = `#version 300 es
            layout(location = 0) in vec2 a_position;
            layout(location = 1) in vec2 a_texCoord;

            uniform mat4 u_projection;
            uniform mat4 u_model;

            out vec2 v_texCoord;

            void main() {
                gl_Position = u_projection * u_model * vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const textFragmentShader = `#version 300 es
            precision mediump float;

            in vec2 v_texCoord;

            uniform sampler2D u_fontTexture;
            uniform vec4 u_textColor;

            out vec4 outColor;

            void main() {
                float alpha = texture(u_fontTexture, v_texCoord).r;
                outColor = vec4(u_textColor.rgb, u_textColor.a * alpha);
            }
        `;

        this.textShader = this.createShaderProgram(textVertexShader, textFragmentShader);
    }

    private createShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
        const gl = this.gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader!, vertexSource);
        gl.compileShader(vertexShader!);

        if (!gl.getShaderParameter(vertexShader!, gl.COMPILE_STATUS)) {
            console.error('Vertex shader compilation error:', gl.getShaderInfoLog(vertexShader!));
            return null;
        }

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader!, fragmentSource);
        gl.compileShader(fragmentShader!);

        if (!gl.getShaderParameter(fragmentShader!, gl.COMPILE_STATUS)) {
            console.error('Fragment shader compilation error:', gl.getShaderInfoLog(fragmentShader!));
            return null;
        }

        const program = gl.createProgram();
        gl.attachShader(program!, vertexShader!);
        gl.attachShader(program!, fragmentShader!);
        gl.linkProgram(program!);

        if (!gl.getProgramParameter(program!, gl.LINK_STATUS)) {
            console.error('Shader program linking error:', gl.getProgramInfoLog(program!));
            return null;
        }

        return program!;
    }

    private initializeBuffers(): void {
        const gl = this.gl;

        // Create vertex buffer for UI quads
        this.vertexBuffer = new Float32Array(this.maxVertices * 8); // 8 floats per vertex (pos, texCoord, color, borderWidth, borderColor)
        this.indexBuffer = new Uint16Array(this.maxIndices);

        this.quadVAO = gl.createVertexArray();
        gl.bindVertexArray(this.quadVAO);

        this.quadVBO = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexBuffer, gl.DYNAMIC_DRAW);

        // Position attribute
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8 * 4, 0);

        // Texture coordinate attribute
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8 * 4, 2 * 4);

        // Color attribute
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 8 * 4, 4 * 4);

        // Border width and color attributes would need additional setup
        // For simplicity, we'll handle borders differently

        gl.bindVertexArray(null);
    }

    private initializeDefaultTheme(): void {
        const defaultTheme: UITheme = {
            name: 'default',
            colors: {
                primary: [0.2, 0.6, 1.0, 1.0],
                secondary: [0.8, 0.8, 0.8, 1.0],
                accent: [1.0, 0.8, 0.2, 1.0],
                background: [0.95, 0.95, 0.95, 1.0],
                surface: [1.0, 1.0, 1.0, 1.0],
                text: [0.1, 0.1, 0.1, 1.0],
                textSecondary: [0.5, 0.5, 0.5, 1.0],
                border: [0.8, 0.8, 0.8, 1.0],
                error: [1.0, 0.3, 0.3, 1.0],
                warning: [1.0, 0.8, 0.3, 1.0],
                success: [0.3, 1.0, 0.3, 1.0]
            },
            fonts: {
                default: {
                    family: 'Arial',
                    size: 14,
                    weight: 'normal',
                    style: 'normal'
                },
                heading: {
                    family: 'Arial',
                    size: 18,
                    weight: 'bold',
                    style: 'normal'
                },
                monospace: {
                    family: 'Monaco',
                    size: 12,
                    weight: 'normal',
                    style: 'normal'
                }
            },
            spacing: {
                xs: 4,
                sm: 8,
                md: 16,
                lg: 24,
                xl: 32
            },
            borderRadius: {
                none: 0,
                sm: 4,
                md: 8,
                lg: 12,
                full: 9999
            },
            shadows: {
                none: null,
                sm: { offsetX: 0, offsetY: 1, blur: 2, color: [0, 0, 0, 0.1] },
                md: { offsetX: 0, offsetY: 2, blur: 4, color: [0, 0, 0, 0.15] },
                lg: { offsetX: 0, offsetY: 4, blur: 8, color: [0, 0, 0, 0.2] }
            },
            transitions: {
                fast: { duration: 150, easing: 'ease-out' },
                normal: { duration: 250, easing: 'ease-out' },
                slow: { duration: 500, easing: 'ease-out' }
            }
        };

        this.themes.set('default', defaultTheme);
    }

    private initializeDefaultElements(): void {
        // Create root canvas element
        this.rootElement = {
            id: 'root',
            type: 'canvas',
            position: Vec2.fromValues(0, 0),
            size: Vec2.fromValues(this.canvas.width, this.canvas.height),
            style: {
                backgroundColor: this.getThemeColor('background'),
                visible: true,
                zIndex: 0
            },
            children: [],
            parent: null,
            enabled: true,
            interactive: false,
            clipChildren: false,
            layout: {
                type: 'absolute'
            }
        };

        this.uiElements.set('root', this.rootElement);
    }

    // UI Element Management
    createElement(type: UIElementType, config: Partial<UIElement>): string {
        const elementId = `ui_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const element: UIElement = {
            id: elementId,
            type,
            position: Vec2.fromValues(0, 0),
            size: Vec2.fromValues(100, 100),
            style: {
                backgroundColor: this.getThemeColor('surface'),
                borderColor: this.getThemeColor('border'),
                borderWidth: 1,
                borderRadius: this.getThemeBorderRadius('sm'),
                visible: true,
                zIndex: 1
            },
            children: [],
            parent: null,
            enabled: true,
            interactive: true,
            clipChildren: false,
            layout: {
                type: 'absolute'
            },
            ...config
        };

        // Set default properties based on type
        switch (type) {
            case 'button':
                element.text = element.text || 'Button';
                element.style!.padding = this.getThemeSpacing('sm');
                element.onClick = element.onClick || (() => {});
                break;

            case 'label':
                element.text = element.text || 'Label';
                element.style!.padding = this.getThemeSpacing('xs');
                break;

            case 'textbox':
                element.text = element.text || '';
                element.placeholder = element.placeholder || 'Enter text...';
                element.style!.padding = this.getThemeSpacing('sm');
                element.style!.borderWidth = 2;
                break;

            case 'slider':
                element.min = element.min || 0;
                element.max = element.max || 100;
                element.value = element.value || 0;
                break;

            case 'checkbox':
                element.checked = element.checked || false;
                break;

            case 'progressbar':
                element.progress = element.progress || 0;
                element.max = element.max || 1;
                break;

            case 'image':
                element.image = element.image || '';
                break;

            case 'panel':
                element.layout = { type: 'vertical', spacing: this.getThemeSpacing('sm') };
                break;

            case 'scrollview':
                element.scrollPosition = Vec2.fromValues(0, 0);
                element.contentSize = Vec2.clone(element.size!);
                break;
        }

        this.uiElements.set(elementId, element);
        this.dirtyElements.add(elementId);

        // Add to parent if specified
        if (config.parent) {
            this.addChild(config.parent, elementId);
        } else {
            this.addChild('root', elementId);
        }

        console.log(`[AdvancedUISystem] Created ${type} element: ${elementId}`);
        return elementId;
    }

    destroyElement(elementId: string): void {
        const element = this.uiElements.get(elementId);
        if (!element) return;

        // Remove from parent
        if (element.parent) {
            const parent = this.uiElements.get(element.parent);
            if (parent && parent.children) {
                const index = parent.children.indexOf(elementId);
                if (index > -1) {
                    parent.children.splice(index, 1);
                }
            }
        }

        // Destroy children recursively
        if (element.children) {
            for (const childId of element.children) {
                this.destroyElement(childId);
            }
        }

        // Clean up resources
        this.uiElements.delete(elementId);
        this.dirtyElements.delete(elementId);
        this.layoutConstraints.delete(elementId);
        this.activeAnimations.delete(elementId);

        console.log(`[AdvancedUISystem] Destroyed element: ${elementId}`);
    }

    addChild(parentId: string, childId: string): void {
        const parent = this.uiElements.get(parentId);
        const child = this.uiElements.get(childId);

        if (!parent || !child) return;

        if (!parent.children) parent.children = [];
        if (!parent.children.includes(childId)) {
            parent.children.push(childId);
            child.parent = parentId;
            this.dirtyElements.add(parentId);
            this.dirtyElements.add(childId);
        }
    }

    removeChild(parentId: string, childId: string): void {
        const parent = this.uiElements.get(parentId);
        if (!parent || !parent.children) return;

        const index = parent.children.indexOf(childId);
        if (index > -1) {
            parent.children.splice(index, 1);
            const child = this.uiElements.get(childId);
            if (child) {
                child.parent = null;
            }
            this.dirtyElements.add(parentId);
        }
    }

    // Layout System
    setLayout(elementId: string, layout: UILayout): void {
        const element = this.uiElements.get(elementId);
        if (!element) return;

        element.layout = layout;
        this.dirtyElements.add(elementId);

        // Mark all children as dirty too
        this.markChildrenDirty(elementId);
    }

    private markChildrenDirty(elementId: string): void {
        const element = this.uiElements.get(elementId);
        if (!element || !element.children) return;

        for (const childId of element.children) {
            this.dirtyElements.add(childId);
            this.markChildrenDirty(childId);
        }
    }

    addLayoutConstraint(elementId: string, constraint: LayoutConstraint): void {
        if (!this.layoutConstraints.has(elementId)) {
            this.layoutConstraints.set(elementId, []);
        }
        this.layoutConstraints.get(elementId)!.push(constraint);
        this.dirtyElements.add(elementId);
    }

    updateLayout(elementId: string): void {
        const element = this.uiElements.get(elementId);
        if (!element) return;

        const layout = element.layout;
        if (!layout) return;

        switch (layout.type) {
            case 'absolute':
                // No automatic layout
                break;

            case 'horizontal':
                this.applyHorizontalLayout(element);
                break;

            case 'vertical':
                this.applyVerticalLayout(element);
                break;

            case 'grid':
                this.applyGridLayout(element);
                break;

            case 'flex':
                this.applyFlexLayout(element);
                break;
        }

        // Apply constraints
        const constraints = this.layoutConstraints.get(elementId);
        if (constraints) {
            for (const constraint of constraints) {
                this.applyConstraint(element, constraint);
            }
        }
    }

    private applyHorizontalLayout(element: UIElement): void {
        if (!element.children || element.children.length === 0) return;

        const spacing = (element.layout as any).spacing || 0;
        let currentX = 0;

        for (const childId of element.children) {
            const child = this.uiElements.get(childId);
            if (!child) continue;

            Vec2.set(child.position!, currentX, child.position![1]);
            currentX += child.size![0] + spacing;
        }
    }

    private applyVerticalLayout(element: UIElement): void {
        if (!element.children || element.children.length === 0) return;

        const spacing = (element.layout as any).spacing || 0;
        let currentY = 0;

        for (const childId of element.children) {
            const child = this.uiElements.get(childId);
            if (!child) continue;

            Vec2.set(child.position!, child.position![0], currentY);
            currentY += child.size![1] + spacing;
        }
    }

    private applyGridLayout(element: UIElement): void {
        if (!element.children || element.children.length === 0) return;

        const gridLayout = element.layout as any;
        const cols = gridLayout.columns || Math.ceil(Math.sqrt(element.children.length));
        const rows = Math.ceil(element.children.length / cols);
        const spacing = gridLayout.spacing || 0;

        let index = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (index >= element.children.length) break;

                const childId = element.children[index];
                const child = this.uiElements.get(childId);
                if (!child) continue;

                const x = col * (child.size![0] + spacing);
                const y = row * (child.size![1] + spacing);
                Vec2.set(child.position!, x, y);

                index++;
            }
        }
    }

    private applyFlexLayout(element: UIElement): void {
        if (!element.children || element.children.length === 0) return;

        const flexLayout = element.layout as any;
        const direction = flexLayout.direction || 'row';
        const justify = flexLayout.justify || 'start';
        const align = flexLayout.align || 'stretch';
        const spacing = flexLayout.spacing || 0;

        if (direction === 'row') {
            this.applyFlexRow(element, justify, align, spacing);
        } else {
            this.applyFlexColumn(element, justify, align, spacing);
        }
    }

    private applyFlexRow(element: UIElement, justify: string, align: string, spacing: number): void {
        const children = element.children!.map(id => this.uiElements.get(id)!).filter(Boolean);
        const totalWidth = children.reduce((sum, child) => sum + child.size![0], 0) + spacing * (children.length - 1);
        const availableWidth = element.size![0] - totalWidth;

        let currentX = 0;

        // Justify content
        switch (justify) {
            case 'center':
                currentX = availableWidth / 2;
                break;
            case 'end':
                currentX = availableWidth;
                break;
            case 'space-between':
                if (children.length > 1) {
                    const space = availableWidth / (children.length - 1);
                    children.forEach((child, index) => {
                        if (index > 0) currentX += space;
                        Vec2.set(child.position!, currentX, child.position![1]);
                        currentX += child.size![0] + spacing;
                    });
                    return;
                }
                break;
            case 'space-around':
                if (children.length > 0) {
                    const space = availableWidth / children.length;
                    currentX = space / 2;
                }
                break;
        }

        // Position children
        for (const child of children) {
            // Align items
            let y = child.position![1];
            switch (align) {
                case 'center':
                    y = (element.size![1] - child.size![1]) / 2;
                    break;
                case 'end':
                    y = element.size![1] - child.size![1];
                    break;
            }

            Vec2.set(child.position!, currentX, y);
            currentX += child.size![0] + spacing;
        }
    }

    private applyFlexColumn(element: UIElement, justify: string, align: string, spacing: number): void {
        // Similar to row but vertical
        const children = element.children!.map(id => this.uiElements.get(id)!).filter(Boolean);
        const totalHeight = children.reduce((sum, child) => sum + child.size![1], 0) + spacing * (children.length - 1);
        const availableHeight = element.size![1] - totalHeight;

        let currentY = 0;

        // Justify content
        switch (justify) {
            case 'center':
                currentY = availableHeight / 2;
                break;
            case 'end':
                currentY = availableHeight;
                break;
        }

        // Position children
        for (const child of children) {
            let x = child.position![0];
            switch (align) {
                case 'center':
                    x = (element.size![0] - child.size![0]) / 2;
                    break;
                case 'end':
                    x = element.size![0] - child.size![0];
                    break;
            }

            Vec2.set(child.position!, x, currentY);
            currentY += child.size![1] + spacing;
        }
    }

    private applyConstraint(element: UIElement, constraint: LayoutConstraint): void {
        switch (constraint.type) {
            case 'aspectRatio':
                const ratio = constraint.value as number;
                if (element.size![0] > element.size![1]) {
                    element.size![1] = element.size![0] / ratio;
                } else {
                    element.size![0] = element.size![1] * ratio;
                }
                break;

            case 'minWidth':
                element.size![0] = Math.max(element.size![0], constraint.value as number);
                break;

            case 'maxWidth':
                element.size![0] = Math.min(element.size![0], constraint.value as number);
                break;

            case 'minHeight':
                element.size![1] = Math.max(element.size![1], constraint.value as number);
                break;

            case 'maxHeight':
                element.size![1] = Math.min(element.size![1], constraint.value as number);
                break;
        }
    }

    // Animation System
    createAnimation(elementId: string, animation: UIAnimation): string {
        const animationId = `anim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        this.animations.set(animationId, animation);

        // Start animation immediately
        this.startAnimation(animationId, elementId);

        return animationId;
    }

    private startAnimation(animationId: string, elementId: string): void {
        const animation = this.animations.get(animationId);
        const element = this.uiElements.get(elementId);

        if (!animation || !element) return;

        const activeAnimation: ActiveAnimation = {
            id: animationId,
            elementId,
            animation,
            startTime: performance.now(),
            currentTime: 0,
            completed: false,
            paused: false
        };

        this.activeAnimations.set(animationId, activeAnimation);
    }

    updateAnimations(deltaTime: number): void {
        for (const [animationId, activeAnim] of this.activeAnimations) {
            if (activeAnim.paused || activeAnim.completed) continue;

            activeAnim.currentTime += deltaTime;

            const element = this.uiElements.get(activeAnim.elementId);
            if (!element) {
                activeAnim.completed = true;
                continue;
            }

            const progress = Math.min(activeAnim.currentTime / activeAnim.animation.duration, 1.0);
            const easedProgress = this.applyEasing(activeAnim.animation.easing, progress);

            // Apply animation keyframes
            for (const keyframe of activeAnim.animation.keyframes) {
                if (keyframe.time <= progress) {
                    this.applyKeyframe(element, keyframe);
                }
            }

            if (progress >= 1.0) {
                activeAnim.completed = true;
                if (activeAnim.animation.loop) {
                    activeAnim.currentTime = 0;
                    activeAnim.completed = false;
                }
            }

            this.dirtyElements.add(activeAnim.elementId);
        }

        // Clean up completed animations
        for (const [animationId, activeAnim] of this.activeAnimations) {
            if (activeAnim.completed && !activeAnim.animation.loop) {
                this.activeAnimations.delete(animationId);
            }
        }
    }

    private applyEasing(easing: string, t: number): number {
        switch (easing) {
            case 'ease-in':
                return t * t;
            case 'ease-out':
                return 1 - (1 - t) * (1 - t);
            case 'ease-in-out':
                return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            case 'linear':
            default:
                return t;
        }
    }

    private applyKeyframe(element: UIElement, keyframe: UIKeyframe): void {
        if (keyframe.position) {
            Vec2.copy(element.position!, keyframe.position);
        }

        if (keyframe.size) {
            Vec2.copy(element.size!, keyframe.size);
        }

        if (keyframe.rotation !== undefined) {
            element.rotation = keyframe.rotation;
        }

        if (keyframe.opacity !== undefined) {
            if (element.style) {
                element.style.opacity = keyframe.opacity;
            }
        }

        if (keyframe.scale !== undefined) {
            element.scale = keyframe.scale;
        }
    }

    pauseAnimation(animationId: string): void {
        const activeAnim = this.activeAnimations.get(animationId);
        if (activeAnim) {
            activeAnim.paused = true;
        }
    }

    resumeAnimation(animationId: string): void {
        const activeAnim = this.activeAnimations.get(animationId);
        if (activeAnim) {
            activeAnim.paused = false;
        }
    }

    stopAnimation(animationId: string): void {
        this.activeAnimations.delete(animationId);
    }

    // Event System
    addEventListener(elementId: string, eventType: string, callback: UIEventCallback): void {
        const key = `${elementId}:${eventType}`;
        if (!this.eventListeners.has(key)) {
            this.eventListeners.set(key, []);
        }
        this.eventListeners.get(key)!.push(callback);
    }

    removeEventListener(elementId: string, eventType: string, callback: UIEventCallback): void {
        const key = `${elementId}:${eventType}`;
        const listeners = this.eventListeners.get(key);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    private dispatchEvent(elementId: string, event: UIEvent): void {
        const key = `${elementId}:${event.type}`;
        const listeners = this.eventListeners.get(key);

        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(event);
                } catch (error) {
                    console.error(`[AdvancedUISystem] Error in event listener for ${key}:`, error);
                }
            }
        }

        // Bubble up to parent
        const element = this.uiElements.get(elementId);
        if (element && element.parent) {
            this.dispatchEvent(element.parent, event);
        }
    }

    // Input Handling
    handleInput(inputManager: any): void {
        this.inputManager = inputManager;

        // Handle mouse input
        const mousePos = inputManager.getMousePosition();
        const mouseButtons = [];

        for (let i = 0; i < 3; i++) {
            mouseButtons.push(inputManager.isMouseButtonDown(i));
        }

        // Find hovered element
        const hoveredElement = this.findElementAtPosition(mousePos[0], mousePos[1]);
        if (hoveredElement !== this.hoveredElement) {
            if (this.hoveredElement) {
                this.dispatchEvent(this.hoveredElement.id, {
                    type: 'mouseleave',
                    target: this.hoveredElement.id,
                    position: mousePos
                });
            }

            this.hoveredElement = hoveredElement;
            if (hoveredElement) {
                this.dispatchEvent(hoveredElement.id, {
                    type: 'mouseenter',
                    target: hoveredElement.id,
                    position: mousePos
                });
            }
        }

        // Handle mouse button events
        if (inputManager.isMouseButtonPressed(0) && hoveredElement) {
            this.focusedElement = hoveredElement;
            this.dispatchEvent(hoveredElement.id, {
                type: 'mousedown',
                target: hoveredElement.id,
                position: mousePos,
                button: 0
            });
        }

        if (inputManager.isMouseButtonReleased(0) && hoveredElement) {
            this.dispatchEvent(hoveredElement.id, {
                type: 'mouseup',
                target: hoveredElement.id,
                position: mousePos,
                button: 0
            });

            this.dispatchEvent(hoveredElement.id, {
                type: 'click',
                target: hoveredElement.id,
                position: mousePos,
                button: 0
            });
        }

        // Handle keyboard input for focused element
        if (this.focusedElement) {
            // Handle text input
            const textInput = inputManager.getTextInput();
            if (textInput && this.focusedElement.type === 'textbox') {
                this.focusedElement.text = (this.focusedElement.text || '') + textInput;
                this.dirtyElements.add(this.focusedElement.id);
            }

            // Handle special keys
            if (inputManager.isKeyPressed(13) && this.focusedElement.type === 'textbox') { // Enter
                this.dispatchEvent(this.focusedElement.id, {
                    type: 'submit',
                    target: this.focusedElement.id
                });
            }

            if (inputManager.isKeyPressed(27)) { // Escape
                this.focusedElement = null;
            }
        }
    }

    private findElementAtPosition(x: number, y: number): UIElement | null {
        // Start from root and traverse in reverse paint order (top to bottom)
        return this.findElementAtPositionRecursive(this.rootElement!, x, y);
    }

    private findElementAtPositionRecursive(element: UIElement, x: number, y: number): UIElement | null {
        if (!element.enabled || !element.interactive || !element.style?.visible) return null;

        // Check children first (reverse order for top-to-bottom)
        if (element.children) {
            for (let i = element.children.length - 1; i >= 0; i--) {
                const child = this.uiElements.get(element.children[i]);
                if (child) {
                    const result = this.findElementAtPositionRecursive(child, x, y);
                    if (result) return result;
                }
            }
        }

        // Check if point is within this element
        const left = element.position![0];
        const top = element.position![1];
        const right = left + element.size![0];
        const bottom = top + element.size![1];

        if (x >= left && x <= right && y >= top && y <= bottom) {
            return element;
        }

        return null;
    }

    // Rendering
    render(): void {
        const gl = this.gl;

        // Update layouts for dirty elements
        for (const elementId of this.dirtyElements) {
            this.updateLayout(elementId);
        }
        this.dirtyElements.clear();

        // Sort elements by z-index
        const sortedElements = Array.from(this.uiElements.values())
            .filter(element => element.style?.visible)
            .sort((a, b) => (a.style?.zIndex || 0) - (b.style?.zIndex || 0));

        // Build render batches
        this.buildRenderBatches(sortedElements);

        // Set up OpenGL state
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);

        // Set up projection matrix
        const projection = Mat4.create();
        Mat4.ortho(projection, 0, this.canvas.width, this.canvas.height, 0, -1, 1);

        // Render batches
        for (const batch of this.renderBatches) {
            this.renderBatch(batch, projection);
        }

        // Render text elements separately
        this.renderTextElements(sortedElements, projection);

        // Render focus ring if needed
        if (this.focusedElement && this.focusRing) {
            this.renderFocusRing(this.focusedElement, projection);
        }
    }

    private buildRenderBatches(elements: UIElement[]): void {
        this.renderBatches.length = 0;

        let currentBatch: UIRenderBatch | null = null;

        for (const element of elements) {
            if (element.type === 'label' || element.type === 'textbox') continue; // Text elements handled separately

            if (!currentBatch || !this.canAddToBatch(currentBatch, element)) {
                currentBatch = {
                    texture: null,
                    elements: [],
                    vertexCount: 0,
                    indexCount: 0
                };
                this.renderBatches.push(currentBatch);
            }

            currentBatch.elements.push(element);
            currentBatch.vertexCount += 4; // 4 vertices per quad
            currentBatch.indexCount += 6;  // 6 indices per quad
        }
    }

    private canAddToBatch(batch: UIRenderBatch, element: UIElement): boolean {
        // For now, keep all elements in separate batches for simplicity
        // In a real implementation, you'd group by texture, shader, etc.
        return false;
    }

    private renderBatch(batch: UIRenderBatch, projection: Mat4): void {
        if (batch.elements.length === 0) return;

        const gl = this.gl;

        // Use UI shader
        gl.useProgram(this.uiShader);

        // Set uniforms
        const projectionLoc = gl.getUniformLocation(this.uiShader!, 'u_projection');
        gl.uniformMatrix4fv(projectionLoc, false, projection);

        // Bind VAO
        gl.bindVertexArray(this.quadVAO);

        let vertexOffset = 0;
        let indexOffset = 0;

        for (const element of batch.elements) {
            this.renderElement(element, vertexOffset, indexOffset);
            vertexOffset += 4;
            indexOffset += 6;
        }

        // Unbind
        gl.bindVertexArray(null);
    }

    private renderElement(element: UIElement, vertexOffset: number, indexOffset: number): void {
        const gl = this.gl;

        // Calculate vertex positions
        const x = element.position![0];
        const y = element.position![1];
        const w = element.size![0];
        const h = element.size![1];

        // Update vertex buffer
        const vertices = [
            // Position (x, y), TexCoord (u, v), Color (r, g, b, a)
            x, y, 0, 0, ...element.style!.backgroundColor!, // Top-left
            x + w, y, 1, 0, ...element.style!.backgroundColor!, // Top-right
            x + w, y + h, 1, 1, ...element.style!.backgroundColor!, // Bottom-right
            x, y + h, 0, 1, ...element.style!.backgroundColor!  // Bottom-left
        ];

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
        gl.bufferSubData(gl.ARRAY_BUFFER, vertexOffset * 8 * 4, new Float32Array(vertices));

        // Set model matrix
        const model = Mat4.create();
        const modelLoc = gl.getUniformLocation(this.uiShader!, 'u_model');
        gl.uniformMatrix4fv(modelLoc, false, model);

        // Set render mode
        const renderModeLoc = gl.getUniformLocation(this.uiShader!, 'u_renderMode');
        let renderMode = 0; // solid

        if (element.type === 'image' && element.image) {
            renderMode = 3; // image
            // Bind texture
        }

        gl.uniform1i(renderModeLoc, renderMode);

        // Draw
        gl.drawArrays(gl.TRIANGLE_FAN, vertexOffset, 4);
    }

    private renderTextElements(elements: UIElement[], projection: Mat4): void {
        const textElements = elements.filter(el => el.type === 'label' || el.type === 'textbox');

        if (textElements.length === 0) return;

        const gl = this.gl;
        gl.useProgram(this.textShader);

        const projectionLoc = gl.getUniformLocation(this.textShader!, 'u_projection');
        gl.uniformMatrix4fv(projectionLoc, false, projection);

        for (const element of textElements) {
            this.renderTextElement(element);
        }
    }

    private renderTextElement(element: UIElement): void {
        const text = element.text || '';
        if (!text) return;

        const gl = this.gl;

        // Get font texture
        const fontTexture = this.getFontTexture(element.style?.fontFamily || 'Arial');
        if (!fontTexture) return;

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fontTexture);

        const textureLoc = gl.getUniformLocation(this.textShader!, 'u_fontTexture');
        gl.uniform1i(textureLoc, 0);

        const colorLoc = gl.getUniformLocation(this.textShader!, 'u_textColor');
        const textColor = element.style?.color || this.getThemeColor('text');
        gl.uniform4fv(colorLoc, textColor);

        // Render each character
        let x = element.position![0] + (element.style?.padding || 0);
        const y = element.position![1] + (element.style?.padding || 0);

        for (const char of text) {
            const glyph = this.getGlyphInfo(char);
            if (!glyph) continue;

            // Calculate glyph position and size
            const glyphX = x + glyph.offsetX;
            const glyphY = y + glyph.offsetY;
            const glyphW = glyph.width;
            const glyphH = glyph.height;

            // Create quad for glyph
            const vertices = new Float32Array([
                glyphX, glyphY, glyph.u0, glyph.v0,
                glyphX + glyphW, glyphY, glyph.u1, glyph.v0,
                glyphX + glyphW, glyphY + glyphH, glyph.u1, glyph.v1,
                glyphX, glyphY + glyphH, glyph.u0, glyph.v1
            ]);

            // Upload vertices and draw
            const tempBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, tempBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

            gl.enableVertexAttribArray(0);
            gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(1);
            gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

            gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

            gl.deleteBuffer(tempBuffer);

            x += glyph.advance;
        }
    }

    private renderFocusRing(element: UIElement, projection: Mat4): void {
        // Render focus ring around focused element
        const gl = this.gl;

        // Simple outline for now
        const x = element.position![0] - 2;
        const y = element.position![1] - 2;
        const w = element.size![0] + 4;
        const h = element.size![1] + 4;

        // Draw outline using UI shader
        gl.useProgram(this.uiShader);

        const projectionLoc = gl.getUniformLocation(this.uiShader!, 'u_projection');
        gl.uniformMatrix4fv(projectionLoc, false, projection);

        const model = Mat4.create();
        const modelLoc = gl.getUniformLocation(this.uiShader!, 'u_model');
        gl.uniformMatrix4fv(modelLoc, false, model);

        const renderModeLoc = gl.getUniformLocation(this.uiShader!, 'u_renderMode');
        gl.uniform1i(renderModeLoc, 2); // border mode

        // Outline color
        const color = [0, 0.5, 1, 1]; // Blue outline

        const vertices = new Float32Array([
            x, y, 0, 0, ...color,
            x + w, y, 1, 0, ...color,
            x + w, y + h, 1, 1, ...color,
            x, y + h, 0, 1, ...color
        ]);

        const tempBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, tempBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 8);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 24, 16);

        gl.drawArrays(gl.LINE_LOOP, 0, 4);
        gl.deleteBuffer(tempBuffer);
    }

    // Font and text rendering
    private getFontTexture(fontFamily: string): WebGLTexture | null {
        return this.fontTextures.get(fontFamily) || null;
    }

    private getGlyphInfo(char: string): GlyphInfo | null {
        // Return cached glyph info or generate it
        if (this.glyphCache.has(char)) {
            return this.glyphCache.get(char)!;
        }

        // For now, return a simple placeholder
        // In a real implementation, you'd measure and cache actual glyph metrics
        const glyph: GlyphInfo = {
            width: 8,
            height: 12,
            offsetX: 0,
            offsetY: 0,
            advance: 8,
            u0: 0,
            v0: 0,
            u1: 1,
            v1: 1
        };

        this.glyphCache.set(char, glyph);
        return glyph;
    }

    // Theme system
    setTheme(themeName: string): void {
        if (this.themes.has(themeName)) {
            this.activeTheme = themeName;
            this.dirtyElements.clear();
            // Mark all elements as dirty to refresh with new theme
            for (const elementId of this.uiElements.keys()) {
                this.dirtyElements.add(elementId);
            }
        }
    }

    addTheme(theme: UITheme): void {
        this.themes.set(theme.name, theme);
    }

    getThemeColor(colorName: string): number[] {
        const theme = this.themes.get(this.activeTheme);
        return theme?.colors[colorName as keyof typeof theme.colors] || [1, 1, 1, 1];
    }

    getThemeFont(fontName: string): UIFont {
        const theme = this.themes.get(this.activeTheme);
        return theme?.fonts[fontName as keyof typeof theme.fonts] || theme!.fonts.default;
    }

    getThemeSpacing(spacingName: string): number {
        const theme = this.themes.get(this.activeTheme);
        return theme?.spacing[spacingName as keyof typeof theme.spacing] || 8;
    }

    getThemeBorderRadius(radiusName: string): number {
        const theme = this.themes.get(this.activeTheme);
        return theme?.borderRadius[radiusName as keyof typeof theme.borderRadius] || 0;
    }

    // Utility methods
    getElement(elementId: string): UIElement | undefined {
        return this.uiElements.get(elementId);
    }

    setElementProperty(elementId: string, property: string, value: any): void {
        const element = this.uiElements.get(elementId);
        if (!element) return;

        // Navigate nested properties
        const parts = property.split('.');
        let target: any = element;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!target[parts[i]]) target[parts[i]] = {};
            target = target[parts[i]];
        }

        target[parts[parts.length - 1]] = value;
        this.dirtyElements.add(elementId);
    }

    getElementProperty(elementId: string, property: string): any {
        const element = this.uiElements.get(elementId);
        if (!element) return undefined;

        const parts = property.split('.');
        let target: any = element;

        for (const part of parts) {
            if (target[part] === undefined) return undefined;
            target = target[part];
        }

        return target;
    }

    // Debug and inspection
    getDebugInfo(): any {
        return {
            elementCount: this.uiElements.size,
            dirtyElements: this.dirtyElements.size,
            activeAnimations: this.activeAnimations.size,
            renderBatches: this.renderBatches.length,
            theme: this.activeTheme,
            focusedElement: this.focusedElement?.id,
            hoveredElement: this.hoveredElement?.id
        };
    }

    // Cleanup
    dispose(): void {
        const gl = this.gl;

        if (this.uiShader) gl.deleteProgram(this.uiShader);
        if (this.textShader) gl.deleteProgram(this.textShader);
        if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
        if (this.quadVBO) gl.deleteBuffer(this.quadVBO);

        for (const texture of this.fontTextures.values()) {
            gl.deleteTexture(texture);
        }

        this.uiElements.clear();
        this.themes.clear();
        this.animations.clear();
        this.activeAnimations.clear();
        this.eventListeners.clear();
        this.dirtyElements.clear();
        this.layoutConstraints.clear();

        console.log('[AdvancedUISystem] Disposed');
    }
}

// Type definitions
type UIElementType = 'canvas' | 'panel' | 'button' | 'label' | 'textbox' | 'slider' | 'checkbox' | 'progressbar' | 'image' | 'scrollview';

interface UIElement {
    id: string;
    type: UIElementType;
    position: Vec2;
    size: Vec2;
    rotation?: number;
    scale?: number;
    style?: UIStyle;
    text?: string;
    placeholder?: string;
    children?: string[];
    parent: string | null;
    enabled: boolean;
    interactive: boolean;
    clipChildren: boolean;
    layout?: UILayout;

    // Type-specific properties
    onClick?: () => void;
    onChange?: (value: any) => void;
    min?: number;
    max?: number;
    value?: number;
    checked?: boolean;
    progress?: number;
    image?: string;
    scrollPosition?: Vec2;
    contentSize?: Vec2;
}

interface UIStyle {
    backgroundColor?: number[];
    borderColor?: number[];
    borderWidth?: number;
    borderRadius?: number;
    color?: number[];
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    padding?: number;
    margin?: number;
    opacity?: number;
    visible?: boolean;
    zIndex?: number;
    shadow?: UIShadow;
}

interface UIShadow {
    offsetX: number;
    offsetY: number;
    blur: number;
    color: number[];
}

interface UILayout {
    type: 'absolute' | 'horizontal' | 'vertical' | 'grid' | 'flex';
    spacing?: number;
    columns?: number;
    direction?: 'row' | 'column';
    justify?: 'start' | 'center' | 'end' | 'space-between' | 'space-around';
    align?: 'start' | 'center' | 'end' | 'stretch';
}

interface LayoutConstraint {
    type: 'aspectRatio' | 'minWidth' | 'maxWidth' | 'minHeight' | 'maxHeight';
    value: number;
}

interface LayoutGroup {
    id: string;
    elements: string[];
    layout: UILayout;
}

interface UITheme {
    name: string;
    colors: {
        primary: number[];
        secondary: number[];
        accent: number[];
        background: number[];
        surface: number[];
        text: number[];
        textSecondary: number[];
        border: number[];
        error: number[];
        warning: number[];
        success: number[];
    };
    fonts: {
        default: UIFont;
        heading: UIFont;
        monospace: UIFont;
    };
    spacing: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
    };
    borderRadius: {
        none: number;
        sm: number;
        md: number;
        lg: number;
        full: number;
    };
    shadows: {
        none: any;
        sm: UIShadow;
        md: UIShadow;
        lg: UIShadow;
    };
    transitions: {
        fast: UITransition;
        normal: UITransition;
        slow: UITransition;
    };
}

interface UIFont {
    family: string;
    size: number;
    weight: string;
    style: string;
}

interface UITransition {
    duration: number;
    easing: string;
}

interface UIAnimation {
    id: string;
    duration: number;
    loop: boolean;
    easing: string;
    keyframes: UIKeyframe[];
}

interface UIKeyframe {
    time: number;
    position?: Vec2;
    size?: Vec2;
    rotation?: number;
    opacity?: number;
    scale?: number;
}

interface ActiveAnimation {
    id: string;
    elementId: string;
    animation: UIAnimation;
    startTime: number;
    currentTime: number;
    completed: boolean;
    paused: boolean;
}

interface UIEvent {
    type: string;
    target: string;
    position?: Vec2;
    button?: number;
    key?: string;
    delta?: Vec2;
}

type UIEventCallback = (event: UIEvent) => void;

interface UIRenderBatch {
    texture: WebGLTexture | null;
    elements: UIElement[];
    vertexCount: number;
    indexCount: number;
}

interface ScreenReader {
    announce(message: string): void;
    setElementLabel(elementId: string, label: string): void;
}

interface UIFocusRing {
    color: number[];
    width: number;
    style: 'solid' | 'dashed';
}

interface GlyphInfo {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    advance: number;
    u0: number;
    v0: number;
    u1: number;
    v1: number;
}
