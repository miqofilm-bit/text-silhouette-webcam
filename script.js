/**
 * PRESENCE — script.js
 * ════════════════════════════════════════════════════════════════
 * Live kinetic-typography art installation.
 * A person stands in front of the camera — their silhouette cuts
 * through an animated wall of text. The text lives everywhere
 * except where the person is.
 *
 * HOW TO RUN (local):
 *   python -m http.server 8080        → open http://localhost:8080
 *   npx serve .                       → follow printed URL
 *   VS Code "Go Live" (Live Server)
 *
 * GitHub Pages: push all three files to a repo, enable Pages.
 * Webcam requires HTTPS in production (GitHub Pages provides this).
 * ════════════════════════════════════════════════════════════════
 */

'use strict';

// ─────────────────────────────────────────────────────────────
//  TEXT SOURCES  (edit to change words / phrases on screen)
// ─────────────────────────────────────────────────────────────
const SOURCES = {

  manifesto: [
    'THE MEDIUM IS THE MESSAGE',
    'INFORMATION WANTS TO BE FREE',
    'WE SHAPE OUR TOOLS AND THEREAFTER THEY SHAPE US',
    'THE MAP IS NOT THE TERRITORY',
    'CODE IS LAW',
    'THE NET INTERPRETS CENSORSHIP AS DAMAGE AND ROUTES AROUND IT',
    'ALL WATCHED OVER BY MACHINES OF LOVING GRACE',
    'RESISTANCE IS NOT FUTILE',
    'THE FUTURE IS ALREADY HERE JUST NOT EVENLY DISTRIBUTED',
    'LANGUAGE IS THE HOUSE OF BEING',
    'DATA IS THE NEW OIL',
    'ATTENTION IS THE NEW CURRENCY',
    'DO NOT GO GENTLE',
    'ACT AS IF',
    'MAKE IT NEW',
    'THERE IS NO OUTSIDE TEXT',
    'EVERY TOOL IS A WEAPON IF YOU HOLD IT RIGHT',
    'THE SPECTACLE IS NOT A COLLECTION OF IMAGES',
    'BENEATH THE PAVEMENT THE BEACH',
    'BE REALISTIC DEMAND THE IMPOSSIBLE',
  ],

  code: [
    'const mask = await segmenter.segment(frame)',
    'ctx.globalCompositeOperation = "destination-out"',
    'requestAnimationFrame(renderLoop)',
    'navigator.mediaDevices.getUserMedia({ video: true })',
    'new ImageData(Uint8ClampedArray.from(pixels), w, h)',
    'offscreen.transferToImageBitmap()',
    'performance.now() - lastFrame < 16.67',
    'canvas.getContext("2d", { willReadFrequently: true })',
    'filter: blur(8px) contrast(1.2)',
    'segBuffer.drawImage(video, 0, 0, SEG_W, SEG_H)',
    'const { width, height } = window.screen',
    'transform: scale(-1, 1)',
    'Math.floor(Math.random() * words.length)',
    '0x00FF00 & (mask >> 8)',
    'for (let i = 0; i < pixels.length; i += 4)',
    'mediaStream.getTracks().forEach(t => t.stop())',
    'video.srcObject = stream',
    'createImageBitmap(blob, { resizeWidth: 320 })',
  ],

  glitch: [
    '▓▒░ SIGNAL LOST ░▒▓',
    'ERR_OVERFLOW 0x00FA9C',
    '████ REDACTED ████',
    'NULL NULL NULL NULL',
    '∷ FEED INTERRUPTED ∷',
    '⚠ UNKNOWN ENTITY DETECTED',
    'BUFFER UNDERRUN',
    'SYNC FAILED — RETRYING',
    '01001000 01101001',
    'FRAME DROP FRAME DROP',
    '░░░ PRESENCE UNKNOWN ░░░',
    '▌▐▌▐ GHOST IN MACHINE',
    'WHO IS WATCHING',
    'YOU ARE BEING RENDERED',
    'REALITY.EXE HAS STOPPED',
    'IDENTITY: [REDACTED]',
    '◈ SCAN COMPLETE: ANOMALY',
    '⟳ REBOOT IN PROGRESS ⟳',
  ],

  haiku: [
    'old pond',
    'a frog jumps in',
    'sound of water',
    'over the wintry forest',
    'winds howl in rage',
    'with no leaves to blow',
    'in the cicada\'s cry',
    'no sign that it knows',
    'it will soon die',
    'lightning flash',
    'what I thought were faces',
    'are plumes of pampas grass',
    'a world of dew',
    'and within every dewdrop',
    'a world of struggle',
    'the light of a candle',
    'is transferred to another candle',
    'spring twilight',
  ],

  binary: (() => {
    const arr = [];
    for (let i = 0; i < 60; i++) {
      const len = 8 + Math.floor(Math.random() * 24);
      arr.push(Array.from({ length: len }, () => Math.random() > 0.5 ? '1' : '0').join(''));
    }
    return arr;
  })(),
};

