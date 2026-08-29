// WebGL 1 (GLSL ES 1.00) shader sources as template strings. Deliberately untested by Vitest -
// jsdom has no WebGL context - and verified manually and via the screenshot suite instead
// (plan.md decision 6). No `gl` import here; `GlRenderer.ts` is the only stateful, gl-owning
// module.

// Flat-filled triangles: world-space position in, uniform camera transform (camera.ts's
// worldToClipTransform, computed on the JS side) applied per vertex, per-vertex colour passed
// straight through. `a_patternIndex` (-1 = ordinary flat colour, >=0 = a palette-texture pattern
// id) is TeamPatternVisualization's stripe path (spec.md, "Team pattern visualisation"); `v_world`
// carries the un-transformed world position through so the fragment shader can anchor the stripe
// phase to content, not viewport, position (see FILL_FRAGMENT_SHADER's comment on why).
export const FILL_VERTEX_SHADER = `
attribute vec2 a_pos;
attribute vec3 a_colour;
attribute float a_patternIndex;

uniform vec2 u_scale;
uniform vec2 u_translate;

varying vec3 v_colour;
varying vec2 v_world;
varying float v_patternIndex;

void main() {
  gl_Position = vec4(a_pos * u_scale + u_translate, 0.0, 1.0);
  v_colour = a_colour;
  v_world = a_pos;
  v_patternIndex = a_patternIndex;
}
`;

// `v_patternIndex < 0.0` is the overwhelming common case (every visualisation except
// TeamPatternVisualization, and even within it, any node with no team data at all - see
// BaseVisualization.fillFn's neutralColour override) - a per-vertex sentinel rather than a global
// "pattern mode" uniform, since a scene can legitimately mix patterned and flat-coloured vertices
// (TeamPatternVisualization's own neutralColour/circlePackBackground/nonexistentColour overrides).
//
// The stripe phase is anchored to `v_world` (interpolated, so still world space per-fragment),
// not `gl_FragCoord` - the obvious `dot(gl_FragCoord.xy, axis)` form locks the stripe field to the
// *viewport*, so panning slides the pattern underneath the content (the "shower door" artefact).
// `u_worldScale` (camera.ts's worldToDeviceScale - world -> device pixels, isotropic) converts the
// world-space dot product to device pixels so the period stays a fixed size on screen regardless
// of zoom, exactly like the outline shader's stroke-width offset.
export const FILL_FRAGMENT_SHADER = `
precision mediump float;

varying vec3 v_colour;
varying vec2 v_world;
varying float v_patternIndex;

uniform float u_worldScale;
uniform float u_dpr;
uniform float u_stripePeriod; // CSS pixels
uniform sampler2D u_palette;
uniform float u_paletteWidth; // texture width in texels (patternCount * 3)

const vec2 STRIPE_AXIS = vec2(0.70710678, -0.70710678); // -45 degrees, unit length

vec2 paletteUv(float patternIndex, float band) {
  float texel = patternIndex * 3.0 + band;
  return vec2((texel + 0.5) / u_paletteWidth, 0.5);
}

void main() {
  if (v_patternIndex >= 0.0) {
    float d = dot(v_world * u_worldScale, STRIPE_AXIS) / (u_stripePeriod * u_dpr);
    float band = floor(fract(d) * 3.0);
    gl_FragColor = vec4(texture2D(u_palette, paletteUv(v_patternIndex, band)).rgb, 1.0);
  } else {
    gl_FragColor = vec4(v_colour, 1.0);
  }
}
`;

// Expanded-triangle outlines (spec.md, "Outlines"): `a_normal` is the signed per-vertex offset
// direction computed on the CPU (geometry.ts's buildOutlines), scaled here by a CSS-pixel width
// looked up per-vertex via `a_level` so that editing a nesting colour or width in the UI becomes
// a uniform update with no buffer re-upload. The offset is applied in world space, before the
// same u_scale/u_translate fit+zoom transform the fill shader uses, which is what keeps the
// resulting screen-space width isotropic even when the canvas isn't square - see
// camera.ts's worldToDeviceScale for the derivation.
export const OUTLINE_VERTEX_SHADER = `
attribute vec2 a_pos;
attribute vec2 a_normal;
attribute float a_level;

uniform vec2 u_scale;
uniform vec2 u_translate;
uniform float u_worldScale; // world -> device-pixel scale (camera.ts's worldToDeviceScale)
uniform float u_dpr;
uniform float u_widths[5];
uniform vec3 u_strokeColours[5];

varying vec3 v_colour;

void main() {
  int level = int(a_level + 0.5);
  float widthCss = u_widths[level];
  float offsetDevicePx = widthCss * u_dpr * 0.5;
  vec2 worldPos = a_pos + a_normal * (offsetDevicePx / u_worldScale);
  gl_Position = vec4(worldPos * u_scale + u_translate, 0.0, 1.0);
  v_colour = u_strokeColours[level];
}
`;

export const OUTLINE_FRAGMENT_SHADER = `
precision mediump float;

varying vec3 v_colour;

void main() {
  gl_FragColor = vec4(v_colour, 1.0);
}
`;
