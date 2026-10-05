// Tilt input for the fold effect.
//
// Mobile (Android / iOS): port of FoldMotionModel.swift — the device tilt around the
// screen-space Y axis is measured from the fused orientation relative to a calibrated
// zero pose, with a gyro prediction term and per-sample smoothing.
// Desktop (Windows / macOS / Linux): there is no accelerometer, so the glass is driven
// by a small spring simulation — drag to hold a tilt, fling the mouse to "shake" it,
// or hold the arrow keys.

const DEG = Math.PI / 180;

// --- tiny 3x3 helpers (row-major arrays of 9) ---
function matMul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
function matTranspose(m) {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}
function matApply(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
// ZXY intrinsic Tait-Bryan angles (deviceorientation convention) -> device-to-Earth matrix.
function orientationMatrix(alphaDeg, betaDeg, gammaDeg) {
  const a = alphaDeg * DEG, b = betaDeg * DEG, g = gammaDeg * DEG;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  const cg = Math.cos(g), sg = Math.sin(g);
  // R = Rz(a) * Rx(b) * Ry(g)
  return [
    ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg,
    sa * cg + ca * sb * sg,  ca * cb, sa * sg - ca * sb * cg,
    -cb * sg,                sb,      cb * cg,
  ];
}

// Screen-space axes in device coordinates, per interface orientation
// (same table as screenAxesInDeviceSpace() in FoldMotionModel.swift).
function screenAxes() {
  const type = (screen.orientation && screen.orientation.type) || 'portrait-primary';
  switch (type) {
    case 'landscape-primary':   return { x: [0, 1, 0],  y: [-1, 0, 0] }; // landscapeLeft
    case 'landscape-secondary': return { x: [0, -1, 0], y: [1, 0, 0] };  // landscapeRight
    case 'portrait-secondary':  return { x: [-1, 0, 0], y: [0, -1, 0] }; // portraitUpsideDown
    default:                    return { x: [1, 0, 0],  y: [0, 1, 0] };  // portrait
  }
}

const SMOOTHING = 0.7;           // fraction of remaining error closed per sample (as in the original)
const PREDICTION_INTERVAL = 0.04; // s of gyro extrapolation to cover sensor+display latency
const MAX_ANGLE = 88 * DEG;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export class TiltController {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = true;   // main.js toggles this per UI mode
    this.angle = 0;        // radians, what the renderer should show now
    this.mode = 'desktop'; // flips to 'sensor' on the first valid orientation event
    this.onModeChange = null;

    // sensor state
    this.reference = null;         // device->Earth matrix at the zero-tilt pose
    this.motionTilt = 0;
    this.latestRate = [0, 0, 0];   // rad/s in device axes (x, y, z)
    this.sensorSeen = false;

    // desktop spring state
    this.target = 0;
    this.vel = 0;
    this.dragging = false;
    this.keyLeft = false;
    this.keyRight = false;
    this.lastFlickAt = 0;
    this.lastMouseX = 0;
    this.lastMouseT = 0;
    this.mouseVX = 0;

    this.#bindSensor();
    this.#bindPointer();
    this.#bindKeys();
  }

  // ------------------------------------------------------------- sensor mode

  static motionNeedsPermission() {
    return typeof window.DeviceOrientationEvent !== 'undefined' &&
      typeof window.DeviceOrientationEvent.requestPermission === 'function';
  }

  async requestMotionPermission() {
    if (!TiltController.motionNeedsPermission()) return true;
    try {
      const state = await window.DeviceOrientationEvent.requestPermission();
      return state === 'granted';
    } catch {
      return false;
    }
  }

  recalibrate() {
    this.reference = null;
    this.motionTilt = 0;
    this.angle = 0;
  }

  #bindSensor() {
    window.addEventListener('deviceorientation', (e) => {
      if (!this.enabled) return;
      if (e.alpha == null && e.beta == null && e.gamma == null) return;
      if (!this.sensorSeen) {
        this.sensorSeen = true;
        if (matchMedia('(pointer: coarse)').matches) this.#setMode('sensor');
      }
      const current = orientationMatrix(e.alpha || 0, e.beta || 0, e.gamma || 0);
      if (!this.reference) {
        this.reference = current; // first sample defines the zero-tilt pose
        return;
      }
      if (this.sliderActive || this.debugTarget != null) return;

      // Current device axes expressed in the calibrated device frame.
      const relative = matMul(matTranspose(this.reference), current);
      const normal = [relative[2], relative[5], relative[8]]; // relative * (0,0,1)
      const { x, y } = screenAxes();
      const measured = Math.atan2(
        normal[0] * x[0] + normal[1] * x[1] + normal[2] * x[2],
        normal[2],
      );

      // Extrapolate along the rotation rate around the screen's Y axis.
      const rateDotY = this.latestRate[0] * y[0] + this.latestRate[1] * y[1] + this.latestRate[2] * y[2];
      const predicted = measured + rateDotY * PREDICTION_INTERVAL;

      this.motionTilt += (predicted - this.motionTilt) * SMOOTHING;
      this.motionTilt = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, this.motionTilt));
    }, { passive: true });

    // rotationRate axes: alpha = device Z, beta = device X, gamma = device Y (deg/s).
    window.addEventListener('devicemotion', (e) => {
      if (!e.rotationRate) return;
      const d = DEG;
      this.latestRate = [
        (e.rotationRate.beta || 0) * d,
        (e.rotationRate.gamma || 0) * d,
        (e.rotationRate.alpha || 0) * d,
      ];
    }, { passive: true });
  }

  // ------------------------------------------------------------ desktop mode

  #bindPointer() {
    const el = this.canvas;
    const maxDrag = 60 * DEG;

    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || this.mode === 'sensor') return;
      this.dragging = true;
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      this.#dragTo(e);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (this.dragging) { this.#dragTo(e); return; }
      if (this.mode === 'sensor' || this.sliderActive || this.debugTarget != null) return;
      // Flick detection: a fast horizontal mouse sweep "shakes" the glass.
      const now = performance.now();
      const dt = (now - this.lastMouseT) / 1000;
      if (dt > 0 && dt < 0.12) {
        this.mouseVX = 0.7 * this.mouseVX + 0.3 * ((e.clientX - this.lastMouseX) / dt);
        if (Math.abs(this.mouseVX) > 1100 && now - this.lastFlickAt > 140) {
          const impulse = Math.max(-5.5, Math.min(5.5, this.mouseVX / 340));
          this.vel += impulse;
          this.lastFlickAt = now;
        }
      } else {
        this.mouseVX = 0;
      }
      this.lastMouseX = e.clientX;
      this.lastMouseT = now;
    });
    const release = () => {
      this.dragging = false;
      el.classList.remove('dragging');
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  #dragTo(e) {
    const rect = this.canvas.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const ratio = (e.clientX - center) / (rect.width / 2);
    this.target = Math.max(-1, Math.min(1, ratio)) * 60 * DEG;
  }

  #bindKeys() {
    const apply = () => {
      if (!this.enabled || this.mode === 'sensor' || this.sliderActive || this.debugTarget != null) return;
      this.target = (this.keyRight ? 50 * DEG : 0) - (this.keyLeft ? 50 * DEG : 0);
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { this.keyLeft = true; apply(); }
      if (e.key === 'ArrowRight') { this.keyRight = true; apply(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft') { this.keyLeft = false; apply(); }
      if (e.key === 'ArrowRight') { this.keyRight = false; apply(); }
    });
  }

  // ------------------------------------------------------------------ shared

  #setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.vel = 0;
    this.target = 0;
    this.motionTilt = this.angle;
    this.onModeChange && this.onModeChange(mode);
  }

  setManual(deg) {
    this.sliderActive = true;
    this.target = deg * DEG;
  }

  endManual() {
    this.sliderActive = false;
    this.target = 0;
  }

  setDebugTilt(deg) { this.debugTarget = deg * DEG; }

  clearDebugTilt() { this.debugTarget = null; }

  update(dt) {
    if (this.debugTarget != null) {
      this.angle += (this.debugTarget - this.angle) * Math.min(1, dt * 10);
      return;
    }
    if (this.mode === 'sensor') {
      this.angle = this.motionTilt;
      return;
    }
    // Critically-ish damped spring toward the target; flick impulses ride on it.
    const k = 110;
    const c = 2 * Math.sqrt(k) * 0.72;
    this.vel += (-k * (this.angle - this.target) - c * this.vel) * dt;
    this.angle += this.vel * dt;
    this.angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, this.angle));
  }
}

