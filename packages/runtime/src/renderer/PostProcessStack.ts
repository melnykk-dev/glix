export class PostProcessStack {
    private sceneFbo: WebGLFramebuffer;
    private sceneTexture: WebGLTexture;
    private pingpongFbos: [WebGLFramebuffer, WebGLFramebuffer];
    private pingpongTextures: [WebGLTexture, WebGLTexture];
    private quadBuffer: WebGLBuffer;

    private crtProgram: WebGLProgram;
    private vignetteProgram: WebGLProgram;
    private bloomExtractProgram: WebGLProgram;
    private bloomBlurProgram: WebGLProgram;
    private bloomCompositeProgram: WebGLProgram;
    private blitProgram: WebGLProgram;

    private width: number = 0;
    private height: number = 0;

    constructor(private gl: WebGL2RenderingContext) {
        this.pingpongFbos = [this.gl.createFramebuffer()!, this.gl.createFramebuffer()!];
        this.pingpongTextures = [this.gl.createTexture()!, this.gl.createTexture()!];
        this.sceneFbo = this.gl.createFramebuffer()!;
        this.sceneTexture = this.gl.createTexture()!;
        this.quadBuffer = this.createQuadBuffer();

        this.crtProgram = this.createProgram(this.vsSource, this.fsCrt)!;
        this.vignetteProgram = this.createProgram(this.vsSource, this.fsVignette)!;
        this.bloomExtractProgram = this.createProgram(this.vsSource, this.fsBloomExtract)!;
        this.bloomBlurProgram = this.createProgram(this.vsSource, this.fsBloomBlur)!;
        this.bloomCompositeProgram = this.createProgram(this.vsSource, this.fsBloomComposite)!;
        this.blitProgram = this.createProgram(this.vsSource, this.fsBlit)!;
    }

    private fsBlit = `#version 300 es
        precision mediump float;
        in vec2 v_texCoord;
        uniform sampler2D u_texture;
        out vec4 outColor;
        void main() {
            outColor = texture(u_texture, v_texCoord);
        }
    `;

    private vsSource = `#version 300 es
        layout(location = 0) in vec2 a_position;
        out vec2 v_texCoord;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_position * 0.5 + 0.5;
        }
    `;

    private fsCrt = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_texture;
        out vec4 outColor;
        
        vec2 curve(vec2 uv) {
            uv = (uv - 0.5) * 2.0;
            uv *= 1.1; 
            uv.x *= 1.0 + pow((abs(uv.y) / 5.0), 2.0);
            uv.y *= 1.0 + pow((abs(uv.x) / 4.0), 2.0);
            uv  = (uv / 2.0) + 0.5;
            uv =  uv *0.92 + 0.04;
            return uv;
        }

        void main() {
            vec2 uv = curve(v_texCoord);
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                outColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }
            vec4 color = texture(u_texture, uv);
            float scanline = sin(uv.y * 800.0) * 0.04;
            color.rgb -= scanline;
            outColor = color;
        }
    `;

    private fsVignette = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_texture;
        uniform float u_strength;
        out vec4 outColor;
        
        void main() {
            vec4 color = texture(u_texture, v_texCoord);
            vec2 uv = v_texCoord * (1.0 - v_texCoord.yx);
            float vig = uv.x * uv.y * 15.0; // multiply with sth for intensity
            vig = pow(vig, u_strength);
            outColor = vec4(color.rgb * vig, color.a);
        }
    `;

    private fsBloomExtract = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_texture;
        uniform float u_threshold;
        out vec4 outColor;
        
        void main() {
            vec4 color = texture(u_texture, v_texCoord);
            float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            if(brightness > u_threshold)
                outColor = vec4(color.rgb, 1.0);
            else
                outColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    `;

    private fsBloomBlur = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_texture;
        uniform vec2 u_dir;
        out vec4 outColor;
        
        void main() {
            vec2 tex_offset = 1.0 / vec2(textureSize(u_texture, 0));
            vec3 result = texture(u_texture, v_texCoord).rgb * 0.227027;
            result += texture(u_texture, v_texCoord + u_dir * tex_offset).rgb * 0.1945946;
            result += texture(u_texture, v_texCoord - u_dir * tex_offset).rgb * 0.1945946;
            result += texture(u_texture, v_texCoord + u_dir * 2.0 * tex_offset).rgb * 0.1216216;
            result += texture(u_texture, v_texCoord - u_dir * 2.0 * tex_offset).rgb * 0.1216216;
            result += texture(u_texture, v_texCoord + u_dir * 3.0 * tex_offset).rgb * 0.054054;
            result += texture(u_texture, v_texCoord - u_dir * 3.0 * tex_offset).rgb * 0.054054;
            result += texture(u_texture, v_texCoord + u_dir * 4.0 * tex_offset).rgb * 0.016216;
            result += texture(u_texture, v_texCoord - u_dir * 4.0 * tex_offset).rgb * 0.016216;
            outColor = vec4(result, 1.0);
        }
    `;

    private fsBloomComposite = `#version 300 es
        precision highp float;
        in vec2 v_texCoord;
        uniform sampler2D u_scene;
        uniform sampler2D u_bloomBlur;
        out vec4 outColor;
        
        void main() {
            vec3 sceneColor = texture(u_scene, v_texCoord).rgb;      
            vec3 bloomColor = texture(u_bloomBlur, v_texCoord).rgb;
            outColor = vec4(sceneColor + bloomColor, 1.0);
        }
    `;

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

    private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
        const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource)!;
        const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource)!;
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
        const vertices = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1,
        ]);
        const buffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        return buffer;
    }

    resize(width: number, height: number) {
        if (this.width === width && this.height === height) return;
        this.width = width;
        this.height = height;

        const setupFBO = (fbo: WebGLFramebuffer, tex: WebGLTexture) => {
            this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, tex, 0);
        };

        setupFBO(this.sceneFbo, this.sceneTexture);
        setupFBO(this.pingpongFbos[0], this.pingpongTextures[0]);
        setupFBO(this.pingpongFbos[1], this.pingpongTextures[1]);
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }

    bindSceneFramebuffer() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.sceneFbo);
        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }

    render(config: { bloom?: boolean, vignette?: boolean, crt?: boolean }) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);

        let currentInput = this.sceneTexture;
        let currentOutputFbo = this.pingpongFbos[0];
        let pingPongIdx = 0;

        const drawPass = (program: WebGLProgram, outputFbo: WebGLFramebuffer | null, inputTex: WebGLTexture, setupUniforms?: () => void) => {
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, outputFbo);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            this.gl.useProgram(program);

            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, inputTex);
            this.gl.uniform1i(this.gl.getUniformLocation(program, 'u_texture'), 0);

            if (setupUniforms) setupUniforms();

            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
        };

        // Bloom
        if (config.bloom) {
            // Extract
            drawPass(this.bloomExtractProgram, this.pingpongFbos[0], this.sceneTexture, () => {
                this.gl.uniform1f(this.gl.getUniformLocation(this.bloomExtractProgram, 'u_threshold'), 0.85);
            });
            // Blur horizontal
            drawPass(this.bloomBlurProgram, this.pingpongFbos[1], this.pingpongTextures[0], () => {
                this.gl.uniform2f(this.gl.getUniformLocation(this.bloomBlurProgram, 'u_dir'), 1.0, 0.0);
            });
            // Blur vertical
            drawPass(this.bloomBlurProgram, this.pingpongFbos[0], this.pingpongTextures[1], () => {
                this.gl.uniform2f(this.gl.getUniformLocation(this.bloomBlurProgram, 'u_dir'), 0.0, 1.0);
            });

            // Composite
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.pingpongFbos[1]);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            this.gl.useProgram(this.bloomCompositeProgram);

            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.sceneTexture);
            this.gl.uniform1i(this.gl.getUniformLocation(this.bloomCompositeProgram, 'u_scene'), 0);

            this.gl.activeTexture(this.gl.TEXTURE1);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.pingpongTextures[0]);
            this.gl.uniform1i(this.gl.getUniformLocation(this.bloomCompositeProgram, 'u_bloomBlur'), 1);

            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
            currentInput = this.pingpongTextures[1];
        }

        // Vignette
        if (config.vignette) {
            const outputFbo = pingPongIdx === 0 ? this.pingpongFbos[0] : this.pingpongFbos[1];
            drawPass(this.vignetteProgram, outputFbo, currentInput, () => {
                this.gl.uniform1f(this.gl.getUniformLocation(this.vignetteProgram, 'u_strength'), 0.25);
            });
            currentInput = pingPongIdx === 0 ? this.pingpongTextures[0] : this.pingpongTextures[1];
            pingPongIdx = pingPongIdx === 0 ? 1 : 0;
        }

        // Final pass to screen
        if (config.crt) {
            drawPass(this.crtProgram, null, currentInput);
        } else {
            drawPass(this.blitProgram, null, currentInput);
        }
    }
}
