import { FoldRenderer } from './fold.js';
import { TiltController } from './motion.js';
import { renderLayer } from './ui.js';

const canvas = document.getElementById('gl');
const boot = document.getElementById('boot');
const hint = document.getElementById('hint');
const panel = document.getElementById('panel');
const btnMotion = document.getElementById('btnMotion');
const btnCalibrate = document.getElementById('btnCalibrate');
const manualBox = document.getElementById('manualBox');
const slider = document.getElementById('slider');
const sliderVal = document.getElementById('sliderVal');
const fileInput = document.getElementById('file');

let renderer;
let controller;
let wallpaper = null;
let lastLayerKey = '';

const isCoarse = matchMedia('(pointer: coarse)').matches;

function hintFor(mode) {
  if (mode === 'sensor') {
    return '倾斜手机 — 界面留在原地，屏幕变成一块磨砂玻璃';
  }
  return '甩动或按住拖动鼠标 · 也可以用 ← → 方向键';
}

function showHint(text) {
  hint.textContent = text;
  hint.hidden = false;
  hint.style.opacity = '1';
  // fade out after a few seconds so it never fights with the effect
  hint.style.transition = 'none';
  requestAnimationFrame(() => {
    hint.style.transition = 'opacity 0.8s ease 4s';
    hint.style.opacity = '0';
  });
}

function ptSize() {
  if (isCoarse) {
    return { w: window.innerWidth, h: window.innerHeight };
  }
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function rebuildLayer() {
  const { w, h } = ptSize();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const key = `${Math.round(w)}x${Math.round(h)}@${scale}`;
  if (key === lastLayerKey) return;
  lastLayerKey = key;

  renderer.setSize(w, h, scale);
  const layer = renderLayer(w, h, scale, wallpaper);
  renderer.setLayer(layer);
}

function loadWallpaper(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    wallpaper = img;
    lastLayerKey = '';
    rebuildLayer();
    URL.revokeObjectURL(url);
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

function start() {
  renderer = new FoldRenderer(canvas);
  controller = new TiltController(canvas);

  controller.onModeChange = (mode) => {
    btnCalibrate.hidden = mode !== 'sensor';
    showHint(hintFor(mode));
  };

  // Wire up the floating panel (mirrors the original's manual-tilt panel).
  btnCalibrate.addEventListener('click', () => controller.recalibrate());

  if (isCoarse && TiltController.motionNeedsPermission()) {
    btnMotion.hidden = false;
    btnMotion.addEventListener('click', async () => {
      btnMotion.textContent = '…';
      const ok = await controller.requestMotionPermission();
      btnMotion.hidden = true;
      if (!ok) showHint('体感权限被拒绝，可以在手动滑杆里拖动倾斜');
    });
  }

  slider.addEventListener('input', () => {
    sliderVal.textContent = `${slider.value}°`;
    controller.setManual(Number(slider.value));
  });
  slider.addEventListener('change', () => controller.endManual());

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) loadWallpaper(fileInput.files[0]);
  });

  window.addEventListener('resize', () => { lastLayerKey = ''; rebuildLayer(); });

  // Debug / screenshot hooks.
  window.__setTiltDeg = (deg) => controller.setDebugTilt(deg);
  window.__clearTilt = () => controller.clearDebugTilt();
  window.__controller = controller;

  rebuildLayer();
  panel.hidden = false;
  manualBox.hidden = false;
  showHint(hintFor(controller.mode));

  let lastT = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    controller.update(dt);
    renderer.draw(controller.angle);
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
