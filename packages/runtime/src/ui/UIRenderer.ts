import { World } from '../core/World';
import { Mat4 } from '../math';

function hexToRgba(hex: string): [number, number, number, number] {
    let r = 0, g = 0, b = 0, a = 1;
    if (hex.startsWith('#')) {
        if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16) / 255;
            g = parseInt(hex.slice(3, 5), 16) / 255;
            b = parseInt(hex.slice(5, 7), 16) / 255;
        } else if (hex.length === 9) {
            r = parseInt(hex.slice(1, 3), 16) / 255;
            g = parseInt(hex.slice(3, 5), 16) / 255;
            b = parseInt(hex.slice(5, 7), 16) / 255;
            a = parseInt(hex.slice(7, 9), 16) / 255;
        }
    } else if (hex.startsWith('rgba')) {
        const parts = hex.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (parts) {
            r = parseInt(parts[1]) / 255;
            g = parseInt(parts[2]) / 255;
            b = parseInt(parts[3]) / 255;
            a = parts[4] !== undefined ? parseFloat(parts[4]) : 1;
        }
    }
    return [r, g, b, a];
}

export class UIRenderer {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private quadBuffer: WebGLBuffer;

    private textCanvas: HTMLCanvasElement;
    private textCtx: CanvasRenderingContext2D;
    private textTextures: Map<string, { tex: WebGLTexture, width: number, height: number }> = new Map();
    private textCacheKeys: Map<string, string> = new Map();

    private uniformLocs: Record<string, WebGLUniformLocation | null> = {};

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.program = this.createProgram()!;
        this.quadBuffer = this.createQuadBuffer();

        this.textCanvas = document.createElement('canvas');
        this.textCtx = this.textCanvas.getContext('2d')!;

