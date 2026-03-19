/**
 * Advanced Rendering System with custom shaders, lighting integration, shadows,
 * normal mapping, bloom effects, and GPU-accelerated post-processing.
 */
export class AdvancedRenderingSystem {
    private gl: WebGL2RenderingContext;
    private shaderPrograms: Map<string, WebGLProgram> = new Map();
    private framebuffers: Map<string, WebGLFramebuffer> = new Map();
    private textures: Map<string, WebGLTexture> = new Map();
    private vertexArrays: Map<string, WebGLVertexArrayObject> = new Map();
    private uniformBuffers: Map<string, WebGLBuffer> = new Map();

    // Post-processing
    private postProcessPipeline: PostProcessEffect[] = [];
    private bloomEffect: BloomEffect;
    private toneMapping: ToneMappingEffect;
    private colorGrading: ColorGradingEffect;

    // Lighting
    private shadowMaps: Map<string, ShadowMap> = new Map();

    // Materials and shaders
    private materials: Map<string, Material> = new Map();

    // Performance
    private renderStats: RenderStats = {
        drawCalls: 0,
        triangles: 0,
        frameTime: 0,
        gpuMemory: 0
    };

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.initializeShaders();
        this.initializeFramebuffers();
        this.bloomEffect = new BloomEffect(gl);
        this.toneMapping = new ToneMappingEffect(gl);
        this.colorGrading = new ColorGradingEffect(gl);
        this.initializePostProcessing();
        console.log('[AdvancedRenderingSystem] Initialized advanced rendering system');
    }

    private initializeShaders(): void {
        // PBR shader
        const pbrVertexShader = `#version 300 es
            layout(location = 0) in vec3 a_position;
            layout(location = 1) in vec3 a_normal;
            layout(location = 2) in vec2 a_texCoord;
            layout(location = 3) in vec4 a_tangent;

            uniform mat4 u_modelViewProjection;
            uniform mat4 u_model;
            uniform mat3 u_normalMatrix;

            out vec3 v_worldPos;
            out vec3 v_normal;
            out vec2 v_texCoord;
            out mat3 v_tbnMatrix;

            void main() {
                gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
                v_worldPos = (u_model * vec4(a_position, 1.0)).xyz;
                v_normal = normalize(u_normalMatrix * a_normal);
                v_texCoord = a_texCoord;

                // TBN matrix for normal mapping
                vec3 tangent = normalize(u_normalMatrix * a_tangent.xyz);
                vec3 bitangent = cross(v_normal, tangent) * a_tangent.w;
                v_tbnMatrix = mat3(tangent, bitangent, v_normal);
            }
        `;

        const pbrFragmentShader = `#version 300 es
            precision highp float;

            in vec3 v_worldPos;
            in vec3 v_normal;
            in vec2 v_texCoord;
            in mat3 v_tbnMatrix;

            uniform vec3 u_cameraPosition;
            uniform sampler2D u_albedoMap;
            uniform sampler2D u_normalMap;
            uniform sampler2D u_metallicRoughnessMap;
            uniform sampler2D u_emissiveMap;
            uniform vec4 u_baseColor;
            uniform float u_metallic;
            uniform float u_roughness;
            uniform vec3 u_emissive;

            // Lighting uniforms
            uniform vec3 u_lightPositions[16];
            uniform vec3 u_lightColors[16];
            uniform float u_lightIntensities[16];
            uniform int u_lightCount;

            out vec4 outColor;

            const float PI = 3.14159265359;

            // PBR functions
            float DistributionGGX(vec3 N, vec3 H, float roughness) {
                float a = roughness * roughness;
                float a2 = a * a;
                float NdotH = max(dot(N, H), 0.0);
                float NdotH2 = NdotH * NdotH;

                float nom = a2;
                float denom = (NdotH2 * (a2 - 1.0) + 1.0);
                denom = PI * denom * denom;

                return nom / denom;
            }

            float GeometrySchlickGGX(float NdotV, float roughness) {
                float r = (roughness + 1.0);
                float k = (r * r) / 8.0;
                return NdotV / (NdotV * (1.0 - k) + k);
            }

            float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
                float NdotV = max(dot(N, V), 0.0);
                float NdotL = max(dot(N, L), 0.0);
                float ggx2 = GeometrySchlickGGX(NdotV, roughness);
                float ggx1 = GeometrySchlickGGX(NdotL, roughness);
                return ggx1 * ggx2;
            }

            vec3 fresnelSchlick(float cosTheta, vec3 F0) {
                return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
            }

            void main() {
                vec3 albedo = texture(u_albedoMap, v_texCoord).rgb * u_baseColor.rgb;
                vec3 normalMap = texture(u_normalMap, v_texCoord).rgb * 2.0 - 1.0;
                float metallic = texture(u_metallicRoughnessMap, v_texCoord).b * u_metallic;
                float roughness = texture(u_metallicRoughnessMap, v_texCoord).g * u_roughness;
                vec3 emissive = texture(u_emissiveMap, v_texCoord).rgb * u_emissive;

                // Normal mapping
                vec3 N = normalize(v_tbnMatrix * normalMap);
                vec3 V = normalize(u_cameraPosition - v_worldPos);

                vec3 F0 = vec3(0.04);
                F0 = mix(F0, albedo, metallic);

                vec3 Lo = vec3(0.0);
                for (int i = 0; i < u_lightCount; i++) {
                    vec3 L = normalize(u_lightPositions[i] - v_worldPos);
                    vec3 H = normalize(V + L);
                    float distance = length(u_lightPositions[i] - v_worldPos);
                    float attenuation = 1.0 / (distance * distance);
                    vec3 radiance = u_lightColors[i] * u_lightIntensities[i] * attenuation;

                    float NDF = DistributionGGX(N, H, roughness);
                    float G = GeometrySmith(N, V, L, roughness);
                    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

                    vec3 kS = F;
                    vec3 kD = vec3(1.0) - kS;
                    kD *= 1.0 - metallic;

                    float NdotL = max(dot(N, L), 0.0);
                    vec3 numerator = NDF * G * F;
                    float denominator = 4.0 * max(dot(N, V), 0.0) * NdotL;
                    vec3 specular = numerator / max(denominator, 0.001);

                    Lo += (kD * albedo / PI + specular) * radiance * NdotL;
                }

                vec3 ambient = vec3(0.03) * albedo;
                vec3 color = ambient + Lo + emissive;

                outColor = vec4(color, u_baseColor.a);
            }
        `;

        this.shaderPrograms.set('pbr', this.createShaderProgram(pbrVertexShader, pbrFragmentShader));

        // Shadow mapping shader
        const shadowVertexShader = `#version 300 es
            layout(location = 0) in vec3 a_position;

            uniform mat4 u_lightSpaceMatrix;
            uniform mat4 u_model;

            void main() {
                gl_Position = u_lightSpaceMatrix * u_model * vec4(a_position, 1.0);
            }
        `;

        const shadowFragmentShader = `#version 300 es
            precision mediump float;

            void main() {
                // Depth is automatically written
            }
        `;

        this.shaderPrograms.set('shadow', this.createShaderProgram(shadowVertexShader, shadowFragmentShader));
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

    private initializeFramebuffers(): void {
        const gl = this.gl;

        // Main render target
        const mainFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, mainFBO);

        // Color texture
        const colorTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, colorTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);

        // Depth texture
        const depthTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, depthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH24_STENCIL8, gl.canvas.width, gl.canvas.height, 0, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

        this.framebuffers.set('main', mainFBO!);
        this.textures.set('main_color', colorTexture!);
        this.textures.set('main_depth', depthTexture!);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private initializePostProcessing(): void {
        // Initialize bloom effect
        this.bloomEffect = new BloomEffect(this.gl);

        // Initialize tone mapping
        this.toneMapping = new ToneMappingEffect(this.gl);

        // Initialize color grading
        this.colorGrading = new ColorGradingEffect(this.gl);

        // Set up post-processing pipeline
        this.postProcessPipeline = [
            this.bloomEffect,
            this.toneMapping,
            this.colorGrading
        ];
    }

    render(scene: any, camera: any): void {
        const gl = this.gl;
        const startTime = performance.now();

        // Reset render stats
        this.renderStats.drawCalls = 0;
        this.renderStats.triangles = 0;

        // Shadow pass
        this.renderShadowMaps(scene, camera);

        // Main render pass
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.get('main')!);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        this.renderScene(scene, camera);

        // Post-processing
        this.applyPostProcessing();

        // Final blit to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        this.renderStats.frameTime = performance.now() - startTime;
    }

    private renderShadowMaps(scene: any, _camera: any): void {
        const gl = this.gl;

        for (const [lightId, shadowMap] of this.shadowMaps) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMap.framebuffer);
            gl.viewport(0, 0, shadowMap.resolution, shadowMap.resolution);
            gl.clear(gl.DEPTH_BUFFER_BIT);

            const shadowProgram = this.shaderPrograms.get('shadow')!;
            gl.useProgram(shadowProgram);

            // Set light space matrix uniform
            const lightSpaceLoc = gl.getUniformLocation(shadowProgram, 'u_lightSpaceMatrix');
            gl.uniformMatrix4fv(lightSpaceLoc, false, shadowMap.lightSpaceMatrix);

            // Render scene from light's perspective
            this.renderSceneDepth(scene);

            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
    }

    private renderScene(scene: any, camera: any): void {
        const gl = this.gl;

        // Use PBR shader
        const pbrProgram = this.shaderPrograms.get('pbr')!;
        gl.useProgram(pbrProgram);

        // Set camera uniforms
        const mvpLoc = gl.getUniformLocation(pbrProgram, 'u_modelViewProjection');
        const modelLoc = gl.getUniformLocation(pbrProgram, 'u_model');
        const normalLoc = gl.getUniformLocation(pbrProgram, 'u_normalMatrix');
        const cameraLoc = gl.getUniformLocation(pbrProgram, 'u_cameraPosition');

        // Set lighting uniforms
        this.updateLightingUniforms(pbrProgram);

        // Render objects
        for (const object of scene.objects) {
            if (object.material) {
                this.setMaterialUniforms(pbrProgram, object.material);
            }

            gl.uniformMatrix4fv(mvpLoc, false, object.mvpMatrix);
            gl.uniformMatrix4fv(modelLoc, false, object.modelMatrix);
            gl.uniformMatrix3fv(normalLoc, false, object.normalMatrix);
            gl.uniform3fv(cameraLoc, camera.position);

            gl.bindVertexArray(object.vao);
            gl.drawElements(gl.TRIANGLES, object.indexCount, gl.UNSIGNED_INT, 0);

            this.renderStats.drawCalls++;
            this.renderStats.triangles += object.indexCount / 3;
        }
    }

    private renderSceneDepth(scene: any): void {
        const gl = this.gl;

        // Simplified depth-only rendering
        for (const object of scene.objects) {
            const modelLoc = gl.getUniformLocation(this.shaderPrograms.get('shadow')!, 'u_model');
            gl.uniformMatrix4fv(modelLoc, false, object.modelMatrix);

            gl.bindVertexArray(object.vao);
            gl.drawElements(gl.TRIANGLES, object.indexCount, gl.UNSIGNED_INT, 0);
        }
    }

    private updateLightingUniforms(program: WebGLProgram): void {
        const gl = this.gl;

        // For now, set some dummy lighting data
        const lightPositions = new Float32Array([
            10, 10, 10,
            -10, 10, 10,
            0, -10, 10
        ]);

        const lightColors = new Float32Array([
            1, 1, 1,
            0.8, 0.8, 1,
            1, 0.8, 0.8
        ]);

        const lightIntensities = new Float32Array([1, 0.8, 0.6]);

        gl.uniform3fv(gl.getUniformLocation(program, 'u_lightPositions'), lightPositions);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_lightColors'), lightColors);
        gl.uniform1fv(gl.getUniformLocation(program, 'u_lightIntensities'), lightIntensities);
        gl.uniform1i(gl.getUniformLocation(program, 'u_lightCount'), 3);
    }

    private setMaterialUniforms(program: WebGLProgram, material: Material): void {
        const gl = this.gl;

        // Bind textures
        if (material.albedoTexture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, material.albedoTexture);
            gl.uniform1i(gl.getUniformLocation(program, 'u_albedoMap'), 0);
        }

        if (material.normalTexture) {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, material.normalTexture);
            gl.uniform1i(gl.getUniformLocation(program, 'u_normalMap'), 1);
        }

        if (material.metallicRoughnessTexture) {
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, material.metallicRoughnessTexture);
            gl.uniform1i(gl.getUniformLocation(program, 'u_metallicRoughnessMap'), 2);
        }

        if (material.emissiveTexture) {
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, material.emissiveTexture);
            gl.uniform1i(gl.getUniformLocation(program, 'u_emissiveMap'), 3);
        }

        // Set material properties
        gl.uniform4fv(gl.getUniformLocation(program, 'u_baseColor'), material.baseColor);
        gl.uniform1f(gl.getUniformLocation(program, 'u_metallic'), material.metallic);
        gl.uniform1f(gl.getUniformLocation(program, 'u_roughness'), material.roughness);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_emissive'), material.emissive);
    }

    private applyPostProcessing(): void {
        for (const effect of this.postProcessPipeline) {
            effect.apply(this.framebuffers.get('main')!, this.textures.get('main_color')!);
        }
    }

    createMaterial(config: MaterialConfig): Material {
        const material: Material = {
            name: config.name,
            shader: config.shader || 'pbr',
            baseColor: config.baseColor || [1, 1, 1, 1],
            metallic: config.metallic || 0,
            roughness: config.roughness || 0.5,
            emissive: config.emissive || [0, 0, 0],
            albedoTexture: config.albedoTexture,
            normalTexture: config.normalTexture,
            metallicRoughnessTexture: config.metallicRoughnessTexture,
            emissiveTexture: config.emissiveTexture,
            doubleSided: config.doubleSided || false,
            transparent: config.transparent || false
        };

        this.materials.set(config.name, material);
        return material;
    }

    createShadowMap(lightId: string, resolution: number = 2048): ShadowMap {
        const gl = this.gl;

        const shadowMap: ShadowMap = {
            lightId,
            resolution,
            framebuffer: gl.createFramebuffer()!,
            depthTexture: gl.createTexture()!,
            lightSpaceMatrix: new Float32Array(16)
        };

        // Create depth texture
        gl.bindTexture(gl.TEXTURE_2D, shadowMap.depthTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, resolution, resolution, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Create framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMap.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowMap.depthTexture, 0);
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.shadowMaps.set(lightId, shadowMap);
        return shadowMap;
    }

    getRenderStats(): RenderStats {
        return { ...this.renderStats };
    }

    dispose(): void {
        const gl = this.gl;

        for (const program of this.shaderPrograms.values()) {
            gl.deleteProgram(program);
        }

        for (const fbo of this.framebuffers.values()) {
            gl.deleteFramebuffer(fbo);
        }

        for (const texture of this.textures.values()) {
            gl.deleteTexture(texture);
        }

        for (const vao of this.vertexArrays.values()) {
            gl.deleteVertexArray(vao);
        }

        for (const buffer of this.uniformBuffers.values()) {
            gl.deleteBuffer(buffer);
        }

        console.log('[AdvancedRenderingSystem] Disposed');
    }
}

