// Draws the interface that lives "behind the frosted glass".
//
// This is a Canvas2D recreation of DemoContentView.swift from DuoLikeAnimation —
// a busy, colorful screen so the reprojection and blur are easy to read — plus an
// optional custom wallpaper mode.

const SYSTEM_FONT = '-apple-system, "SF Pro Text", "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Recreates the original demo's "Today" dashboard screen.
export function drawDemoUI(ctx, W, H) {
  const BG = '#f2f2f7', CARD = '#ffffff', SECONDARY = '#8e8e93';
  const PAD = 20;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // ---- header ------------------------------------------------------------
  let y = 14;
  ctx.fillStyle = SECONDARY;
  ctx.font = `500 13px ${SYSTEM_FONT}`;
  ctx.fillText('10月5日 周一', PAD, y + 12);

  ctx.fillStyle = '#000';
  ctx.font = `700 34px ${SYSTEM_FONT}`;
  ctx.fillText('今天', PAD, y + 46);

  // avatar
  const ax = W - PAD - 44, ay = y + 6;
  ctx.fillStyle = '#8e8e93';
  ctx.beginPath();
  ctx.arc(ax + 22, ay + 22, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 16px ${SYSTEM_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Duo', ax + 22, ay + 27);
  ctx.textAlign = 'left';

  // ---- chips -------------------------------------------------------------
  y += 64;
  const chips = ['All', 'Health', 'Work', 'Reading', 'Travel', 'Music'];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y - 12, W, 44);
  ctx.clip();
  let cx = PAD;
  for (let i = 0; i < chips.length; i++) {
    ctx.font = `600 13px ${SYSTEM_FONT}`;
    const w = ctx.measureText(chips[i]).width + 28;
    ctx.fillStyle = i === 0 ? '#007aff' : '#e9e9ee';
    roundRect(ctx, cx, y, w, 32, 16);
    ctx.fill();
    ctx.fillStyle = i === 0 ? '#fff' : '#1c1c1e';
    ctx.fillText(chips[i], cx + 14, y + 21);
    cx += w + 8;
  }
  ctx.restore();

  // ---- hero card ---------------------------------------------------------
  y += 52;
  ctx.font = `400 13px ${SYSTEM_FONT}`;
  const heroLines = wrapText(ctx, 'Tilt the phone around its vertical axis. The interface stays put in space while the screen becomes a tilted pane of frosted glass.', W - PAD * 2 - 36);
  const maxBarH = 18 + (11 * 37) % 46;
  const heroH = 50 + heroLines.length * 18 + maxBarH + 26;
  ctx.fillStyle = '#1c1c1e';
  roundRect(ctx, PAD, y, W - PAD * 2, heroH, 20);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = `700 17px ${SYSTEM_FONT}`;
  ctx.fillText('✦ Frosted glass fold', PAD + 18, y + 30);
  ctx.font = `700 17px ${SYSTEM_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('↗', W - PAD - 18, y + 30);
  ctx.textAlign = 'left';

  ctx.font = `400 13px ${SYSTEM_FONT}`;
  ctx.globalAlpha = 0.92;
  let by = y + 54;
  for (const line of heroLines) {
    ctx.fillText(line, PAD + 18, by);
    by += 18;
  }
  ctx.globalAlpha = 1;

  // the little equalizer bars from the original hero card
  const bars = 12, barW = (W - PAD * 2 - 36 - (bars - 1) * 6) / bars;
  for (let i = 0; i < bars; i++) {
    const bh = 18 + (i * 37) % 46;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    roundRect(ctx, PAD + 18 + i * (barW + 6), y + heroH - 18 - bh, barW, bh, 3);
    ctx.fill();
  }

  // ---- stat tiles (2x2) --------------------------------------------------
  y += heroH + 14;
  const tileW = (W - PAD * 2 - 12) / 2, tileH = 76;
  const tiles = [
    ['🚶', 'Steps', '8,412', '#34c759'],
    ['🌙', 'Sleep', '7h 20m', '#5e5ce6'],
    ['🧠', 'Focus', '3h 05m', '#ff9500'],
    ['💧', 'Water', '1.8 L', '#32ade6'],
  ];
  tiles.forEach(([icon, title, value, tint], i) => {
    const tx = PAD + (i % 2) * (tileW + 12);
    const ty = y + Math.floor(i / 2) * (tileH + 12);
    ctx.fillStyle = CARD;
    roundRect(ctx, tx, ty, tileW, tileH, 16);
    ctx.fill();
    ctx.font = `400 17px ${SYSTEM_FONT}`;
    ctx.fillStyle = tint;
    ctx.fillText(icon, tx + 14, ty + 24);
    ctx.fillStyle = SECONDARY;
    ctx.font = `500 13px ${SYSTEM_FONT}`;
    ctx.fillText(title, tx + 40, ty + 23);
    ctx.fillStyle = '#000';
    ctx.font = `600 22px ${SYSTEM_FONT}`;
    ctx.fillText(value, tx + 14, ty + 58);
  });

  // ---- recent list -------------------------------------------------------
  y += tileH * 2 + 12 + 26;
  ctx.fillStyle = '#000';
  ctx.font = `600 20px ${SYSTEM_FONT}`;
  ctx.fillText('Recent', PAD, y);

  y += 12;
  const rows = [
    ['🏃', '#34c759', 'Morning run', '5.2 km · 27 min'],
    ['📅', '#ff3b30', 'Design review', '10:30 · Room 4B'],
    ['✈️', '#007aff', 'Flight to Lisbon', 'Fri 18:45 · Gate 22'],
    ['📖', '#a2845e', 'Read 20 pages', 'The Left Hand of Darkness'],
  ];
  const rowH = 56;
  const listH = rows.length * rowH;
  ctx.fillStyle = CARD;
  roundRect(ctx, PAD, y, W - PAD * 2, listH, 16);
  ctx.fill();

  rows.forEach(([icon, tint, title, sub], i) => {
    const ry = y + i * rowH;
    ctx.fillStyle = tint;
    roundRect(ctx, PAD + 14, ry + 11, 34, 34, 8);
    ctx.fill();
    ctx.font = `400 17px ${SYSTEM_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText(icon, PAD + 14 + 17, ry + 34);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#000';
    ctx.font = `500 15px ${SYSTEM_FONT}`;
    ctx.fillText(title, PAD + 60, ry + 25);
    ctx.fillStyle = SECONDARY;
    ctx.font = `400 12px ${SYSTEM_FONT}`;
    ctx.fillText(sub, PAD + 60, ry + 43);

    ctx.fillStyle = '#c7c7cc';
    ctx.font = `600 16px ${SYSTEM_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('›', W - PAD - 16, ry + 33);
    ctx.textAlign = 'left';

    if (i < rows.length - 1) {
      ctx.strokeStyle = 'rgba(60,60,67,0.12)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(PAD + 60, ry + rowH);
      ctx.lineTo(W - PAD, ry + rowH);
      ctx.stroke();
    }
  });
}

// Draws either the demo UI or a cover-fitted wallpaper image.
export function renderLayer(widthPt, heightPt, scale, wallpaper) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPt * scale);
  canvas.height = Math.round(heightPt * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  if (wallpaper) {
    const iw = wallpaper.naturalWidth || wallpaper.width;
    const ih = wallpaper.naturalHeight || wallpaper.height;
    const s = Math.max(widthPt / iw, heightPt / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(wallpaper, (widthPt - dw) / 2, (heightPt - dh) / 2, dw, dh);
  } else {
    drawDemoUI(ctx, widthPt, heightPt);
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// Duo fold mode textures
// ---------------------------------------------------------------------------

// The unfolded inner screen: a 780x844pt two-column dashboard. The 50pt gutter
// between the columns straddles the hinge at x=390 so no text sits on the crease.
export function renderInner(widthPt, heightPt, scale, wallpaper) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPt * scale);
  canvas.height = Math.round(heightPt * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  if (wallpaper) {
    const iw = wallpaper.naturalWidth || wallpaper.width;
    const ih = wallpaper.naturalHeight || wallpaper.height;
    const s = Math.max(widthPt / iw, heightPt / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(wallpaper, (widthPt - dw) / 2, (heightPt - dh) / 2, dw, dh);
    return canvas;
  }

  // --- iOS home screen on a dark Apple-style wallpaper ---------------------
  const W = 780, H = 844;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#171a23');
  bg.addColorStop(0.55, '#0d0f16');
  bg.addColorStop(1, '#07080c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // soft organic light, the way iOS dark wallpapers do it: two restrained glows
  let g = ctx.createRadialGradient(W * 0.24, H * 0.18, 20, W * 0.24, H * 0.18, W * 0.7);
  g.addColorStop(0, 'rgba(94, 110, 148, 0.30)');
  g.addColorStop(1, 'rgba(94, 110, 148, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.8, H * 0.72, 20, W * 0.8, H * 0.72, W * 0.75);
  g.addColorStop(0, 'rgba(120, 100, 78, 0.20)');
  g.addColorStop(1, 'rgba(120, 100, 78, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // dither so the dark gradients don't band on the GPU
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.022})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.3, 1.3);
  }

  // status bar
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 15px ${SYSTEM_FONT}`;
  ctx.fillText('9:41', 44, 26);
  ctx.textAlign = 'right';
  ctx.font = `500 13px ${SYSTEM_FONT}`;
  ctx.fillText('\u25B4\u25BE\u25B4  \u{1F50B}', W - 44, 26); // signal bars + battery
  ctx.textAlign = 'left';

  // icon grid: 6 columns whose gutter straddles the hinge at x = 390
  const ICON = 70, STEP = 114, MARGIN = 70, ROW0 = 64, ROWSTEP = 104;
  const ICONS = [
    ['⚙️', '#d8d8dc', 'Settings'], ['CAL', '#ffffff', 'Calendar'], ['PHOTOS', '#ffffff', 'Photos'],
    ['📷', '#3a3a3c', 'Camera'], ['✉️', '#0a84ff', 'Mail'], ['📝', '#ffffff', 'Notes'],
    ['CLOCK', '#0f0f12', 'Clock'], ['🌤️', '#4a7fc9', 'Weather'], ['🗺️', '#e8f3ec', 'Maps'],
    ['☑️', '#ffffff', 'Reminders'], ['📈', '#0f0f12', 'Stocks'], ['📖', '#fdf6e6', 'Books'],
    ['APP', '#0a84ff', 'App Store'], ['❤️', '#ffffff', 'Health'], ['👛', '#0f0f12', 'Wallet'],
    ['🏠', '#f2f2f7', 'Home'], ['🎙️', '#8944ab', 'Podcasts'], ['🏃', '#0f0f12', 'Fitness'],
    ['📹', '#35c759', 'FaceTime'], ['📁', '#0a84ff', 'Files'], ['🧮', '#0f0f12', 'Calculator'],
    ['🌐', '#0a84ff', 'Translate'], ['🎤', '#0f0f12', 'Voice Memos'], ['⌚', '#0f0f12', 'Watch'],
  ];
  const label = (text, x, y) => {
    ctx.font = `500 11.5px ${SYSTEM_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  };
  const drawAppIcon = (def, x, y, size) => {
    const [glyph, color, name] = def;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 9;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, size, size, size * 0.235);
    ctx.fill();
    ctx.restore();
    if (glyph === 'CAL') {
      ctx.fillStyle = '#ff3b30';
      ctx.font = `600 11px ${SYSTEM_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('FRIDAY', x + size / 2, y + 18);
      ctx.fillStyle = '#1c1c1e';
      ctx.font = `300 38px ${SYSTEM_FONT}`;
      ctx.fillText('5', x + size / 2, y + 55);
      ctx.textAlign = 'left';
    } else if (glyph === 'PHOTOS') {
      const petals = ['#f5493d', '#f78200', '#fbbc04', '#7ac74f', '#3aa757', '#4a9de8', '#6a5acd', '#e8506e'];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillStyle = petals[i];
        ctx.beginPath();
        ctx.ellipse(x + size / 2 + Math.cos(a) * 10, y + size / 2 + Math.sin(a) * 10, 9.5, 5.2, a, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (glyph === 'CLOCK') {
      ctx.fillStyle = '#f5f5f7';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1c1c1e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + size / 2);
      ctx.lineTo(x + size / 2 + 10, y + size / 2 - 12); // 10:09 hands
      ctx.moveTo(x + size / 2, y + size / 2);
      ctx.lineTo(x + size / 2 - 14, y + size / 2 + 6);
      ctx.stroke();
    } else if (glyph === 'APP') {
      ctx.fillStyle = '#fff';
      ctx.font = `700 38px ${SYSTEM_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('A', x + size / 2, y + size / 2 + 13);
      ctx.textAlign = 'left';
    } else {
      ctx.font = `400 ${size * 0.52}px ${SYSTEM_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(glyph, x + size / 2, y + size / 2 + size * 0.18);
      ctx.textAlign = 'left';
    }
    label(name, x + size / 2, y + size + 15);
  };
  ICONS.forEach((def, i) => {
    const col = i % 6, row = Math.floor(i / 6);
    drawAppIcon(def, MARGIN + col * STEP, ROW0 + row * ROWSTEP, ICON);
  });

  // page dots
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(W / 2 - 28 + i * 14, 676, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // dock
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, 26, H - 128, W - 52, 104, 36);
  ctx.fill();
  const dock = [
    ['📞', '#35c759'], ['🧭', '#f5f5f7'], ['💬', '#35c759'], ['🎵', '#fa233b'],
  ];
  dock.forEach((def, i) => {
    const [glyph, color] = def;
    const x = 208 + i * 98, y = H - 114;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, ICON, ICON, ICON * 0.235);
    ctx.fill();
    ctx.font = `400 ${ICON * 0.52}px ${SYSTEM_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(glyph, x + ICON / 2, y + ICON / 2 + ICON * 0.18);
    ctx.textAlign = 'left';
  });

  return canvas;
}

// The outer cover screen (back of the folding half): dark liquid glass with a
// clock. 390x844pt; its left edge is the leaf's free edge, right edge the hinge.
export function renderCover(widthPt, heightPt, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthPt * scale);
  canvas.height = Math.round(heightPt * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  const W = widthPt, H = heightPt;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b0b0e');
  bg.addColorStop(1, '#050506');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // a whisper of top light, like glass catching a window
  const sheen = ctx.createLinearGradient(0, 0, 0, H * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, W, H * 0.5);

  // camera punch hole, top-left (free edge side)
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(46, 64, 11, 0, Math.PI * 2);
  ctx.fill();
  const lens = ctx.createRadialGradient(43, 61, 1, 43, 61, 8);
  lens.addColorStop(0, '#2a3a55');
  lens.addColorStop(1, '#05050a');
  ctx.fillStyle = lens;
  ctx.beginPath();
  ctx.arc(45, 63, 8, 0, Math.PI * 2);
  ctx.fill();

  // clock
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `200 96px ${SYSTEM_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('9:41', W / 2 + 6, H * 0.34);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 16px ${SYSTEM_FONT}`;
  ctx.fillText('10月5日 周一', W / 2 + 6, H * 0.34 + 38);

  // glass notification card
  const cardY = H * 0.34 + 76;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, W / 2 - 130, cardY, 260, 64, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  roundRect(ctx, W / 2 - 130, cardY, 260, 64, 18);
  ctx.stroke();
  const icon = ctx.createLinearGradient(W / 2 - 114, cardY + 12, W / 2 - 82, cardY + 44);
  icon.addColorStop(0, '#3a3a3e');
  icon.addColorStop(1, '#2c2c2e');
  ctx.fillStyle = icon;
  roundRect(ctx, W / 2 - 114, cardY + 14, 32, 32, 9);
  ctx.fill();
  ctx.font = `400 16px ${SYSTEM_FONT}`;
  ctx.fillText('✦', W / 2 - 98, cardY + 36);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 14px ${SYSTEM_FONT}`;
  ctx.fillText('DuoLike Web', W / 2 - 70, cardY + 27);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `400 12px ${SYSTEM_FONT}`;
  ctx.fillText('拖动展开，看看里面', W / 2 - 70, cardY + 47);

  // bottom: home indicator
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  roundRect(ctx, W / 2 - 60 + 6, H - 26, 120, 5, 2.5);
  ctx.fill();
  return canvas;
}
