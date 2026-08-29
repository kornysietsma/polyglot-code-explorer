// The only stateful, gl-owning object in the WebGL renderer (plan.md decision 6: deliberately
// untested by Vitest - jsdom has no WebGL context - verified manually and by the screenshot
// suite instead).

import { HierarchyNode } from "d3";

import { TreeNode } from "../polyglot_data.types";
import { Camera, worldToClipTransform, worldToDeviceScale } from "./camera";
import { parseCssColour } from "./colours";
import { buildFillColours, buildFills, buildOutlines } from "./geometry";
import { buildIndex, pick as pickInIndex, PickIndex } from "./picking";
import {
  FILL_FRAGMENT_SHADER,
  FILL_VERTEX_SHADER,
  OUTLINE_FRAGMENT_SHADER,
  OUTLINE_VERTEX_SHADER,
} from "./shaders";

// The nesting stroke style, resolved from `state.config.nesting` / `themedColours(state.config)`
// by the caller (Viz.tsx) rather than imported here, so this module stays decoupled from the
// State type. Index 4 is the shared defaultStroke/defaultWidth slot - see geometry.ts's
// `outlineLevel`.
export interface NestingStyle {
  widths: readonly number[]; // length 5: 4 nested levels + 1 default
  strokeColours: readonly string[]; // length 5: 4 nested levels + 1 default
}

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

// Owns the GL context and both programs' buffers. Fill positions/colours live in separate
// buffers (spec.md, "The three update paths"): setColours() rewrites only the colour buffer,
// leaving positions and the picking index untouched. Outline positions/normals/levels are static
// per setGeometry() call; only the u_widths/u_strokeColours uniforms change for a nesting colour
// or width edit, via the standalone setNestingStyle().
export class GlRenderer {
  private readonly gl: WebGLRenderingContext;

  private readonly fillProgram: WebGLProgram;
  private readonly fillPositionBuffer: WebGLBuffer;
  private readonly fillColourBuffer: WebGLBuffer;
  private readonly aPos: number;
  private readonly aColour: number;
  private readonly uFillScale: WebGLUniformLocation;
  private readonly uFillTranslate: WebGLUniformLocation;
  private fillVertexCount = 0;

  private readonly outlineProgram: WebGLProgram;
  private readonly outlinePositionBuffer: WebGLBuffer;
  private readonly outlineNormalBuffer: WebGLBuffer;
  private readonly outlineLevelBuffer: WebGLBuffer;
  private readonly outlineIndexBuffer: WebGLBuffer;
  private readonly aOutlinePos: number;
  private readonly aNormal: number;
  private readonly aLevel: number;
  private readonly uOutlineScale: WebGLUniformLocation;
  private readonly uOutlineTranslate: WebGLUniformLocation;
  private readonly uWorldScale: WebGLUniformLocation;
  private readonly uDpr: WebGLUniformLocation;
  private readonly uWidths: WebGLUniformLocation;
  private readonly uStrokeColours: WebGLUniformLocation;
  private outlineIndexCount = 0;