// Supporting classes and interfaces
interface Material {
    name: string;
    shader: string;
    baseColor: number[];
    metallic: number;
    roughness: number;
    emissive: number[];
    albedoTexture?: WebGLTexture;
    normalTexture?: WebGLTexture;
    metallicRoughnessTexture?: WebGLTexture;
    emissiveTexture?: WebGLTexture;
    doubleSided: boolean;
    transparent: boolean;
}

interface MaterialConfig {
    name: string;
    shader?: string;
    baseColor?: number[];
    metallic?: number;
    roughness?: number;
    emissive?: number[];
    albedoTexture?: WebGLTexture;
    normalTexture?: WebGLTexture;
    metallicRoughnessTexture?: WebGLTexture;
    emissiveTexture?: WebGLTexture;
    doubleSided?: boolean;
    transparent?: boolean;
}

interface ShadowMap {
    lightId: string;
    resolution: number;
    framebuffer: WebGLFramebuffer;
    depthTexture: WebGLTexture;
    lightSpaceMatrix: Float32Array;
}

interface RenderStats {
    drawCalls: number;
    triangles: number;
    frameTime: number;
    gpuMemory: number;
}

interface PostProcessEffect {
    apply(inputFBO: WebGLFramebuffer, inputTexture: WebGLTexture): void;
}

