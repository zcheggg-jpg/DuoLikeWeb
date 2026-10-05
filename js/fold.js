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

// Book-fold shader for the Duo mode: an iPhone-Duo-style foldable seen head-on.
// The base half (left) lies in the interface plane; the folding leaf (right half)
// rotates around the vertical hinge at x = HALF_W, rising toward the viewer as it
// closes. Each pixel casts a ray from the eye and intersects BOTH the leaf and the
// base plane, keeping whichever is closer: the leaf covers the base as it folds
// over it, and the background (alpha 0) shows wherever neither is hit. The inner
// screen content is glued to each half; the leaf's back carries the cover screen.
export const DUO_FRAG_SRC = `#version 300 es
precision highp float;

uniform sampler2D uInner;   // unfolded inner screen, 780 x 844 pt
uniform sampler2D uCover;   // cover screen, 390 x 844 pt
uniform vec2  uSize;        // (780, 844) pt
uniform float uScale;
uniform float uFold;        // fold angle, radians: 0 = fully open, PI = fully folded
uniform float uFoldVel;     // angular velocity of the fold, rad/s (drives the glass sheen)
uniform float uEyeX;
uniform float uEyeDist;

out vec4 fragColor;

float HALF_W = 390.0;  // width of one half; the hinge sits at x = HALF_W
float RADIUS = 46.0;   // body corner radius, pt
float THICK = 26.0;    // body thickness at the free edge, pt (~4.3 mm)
float AA = 1.1;        // silhouette smoothing, pt

// Rounded-box SDF, y-down centered coords, per-corner radii (top-R, bottom-R, top-L, bottom-L).
float sdRoundBox(vec2 p, vec2 b, float rTR, float rBR, float rBL, float rTL) {
    float r = (p.x > 0.0) ? ((p.y < 0.0) ? rTR : rBR) : ((p.y < 0.0) ? rTL : rBL);
    vec2 q = abs(p) - b + vec2(r);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
    vec2 position = vec2(gl_FragCoord.x, uScale * uSize.y - gl_FragCoord.y) / uScale;

    float phi = clamp(uFold, 0.0, 3.14159265);
    float c = cos(phi);
    float s = sin(phi);
    float motion = clamp(abs(uFoldVel) * 0.5, 0.0, 1.0);
    vec3 eye = vec3(uEyeX, uSize.y * 0.5, uEyeDist);
    // The canvas is a viewport centered on the eye, not plane coordinates:
    // as the camera pans to keep the half-open phone centered, the plane
    // point seen at each pixel shifts with it.
    vec2 plane = eye.xy + (position - uSize * 0.5);
    vec3 v = vec3(plane - eye.xy, -eye.z);

    // --- intersection with the leaf plane (rotated around the hinge line) ---
    float denom = v.x * s + eye.z * c;
    float tLeaf = 1e9;
    float d = -1.0;
    float yLeaf = 0.0;
    bool leafHit = false;
    if (abs(denom) > 1e-5) {
        tLeaf = (s * (HALF_W - eye.x) + eye.z * c) / denom;
        if (tLeaf > 0.0) {
            vec3 P = eye + v * tLeaf;
            yLeaf = P.y;
            d = (P.x - HALF_W) * c + P.z * s;
            leafHit = d >= 0.0 && d <= HALF_W && yLeaf >= 0.0 && yLeaf <= uSize.y;
        }
    }

    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // Screen power state, like a real foldable - but with no dark valley: the
    // inner display stays lit until the leaf actually covers it (dims only a
    // little under the closing half), and the cover wakes as soon as its back
    // swings past vertical. A snap-close therefore never blinks to black.
    float powerOn = 0.55 + 0.45 * smoothstep(2.75, 2.50, phi);
    float coverOn = 0.25 + 0.75 * smoothstep(1.75, 2.20, phi);

    // Free-edge side face: the body's thickness. Its plane contains the leaf's
    // free edge and runs along the leaf axis; normal (-s, 0, c) through the edge.
    // Only rendered while the edge actually faces the viewer and the hit lands in
    // front of the base plane: the plane's infinite extension otherwise ghosts a
    // detached titanium strip just outside the silhouette near both fold ends.
    float alphaSide = 0.0;
    vec3 sideCol = vec3(0.0);
    float facing = c * (eye.x - HALF_W * (1.0 + c)) + s * (eye.z - HALF_W * s);
    if (abs(denom) > 1e-5 && s > 0.02 && facing > 0.0) {
        float tSide = (c * eye.z - s * (eye.x - HALF_W)) / denom;
        if (tSide > 0.0 && tSide <= 1.0) {
            vec3 Ps = eye + v * tSide;
            // distance along the leaf axis from the surface edge: u in [0, THICK]
            float u = (Ps.x - HALF_W - HALF_W * c) * c + (Ps.z - HALF_W * s) * s;
            if (u >= 0.0 && u <= THICK && Ps.y >= 0.0 && Ps.y <= uSize.y) {
                // rounded corners taper the edge away at the top and bottom
                float yN = (Ps.y - uSize.y * 0.5) / (uSize.y * 0.5 - RADIUS);
                float roundA = clamp(1.0 - yN * yN, 0.0, 1.0);
                float rim = 0.30 + 0.55 * smoothstep(0.35, 1.0, u / THICK);
                sideCol = vec3(rim * 0.40, rim * 0.40, rim * 0.44);
                // Two guards against grazing-angle garbage: near ~175 degrees the
                // side plane runs parallel to the view rays and the per-pixel hit
                // shatters into a rippled comb (the "flash"), so the edge fades
                // out before that zone and also as its facing turns away.
                alphaSide = roundA * smoothstep(0.0, 80.0, facing)
                          * (1.0 - smoothstep(2.845, 2.932, phi));
            }
        }
    }

    if (alphaSide > 0.0) {
        // the outermost surface along this ray is the metal edge itself
        fragColor = vec4(sideCol * alphaSide, alphaSide);
        return;
    }

    // Depth: the leaf wins when it is strictly in front, when it has folded past
    // vertical (lying on top of the base), or when the pixel is beyond the hinge
    // where the base half does not exist at all — otherwise at phi = 0 (fully
    // open, exactly coplanar) the right half of the phone would vanish.
    if (leafHit && (tLeaf < 1.0 - 1e-4 || plane.x > HALF_W || c < 0.0)) {
        vec2 uv;
        if (c > 0.0) {
            // Front face: inner content is glued to the leaf; at phi = 0 it lines up
            // seamlessly with the base half. Mip bias hides minification shimmer and
            // motion-blurs the content a touch while the fold is moving fast.
            uv = vec2(HALF_W + d, yLeaf) / uSize;
            float bias = clamp(log2(1.0 / max(c, 0.12)) + log2(1.0 + abs(uFoldVel) * 0.10), 0.0, 5.0);
            vec3 c3 = texture(uInner, uv, bias).rgb;
            float x01 = d / HALF_W;
            c3 *= 1.0 - 0.10 * (1.0 - c) * x01;
            // A soft sheen sweeps across the glass while it moves, and rests as a
            // barely-there ambient reflection when the phone is still.
            float band = HALF_W * (0.22 + 0.78 * clamp(1.0 - phi / 1.5707963, 0.0, 1.0));
            c3 += vec3(exp(-pow((d - band) / 52.0, 2.0)) * (0.03 + 0.22 * motion) * (0.3 + 0.7 * s));
            c3 = mix(vec3(0.012), c3, powerOn); // inner display wakes as the fold opens
            col = c3;
            col *= 1.0 - 0.14 * exp(-pow(d / 3.5, 2.0));  // hinge groove on the leaf side
        } else {
            // Back face: the cover screen, glued mirrored (its left edge is the leaf's free edge).
            uv = vec2((HALF_W - d) / HALF_W, yLeaf / uSize.y);
            float bias = clamp(log2(1.0 / max(-c, 0.12)) + log2(1.0 + abs(uFoldVel) * 0.10), 0.0, 5.0);
            vec3 c3 = texture(uCover, uv, bias).rgb;
            c3 *= 1.0 - 0.05 * s;
            c3 = mix(vec3(0.012), c3, coverOn); // cover display dozes off as opening starts
            c3 += vec3(exp(-pow((d - HALF_W * 0.5) / 90.0, 2.0)) * 0.07 * motion);
            col = c3;
            col *= 1.0 - 0.12 * exp(-pow((HALF_W - d) / 3.5, 2.0));  // groove at the hinge edge
        }
        // leaf silhouette + bezel
        vec2 lp = vec2(d - HALF_W * 0.5, yLeaf - uSize.y * 0.5);
        float sdL = sdRoundBox(lp, vec2(HALF_W * 0.5, uSize.y * 0.5), RADIUS, RADIUS, 0.0, 0.0);
        alpha = 1.0 - smoothstep(-AA, AA, sdL);
        col *= mix(1.0, 0.10, smoothstep(-7.0, -1.0, sdL));
    } else {
        // --- base half, flat in the interface plane ---
        vec2 bp = plane - vec2(HALF_W * 0.5, uSize.y * 0.5);
        float sdB = sdRoundBox(bp, vec2(HALF_W * 0.5, uSize.y * 0.5), 0.0, 0.0, RADIUS, RADIUS);
        alpha = 1.0 - smoothstep(-AA, AA, sdB);
        if (alpha > 0.0) {
            col = texture(uInner, plane / uSize).rgb;
            col = mix(vec3(0.012), col, powerOn); // inner display wakes as the fold opens
            col *= mix(1.0, 0.10, smoothstep(-7.0, -1.0, sdB));
            // permanent crease shading at the hinge
            col *= 1.0 - 0.08 * exp(-pow((plane.x - HALF_W) / 9.0, 2.0));
            // the folded leaf hovers over the base and casts a soft shadow on it
            if (c < 0.0) {
                float edge = HALF_W * (1.0 + c);
                float sh = smoothstep(edge - 34.0, edge + 16.0, plane.x);
                col *= 1.0 - 0.38 * sh * s;
            }
        }
    }

    fragColor = vec4(col * alpha, alpha);
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

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
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

    this.duoProgram = this.#buildProgram(VERT_SRC, DUO_FRAG_SRC);
    this.duoUniforms = {
      inner: gl.getUniformLocation(this.duoProgram, 'uInner'),
      cover: gl.getUniformLocation(this.duoProgram, 'uCover'),
      size: gl.getUniformLocation(this.duoProgram, 'uSize'),
      scale: gl.getUniformLocation(this.duoProgram, 'uScale'),
      fold: gl.getUniformLocation(this.duoProgram, 'uFold'),
      foldVel: gl.getUniformLocation(this.duoProgram, 'uFoldVel'),
      eyeX: gl.getUniformLocation(this.duoProgram, 'uEyeX'),
      eye: gl.getUniformLocation(this.duoProgram, 'uEyeDist'),
    };

    this.texture = this.#makeTexture(gl.LINEAR);
    this.innerTex = this.#makeTexture(gl.LINEAR_MIPMAP_LINEAR);
    this.coverTex = this.#makeTexture(gl.LINEAR_MIPMAP_LINEAR);

    gl.useProgram(this.program);
    gl.uniform1i(this.uniforms.layer, 0);
    gl.uniform1f(this.uniforms.blurSpread, this.parameters.blurSpread);
    gl.uniform1f(this.uniforms.darkening, this.parameters.darkening);
    gl.uniform1f(this.uniforms.eye, this.parameters.eyeDistanceMillimeters * this.parameters.pointsPerMillimeter);

    gl.useProgram(this.duoProgram);
    gl.uniform1i(this.duoUniforms.inner, 0);
    gl.uniform1i(this.duoUniforms.cover, 1);
    gl.uniform1f(this.duoUniforms.eye, this.parameters.eyeDistanceMillimeters * this.parameters.pointsPerMillimeter);
  }

  #makeTexture(filter) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
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

  #uploadMipped(tex, source) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  /** Uploads the unfolded inner screen and the cover screen for the Duo mode. */
  setDuoTextures(innerSource, coverSource) {
    this.#uploadMipped(this.innerTex, innerSource);
    this.#uploadMipped(this.coverTex, coverSource);
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

  /** Renders the Duo book-fold. phi: 0 = fully open, PI = fully folded. foldVel: rad/s. */
  drawDuo(phi, eyeX, foldVel = 0) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.duoProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.innerTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.coverTex);
    gl.uniform2f(this.duoUniforms.size, this.sizePt[0], this.sizePt[1]);
    gl.uniform1f(this.duoUniforms.scale, this.scale);
    gl.uniform1f(this.duoUniforms.fold, phi);
    gl.uniform1f(this.duoUniforms.foldVel, foldVel);
    gl.uniform1f(this.duoUniforms.eyeX, eyeX);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
