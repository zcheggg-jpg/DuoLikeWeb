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
  const grad = ctx.createLinearGradient(ax, ay, ax + 44, ay + 44);
  grad.addColorStop(0, '#ff2d78');
  grad.addColorStop(1, '#ff9500');
  ctx.fillStyle = grad;
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
    ctx.fillStyle = i === 0 ? '#4f7cff' : '#e9e9ee';
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
  const hero = ctx.createLinearGradient(PAD, y, W - PAD, y + heroH);
  hero.addColorStop(0, '#2f6bff');
  hero.addColorStop(0.55, '#8b5cf6');
  hero.addColorStop(1, '#ec4899');
  ctx.fillStyle = hero;
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
    ['✈️', '#2f6bff', 'Flight to Lisbon', 'Fri 18:45 · Gate 22'],
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
