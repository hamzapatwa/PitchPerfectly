// Minimal CRT-like scanline vignette shader (GLSL ES 1.0 fragment)
precision mediump float;
uniform sampler2D u_tex;
varying vec2 v_uv;
void main() {
  vec3 col = texture2D(u_tex, v_uv).rgb;
  float scan = sin(v_uv.y * 1200.0) * 0.04;
  float vig = smoothstep(0.9, 0.2, length(v_uv - 0.5));
  col *= (1.0 - scan);
  col *= mix(1.0, 0.75, vig);
  gl_FragColor = vec4(col, 1.0);
}