// ─────────────────────────────────────────────────────────────
//  CONFIGURATION  (defaults — UI sliders override these live)
// ─────────────────────────────────────────────────────────────
const CFG = {
  fontSize:       16,      // px
  scrollSpeed:    1.2,     // px / frame
  animating:      true,
  inverted:       false,
  source:         'manifesto',
  lineHeight:     1.6,
  wordRefreshMs:  700,     // how often to mutate text lines
  segFpsTarget:   15,      // max segmentation FPS
};

// Segmentation input resolution — kept small for performance
const SEG_W = 320;
const SEG_H = 180;

// ─────────────────────────────────────────────────────────────
//  DOM ELEMENTS
// ─────────────────────────────────────────────────────────────
const stage      = document.getElementById('stage');
const sctx       = stage.getContext('2d');

const video      = document.getElementById('cam');
const segIn      = document.getElementById('seg-in');    // low-res input canvas
const segCtx     = segIn.getContext('2d');

const bootEl     = document.getElementById('boot');
const bootMsg    = document.getElementById('boot-msg');
const fpsR       = document.getElementById('fps-r');
const fpsS       = document.getElementById('fps-s');

// ─────────────────────────────────────────────────────────────
//  OFF-SCREEN BUFFERS
// ─────────────────────────────────────────────────────────────
// textBuf  — full-screen scrolling typography
const textBuf  = document.createElement('canvas');
const tctx     = textBuf.getContext('2d');

// maskBuf  — upscaled person mask (greyscale)
const maskBuf  = document.createElement('canvas');
const mctx     = maskBuf.getContext('2d');

// personBuf — webcam frame, person region only
const personBuf = document.createElement('canvas');
const pctx      = personBuf.getContext('2d');

// ─────────────────────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────────────────────
let W = 0, H = 0;
let scrollY        = 0;
let textLines      = [];        // array of { text, xOffset }
let lastWordMutate = 0;
let segmentation   = null;      // MediaPipe instance
let latestMaskBitmap = null;    // ImageBitmap from last seg result
let segReady       = false;
let lastSegTime    = 0;
let segInterval    = 1000 / CFG.segFpsTarget;

// FPS counters
let renderFrames   = 0;
let segFrames      = 0;
let lastFpsTick    = 0;

// ─────────────────────────────────────────────────────────────
//  RESIZE — keeps all buffers in sync with window
// ─────────────────────────────────────────────────────────────
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;

  stage.width       = W;
  stage.height      = H;

  // text buffer slightly taller for seamless vertical scroll
  const textH = H + Math.ceil(CFG.fontSize * CFG.lineHeight) * 4;
  textBuf.width     = W;
  textBuf.height    = textH;

  maskBuf.width     = W;
  maskBuf.height    = H;

  personBuf.width   = W;
  personBuf.height  = H;

  segIn.width       = SEG_W;
  segIn.height      = SEG_H;

  buildTextLines();
}

window.addEventListener('resize', resize);

// ─────────────────────────────────────────────────────────────
//  TEXT ENGINE
// ─────────────────────────────────────────────────────────────
function getPool() {
  const src = SOURCES[CFG.source];
  return Array.isArray(src) ? src : src();
}

