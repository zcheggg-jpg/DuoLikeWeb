// WebGL2 port of DuoLikeAnimation's DuoFold.metal (MIT, (c) 2026 Elijah Semyonov).
// https://github.com/elijah-semyonov/DuoLikeAnimation
//
// Frosted-glass "fold" effect, math identical to the original Metal shader:
//   The UI lives on a fixed plane in the world (the plane the screen occupied at zero tilt).
//   The viewer's eye stays on that plane's normal through the screen center. When the glass
//   tilts by `angle` around the screen-space Y axis, it rotates around the edge farther from
//   the viewer; for each pixel we cast a ray from the eye through the rotated glass onto the
//   UI plane and blur/dim by the glass-to-plane gap. Rays missing the UI are black.
//
// All geometry is computed in "points" (top-left origin, y down) exactly like the Metal
// version; gl_FragCoord is converted at the top of the fragment shader.

export const VERT_SRC = `#version 300 es
void main() {
    // Fullscreen triangle from gl_VertexID, no attribute buffers needed.
    float x = (gl_VertexID == 1) ? 3.0 : -1.0;
    float y = (gl_VertexID == 2) ? 3.0 : -1.0;
    gl_Position = vec4(x, y, 0.0, 1.0);
}`;

export const FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D uLayer;       // the interface texture, points = texels / uScale
uniform vec2  uSize;            // view size in points (top-left origin, y down)
uniform float uScale;           // device pixels per point
uniform float uAngle;           // signed tilt in radians around the screen-space Y axis
uniform float uEyeDistance;     // eye to UI plane, in points
uniform float uBlurSpread;      // blur radius per point of glass-to-plane separation
uniform float uDarkening;       // fraction of light lost per point of blur radius

out vec4 fragColor;

const int   K_BLUR_TAPS  = 32;
const float GOLDEN_ANGLE = 2.39996322972865332;  // radians, Vogel disk spacing
const float TWO_PI       = 6.28318530717958648;

float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Samples the layer at point coordinates (top-left origin, y down).
// CLAMP_TO_EDGE mirrors how a SwiftUI layerEffect sample clamps at the edges;
// the caller only samples within [-radius, size + radius].
vec3 sampleLayer(vec2 pt) {
    return texture(uLayer, pt / uSize).rgb;
}

void main() {
    // gl_FragCoord is bottom-left origin in device pixels; convert to top-left points.
    vec2 position = vec2(gl_FragCoord.x, uScale * uSize.y - gl_FragCoord.y) / uScale;

vec2 size = uSize;
float tilt = abs(uAngle);

    if (tilt < 1e-5) {
        fragColor = vec4(sampleLayer(position), 1.0);
        return;
    }

    // UI-plane frame: origin at the top-left corner of the untilted screen, z toward the viewer.
bool  hingeRight = uAngle > 0.0;
float hingeX     = hingeRight ? size.x : 0.0;
float side       = hingeRight ? -1.0 : 1.0;   // across the screen, away from the hinge
float d          = abs(position.x - hingeX);  // distance from the hinge, along the glass

    // The glass is rotated 'tilt' around the hinge line, rising toward the viewer.
vec3 glass = vec3(hingeX + side * d * cos(tilt), position.y, d * sin(tilt));
vec3 eye   = vec3(size * 0.5, uEyeDistance);

    // Ray eye -> glass pixel, continued to the UI plane z = 0.
float depth = eye.z - glass.z;
    if (depth <= 1e-3) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
float t   = eye.z / depth;
vec2  hit = eye.xy + (glass.xy - eye.xy) * t;

    // Gap between this pixel of the glass and the UI plane.
float gap    = glass.z;
float radius = uBlurSpread * gap;

    // The whole blur kernel misses the UI: black.
    if (hit.x < -radius || hit.y < -radius || hit.x > size.x + radius || hit.y > size.y + radius) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // Frosted glass also absorbs: dim in proportion to how much it scatters.
float attenuation = max(1.0 - uDarkening * radius, 0.0);

    if (radius < 0.5) {
        fragColor = vec4(sampleLayer(hit) * attenuation, 1.0);
        return;
    }

    // Vogel disk with a per-pixel rotation so banding turns into frosted-glass grain.
int   taps     = int(clamp(radius * 2.0, 6.0, float(K_BLUR_TAPS)));
float rotation = hash21(position) * TWO_PI;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < taps; ++i) {
    float r = radius * sqrt((float(i) + 0.5) / float(taps));
    float a = float(i) * GOLDEN_ANGLE + rotation;
    vec2 offset = r * vec2(cos(a), sin(a));
        sum += sampleLayer(hit + offset);
    }
    fragColor = vec4(sum / float(taps) * attenuation, 1.0);
}`;

export const DEFAULT_PARAMETERS = {
  /** Eye to screen distance in millimeters (hand-held). */
  eyeDistanceMillimeters: 320,
  /** Approximate density of logical points on current phone panels (~6 pt/mm). */
  pointsPerMillimeter: 6,
  /** Blur radius per point of separation (tan of the frost scattering half-angle). */
  blurSpread: 0.12,
  /** Fraction of light lost per point of blur radius. */
  darkening: 0.015,
};

export class FoldRenderer {
  constructor(canvas, parameters = DEFAULT_PARAMETERS) {
    this.canvas = canvas;
    this.parameters = { ...DEFAULT_PARAMETERS, ...parameters };
    this.angle = 0;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;

    this.program = this.#buildProgram(VERT_SRC, FRAG_SRC);
    this.uniforms = {
      layer: gl.getUniformLocation(this.program, 'uLayer'),
      size: gl.getUniformLocation(this.program, 'uSize'),
      scale: gl.getUniformLocation(this.program, 'uScale'),
      angle: gl.getUniformLocation(this.program, 'uAngle'),
      eye: gl.getUniformLocation(this.program, 'uEyeDistance'),
      blurSpread: gl.getUniformLocation(this.program, 'uBlurSpread'),
      darkening: gl.getUniformLocation(this.program, 'uDarkening'),
    };

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.layer, 0);
    gl.uniform1f(this.uniforms.blurSpread, this.parameters.blurSpread);
    gl.uniform1f(this.uniforms.darkening, this.parameters.darkening);
    gl.uniform1f(this.uniforms.eye, this.parameters.eyeDistanceMillimeters * this.parameters.pointsPerMillimeter);
  }

  #buildProgram(vertSrc, fragSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    return program;
  }

  /** Uploads a canvas (or image) as the interface texture. Size must match the render target. */
  setLayer(source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  /** Sets the render size in points and the backing pixel scale. */
  setSize(widthPt, heightPt, pixelScale) {
    const gl = this.gl;
    this.canvas.width = Math.max(1, Math.round(widthPt * pixelScale));
    this.canvas.height = Math.max(1, Math.round(heightPt * pixelScale));
    this.sizePt = [widthPt, heightPt];
    this.scale = pixelScale;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(angle = this.angle) {
    const gl = this.gl;
    this.angle = angle;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform2f(this.uniforms.size, this.sizePt[0], this.sizePt[1]);
    gl.uniform1f(this.uniforms.scale, this.scale);
    gl.uniform1f(this.uniforms.angle, angle);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
