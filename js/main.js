import { FoldRenderer } from './fold.js';
import { TiltController, FoldController } from './motion.js';
import { renderLayer, renderInner, renderCover } from './ui.js';

const DUO_SIZE = { w: 780, h: 844 };
const COVER_SIZE = { w: 390, h: 844 };

const canvas = document.getElementById('gl');
const boot = document.getElementById('boot');
const hint = document.getElementById('hint');
const panel = document.getElementById('panel');
const segTilt = document.getElementById('modeTilt');
const segDuo = document.getElementById('modeDuo');
const btnMotion = document.getElementById('btnMotion');
const btnCalibrate = document.getElementById('btnCalibrate');
const manualBox = document.getElementById('manualBox');
const slider = document.getElementById('slider');
const sliderVal = document.getElementById('sliderVal');
const btnFold = document.getElementById('btnFold');
const foldBox = document.getElementById('foldBox');
const foldSlider = document.getElementById('foldSlider');
const foldVal = document.getElementById('foldVal');
const fileInput = document.getElementById('file');

let renderer;
let tiltCtl;
let foldCtl;
let appMode = 'tilt';
let wallpaper = null;
let lastLayerKey = '';

const isCoarse = matchMedia('(pointer: coarse)').matches;

// ----------------------------------------------------------------- helpers

function hintFor(mode, uiMode) {
  if (uiMode === 'duo') {
    return isCoarse ? '左右滑动屏幕，像翻开书一样展开它' : '拖动或甩动鼠标展开手机 · 滚轮微调 · ← → 键开合';
  }
  if (mode === 'sensor') {
    return '倾斜手机 — 界面留在原地，屏幕变成一块磨砂玻璃';
  }
  return '甩动或按住拖动鼠标 · 也可以用 ← → 方向键';
}

function showHint(text) {
  hint.textContent = text;
  hint.hidden = false;
  hint.style.opacity = '1';
  hint.style.transition = 'none';
  requestAnimationFrame(() => {
    hint.style.transition = 'opacity 0.8s ease 4s';
    hint.style.opacity = '0';
  });
}

