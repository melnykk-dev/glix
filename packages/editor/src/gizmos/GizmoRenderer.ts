import { Mat4 } from '@glix/runtime';

/**
 * GizmoRenderer - A lightweight WebGL utility for drawing editor-only 
 * graphics such as manipulation handles, selection boxes, and outlines.
 */
export class GizmoRenderer {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private buffer: WebGLBuffer;
    private positionLoc: number;
    private projectionLoc: WebGLUniformLocation;
    private viewLoc: WebGLUniformLocation;
    private modelLoc: WebGLUniformLocation;
    private colorLoc: WebGLUniformLocation;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;

        const vs = `#version 300 es
            layout(location = 0) in vec2 a_position;
            uniform mat4 u_projection;
            uniform mat4 u_view;
            uniform mat4 u_model;
            void main() {
                gl_Position = u_projection * u_view * u_model * vec4(a_position, 0.0, 1.0);
            }
        `;

        const fs = `#version 300 es
            precision mediump float;
            uniform vec4 u_color;
            out vec4 outColor;
            void main() {
                outColor = u_color;
            }
        `;

        this.program = this.createProgram(vs, fs)!;
        this.gl.useProgram(this.program);

        this.positionLoc = 0;
        this.projectionLoc = this.gl.getUniformLocation(this.program, 'u_projection')!;
        this.viewLoc = this.gl.getUniformLocation(this.program, 'u_view')!;
        this.modelLoc = this.gl.getUniformLocation(this.program, 'u_model')!;
        this.colorLoc = this.gl.getUniformLocation(this.program, 'u_color')!;

        this.buffer = this.gl.createBuffer()!;
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
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vs!);
        this.gl.attachShader(program, fs!);
        this.gl.linkProgram(program);
        return program;
    }

    begin(projection: any, view: any) {
        this.gl.useProgram(this.program);
        this.gl.uniformMatrix4fv(this.projectionLoc, false, projection);
        this.gl.uniformMatrix4fv(this.viewLoc, false, view);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.enableVertexAttribArray(this.positionLoc);
        this.gl.vertexAttribPointer(this.positionLoc, 2, this.gl.FLOAT, false, 0, 0);
    }

    drawRect(x: number, y: number, w: number, h: number, color: [number, number, number, number], wireframe: boolean = false, angle: number = 0) {
        const model = Mat4.create();
        Mat4.translate(model, model, [x, y, 0]);
        if (angle !== 0) {
            Mat4.rotateZ(model, model, angle);
        }
        this.gl.uniformMatrix4fv(this.modelLoc, false, model);
        this.gl.uniform4fv(this.colorLoc, color);

        const hw = w / 2;
        const hh = h / 2;
        const verts = new Float32Array([
            -hw, -hh,
            hw, -hh,
            hw, hh,
            -hw, hh,
            -hw, -hh,
        ]);

        this.gl.bufferData(this.gl.ARRAY_BUFFER, verts, this.gl.DYNAMIC_DRAW);
        this.gl.drawArrays(wireframe ? this.gl.LINE_STRIP : this.gl.TRIANGLE_FAN, 0, wireframe ? 5 : 4);
    }

    drawLine(x1: number, y1: number, x2: number, y2: number, color: [number, number, number, number]) {
        const model = Mat4.create(); // Identity
        this.gl.uniformMatrix4fv(this.modelLoc, false, model);
        this.gl.uniform4fv(this.colorLoc, color);

        const verts = new Float32Array([x1, y1, x2, y2]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, verts, this.gl.DYNAMIC_DRAW);
        this.gl.drawArrays(this.gl.LINES, 0, 2);
    }

    drawArrow(x: number, y: number, dx: number, dy: number, color: [number, number, number, number]) {
        this.drawLine(x, y, x + dx, y + dy, color);

        // Draw head
        const angle = Math.atan2(dy, dx);
        const headSize = 0.2;
        const x2 = x + dx;
        const y2 = y + dy;

        const h1x = x2 - headSize * Math.cos(angle - Math.PI / 6);
        const h1y = y2 - headSize * Math.sin(angle - Math.PI / 6);
        const h2x = x2 - headSize * Math.cos(angle + Math.PI / 6);
        const h2y = y2 - headSize * Math.sin(angle + Math.PI / 6);

        const model = Mat4.create();
        this.gl.uniformMatrix4fv(this.modelLoc, false, model);
        this.gl.uniform4fv(this.colorLoc, color);

        const verts = new Float32Array([x2, y2, h1x, h1y, h2x, h2y]);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, verts, this.gl.DYNAMIC_DRAW);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    }

    drawCircle(x: number, y: number, radius: number, color: [number, number, number, number], segments: number = 24) {
        const model = Mat4.create();
        Mat4.translate(model, model, [x, y, 0]);
        this.gl.uniformMatrix4fv(this.modelLoc, false, model);
        this.gl.uniform4fv(this.colorLoc, color);

        const verts = new Float32Array((segments + 1) * 2);
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            verts[i * 2 + 0] = Math.cos(angle) * radius;
            verts[i * 2 + 1] = Math.sin(angle) * radius;
        }

        this.gl.bufferData(this.gl.ARRAY_BUFFER, verts, this.gl.DYNAMIC_DRAW);
        this.gl.drawArrays(this.gl.LINE_STRIP, 0, segments + 1);
    }
}
