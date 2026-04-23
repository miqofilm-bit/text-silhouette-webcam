/**
 * FIELD — script.js
 * ═══════════════════════════════════════════════════════════════
 *
 * HOW TO RUN:
 *   python -m http.server 8080   →  http://localhost:8080
 *   npx serve .                  →  follow URL
 *   VS Code Live Server          →  click Go Live
 *   GitHub Pages                 →  push files, enable Pages (HTTPS required for camera)
 *
 * CONCEPT:
 *   Every character is an autonomous particle.
 *   MediaPipe segmentation produces a smooth influence field.
 *   Each particle samples the field at its position and reacts:
 *     • low influence  → dense, dim, static
 *     • high influence → sparse, bright, jittery, large, chaotic
 *   The human form becomes "readable" through typography behavior —
 *   not through masking or erasure.
 *
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  TEXT SOURCES
// ─────────────────────────────────────────────────────────────
const SOURCES = {
  signal: [
    'SIGNAL','PRESENCE','FIELD','BODY','FORM','WAVE','PULSE',
    'NODE','FLUX','PHASE','DRIFT','ECHO','TRACE','LAYER',
    'DEPTH','SURFACE','EDGE','CORE','MASS','VOID','SHAPE',
    'MOTION','STILL','ALIVE','HERE','NOW','WITNESS','WATCH',
    'EMERGE','DISSOLVE','BECOME','REMAIN','VANISH','PERSIST',
  ],
  body: [
    'SKIN','BONE','BREATH','NERVE','BLOOD','CELL','TISSUE',
    'MUSCLE','JOINT','SPINE','CHEST','HEART','LUNG','VEIN',
    'LIMB','HAND','FACE','EYE','MOUTH','THOUGHT','FEELING',
    'MEMORY','HUNGER','WEIGHT','HEAT','COLD','TOUCH','PAIN',
    'FEAR','CALM','REST','WAKE','SLEEP','GROW','CHANGE',
  ],
  code: [
    'const','await','async','return','yield','export',
    'function','class','extends','import','from','let',
    'new Float32Array','requestAnimationFrame','getContext',
    'segmentation.send','onResults','createImageBitmap',
    'canvas.width','ctx.drawImage','performance.now',
    'Math.random','Math.floor','Uint8ClampedArray',
    '0x00FF','0xFFFF','undefined','null','true','false',
  ],
  void: [
    '░','▒','▓','█','▄','▀','■','□','▪','▫',
    '◈','◉','◊','○','●','◌','◍','◎','◦',
    '∷','∶','∴','∵','⁂','※','†','‡','§',
    '∞','≈','≠','±','×','÷','√','∑','∏',
    '⟨','⟩','⌈','⌉','⌊','⌋','⟦','⟧',
  ],
  glitch: [
    'ERR','NUL','SYN','ACK','NAK','ETX','SOH','STX',
    '0xDEAD','0xBEEF','0xCAFE','0xFACE','0xBAD',
    '▌▐▌▐','████','////','\\\\\\\\','----','====',
    'OVERFLOW','UNDERRUN','CORRUPT','FAULT','HALT',
    'WHO IS HERE','ARE YOU REAL','I SEE YOU','GHOST',
    'UNDEFINED','MISSING','LOST','FOUND','ECHO ECHO',
  ],
};

// ─────────────────────────────────────────────────────────────
//  CONFIGURATION  (UI overrides these live)
// ─────────────────────────────────────────────────────────────
const CFG = {
  glyphCount:    40,      // glyphs per row — controls density
  fontSize:      14,      // base px
  reactivity:    6,       // 1–12 — how strongly field drives behavior
  animating:     true,
  inverted:      false,
  source:        'signal',
  segFps:        18,      // segmentation target fps
  fieldDecay:    0.88,    // influence field temporal smoothing (0..1)
};

// Low-res segmentation resolution
const SEG_W = 320;
const SEG_H = 180;

// ─────────────────────────────────────────────────────────────
//  DOM
// ─────────────────────────────────────────────────────────────
const stage   = document.getElementById('stage');
const sctx    = stage.getContext('2d', { alpha: false });
const video   = document.getElementById('cam');
const segIn   = document.getElementById('seg-in');
const segCtx  = segIn.getContext('2d');
const veil    = document.getElementById('veil');
const vmsg    = document.getElementById('vmsg');
const frEl    = document.getElementById('fr');
const srEl    = document.getElementById('sr');

// ─────────────────────────────────────────────────────────────
//  FIELD STATE
//  fieldBuf: Float32Array[W*H], 0..1, smoothly updated each seg frame
// ─────────────────────────────────────────────────────────────
let W = 0, H = 0;
let fieldBuf = null;   // current smoothed influence map at screen res

// Small-res working buffers for seg processing
let segFieldW = 0, segFieldH = 0;
let rawField  = null;   // Float32Array at seg resolution, latest frame
let smoothField = null; // temporally smoothed at seg resolution

let segmentation   = null;
let segReady       = false;
let lastSegTime    = 0;
let segFpsCount    = 0, renderFpsCount = 0, lastFpsTick = 0;

// ─────────────────────────────────────────────────────────────
//  GLYPH SYSTEM
//  Each Glyph is an independent particle with its own position,
//  velocity, target position, and character drawn on canvas each frame.
// ─────────────────────────────────────────────────────────────

class Glyph {
  constructor(x, y, word) {
    // Grid home position
    this.hx = x;
    this.hy = y;
    // Current draw position (animated)
    this.x  = x + (Math.random() - 0.5) * 4;
    this.y  = y + (Math.random() - 0.5) * 4;
    // Velocity
    this.vx = 0;
    this.vy = 0;
    // Base word/char token from source
    this.word  = word;
    this.char  = this._pick(word);
    // Mutation timer
    this.mutTimer  = Math.random() * 80;
    this.mutPeriod = 30 + Math.random() * 100;
    // Per-glyph noise offset for organic jitter
    this.noiseOff  = Math.random() * 1000;
    // Smooth influence value (lerped)
    this.inf = 0;
  }

  _pick(word) {
    // For multi-char tokens, sometimes show first char, sometimes full word
    if (word.length <= 2) return word;
    return Math.random() < 0.45 ? word[0] : word;
  }

  update(t, influence) {
    // Smooth influence with per-glyph lag
    this.inf += (influence - this.inf) * 0.12;
    const inf = this.inf;
    const rx  = CFG.reactivity / 6;   // normalise to 0..2

    // ── Character mutation ──────────────────────────────────
    // High influence → mutates faster (more chaotic)
    this.mutTimer++;
    const mutRate = this.mutPeriod * (1 - inf * rx * 0.7);
    if (this.mutTimer > mutRate) {
      this.mutTimer = 0;
      const pool = SOURCES[CFG.source];
      this.word  = pool[Math.floor(Math.random() * pool.length)];
      this.char  = this._pick(this.word);
    }

    // ── Position drift ──────────────────────────────────────
    // In body region: particles repel from home, orbit chaotically
    // Outside: slowly return to grid home
    const noiseT  = t * 0.0008 + this.noiseOff;
    const noiseX  = Math.sin(noiseT * 1.3) * Math.cos(noiseT * 0.7);
    const noiseY  = Math.cos(noiseT * 1.1) * Math.sin(noiseT * 0.9);

    const repel   = inf * rx * 18;   // max px displacement from home
    const tx      = this.hx + noiseX * repel;
    const ty      = this.hy + noiseY * repel;

    // Spring back toward target
    const spring  = 0.08 + (1 - inf) * 0.06;
    this.vx += (tx - this.x) * spring;
    this.vy += (ty - this.y) * spring;
    // Damping
    const damp = 0.72 - inf * 0.12;
    this.vx   *= damp;
    this.vy   *= damp;
    this.x    += this.vx;
    this.y    += this.vy;
  }

  draw(ctx, t) {
    const inf     = this.inf;
    const rx      = CFG.reactivity / 6;

    // ── Opacity: dim in background, bright in body center ──
    // Background:   ~0.18–0.35
    // Body center:  ~0.85–1.0
    const opacity = 0.18 + inf * rx * 0.75;

    // ── Size scale: larger in body (presence swells type) ──
    const scale   = 1.0 + inf * rx * 1.2;
    const fs      = CFG.fontSize * scale;

    // ── Color: shift to accent color in body ────────────────
    // Outside: dim fg  |  Inside: bright hi color
    let color;
    if (CFG.inverted) {
      // Light mode: dark text, body goes near-black / accent
      const v = Math.round(8 + (1 - inf) * 100);
      color   = `rgba(${v},${v},${v},${opacity.toFixed(2)})`;
    } else {
      // Dark mode: bright on body, dim outside
      const v = Math.round(120 + inf * rx * 135);
      const g = Math.round(120 + inf * rx * 60);
      const b = Math.round(80  + inf * rx * 20);
      // Subtle warm tint in body (towards yellow-green accent)
      color   = `rgba(${Math.min(255,v)},${Math.min(255,g)},${Math.min(255,b)},${opacity.toFixed(2)})`;
    }

    // ── Per-frame positional jitter (extra in body) ─────────
    const jit  = inf * rx * 1.4;
    const jx   = (Math.random() - 0.5) * jit;
    const jy   = (Math.random() - 0.5) * jit;

    ctx.save();
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.fillStyle   = color;
    ctx.font        = `${fs <= 14 ? 200 : 400} ${fs.toFixed(1)}px 'IBM Plex Mono', monospace`;
    ctx.fillText(this.char, this.x + jx, this.y + jy);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────
//  GLYPH GRID — rebuild when size/density changes
// ─────────────────────────────────────────────────────────────
let glyphs = [];

function buildGlyphs() {
  if (!W || !H) return;
  glyphs = [];

  const pool   = SOURCES[CFG.source];
  const colGap = CFG.fontSize * 0.68;
  const rowGap = CFG.fontSize * 1.55;
  const cols   = Math.max(1, Math.floor(W / colGap));
  const rows   = Math.max(1, Math.floor(H / rowGap));

  // Randomise some extra vertical offset per-row for stagger
  const rowOffsets = Array.from({ length: rows }, () => (Math.random() - 0.5) * CFG.fontSize * 0.6);

  for (let r = 0; r < rows; r++) {
    const y   = rowGap * 0.8 + r * rowGap + rowOffsets[r];
    for (let c = 0; c < cols; c++) {
      const x    = colGap * 0.3 + c * colGap;
      const word = pool[Math.floor(Math.random() * pool.length)];
      glyphs.push(new Glyph(x, y, word));
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  INFLUENCE FIELD BUILDER
//  Converts MediaPipe's segmentation mask into a Float32Array
//  at seg resolution, then box-blurs 3× for smooth falloff,
//  then upsamples to screen resolution.
// ─────────────────────────────────────────────────────────────

function buildRawField(segmentationMask) {
  // Draw mask to segIn canvas (already sized SEG_W × SEG_H)
  // MediaPipe selfieMode=true means mask is already mirrored
  segCtx.clearRect(0, 0, SEG_W, SEG_H);
  segCtx.drawImage(segmentationMask, 0, 0, SEG_W, SEG_H);

  const imgData = segCtx.getImageData(0, 0, SEG_W, SEG_H);
  const d       = imgData.data;
  const N       = SEG_W * SEG_H;

  if (!rawField || rawField.length !== N) rawField = new Float32Array(N);

  // MediaPipe confidence is in the red channel (0–255)
  for (let i = 0; i < N; i++) {
    rawField[i] = d[i * 4] / 255;
  }

  // ── Box blur ×3 for smooth falloff ──────────────────────────
  // Radius 5 → gives ~15px spread at seg resolution,
  // which maps to a large soft halo at screen resolution.
  boxBlur(rawField, SEG_W, SEG_H, 5);
  boxBlur(rawField, SEG_W, SEG_H, 5);
  boxBlur(rawField, SEG_W, SEG_H, 4);

  // ── Temporal smoothing: blend with previous frame ───────────
  if (!smoothField || smoothField.length !== N) {
    smoothField = new Float32Array(rawField);
  } else {
    const decay = CFG.fieldDecay;
    for (let i = 0; i < N; i++) {
      smoothField[i] = smoothField[i] * decay + rawField[i] * (1 - decay);
    }
  }
}

function boxBlur(buf, w, h, r) {
  const tmp = new Float32Array(w * h);
  // Horizontal pass
  for (let y = 0; y < h; y++) {
    let sum  = 0;
    let cnt  = 0;
    for (let x = 0; x < w; x++) {
      sum += buf[y * w + x];
      cnt++;
      if (x >= r * 2) {
        sum -= buf[y * w + (x - r * 2)];
        cnt--;
      }
      tmp[y * w + x] = sum / cnt;
    }
  }
  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum  = 0;
    let cnt  = 0;
    for (let y = 0; y < h; y++) {
      sum += tmp[y * w + x];
      cnt++;
      if (y >= r * 2) {
        sum -= tmp[(y - r * 2) * w + x];
        cnt--;
      }
      buf[y * w + x] = sum / cnt;
    }
  }
}

// ── Sample influence field at screen coordinate ──────────────
function sampleField(sx, sy) {
  if (!smoothField) return 0;
  // Map screen coord → seg field coord
  const fx = (sx / W) * SEG_W;
  const fy = (sy / H) * SEG_H;
  // Bilinear interpolation
  const x0 = Math.max(0, Math.min(SEG_W - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(SEG_H - 2, Math.floor(fy)));
  const tx = fx - x0;
  const ty = fy - y0;
  const i00 = y0 * SEG_W + x0;
  const i10 = i00 + 1;
  const i01 = i00 + SEG_W;
  const i11 = i01 + 1;
  const v0  = smoothField[i00] * (1 - tx) + smoothField[i10] * tx;
  const v1  = smoothField[i01] * (1 - tx) + smoothField[i11] * tx;
  return v0 * (1 - ty) + v1 * ty;
}

// ─────────────────────────────────────────────────────────────
//  RESIZE
// ─────────────────────────────────────────────────────────────
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  stage.width  = W;
  stage.height = H;
  buildGlyphs();
}
window.addEventListener('resize', resize);

// ─────────────────────────────────────────────────────────────
//  MEDIAPIPE INIT
// ─────────────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src   = src; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function initMediaPipe() {
  setMsg('LOADING MODEL…');

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
  } catch (e) {
    setMsg('CDN LOAD FAILED — CHECK CONNECTION'); return;
  }

  segIn.width  = SEG_W;
  segIn.height = SEG_H;

  segmentation = new SelfieSegmentation({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
  });
  segmentation.setOptions({ modelSelection: 1, selfieMode: true });
  segmentation.onResults(onSegResults);

  setMsg('REQUESTING CAMERA…');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (e) {
    setMsg('CAMERA DENIED — ' + e.message.toUpperCase()); return;
  }

  video.srcObject = stream;
  await new Promise(res => { video.onloadedmetadata = () => video.play().then(res).catch(res); });

  segReady = true;
  resize();
  setMsg('READY');
  setTimeout(() => veil.classList.add('gone'), 900);
  requestAnimationFrame(renderLoop);
}

// ─────────────────────────────────────────────────────────────
//  SEGMENTATION CALLBACK
// ─────────────────────────────────────────────────────────────
function onSegResults(results) {
  if (!results.segmentationMask) return;
  segFpsCount++;
  buildRawField(results.segmentationMask);
}

// ─────────────────────────────────────────────────────────────
//  RENDER LOOP  (~60fps rendering, ~18fps seg)
// ─────────────────────────────────────────────────────────────
function renderLoop(t) {
  requestAnimationFrame(renderLoop);
  renderFpsCount++;

  // FPS display
  if (t - lastFpsTick >= 1000) {
    frEl.textContent = renderFpsCount;
    srEl.textContent = segFpsCount;
    renderFpsCount = 0; segFpsCount = 0;
    lastFpsTick = t;
  }

  if (!segReady || video.readyState < 2) return;

  // ── Throttled segmentation ───────────────────────────────
  const segInterval = 1000 / CFG.segFps;
  if (t - lastSegTime >= segInterval) {
    lastSegTime = t;
    // Downscale video → small canvas → send to MediaPipe
    segCtx.drawImage(video, 0, 0, SEG_W, SEG_H);
    segmentation.send({ image: segIn }).catch(() => {});
  }

  // ── Clear stage ──────────────────────────────────────────
  sctx.fillStyle = CFG.inverted ? '#f2f2f0' : '#050505';
  sctx.fillRect(0, 0, W, H);

  // ── Update + draw each glyph ─────────────────────────────
  if (CFG.animating) {
    for (let i = 0; i < glyphs.length; i++) {
      const g   = glyphs[i];
      const inf = sampleField(g.x, g.y);
      g.update(t, inf);
      g.draw(sctx, t);
    }
  } else {
    // Paused: just draw at current positions, no update
    for (let i = 0; i < glyphs.length; i++) {
      glyphs[i].draw(sctx, t);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  UI
// ─────────────────────────────────────────────────────────────
(function mountUI() {
  const panel = document.getElementById('panel');
  const pt    = document.getElementById('pt');
  let open    = true;

  pt.addEventListener('click', () => {
    open = !open;
    panel.classList.toggle('closed', !open);
  });

  // Auto-fade
  let fadeTimer;
  const resetFade = () => {
    panel.classList.remove('fade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => panel.classList.add('fade'), 4500);
  };
  document.addEventListener('mousemove', resetFade);
  document.addEventListener('touchstart', resetFade, { passive: true });
  panel.addEventListener('mouseenter', () => { clearTimeout(fadeTimer); panel.classList.remove('fade'); });
  resetFade();

  // Animation
  const bAnim = document.getElementById('b-anim');
  bAnim.addEventListener('click', () => {
    CFG.animating = !CFG.animating;
    bAnim.dataset.v   = CFG.animating ? 1 : 0;
    bAnim.textContent = CFG.animating ? 'ON' : 'OFF';
    bAnim.classList.toggle('on', CFG.animating);
  });

  // Invert
  const bInv = document.getElementById('b-inv');
  bInv.addEventListener('click', () => {
    CFG.inverted = !CFG.inverted;
    document.body.classList.toggle('inv', CFG.inverted);
    bInv.dataset.v    = CFG.inverted ? 1 : 0;
    bInv.textContent  = CFG.inverted ? 'ON' : 'OFF';
    bInv.classList.toggle('on', CFG.inverted);
  });

  // Density
  const sDen = document.getElementById('s-den');
  const vDen = document.getElementById('v-den');
  sDen.addEventListener('input', () => {
    CFG.glyphCount = parseInt(sDen.value, 10);
    vDen.textContent = CFG.glyphCount;
    buildGlyphs();
  });

  // Reactivity
  const sRx  = document.getElementById('s-rx');
  const vRx  = document.getElementById('v-rx');
  sRx.addEventListener('input', () => {
    CFG.reactivity = parseInt(sRx.value, 10);
    vRx.textContent = CFG.reactivity;
  });

  // Font size
  const sSz  = document.getElementById('s-sz');
  const vSz  = document.getElementById('v-sz');
  sSz.addEventListener('input', () => {
    CFG.fontSize = parseInt(sSz.value, 10);
    vSz.textContent = CFG.fontSize;
    buildGlyphs();
  });

  // Source
  const sel = document.getElementById('sel');
  sel.addEventListener('change', () => {
    CFG.source = sel.value;
    buildGlyphs();
  });
})();

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
function setMsg(m) { vmsg.textContent = m; }

window.addEventListener('DOMContentLoaded', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  stage.width  = W;
  stage.height = H;
  buildGlyphs();
  initMediaPipe();
});