function ptSize() {
  if (appMode === 'duo') {
    const rect = canvas.getBoundingClientRect();
    return { w: rect.width || DUO_SIZE.w, h: rect.height || DUO_SIZE.h };
  }
  if (isCoarse) {
    return { w: window.innerWidth, h: window.innerHeight };
  }
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function rebuildTextures() {
  // Floor the pixel scale at 1.5 so low-DPR displays still get crisp textures.
  const scale = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
  if (appMode === 'duo') {
    // The shader works in fixed design points (780 x 844); the canvas backing
    // follows the displayed CSS size, so derive the effective px-per-point.
    const cssW = canvas.getBoundingClientRect().width || DUO_SIZE.w;
    const be = Math.max(1, Math.round(cssW * scale)) / DUO_SIZE.w;
    renderer.setSize(DUO_SIZE.w, DUO_SIZE.h, be);
    renderer.setDuoTextures(
      renderInner(DUO_SIZE.w, DUO_SIZE.h, be, wallpaper),
      renderCover(COVER_SIZE.w, COVER_SIZE.h, be),
    );
    lastLayerKey = `duo@${be.toFixed(3)}`;
    return;
  }
  const { w, h } = ptSize();
  const key = `tilt:${Math.round(w)}x${Math.round(h)}@${scale}`;
  if (key === lastLayerKey) return;
  lastLayerKey = key;
  renderer.setSize(w, h, scale);
  renderer.setLayer(renderLayer(w, h, scale, wallpaper));
}

function syncFoldUI() {
  if (foldCtl.sliderActive) return;
  const pct = Math.round(foldCtl.fold * 100);
  foldSlider.value = String(pct);
  foldVal.textContent = `${pct}%`;
  const label = foldCtl.isOpenRest ? '合上' : '展开';
  if (btnFold.textContent !== label) btnFold.textContent = label;
}

function setMode(mode) {
  if (appMode === mode) return;
  appMode = mode;
  document.body.classList.toggle('mode-duo', mode === 'duo');
  segTilt.classList.toggle('active', mode === 'tilt');
  segDuo.classList.toggle('active', mode === 'duo');
  segTilt.setAttribute('aria-selected', String(mode === 'tilt'));
  segDuo.setAttribute('aria-selected', String(mode === 'duo'));

  const duo = mode === 'duo';
  foldCtl.enabled = duo;
  tiltCtl.enabled = !duo;
  btnFold.hidden = !duo;
  foldBox.hidden = !duo;
  manualBox.hidden = duo;
  btnCalibrate.hidden = duo || tiltCtl.mode !== 'sensor';

  lastLayerKey = '';
  rebuildTextures();
  showHint(hintFor(tiltCtl.mode, mode));
}

function loadWallpaper(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    wallpaper = img;
    lastLayerKey = '';
    rebuildTextures();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

// -------------------------------------------------------------------- boot

function start() {
  renderer = new FoldRenderer(canvas);
  tiltCtl = new TiltController(canvas);
  foldCtl = new FoldController(canvas);

  tiltCtl.onModeChange = (mode) => {
    btnCalibrate.hidden = appMode === 'duo' || mode !== 'sensor';
    showHint(hintFor(mode, appMode));
  };
  foldCtl.onRestChange = (isOpen) => {
    btnFold.textContent = isOpen ? '合上' : '展开';
  };

  segTilt.addEventListener('click', () => setMode('tilt'));
  segDuo.addEventListener('click', () => setMode('duo'));

  btnCalibrate.addEventListener('click', () => tiltCtl.recalibrate());

  if (isCoarse && TiltController.motionNeedsPermission()) {
    btnMotion.hidden = false;
    btnMotion.addEventListener('click', async () => {
      btnMotion.textContent = '…';
      const ok = await tiltCtl.requestMotionPermission();
      btnMotion.hidden = true;
      if (!ok) showHint('体感权限被拒绝，可以在手动滑杆里拖动倾斜');
    });
  }

  slider.addEventListener('input', () => {
    sliderVal.textContent = `${slider.value}°`;
    tiltCtl.setManual(Number(slider.value));
  });
  slider.addEventListener('change', () => tiltCtl.endManual());

  btnFold.addEventListener('click', () => foldCtl.toggle());
  foldSlider.addEventListener('input', () => {
    foldVal.textContent = `${foldSlider.value}%`;
    foldCtl.setManual(Number(foldSlider.value) / 100);
  });
  foldSlider.addEventListener('change', () => foldCtl.endManual());

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) loadWallpaper(fileInput.files[0]);
  });

  window.addEventListener('resize', () => { lastLayerKey = ''; rebuildTextures(); });

  // Debug / screenshot hooks. __renderOnce / __renderSettled draw synchronously,
  // independent of rAF, so screenshots are correct even when the tab is throttled.
  window.__setTiltDeg = (deg) => tiltCtl.setDebugTilt(deg);
  window.__clearTilt = () => tiltCtl.clearDebugTilt();
  window.__setFold01 = (v) => foldCtl.setDebugFold(v);
  window.__clearFold = () => foldCtl.clearDebugFold();
  window.__controller = tiltCtl;
  window.__foldController = foldCtl;
  window.__renderer = renderer;
  window.__renderOnce = () => renderFrame(0.016);
  window.__renderSettled = (steps = 240) => {
    for (let i = 0; i < steps; i++) foldCtl.update(1 / 60);
    renderFrame(0.016);
  };

  rebuildTextures();
  panel.hidden = false;
  manualBox.hidden = false;
  showHint(hintFor(tiltCtl.mode, appMode));

  let lastT = performance.now();
  const renderFrame = (dt) => {
    if (appMode === 'duo') {
      foldCtl.update(dt);
      const phi = Math.PI * (1 - foldCtl.fold);
      const foldVel = -Math.PI * foldCtl.vel; // d(phi)/dt, rad/s
      // keep the phone centered: the camera pans with the device's visual span
      const right = phi < Math.PI / 2 ? COVER_SIZE.w * (1 + Math.cos(phi)) : COVER_SIZE.w;
      const targetEyeX = right / 2;
      renderer.eyeX = (renderer.eyeX ?? targetEyeX) + (targetEyeX - (renderer.eyeX ?? targetEyeX)) * Math.min(1, dt * 7);
      renderer.drawDuo(phi, renderer.eyeX, foldVel);
      syncFoldUI();
    } else {
      tiltCtl.update(dt);
      renderer.draw(tiltCtl.angle);
    }
  };
  const loop = (now) => {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    renderFrame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  boot.remove();
}

try {
  start();
} catch (err) {
  boot.textContent = `初始化失败：${err.message}`;
  boot.style.color = '#ff6b6b';
}