function buildTextLines() {
  const pool   = getPool();
  const lh     = CFG.fontSize * CFG.lineHeight;
  const rows   = Math.ceil((textBuf.height) / lh) + 2;
  textLines    = [];

  for (let r = 0; r < rows; r++) {
    let line    = '';
    let lineW   = 0;
    const charW = CFG.fontSize * 0.62;   // rough monospace char width

    while (lineW < W + 60) {
      const phrase = pool[Math.floor(Math.random() * pool.length)];
      line  += phrase + '   ';
      lineW += (phrase.length + 3) * charW;
    }

    // Alternate rows are slightly offset for visual stagger
    const xOffset = (r % 2 === 0) ? 0 : -(CFG.fontSize * 2.5);
    textLines.push({ text: line, xOffset, alpha: 0.65 + Math.random() * 0.35 });
  }
}

function mutateOneLine(pool) {
  if (!textLines.length) return;
  const r     = Math.floor(Math.random() * textLines.length);
  const row   = textLines[r];
  let line    = '';
  let lineW   = 0;
  const charW = CFG.fontSize * 0.62;

  while (lineW < W + 60) {
    const phrase = pool[Math.floor(Math.random() * pool.length)];
    line  += phrase + '   ';
    lineW += (phrase.length + 3) * charW;
  }
  row.text  = line;
  row.alpha = 0.65 + Math.random() * 0.35;
}

function drawTextBuffer(timestamp) {
  const bg = CFG.inverted ? '#f8f8f8' : '#080808';
  const fg = CFG.inverted ? '#0a0a0a' : '#f0f0f0';
  const lh = CFG.fontSize * CFG.lineHeight;

  // Mutate one random line periodically
  if (CFG.animating && timestamp - lastWordMutate > CFG.wordRefreshMs) {
    lastWordMutate = timestamp;
    mutateOneLine(getPool());
  }

  tctx.fillStyle = bg;
  tctx.fillRect(0, 0, W, textBuf.height);

  tctx.font         = `300 ${CFG.fontSize}px 'DM Mono', monospace`;
  tctx.textBaseline = 'top';

  textLines.forEach((row, i) => {
    tctx.globalAlpha = row.alpha;
    tctx.fillStyle   = fg;
    tctx.fillText(row.text, row.xOffset, i * lh);
  });

  tctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────
//  MEDIAPIPE LOADER
// ─────────────────────────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    const s   = document.createElement('script');
    s.src     = src;
    s.crossOrigin = 'anonymous';
    s.onload  = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}

