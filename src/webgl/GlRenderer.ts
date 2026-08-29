// The only stateful, gl-owning object in the WebGL renderer.

import { HierarchyNode } from "d3";

import { TreeNode } from "../polyglot_data.types";
import { SVG_PARTITIONS } from "../svgPatterns";
import { Camera, worldToClipTransform, worldToDeviceScale } from "./camera";
import { parseCssColour, PatternPalette } from "./colours";
import {
  buildFillAttributes,
  buildFills,
  buildOutlines,
  OUTLINE_LEVEL_COUNT,
} from "./geometry";
import { buildIndex, pick as pickInIndex, PickIndex } from "./picking";
import {
  FILL_FRAGMENT_SHADER,
  FILL_VERTEX_SHADER,
  OUTLINE_FRAGMENT_SHADER,
  OUTLINE_VERTEX_SHADER,
} from "./shaders";

// CSS pixels. Chosen by eye against a world-space pattern that scaled with zoom; revisit the same
// way if it reads wrong - it's a single uniform.
const STRIPE_PERIOD_CSS = 10;

// One entry per outline level, so exactly OUTLINE_LEVEL_COUNT of them: geometry.ts's nested levels
// followed by the shared defaultStroke/defaultWidth slot at DEFAULT_OUTLINE_LEVEL. A tuple rather
// than an array because the shader indexes fixed-size uniform arrays of this length, and because
// the only producer (Viz.tsx's buildNestingStyle) spreads a 4-tuple plus one - so the length is
// checkable at compile time and needs no runtime guard.
export type OutlineLevels<T> = readonly [T, T, T, T, T];

// The nesting stroke style, resolved from `state.config.nesting` / `themedColours(state.config)`
// by the caller (Viz.tsx) rather than imported here, so this module stays decoupled from the
// State type.
export interface NestingStyle {
  widths: OutlineLevels<number>;
  strokeColours: OutlineLevels<string>;
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

// Owns the GL context and both programs' buffers. Fill positions/colours live in separate buffers
// (CLAUDE.md, "The three update paths"): setColours() rewrites only the colour buffer, leaving
// positions and the picking index untouched. Outline positions/normals/levels are static per
// setGeometry() call; only the u_widths/u_strokeColours uniforms change for a nesting colour or
// width edit, via the standalone setNestingStyle().
export class GlRenderer {
  private readonly gl: WebGLRenderingContext;

  private readonly fillProgram: WebGLProgram;
  private readonly fillPositionBuffer: WebGLBuffer;
  private readonly fillColourBuffer: WebGLBuffer;
  private readonly fillPatternIndexBuffer: WebGLBuffer;
  private readonly aPos: number;
  private readonly aColour: number;
  private readonly aPatternIndex: number;
  private readonly uFillScale: WebGLUniformLocation;
  private readonly uFillTranslate: WebGLUniformLocation;
  private readonly uFillWorldScale: WebGLUniformLocation;
  private readonly uFillDpr: WebGLUniformLocation;
  private readonly uStripePeriod: WebGLUniformLocation;
  private readonly uPalette: WebGLUniformLocation;
  private readonly uPaletteWidth: WebGLUniformLocation;
  private readonly paletteTexture: WebGLTexture;
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