        this.cacheUniforms();
    }

    private cacheUniforms() {
        const uniforms = ['u_projection', 'u_model', 'u_type', 'u_color', 'u_fillColor', 'u_progress', 'u_dimensions', 'u_borderRadius', 'u_texture'];
        for (const u of uniforms) {
            this.uniformLocs[u] = this.gl.getUniformLocation(this.program, u);
        }
    }

    private createShader(type: number, source: string): WebGLShader | null {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    private createProgram(): WebGLProgram | null {
        const vsSource = `#version 300 es
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

        const fsSource = `#version 300 es
            precision mediump float;

            in vec2 v_texCoord;
            out vec4 outColor;

            uniform int u_type; // 0: Solid, 1: Textured, 2: ProgressBar
            uniform vec4 u_color;
            uniform vec4 u_fillColor;
            uniform float u_progress;
            uniform float u_borderRadius;
            uniform vec2 u_dimensions;
            uniform sampler2D u_texture;

            float roundedBoxSDF(vec2 CenterPosition, vec2 Size, float Radius) {
                return length(max(abs(CenterPosition)-Size+Radius,0.0))-Radius;
            }

            void main() {
                if (u_type == 0) {
                    if (u_borderRadius > 0.0) {
                        vec2 pos = v_texCoord * u_dimensions;
                        vec2 halfSize = u_dimensions * 0.5;
                        vec2 centerPos = pos - halfSize;
                        float dist = roundedBoxSDF(centerPos, halfSize, u_borderRadius);
                        if (dist > 0.0) discard;
                    }
                    outColor = u_color;
                } else if (u_type == 1) {
                    vec4 texColor = texture(u_texture, v_texCoord);
                    outColor = texColor * u_color;
                } else if (u_type == 2) {
                    // Progress bar
                    if (v_texCoord.x < u_progress) {
                        outColor = u_fillColor;
                    } else {
                        outColor = u_color;
                    }
                }
            }
        `;

        const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs);
        this.gl.attachShader(program, fs);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    private createQuadBuffer(): WebGLBuffer {
        // Top-left origin: 0,0 to 1,1
        const vertices = new Float32Array([
            0, 0, 0, 0,
            1, 0, 1, 0,
            0, 1, 0, 1,
            1, 1, 1, 1,
        ]);
        const buffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        return buffer;
    }

    private updateTextTexture(entityId: string, text: string, fontSize: number, color: string, fontFamily: string) {
        const cacheKey = `${text}_${fontSize}_${color}_${fontFamily}`;
        if (this.textCacheKeys.get(entityId) === cacheKey && this.textTextures.has(entityId)) {
            return this.textTextures.get(entityId)!;
        }

        this.textCtx.font = `${fontSize}px ${fontFamily}`;
        const metrics = this.textCtx.measureText(text);

        // Handle proper bounding box if possible, or rough estimate
        const width = Math.ceil(metrics.actualBoundingBoxRight ? metrics.actualBoundingBoxRight + metrics.actualBoundingBoxLeft : metrics.width);
        const height = Math.ceil(metrics.actualBoundingBoxAscent ? metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent : fontSize * 1.5);

        this.textCanvas.width = width > 0 ? width : 1;
        this.textCanvas.height = height > 0 ? height : 1;

        this.textCtx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
        this.textCtx.font = `${fontSize}px ${fontFamily}`;
        this.textCtx.fillStyle = color;
        this.textCtx.textBaseline = 'top';
        this.textCtx.fillText(text, 0, 0);

        let texData = this.textTextures.get(entityId);
        if (!texData) {
            texData = { tex: this.gl.createTexture()!, width: this.textCanvas.width, height: this.textCanvas.height };
            this.textTextures.set(entityId, texData);
        } else {
            texData.width = this.textCanvas.width;
            texData.height = this.textCanvas.height;
        }

        this.gl.bindTexture(this.gl.TEXTURE_2D, texData.tex);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.textCanvas);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

        this.textCacheKeys.set(entityId, cacheKey);
        return texData;
    }

    /** Draw one solid rounded rect (used by the ported slider/checkbox). */
    private drawRect(x: number, y: number, width: number, height: number, colorHex: string): void {
        const model = Mat4.create();
        Mat4.translate(model, model, [x, y, 0]);
        Mat4.scale(model, model, [width, height, 1]);
        this.gl.uniformMatrix4fv(this.uniformLocs['u_model'], false, model);
        this.gl.uniform2f(this.uniformLocs['u_dimensions'], width, height);
        this.gl.uniform1i(this.uniformLocs['u_type'], 0);
        this.gl.uniform1f(this.uniformLocs['u_borderRadius'], 0);
        this.gl.uniform4fv(this.uniformLocs['u_color'], hexToRgba(colorHex));
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    render(world: World, screenWidth: number, screenHeight: number, textures: Map<string, WebGLTexture>) {
        const uiEntities = world.getEntitiesWithComponents('uiTransform');

        // Sorting
        uiEntities.sort((a, b) => {
            const layerA = world.getComponent(a, 'sortingLayer');
            const layerB = world.getComponent(b, 'sortingLayer');
            const lA = layerA?.layer ?? 0;
            const oA = layerA?.orderInLayer ?? 0;
            const lB = layerB?.layer ?? 0;
            const oB = layerB?.orderInLayer ?? 0;
            if (lA !== lB) return lA - lB;
            return oA - oB;
        });

        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.gl.useProgram(this.program);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

        const projection = Mat4.create();
        Mat4.ortho(projection, 0, screenWidth, screenHeight, 0, -1, 1);
        this.gl.uniformMatrix4fv(this.uniformLocs['u_projection'], false, projection);

        // Entities that live inside a scroll view are drawn in a second,
        // scissor-clipped pass below — never in the main pass.
        for (const entity of uiEntities) {
            const transform = world.getComponent(entity, 'uiTransform')!;
            if (transform.scrollParent) continue;
            this.drawUIEntity(world, entity, textures, screenWidth, screenHeight, 0);
        }

        // Scroll-view children, clipped to each container's rect.
        for (const entity of uiEntities) {
            const scrollView = world.getComponent(entity, 'uiScrollView');
            if (!scrollView) continue;
            const transform = world.getComponent(entity, 'uiTransform')!;
            const sx = (transform.anchorX * screenWidth) + transform.offsetX - (transform.pivotX * scrollView.width);
            const sy = (transform.anchorY * screenHeight) + transform.offsetY - (transform.pivotY * scrollView.height);
            this.gl.enable(this.gl.SCISSOR_TEST);
            // GL scissor origin is bottom-left; UI origin is top-left.
            this.gl.scissor(Math.round(sx), Math.round(screenHeight - (sy + scrollView.height)), Math.round(scrollView.width), Math.round(scrollView.height));
            for (const child of uiEntities) {
                const childT = world.getComponent(child, 'uiTransform')!;
                if (childT.scrollParent !== entity) continue;
                this.drawUIEntity(world, child, textures, screenWidth, screenHeight, -scrollView.scrollOffset);
            }
            this.gl.disable(this.gl.SCISSOR_TEST);
        }
    }

    /**
     * Draw one UI entity. offsetY shifts the entity (used for scroll-view
     * children); the scroll parent's screen origin is added when the
     * entity has a scrollParent.
     */
    private drawUIEntity(world: World, entity: string, textures: Map<string, WebGLTexture>, screenWidth: number, screenHeight: number, offsetY: number): void {
        {
            const transform = world.getComponent(entity, 'uiTransform')!;

            const panel = world.getComponent(entity, 'uiPanel');
            const image = world.getComponent(entity, 'uiImage');
            const progress = world.getComponent(entity, 'uiProgressBar');
            const label = world.getComponent(entity, 'uiLabel');
            const button = world.getComponent(entity, 'uiButton');
            const slider = world.getComponent(entity, 'uiSlider');
            const checkbox = world.getComponent(entity, 'uiCheckbox');
            const textbox = world.getComponent(entity, 'uiTextbox');
            const scrollView = world.getComponent(entity, 'uiScrollView');

            let width = 0;
            let height = 0;

            if (panel) { width = panel.width; height = panel.height; }
            else if (image) { width = image.width; height = image.height; }
            else if (progress) { width = progress.width; height = progress.height; }
            else if (slider) { width = slider.width; height = slider.height; }
            else if (checkbox) { width = checkbox.size; height = checkbox.size; }
            else if (textbox) { width = textbox.width; height = textbox.height; }
            else if (scrollView) { width = scrollView.width; height = scrollView.height; }
            else if (button) {
                width = 100; height = 40;
            }

            // For label, we defer width/height until actual texture size is known.
            let texObj: { tex: WebGLTexture, width: number, height: number } | null = null;
            if (label) {
                texObj = this.updateTextTexture(entity, label.text, label.fontSize, label.color, label.fontFamily);
                if (width === 0) width = texObj.width;
                if (height === 0) height = texObj.height;
            }

            let x = (transform.anchorX * screenWidth) + transform.offsetX - (transform.pivotX * width);
            let y = (transform.anchorY * screenHeight) + transform.offsetY - (transform.pivotY * height);
            if (transform.scrollParent) {
                const parentT = world.getComponent(transform.scrollParent, 'uiTransform');
                const parentScroll = world.getComponent(transform.scrollParent, 'uiScrollView');
                if (parentT && parentScroll) {
                    x += (parentT.anchorX * screenWidth) + parentT.offsetX - (parentT.pivotX * parentScroll.width);
                    y += (parentT.anchorY * screenHeight) + parentT.offsetY - (parentT.pivotY * parentScroll.height);
                }
            }
            y += offsetY;

            const model = Mat4.create();
            Mat4.translate(model, model, [x, y, 0]);
            Mat4.scale(model, model, [width, height, 1]);
            this.gl.uniformMatrix4fv(this.uniformLocs['u_model'], false, model);
            this.gl.uniform2f(this.uniformLocs['u_dimensions'], width, height);

            if (panel || button) {
                this.gl.uniform1i(this.uniformLocs['u_type'], 0);
                this.gl.uniform1f(this.uniformLocs['u_borderRadius'], panel?.borderRadius ?? 0);

                let colorHex = panel?.color ?? '#ffffff';
                if (button) {
                    const isHovered = (button as any)._isHovered;
                    const isPressed = (button as any)._isPressed;
                    if (isPressed) colorHex = button.pressColor;
                    else if (isHovered) colorHex = button.hoverColor;
                    else colorHex = button.normalColor;
                }
                this.gl.uniform4fv(this.uniformLocs['u_color'], hexToRgba(colorHex));
                this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            }

            if (image) {
                const tex = textures.get(image.textureId);
                if (tex) {
                    this.gl.uniform1i(this.uniformLocs['u_type'], 1);
                    this.gl.uniform4fv(this.uniformLocs['u_color'], [1, 1, 1, 1]);
                    this.gl.activeTexture(this.gl.TEXTURE0);
                    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
                    this.gl.uniform1i(this.uniformLocs['u_texture'], 0);
                    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
                }
            }

            if (progress) {
                this.gl.uniform1i(this.uniformLocs['u_type'], 2);
                this.gl.uniform4fv(this.uniformLocs['u_color'], hexToRgba(progress.bgColor));
                this.gl.uniform4fv(this.uniformLocs['u_fillColor'], hexToRgba(progress.fillColor));
                this.gl.uniform1f(this.uniformLocs['u_progress'], progress.value / (progress.max || 1));
                this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            }

            if (slider) {
                const frac = slider.max > slider.min
                    ? Math.max(0, Math.min(1, (slider.value - slider.min) / (slider.max - slider.min)))
                    : 0;
                const trackY = y + height / 2 - 3;
                this.drawRect(x, trackY, width, 6, slider.trackColor);
                this.drawRect(x, trackY, Math.max(0, width * frac), 6, slider.fillColor);
                const knobW = Math.min(14, width);
                const knobX = x + Math.max(0, Math.min(width - knobW, width * frac - knobW / 2));
                this.drawRect(knobX, y, knobW, height, slider.knobColor);
            }

            if (checkbox) {
                this.drawRect(x, y, width, height, checkbox.boxColor);
                if (checkbox.checked) {
                    const texObj = this.updateTextTexture(entity, '✓', checkbox.size, checkbox.checkColor, 'Arial');
                    const textModel = Mat4.create();
                    Mat4.translate(textModel, textModel, [x + (width - texObj.width) / 2, y + (height - texObj.height) / 2, 0]);
                    Mat4.scale(textModel, textModel, [texObj.width, texObj.height, 1]);
                    this.gl.uniformMatrix4fv(this.uniformLocs['u_model'], false, textModel);
                    this.gl.uniform2f(this.uniformLocs['u_dimensions'], texObj.width, texObj.height);
                    this.gl.uniform1i(this.uniformLocs['u_type'], 1);
                    this.gl.uniform4fv(this.uniformLocs['u_color'], [1, 1, 1, 1]);
                    this.gl.activeTexture(this.gl.TEXTURE0);
                    this.gl.bindTexture(this.gl.TEXTURE_2D, texObj.tex);
                    this.gl.uniform1i(this.uniformLocs['u_texture'], 0);
                    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
                }
            }

            if (textbox) {
                const border = textbox.focused ? textbox.focusColor : textbox.borderColor;
                this.drawRect(x - 1, y - 1, width + 2, height + 2, border);
                this.drawRect(x, y, width, height, textbox.bgColor);
                const shown = textbox.password ? '•'.repeat(textbox.text.length) : textbox.text;
                const displayText = shown.length > 0 ? shown : (textbox.focused ? '' : textbox.placeholder);
                const displayColor = shown.length > 0 || textbox.focused ? textbox.textColor : '#888888';
                if (displayText.length > 0) {
                    const textTex = this.updateTextTexture(entity, displayText, textbox.fontSize, displayColor, 'Arial');
                    const textModel = Mat4.create();
                    Mat4.translate(textModel, textModel, [x + 8, y + (height - textTex.height) / 2, 0]);
                    Mat4.scale(textModel, textModel, [textTex.width, textTex.height, 1]);
                    this.gl.uniformMatrix4fv(this.uniformLocs['u_model'], false, textModel);
                    this.gl.uniform2f(this.uniformLocs['u_dimensions'], textTex.width, textTex.height);
                    this.gl.uniform1i(this.uniformLocs['u_type'], 1);
                    this.gl.uniform4fv(this.uniformLocs['u_color'], [1, 1, 1, 1]);
                    this.gl.activeTexture(this.gl.TEXTURE0);
                    this.gl.bindTexture(this.gl.TEXTURE_2D, textTex.tex);
                    this.gl.uniform1i(this.uniformLocs['u_texture'], 0);
                    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
                    if (textbox.focused) {
                        // Caret position is proportional (the text texture
                        // cache is per-entity, so no substring measurement).
                        const frac = textbox.text.length > 0 ? textbox.cursor / textbox.text.length : 0;
                        this.drawRect(x + 8 + textTex.width * frac, y + 6, 2, Math.max(4, height - 12), '#FFFFFF');
                    }
                } else if (textbox.focused) {
                    this.drawRect(x + 8, y + 6, 2, Math.max(4, height - 12), '#FFFFFF');
                }
            }

            if (scrollView) {
                this.drawRect(x, y, width, height, scrollView.bgColor);
                const contentH = ((scrollView as any)._contentHeight as number | undefined) ?? scrollView.contentHeight;
                if (scrollView.showScrollbar && contentH > height) {
                    const maxScroll = contentH - height;
                    const thumbH = Math.max(20, (height / contentH) * height);
                    const thumbY = y + (scrollView.scrollOffset / maxScroll) * (height - thumbH);
                    this.drawRect(x + width - 10, y, 10, height, '#00000055');
                    this.drawRect(x + width - 10, thumbY, 10, thumbH, scrollView.scrollbarColor);
                }
            }

            if (label && texObj) {
                // If label has an independent layout or follows panel
                // Usually label is drawn in the center of the panel or relative to anchor
                // But the previous transform x,y used width/height of the panel
                // Let's reset the model to draw the text texture directly, unless we want to center it inside the panel.
                // Assuming offset x,y for label relative to pivot. Wait, if it's attached to the same entity,
                // it should probably be centered if it's a button.

                let textX = x;
                let textY = y;
                if (panel || button || image || progress) {
                    // Center the text in the bounds of the primary element
                    textX = x + (width - texObj.width) / 2;
                    textY = y + (height - texObj.height) / 2;
                }

                const textModel = Mat4.create();
                Mat4.translate(textModel, textModel, [textX, textY, 0]);
                Mat4.scale(textModel, textModel, [texObj.width, texObj.height, 1]);
                this.gl.uniformMatrix4fv(this.uniformLocs['u_model'], false, textModel);
                this.gl.uniform2f(this.uniformLocs['u_dimensions'], texObj.width, texObj.height);

                this.gl.uniform1i(this.uniformLocs['u_type'], 1);
                this.gl.uniform4fv(this.uniformLocs['u_color'], [1, 1, 1, 1]); // the text is already colored via canvas
                this.gl.activeTexture(this.gl.TEXTURE0);
                this.gl.bindTexture(this.gl.TEXTURE_2D, texObj.tex);
                this.gl.uniform1i(this.uniformLocs['u_texture'], 0);
                this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            }
        }
    }
}
