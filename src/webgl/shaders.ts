// WebGL 1 (GLSL ES 1.00) shader sources as template strings. Deliberately untested by Vitest -
// jsdom has no WebGL context - and verified manually and via the screenshot suite instead
// (plan.md decision 6). No `gl` import here; `GlRenderer.ts` is the only stateful, gl-owning
// module.

// Flat-filled triangles: world-space position in, uniform camera transform (camera.ts's
// worldToClipTransform, computed on the JS side) applied per vertex, per-vertex colour passed
// straight through.
export const FILL_VERTEX_SHADER = `
attribute vec2 a_pos;
attribute vec3 a_colour;

uniform vec2 u_scale;
uniform vec2 u_translate;

varying vec3 v_colour;

void main() {
  gl_Position = vec4(a_pos * u_scale + u_translate, 0.0, 1.0);
  v_colour = a_colour;
}
`;

export const FILL_FRAGMENT_SHADER = `
precision mediump float;

varying vec3 v_colour;

void main() {
  gl_FragColor = vec4(v_colour, 1.0);
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