  private pickIndex: PickIndex | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) {
      throw new Error("GlRenderer: WebGL context unavailable");
    }
    this.gl = gl;

    // The outline index buffer easily exceeds 65,535 vertices at openmrs/spring-projects scale
    // (spec.md, "Outlines" budget) - WebGL1's native ELEMENT_ARRAY_BUFFER index type without this
    // extension. Universally supported on desktop/ANGLE; throw loudly rather than silently
    // falling back to a chunked-draw scheme nobody asked for (CLAUDE.md's convention on missing
    // data: fail loud, not subtly wrong).
    if (!gl.getExtension("OES_element_index_uint")) {
      throw new Error(
        "GlRenderer: OES_element_index_uint unavailable - required for outline index buffers at this scale"
      );
    }

    this.fillProgram = createProgram(
      gl,
      FILL_VERTEX_SHADER,
      FILL_FRAGMENT_SHADER
    );
    this.fillPositionBuffer = mustCreateBuffer(gl);
    this.fillColourBuffer = mustCreateBuffer(gl);
    this.aPos = gl.getAttribLocation(this.fillProgram, "a_pos");
    this.aColour = gl.getAttribLocation(this.fillProgram, "a_colour");
    this.uFillScale = mustGetUniformLocation(gl, this.fillProgram, "u_scale");
    this.uFillTranslate = mustGetUniformLocation(
      gl,
      this.fillProgram,
      "u_translate"
    );

    this.outlineProgram = createProgram(
      gl,
      OUTLINE_VERTEX_SHADER,
      OUTLINE_FRAGMENT_SHADER
    );
    this.outlinePositionBuffer = mustCreateBuffer(gl);
    this.outlineNormalBuffer = mustCreateBuffer(gl);
    this.outlineLevelBuffer = mustCreateBuffer(gl);
    this.outlineIndexBuffer = mustCreateBuffer(gl);
    this.aOutlinePos = gl.getAttribLocation(this.outlineProgram, "a_pos");
    this.aNormal = gl.getAttribLocation(this.outlineProgram, "a_normal");
    this.aLevel = gl.getAttribLocation(this.outlineProgram, "a_level");
    this.uOutlineScale = mustGetUniformLocation(
      gl,
      this.outlineProgram,
      "u_scale"
    );
    this.uOutlineTranslate = mustGetUniformLocation(
      gl,
      this.outlineProgram,
      "u_translate"
    );
    this.uWorldScale = mustGetUniformLocation(
      gl,
      this.outlineProgram,
      "u_worldScale"
    );
    this.uDpr = mustGetUniformLocation(gl, this.outlineProgram, "u_dpr");
    this.uWidths = mustGetUniformLocation(gl, this.outlineProgram, "u_widths");
    this.uStrokeColours = mustGetUniformLocation(
      gl,
      this.outlineProgram,
      "u_strokeColours"
    );

    // Standard alpha blending (spec.md, "Draw order") - all current colours are opaque, but
    // blending costs nothing when unused and future fills may not be.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // Rebuilds and re-uploads the fill buffers, the outline buffers, and the nesting-style
  // uniforms, and rebinds the picking index - the `expensiveConfig` (depth) path, the most
  // expensive of the three update paths (spec.md). A cheap `config` change goes through
  // setColours()/setNestingStyle() instead (Viz.tsx routes on this). Reallocates rather than
  // patching in place - a future re-layout can change a polygon's vertex count.
  //
  // `fillNodes` and `outlineNodes` are deliberately different lists, not one shared list narrowed
  // internally: `fillNodes` is the leaf/depth-limit "cell" set (also what the picking index is
  // built from - a pick must never return a node with no fill), `outlineNodes` is the wider union
  // of that same cell set with the "nesting" set (every visible node from the first
  // circle-ancestor level down to the depth limit) - see spec.md's "Outlines". Both are cached
  // once per draw() in Viz.tsx (`visibleNodesRef` / `outlineNodesRef`) rather than rebuilt here.
  setGeometry(
    fillNodes: readonly HierarchyNode<TreeNode>[],
    outlineNodes: readonly HierarchyNode<TreeNode>[],
    fillFn: (d: HierarchyNode<TreeNode>) => string,
    nestingStyle: NestingStyle
  ): void {
    const { gl } = this;
    const { positions, colours } = buildFills(fillNodes, fillFn);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillColourBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colours, gl.DYNAMIC_DRAW);

    this.fillVertexCount = positions.length / 2;
    this.pickIndex = buildIndex(fillNodes);

    const outlineGeometry = buildOutlines(outlineNodes);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.outlinePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, outlineGeometry.positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineNormalBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, outlineGeometry.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineLevelBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, outlineGeometry.levels, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.outlineIndexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      outlineGeometry.indices,
      gl.STATIC_DRAW
    );

    this.outlineIndexCount = outlineGeometry.indices.length;

    this.setNestingStyle(nestingStyle);
  }

  // Colour-only update for a cheap `config` change that isn't a nesting colour/width edit
  // (visualisation switch, date range, teams, theme) - rewrites the fill colour buffer, leaves
  // the position buffer and the picking index untouched (spec.md, "The three update paths").
  // `fillNodes` must be the same list `setGeometry()` was last called with, or the colour buffer's
  // vertex count won't match the position buffer's.
  setColours(
    fillNodes: readonly HierarchyNode<TreeNode>[],
    fillFn: (d: HierarchyNode<TreeNode>) => string
  ): void {
    const { gl } = this;
    const colours = buildFillColours(fillNodes, fillFn);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillColourBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colours, gl.DYNAMIC_DRAW);
  }

  // Uniform-only update for nesting colours/widths - no buffer touched, since level is a
  // per-vertex attribute (spec.md, "Outlines"). Called from setGeometry() to establish the
  // uniforms on a full rebuild, and directly by callers (Viz.tsx) for a colour-picker/width-slider
  // drag - the cheapest of the three update paths.
  setNestingStyle(nestingStyle: NestingStyle): void {
    const { widths, strokeColours } = nestingStyle;
    if (widths.length !== 5 || strokeColours.length !== 5) {
      throw new Error(
        `GlRenderer: nestingStyle must have exactly 5 widths/colours (4 nested levels + default), got ${widths.length}/${strokeColours.length}`
      );
    }
    const { gl } = this;
    const rgb = new Float32Array(15);
    for (let i = 0; i < 5; i++) {
      const [r, g, b] = parseCssColour(strokeColours[i]!);
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    }

    gl.useProgram(this.outlineProgram);
    gl.uniform1fv(this.uWidths, Float32Array.from(widths));
    gl.uniform3fv(this.uStrokeColours, rgb);
  }

  // Hit-tests a world-space point against the current fill geometry (plan.md step 5). `picking.ts`
  // stays gl-free and independently testable; this just delegates to it against whichever index
  // setGeometry() last built. `null` before the first setGeometry() call, or for a background
  // click - identical to today's directory-border-click drop (spec.md decision 3).
  pick(worldX: number, worldY: number): HierarchyNode<TreeNode> | null {
    if (!this.pickIndex) return null;
    return pickInIndex(this.pickIndex, worldX, worldY);
  }

  // Camera-only update: writes the transform uniforms on both programs, touches no buffer.
  // `canvasWidthPx` / `canvasHeightPx` are the canvas's device-pixel backing-store size (post-DPR),
  // not its CSS size.
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
    gl.uniform2f(this.uFillScale, scaleX, scaleY);
    gl.uniform2f(this.uFillTranslate, translateX, translateY);

    gl.useProgram(this.outlineProgram);
    gl.uniform2f(this.uOutlineScale, scaleX, scaleY);
    gl.uniform2f(this.uOutlineTranslate, translateX, translateY);
    gl.uniform1f(this.uWorldScale, worldToDeviceScale(camera));
    gl.uniform1f(this.uDpr, camera.dpr);
  }

  // Painter's algorithm, no depth buffer (spec.md, "Draw order"): all fills, then all outlines.
  draw(): void {
    const { gl } = this;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (this.fillVertexCount > 0) {
      gl.useProgram(this.fillProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPositionBuffer);
      gl.enableVertexAttribArray(this.aPos);
      gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.fillColourBuffer);
      gl.enableVertexAttribArray(this.aColour);
      gl.vertexAttribPointer(this.aColour, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, this.fillVertexCount);
    }

    if (this.outlineIndexCount > 0) {
      gl.useProgram(this.outlineProgram);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.outlinePositionBuffer);
      gl.enableVertexAttribArray(this.aOutlinePos);
      gl.vertexAttribPointer(this.aOutlinePos, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineNormalBuffer);
      gl.enableVertexAttribArray(this.aNormal);
      gl.vertexAttribPointer(this.aNormal, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.outlineLevelBuffer);
      gl.enableVertexAttribArray(this.aLevel);
      gl.vertexAttribPointer(this.aLevel, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.outlineIndexBuffer);
      gl.drawElements(gl.TRIANGLES, this.outlineIndexCount, gl.UNSIGNED_INT, 0);
    }
  }

  destroy(): void {
    const { gl } = this;
    gl.deleteBuffer(this.fillPositionBuffer);
    gl.deleteBuffer(this.fillColourBuffer);
    gl.deleteProgram(this.fillProgram);
    gl.deleteBuffer(this.outlinePositionBuffer);
    gl.deleteBuffer(this.outlineNormalBuffer);
    gl.deleteBuffer(this.outlineLevelBuffer);
    gl.deleteBuffer(this.outlineIndexBuffer);
    gl.deleteProgram(this.outlineProgram);
  }
}
