import { World } from '../core/World';
import { Mat4 } from '../math';
import { TilesetData } from '@glix/shared';

export class TilemapSystem {
    private program: WebGLProgram;
    private quadBuffer: WebGLBuffer;
    private instanceBuffer: WebGLBuffer;
    private maxInstances = 10000;

    constructor(private gl: WebGL2RenderingContext) {
        const vsSource = `#version 300 es
            layout(location = 0) in vec2 a_position;
            layout(location = 1) in vec2 a_texCoord;
            layout(location = 2) in vec2 a_instancePos;
            layout(location = 3) in vec2 a_instanceUVOffset;

            uniform mat4 u_projection;
            uniform mat4 u_view;
            uniform mat4 u_model; // Entity transform
            uniform vec2 u_tileSize; // in world units
            uniform vec2 u_uvScale; // 1.0 / cols, 1.0 / rows

            out vec2 v_texCoord;

            void main() {
                // scale quad by tile size
                vec2 pos = a_position * u_tileSize;
                // translation from instance (tile x,y in grid)
                pos += a_instancePos;
                
                gl_Position = u_projection * u_view * u_model * vec4(pos, 0.0, 1.0);
                v_texCoord = a_instanceUVOffset + a_texCoord * u_uvScale;
            }
        `;

        const fsSource = `#version 300 es
            precision mediump float;
            in vec2 v_texCoord;
            uniform sampler2D u_texture;
            uniform float u_opacity;
            out vec4 outColor;

            void main() {
                outColor = texture(u_texture, v_texCoord);
                outColor.a *= u_opacity;
            }
        `;

        this.program = this.createProgram(vsSource, fsSource)!;
        this.quadBuffer = this.createQuadBuffer();
        this.instanceBuffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.maxInstances * 4 * 4, this.gl.DYNAMIC_DRAW);
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

    private createProgram(vsSource: string, fsSource: string): WebGLProgram | null {
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
        const vertices = new Float32Array([
            -0.5, -0.5, 0, 1,
            0.5, -0.5, 1, 1,
            -0.5, 0.5, 0, 0,
            0.5, 0.5, 1, 0,
        ]);
        const buffer = this.gl.createBuffer()!;
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        return buffer;
    }

    renderTilemap(
        entity: string,
        world: World,
        viewMatrix: Mat4,
        projectionMatrix: Mat4,
        textures: Map<string, WebGLTexture>,
        tilesets: Map<string, TilesetData>
    ): void {
        const transform = world.getComponent(entity, 'transform')!;
        const tilemap = world.getComponent(entity, 'tilemap')!;
        const tileset = tilesets.get(tilemap.tilesetId);

        if (!tileset) return;
        const texture = textures.get(tileset.textureId);
        if (!texture) return;

        this.gl.useProgram(this.program);

        const uProj = this.gl.getUniformLocation(this.program, 'u_projection');
        const uView = this.gl.getUniformLocation(this.program, 'u_view');
        const uModel = this.gl.getUniformLocation(this.program, 'u_model');
        const uTexture = this.gl.getUniformLocation(this.program, 'u_texture');
        const uTileSize = this.gl.getUniformLocation(this.program, 'u_tileSize');
        const uUVScale = this.gl.getUniformLocation(this.program, 'u_uvScale');
        const uOpacity = this.gl.getUniformLocation(this.program, 'u_opacity');

        this.gl.uniformMatrix4fv(uProj, false, projectionMatrix);
        this.gl.uniformMatrix4fv(uView, false, viewMatrix);
        this.gl.uniform1i(uTexture, 0);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 16, 0);
        this.gl.enableVertexAttribArray(1);
        this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 16, 8);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
        this.gl.enableVertexAttribArray(2);
        this.gl.vertexAttribPointer(2, 2, this.gl.FLOAT, false, 16, 0);
        this.gl.vertexAttribDivisor(2, 1);

        this.gl.enableVertexAttribArray(3);
        this.gl.vertexAttribPointer(3, 2, this.gl.FLOAT, false, 16, 8);
        this.gl.vertexAttribDivisor(3, 1);

        const model = Mat4.create();
        Mat4.translate(model, model, [transform.x, transform.y, 0]);
        Mat4.rotateZ(model, model, transform.rotation);
        Mat4.scale(model, model, [transform.scaleX, transform.scaleY, 1]);

        this.gl.uniformMatrix4fv(uModel, false, model);

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

        this.gl.uniform2f(uTileSize, tilemap.tileWidth, tilemap.tileHeight);

        const uvW = 1.0 / tileset.columns;
        const uvH = 1.0 / tileset.rows;
        this.gl.uniform2f(uUVScale, uvW, uvH);

        for (const layer of tilemap.layers) {
            if (!layer.visible) continue;
            this.gl.uniform1f(uOpacity, layer.opacity);

            let instanceCount = 0;
            let instanceData = new Float32Array(layer.tiles.length * (layer.tiles[0]?.length || 0) * 4);

            for (let r = 0; r < layer.tiles.length; r++) {
                if (!layer.tiles[r]) continue;
                for (let c = 0; c < layer.tiles[r].length; c++) {
                    const tileIndex = layer.tiles[r][c];
                    if (tileIndex === -1) continue;

                    const xPos = c * tilemap.tileWidth + (tilemap.tileWidth / 2);
                    const yPos = -r * tilemap.tileHeight - (tilemap.tileHeight / 2);

                    const tCol = tileIndex % tileset.columns;
                    const tRow = Math.floor(tileIndex / tileset.columns);
                    const uvX = tCol * uvW;
                    const uvY = tRow * uvH;

                    const offset = instanceCount * 4;
                    instanceData[offset + 0] = xPos;
                    instanceData[offset + 1] = yPos;
                    instanceData[offset + 2] = uvX;
                    instanceData[offset + 3] = uvY;
                    instanceCount++;
                }
            }

            if (instanceCount > 0) {
                this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.instanceBuffer);
                this.gl.bufferData(this.gl.ARRAY_BUFFER, instanceData.subarray(0, instanceCount * 4), this.gl.DYNAMIC_DRAW);
                this.gl.drawArraysInstanced(this.gl.TRIANGLE_STRIP, 0, 4, instanceCount);
            }
        }

        this.gl.vertexAttribDivisor(2, 0);
        this.gl.vertexAttribDivisor(3, 0);
    }
}