async function initMediaPipe() {
  setBootMsg('LOADING MODEL…');

  try {
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
  } catch (e) {
    setBootMsg('CDN LOAD FAILED — CHECK CONNECTION');
    console.error(e);
    return;
  }

  segIn.width  = SEG_W;
  segIn.height = SEG_H;

  segmentation = new SelfieSegmentation({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`,
  });

  segmentation.setOptions({
    modelSelection: 1,   // 1 = landscape model (more accurate on non-square input)
    selfieMode:    true,
  });

  segmentation.onResults(onSegResults);

  setBootMsg('REQUESTING CAMERA…');

  const constraints = {
    video: {
      facingMode: 'user',
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    setBootMsg('CAMERA DENIED — ' + err.message.toUpperCase());
    console.error(err);
    return;
  }

  video.srcObject = stream;

  await new Promise((res) => {
    video.onloadedmetadata = () => { video.play().then(res).catch(res); };
  });

  segReady = true;
  setBootMsg('READY');

  resize(); // now we know screen dimensions

  setTimeout(() => bootEl.classList.add('gone'), 900);

  requestAnimationFrame(renderLoop);
}

// ─────────────────────────────────────────────────────────────
//  SEGMENTATION CALLBACK
// ─────────────────────────────────────────────────────────────
function onSegResults(results) {
  if (!results.segmentationMask) return;

  segFrames++;

  // results.segmentationMask is a canvas-like element (greyscale confidence map)
  // Person pixels = bright, background = dark.
  // We store it as an ImageBitmap for fast reuse each render frame.

  createImageBitmap(results.segmentationMask).then((bmp) => {
    if (latestMaskBitmap) latestMaskBitmap.close(); // free GPU memory
    latestMaskBitmap = bmp;
  });
}

// ─────────────────────────────────────────────────────────────
//  MAIN RENDER LOOP  (60 fps target)
// ─────────────────────────────────────────────────────────────
function renderLoop(timestamp) {
  requestAnimationFrame(renderLoop);

  renderFrames++;

  // ── FPS counter update (every second) ──────────────────────
  if (timestamp - lastFpsTick >= 1000) {
    fpsR.textContent = renderFrames;
    fpsS.textContent = segFrames;
    renderFrames = 0;
    segFrames    = 0;
    lastFpsTick  = timestamp;
  }

  if (!segReady || video.readyState < 2) return;

  // ── Throttled segmentation ─────────────────────────────────
  // Run at CFG.segFpsTarget, NOT every render frame.
  if (timestamp - lastSegTime >= segInterval) {
    lastSegTime = timestamp;

    // Step 2: Downscale video → low-res canvas
    segCtx.drawImage(video, 0, 0, SEG_W, SEG_H);

    // Step 3: Send low-res frame to MediaPipe (async, non-blocking)
    segmentation.send({ image: segIn }).catch(() => {});
  }

  // ── Scroll offset ──────────────────────────────────────────
  if (CFG.animating) {
    scrollY += CFG.scrollSpeed;
    const lh = CFG.fontSize * CFG.lineHeight;
    if (scrollY >= lh) scrollY -= lh;  // seamless 1-row loop
  }

  // ── Step 1: Draw text background ───────────────────────────
  drawTextBuffer(timestamp);

  // Clear main stage
  const bg = CFG.inverted ? '#f8f8f8' : '#080808';
  sctx.fillStyle = bg;
  sctx.fillRect(0, 0, W, H);

  // Blit scrolled text onto stage
  sctx.drawImage(textBuf, 0, -scrollY);

  // ── Steps 4 & 5: Composite person over text ─────────────────
  if (latestMaskBitmap) {
    compositePersonOverText();
  }
}

// ─────────────────────────────────────────────────────────────
//  COMPOSITING — person silhouette cuts through text
// ─────────────────────────────────────────────────────────────
function compositePersonOverText() {

  // ── 4a. Build full-screen person-mask on maskBuf ────────────
  mctx.clearRect(0, 0, W, H);

  // Scale up the small (SEG_W × SEG_H) mask to full screen.
  // Also mirror horizontally (selfie mode — video is already mirrored by selfieMode:true).
  mctx.save();
  mctx.scale(-1, 1);
  mctx.translate(-W, 0);
  mctx.drawImage(latestMaskBitmap, 0, 0, W, H);
  mctx.restore();

  // Soft-edge: apply blur so silhouette has a feathered border
  mctx.filter = 'blur(6px)';
  const tmpMask = mctx.getImageData(0, 0, W, H);  // snapshot before filter apply

  // Re-draw with blur to get feathered version
  mctx.clearRect(0, 0, W, H);
  mctx.filter = 'blur(6px)';
  mctx.save();
  mctx.scale(-1, 1);
  mctx.translate(-W, 0);
  mctx.drawImage(latestMaskBitmap, 0, 0, W, H);
  mctx.restore();
  mctx.filter = 'none';

  // ── 4b. Punch person-hole OUT of the text layer on stage ────
  // "destination-out" uses the drawn pixels as an ERASER on what's already on stage.
  // The mask's bright pixels (person) erase the text behind them.
  sctx.save();
  sctx.globalCompositeOperation = 'destination-out';
  sctx.drawImage(maskBuf, 0, 0);
  sctx.restore();

  // ── 5. Draw webcam frame ONLY in person region ──────────────
  // Build personBuf: webcam → clipped by mask → draw onto stage

  pctx.clearRect(0, 0, W, H);

  // Mirror video (camera is already mirrored by MediaPipe selfie mode,
  // but the raw <video> element is not — flip it to match)
  pctx.save();
  pctx.scale(-1, 1);
  pctx.translate(-W, 0);

  // Letterbox-fill: cover canvas maintaining aspect ratio
  const vw    = video.videoWidth  || W;
  const vh    = video.videoHeight || H;
  const scale = Math.max(W / vw, H / vh);
  const dw    = vw * scale;
  const dh    = vh * scale;
  const dx    = (W - dw) / 2;
  const dy    = (H - dh) / 2;

  pctx.drawImage(video, dx, dy, dw, dh);
  pctx.restore();

  // Clip webcam to person region using mask (destination-in keeps only masked pixels)
  pctx.save();
  pctx.globalCompositeOperation = 'destination-in';
  pctx.drawImage(maskBuf, 0, 0);
  pctx.restore();

  // Composite person onto stage (normal blend, person is on top)
  sctx.drawImage(personBuf, 0, 0);
}

// ─────────────────────────────────────────────────────────────
//  BOOT STATUS
// ─────────────────────────────────────────────────────────────
function setBootMsg(msg) {
  bootMsg.textContent = msg;
}

// ─────────────────────────────────────────────────────────────
//  UI CONTROLS
// ─────────────────────────────────────────────────────────────
(function mountUI() {

  // ── Panel collapse ─────────────────────────────────────────
  const panel      = document.getElementById('panel');
  const panelToggle = document.getElementById('panel-toggle');
  let open = true;

  panelToggle.addEventListener('click', () => {
    open = !open;
    panel.classList.toggle('closed', !open);
  });

  // Auto-fade after 5s inactivity
  let fadeTimer;
  function resetFade() {
    panel.classList.remove('faded');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => panel.classList.add('faded'), 5000);
  }
  document.addEventListener('mousemove', resetFade);
  document.addEventListener('touchstart', resetFade);
  panel.addEventListener('mouseenter', () => { clearTimeout(fadeTimer); panel.classList.remove('faded'); });
  resetFade();

  // ── Animation toggle ───────────────────────────────────────
  const btnAnim = document.getElementById('btn-anim');
  btnAnim.addEventListener('click', () => {
    CFG.animating = !CFG.animating;
    btnAnim.dataset.on  = CFG.animating;
    btnAnim.textContent = CFG.animating ? 'LIVE' : 'PAUSED';
  });

  // ── Invert toggle ──────────────────────────────────────────
  const btnInvert = document.getElementById('btn-invert');
  btnInvert.addEventListener('click', () => {
    CFG.inverted = !CFG.inverted;
    document.body.classList.toggle('inv', CFG.inverted);
    btnInvert.dataset.on  = CFG.inverted;
    btnInvert.textContent = CFG.inverted ? 'ON' : 'OFF';
  });

  // ── Font size ──────────────────────────────────────────────
  const slSize  = document.getElementById('sl-size');
  const szVal   = document.getElementById('sz-val');
  slSize.addEventListener('input', () => {
    CFG.fontSize = parseInt(slSize.value, 10);
    szVal.textContent = CFG.fontSize;
    buildTextLines();
    resize();
  });

  // ── Speed ──────────────────────────────────────────────────
  const slSpeed = document.getElementById('sl-speed');
  const spVal   = document.getElementById('sp-val');
  slSpeed.addEventListener('input', () => {
    CFG.scrollSpeed = parseFloat(slSpeed.value) / 10;
    spVal.textContent = CFG.scrollSpeed.toFixed(1);
  });

  // ── Source ─────────────────────────────────────────────────
  const selSrc = document.getElementById('sel-src');
  selSrc.addEventListener('change', () => {
    CFG.source = selSrc.value;
    buildTextLines();
  });

})();

// ─────────────────────────────────────────────────────────────
//  BOOT SEQUENCE
// ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Pre-set canvas sizes before media loads
  W = window.innerWidth;
  H = window.innerHeight;
  stage.width  = W;
  stage.height = H;
  textBuf.width  = W;
  textBuf.height = H + 200;
  maskBuf.width  = W;
  maskBuf.height = H;
  personBuf.width  = W;
  personBuf.height = H;
  segIn.width  = SEG_W;
  segIn.height = SEG_H;

  buildTextLines();
  initMediaPipe();
});