// Book-fold control for the Duo mode: fold in [0, 1], 0 = fully folded, 1 = fully
// open. Dragging follows the pointer; a release flick snaps the hinge open or shut
// with an underdamped spring, like a real folding-phone hinge.
export class FoldController {
  #startX = 0;
  #startFold = 0;
  #dragVel = 0;
  #lastMoveT = 0;

  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = false;
    this.fold = 0;        // displayed state
    this.target = 0;      // rest target the spring chases
    this.vel = 0;
    this.dragging = false;
    this.sliderActive = false;
    this.debugTarget = null;
    this.keyLeft = false;
    this.keyRight = false;
    this.#startX = 0;
    this.#startFold = 0;
    this.#dragVel = 0;
    this.#lastMoveT = 0;
    this.onRestChange = null; // (isOpen) -> void, for the open/close button label

    this.#bindPointer();
    this.#bindWheel();
    this.#bindKeys();
  }

  get isOpenRest() { return this.target > 0.5; }

  setTarget(v) {
    this.target = clamp01(v);
    this.onRestChange && this.onRestChange(this.isOpenRest);
  }

  toggle() {
    this.setTarget(this.fold > 0.5 ? 0 : 1);
  }

  #bindPointer() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      this.dragging = true;
      this.#startX = e.clientX;
      this.#startFold = this.fold;
      this.#dragVel = 0;
      this.#lastMoveT = performance.now();
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.dragging) return;
      const rect = el.getBoundingClientRect();
      const next = clamp01(this.#startFold + (e.clientX - this.#startX) / (rect.width * 0.8));
      const now = performance.now();
      const dt = (now - this.#lastMoveT) / 1000;
      if (dt > 0 && dt < 0.15) this.#dragVel = 0.6 * this.#dragVel + 0.4 * ((next - this.fold) / dt);
      else if (dt >= 0.15) this.#dragVel = 0;
      this.#lastMoveT = now;
      this.fold = next;
    });
    const release = () => {
      if (!this.dragging) return;
      this.dragging = false;
      el.classList.remove('dragging');
      // flick: a fast swipe snaps the hinge; otherwise spring to the nearer rest
      if (this.#dragVel > 1.1) this.setTarget(1);
      else if (this.#dragVel < -1.1) this.setTarget(0);
      else this.setTarget(this.fold > 0.5 ? 1 : 0);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
  }

  #bindWheel() {
    this.canvas.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.fold = clamp01(this.fold - e.deltaY / 900);
      this.setTarget(this.fold);
    }, { passive: false });
  }

  #bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || this.sliderActive || this.debugTarget != null) return;
      if (e.key === 'ArrowRight') { this.setTarget(1); }
      if (e.key === 'ArrowLeft') { this.setTarget(0); }
    });
  }

  setManual(v01) {
    this.sliderActive = true;
    this.setTarget(clamp01(v01));
  }

  endManual() { this.sliderActive = false; }

  setDebugFold(v01) { this.debugTarget = clamp01(v01); }
  clearDebugFold() { this.debugTarget = null; }

  update(dt) {
    if (this.debugTarget != null) {
      this.fold += (this.debugTarget - this.fold) * Math.min(1, dt * 12);
      this.fold = clamp01(this.fold);
      return;
    }
    if (this.dragging) return; // pointer position is authoritative while held
    // Slightly underdamped spring so the hinge feels weighted; near the hard
    // stops the overshoot is <1% and the stops absorb it, so the phone settles
    // flat instead of twitching past the fold.
    const k = this.sliderActive ? 140 : 42;
    const zeta = this.sliderActive ? 1.0 : 0.85;
    const c = 2 * Math.sqrt(k) * zeta;
    this.vel += (-k * (this.fold - this.target) - c * this.vel) * dt;
    this.fold += this.vel * dt;
    if (this.fold <= 0) { this.fold = 0; if (this.vel < 0) this.vel = 0; }
    if (this.fold >= 1) { this.fold = 1; if (this.vel > 0) this.vel = 0; }
  }
}
