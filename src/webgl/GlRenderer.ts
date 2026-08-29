// The only stateful, gl-owning object in the WebGL renderer (plan.md decision 6: deliberately
// untested by Vitest - jsdom has no WebGL context - verified manually and by the screenshot
// suite instead).

import { HierarchyNode } from "d3";

import { TreeNode } from "../polyglot_data.types";
import { Camera, worldToClipTransform } from "./camera";
import { buildFills } from "./geometry";
import { FILL_FRAGMENT_SHADER, FILL_VERTEX_SHADER } from "./shaders";

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("GlRenderer: could not create shader");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`GlRenderer: shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("GlRenderer: could not create program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`GlRenderer: program link failed: ${log}`);
  }
  // Shaders are compiled into the program now; the standalone objects are no longer needed.
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

function mustCreateBuffer(gl: WebGLRenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error("GlRenderer: could not create buffer");
  }
  return buffer;
}

function mustGetUniformLocation(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  name: string
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`GlRenderer: uniform "${name}" not found`);
  }
  return location;
}

// Owns the GL context, the fill program, and the fill geometry buffers. Positions and colours
// live in separate buffers from the start (spec.md, "The three update paths") even though step 4
// rewrites both together on every change - step 8 depends on the split and retrofitting it later
// would be a rewrite.
export class GlRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly fillProgram: WebGLProgram;
  private readonly positionBuffer: WebGLBuffer;
  private readonly colourBuffer: WebGLBuffer;
  private readonly aPos: number;
  private readonly aColour: number;
  private readonly uScale: WebGLUniformLocation;
  private readonly uTranslate: WebGLUniformLocation;
  private fillVertexCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) {
      throw new Error("GlRenderer: WebGL context unavailable");
    }
    this.gl = gl;

    this.fillProgram = createProgram(
      gl,
      FILL_VERTEX_SHADER,
      FILL_FRAGMENT_SHADER
    );
    this.positionBuffer = mustCreateBuffer(gl);
    this.colourBuffer = mustCreateBuffer(gl);
    this.aPos = gl.getAttribLocation(this.fillProgram, "a_pos");
    this.aColour = gl.getAttribLocation(this.fillProgram, "a_colour");
    this.uScale = mustGetUniformLocation(gl, this.fillProgram, "u_scale");
    this.uTranslate = mustGetUniformLocation(
      gl,
      this.fillProgram,
      "u_translate"
    );

    // Standard alpha blending (spec.md, "Draw order") - all current colours are opaque, but
    // blending costs nothing when unused and future fills may not be.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // Rebuilds and re-uploads both the position and colour buffers, and rebinds the picking index
  // once it exists (plan.md step 5). Reallocates rather than patching in place - a future
  // re-layout can change a polygon's vertex count (spec.md, "The three update paths").
  setGeometry(
    nodes: readonly HierarchyNode<TreeNode>[],
    fillFn: (d: HierarchyNode<TreeNode>) => string
  ): void {
    const { gl } = this;
    const { positions, colours } = buildFills(nodes, fillFn);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colourBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colours, gl.DYNAMIC_DRAW);

    this.fillVertexCount = positions.length / 2;
  }

  // Camera-only update: writes the transform uniforms, touches no buffer. `canvasWidthPx` /
  // `canvasHeightPx` are the canvas's device-pixel backing-store size (post-DPR), not its CSS
  // size.
  setTransform(
    camera: Camera,
    canvasWidthPx: number,
    canvasHeightPx: number
  ): void {
    const { gl } = this;
    const { scaleX, scaleY, translateX, translateY } = worldToClipTransform(
      camera,
      canvasWidthPx,
      canvasHeightPx
    );
    gl.useProgram(this.fillProgram);
    gl.uniform2f(this.uScale, scaleX, scaleY);
    gl.uniform2f(this.uTranslate, translateX, translateY);
  }

  // Painter's algorithm, no depth buffer (spec.md, "Draw order") - fills only until outlines
  // land in plan.md step 7.
  draw(): void {
    const { gl } = this;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.fillVertexCount === 0) return;

    gl.useProgram(this.fillProgram);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.colourBuffer);
    gl.enableVertexAttribArray(this.aColour);
    gl.vertexAttribPointer(this.aColour, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.fillVertexCount);
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.colourBuffer);
    gl.deleteProgram(this.fillProgram);
  }
}