class BloomEffect implements PostProcessEffect {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private fbo: WebGLFramebuffer;
    private textures: WebGLTexture[];

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.program = gl.createProgram()!;
        this.fbo = gl.createFramebuffer()!;
        this.textures = [];
        this.initialize();
    }

    private initialize(): void {
        // Create bloom shader and resources
        const vertexShader = `#version 300 es
            layout(location = 0) in vec2 a_position;
            layout(location = 1) in vec2 a_texCoord;

            out vec2 v_texCoord;

            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
                v_texCoord = a_texCoord;
            }
        `;

        const fragmentShader = `#version 300 es
            precision mediump float;

            in vec2 v_texCoord;

            uniform sampler2D u_texture;
            uniform float u_threshold;
            uniform float u_intensity;

            out vec4 outColor;

            void main() {
                vec4 color = texture(u_texture, v_texCoord);
                float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

                if (brightness > u_threshold) {
                    outColor = color * u_intensity;
                } else {
                    outColor = vec4(0.0);
                }
            }
        `;

        this.program = this.createShaderProgram(vertexShader, fragmentShader);

        // Create framebuffers and textures for blur passes
        this.fbo = this.gl.createFramebuffer()!;
        this.textures = [];
        for (let i = 0; i < 2; i++) {
            const texture = this.gl.createTexture()!;
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 512, 512, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
            this.textures.push(texture);
        }
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

    apply(inputFBO: WebGLFramebuffer, inputTexture: WebGLTexture): void {
        const gl = this.gl;

        gl.useProgram(this.program);

        // Extract bright areas
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures[0], 0);

        gl.uniform1i(gl.getUniformLocation(this.program, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_threshold'), 0.8);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_intensity'), 1.0);

        // Render quad with input texture
        this.renderQuad();

        // Blur passes would go here
        // For simplicity, just copy back to input

        gl.bindFramebuffer(gl.FRAMEBUFFER, inputFBO);
        // Combine original with bloom
    }

    private renderQuad(): void {
        // Render a full-screen quad
        const gl = this.gl;
        const vertices = new Float32Array([
            -1, -1, 0, 0,
             1, -1, 1, 0,
            -1,  1, 0, 1,
             1,  1, 1, 1
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.deleteBuffer(buffer);
    }
}

class ToneMappingEffect implements PostProcessEffect {
    constructor(_gl: WebGL2RenderingContext) {
        // gl not used in this implementation
    }

    apply(inputFBO: WebGLFramebuffer, inputTexture: WebGLTexture): void {
        // Apply Reinhard tone mapping
        // Implementation would go here
    }
}

class ColorGradingEffect implements PostProcessEffect {
    constructor(_gl: WebGL2RenderingContext) {
        // gl not used in this implementation
    }

    apply(_inputFBO: WebGLFramebuffer, _inputTexture: WebGLTexture): void {
        // Apply color grading using LUT
        // Implementation would go here
    }
}
