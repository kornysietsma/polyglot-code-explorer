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