    // The outline index buffer easily exceeds the 65,535 vertices WebGL1's native
    // ELEMENT_ARRAY_BUFFER index type can address without this extension. Universally supported on
    // desktop/ANGLE; throw loudly rather than silently falling back to a chunked-draw scheme
    // nobody asked for (CLAUDE.md's convention on missing data: fail loud, not subtly wrong).
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
    this.fillPatternIndexBuffer = mustCreateBuffer(gl);
    this.aPos = gl.getAttribLocation(this.fillProgram, "a_pos");
    this.aColour = gl.getAttribLocation(this.fillProgram, "a_colour");
    this.aPatternIndex = gl.getAttribLocation(
      this.fillProgram,
      "a_patternIndex"
    );
    this.uFillScale = mustGetUniformLocation(gl, this.fillProgram, "u_scale");
    this.uFillTranslate = mustGetUniformLocation(
      gl,
      this.fillProgram,
      "u_translate"
    );
    this.uFillWorldScale = mustGetUniformLocation(
      gl,
      this.fillProgram,
      "u_worldScale"
    );
    this.uFillDpr = mustGetUniformLocation(gl, this.fillProgram, "u_dpr");
    this.uStripePeriod = mustGetUniformLocation(
      gl,
      this.fillProgram,
      "u_stripePeriod"
    );
    this.uPalette = mustGetUniformLocation(gl, this.fillProgram, "u_palette");
    this.uPaletteWidth = mustGetUniformLocation(
      gl,
      this.fillProgram,
      "u_paletteWidth"
    );

    // The team-pattern palette: an N x 1 RGB texture, sampled by patternId in the fragment
    // shader. NEAREST + CLAMP_TO_EDGE - discrete colour swatches, not something to interpolate
    // between, and both are required for a non-power-of-2 width under WebGL1 without mipmaps.
    // Bound once here to texture unit 0, which nothing else in this renderer ever uses, so it
    // never needs rebinding.
    const paletteTexture = gl.createTexture();
    if (!paletteTexture) {
      throw new Error("GlRenderer: could not create palette texture");
    }
    this.paletteTexture = paletteTexture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.useProgram(this.fillProgram);
    gl.uniform1i(this.uPalette, 0);
    gl.uniform1f(this.uStripePeriod, STRIPE_PERIOD_CSS);

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

    // Standard alpha blending - all current colours are opaque, but blending costs nothing when
    // unused and future fills may not be.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // Rebuilds and re-uploads the fill buffers, the outline buffers, and the nesting-style
  // uniforms, and rebinds the picking index - the `expensiveConfig` (depth) path, the most
  // expensive of the three update paths (CLAUDE.md). A cheap `config` change goes through
  // setColours()/setNestingStyle() instead (Viz.tsx routes on this). Reallocates rather than
  // patching in place - a future re-layout can change a polygon's vertex count.
  //
  // `fillNodes` and `outlineNodes` are deliberately different lists, not one shared list narrowed
  // internally: `fillNodes` is the leaf/depth-limit "cell" set (also what the picking index is
  // built from - a pick must never return a node with no fill), `outlineNodes` is the wider union
  // of that same cell set with the "nesting" set (every visible node from the first
  // circle-ancestor level down to the depth limit). Both are cached once per draw() in Viz.tsx
  // (`visibleNodesRef` / `outlineNodesRef`) rather than rebuilt here.
  setGeometry(
    fillNodes: readonly HierarchyNode<TreeNode>[],
    outlineNodes: readonly HierarchyNode<TreeNode>[],
    fillFn: (d: HierarchyNode<TreeNode>) => string,
    nestingStyle: NestingStyle,
    palette: PatternPalette
  ): void {
    const { gl } = this;
    const { positions, colours, patternIndices } = buildFills(
      fillNodes,
      fillFn
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillColourBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colours, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPatternIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, patternIndices, gl.DYNAMIC_DRAW);

    this.fillVertexCount = positions.length / 2;
    this.pickIndex = buildIndex(fillNodes);

    this.uploadPalette(palette);

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
  // (visualisation switch, date range, teams, theme) - rewrites the fill colour and pattern-index
  // buffers, leaves the position buffer and the picking index untouched (CLAUDE.md, "The three
  // update paths"). `palette` is rebuilt here too: switching to or from
  // `TeamPatternVisualization`, or a team/date-range change that moves `svgPatternIds`, is exactly
  // a cheap `config` change.
  //
  // `fillNodes` must be the same list `setGeometry()` was last called with. Passing a different
  // one leaves the colour buffer shorter or longer than the position buffer, which GL will happily
  // draw from out of range, so the vertex counts are checked rather than documented.
  setColours(
    fillNodes: readonly HierarchyNode<TreeNode>[],
    fillFn: (d: HierarchyNode<TreeNode>) => string,
    palette: PatternPalette
  ): void {
    const { gl } = this;
    const { colours, patternIndices } = buildFillAttributes(fillNodes, fillFn);
    if (patternIndices.length !== this.fillVertexCount) {
      throw new Error(
        `GlRenderer.setColours: got ${patternIndices.length} vertices for a geometry of ${this.fillVertexCount} - fillNodes must match the list setGeometry() was last called with`
      );
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillColourBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colours, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPatternIndexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, patternIndices, gl.DYNAMIC_DRAW);

    this.uploadPalette(palette);
  }

  // A `patternCount` of 0 (no team data at all) still uploads a 1-texel placeholder rather than a
  // zero-width texture - safe because no vertex will have a non-negative `a_patternIndex` to
  // sample it with in that case (`svgPatternLookup` is empty too).
  private uploadPalette(palette: PatternPalette): void {
    const { gl } = this;
    const width = Math.max(palette.patternCount * SVG_PARTITIONS, 1);
    const rgb =
      palette.patternCount > 0 ? palette.rgb : new Uint8Array([0, 0, 0]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB,
      width,
      1,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      rgb
    );

    gl.useProgram(this.fillProgram);
    gl.uniform1f(this.uPaletteWidth, width);
  }

  // Uniform-only update for nesting colours/widths - no buffer touched, since level is a
  // per-vertex attribute. Called from setGeometry() to establish the uniforms on a full rebuild,
  // and directly by callers (Viz.tsx) for a colour-picker/width-slider drag - the cheapest of the
  // three update paths.
  setNestingStyle(nestingStyle: NestingStyle): void {
    const { widths, strokeColours } = nestingStyle;
    const { gl } = this;
    const rgb = new Float32Array(OUTLINE_LEVEL_COUNT * 3);
    for (let i = 0; i < OUTLINE_LEVEL_COUNT; i++) {
      const [r, g, b] = parseCssColour(strokeColours[i]!);
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    }

    gl.useProgram(this.outlineProgram);
    gl.uniform1fv(this.uWidths, Float32Array.from(widths));
    gl.uniform3fv(this.uStrokeColours, rgb);
  }

  // Hit-tests a world-space point against the current fill geometry. `picking.ts` stays gl-free
  // and independently testable; this just delegates to it against whichever index setGeometry()
  // last built. `null` before the first setGeometry() call, or for a background click.
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

    const worldScale = worldToDeviceScale(camera);

    gl.useProgram(this.fillProgram);
    gl.uniform2f(this.uFillScale, scaleX, scaleY);
    gl.uniform2f(this.uFillTranslate, translateX, translateY);
    gl.uniform1f(this.uFillWorldScale, worldScale);
    gl.uniform1f(this.uFillDpr, camera.dpr);

    gl.useProgram(this.outlineProgram);
    gl.uniform2f(this.uOutlineScale, scaleX, scaleY);
    gl.uniform2f(this.uOutlineTranslate, translateX, translateY);
    gl.uniform1f(this.uWorldScale, worldScale);
    gl.uniform1f(this.uDpr, camera.dpr);
  }

  // Painter's algorithm, no depth buffer: all fills, then all outlines.
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

      gl.bindBuffer(gl.ARRAY_BUFFER, this.fillPatternIndexBuffer);
      gl.enableVertexAttribArray(this.aPatternIndex);
      gl.vertexAttribPointer(this.aPatternIndex, 1, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);

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
    gl.deleteBuffer(this.fillPatternIndexBuffer);
    gl.deleteTexture(this.paletteTexture);
    gl.deleteProgram(this.fillProgram);
    gl.deleteBuffer(this.outlinePositionBuffer);
    gl.deleteBuffer(this.outlineNormalBuffer);
    gl.deleteBuffer(this.outlineLevelBuffer);
    gl.deleteBuffer(this.outlineIndexBuffer);
    gl.deleteProgram(this.outlineProgram);
  }
}
