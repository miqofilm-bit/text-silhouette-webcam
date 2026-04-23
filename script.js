const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

const video = document.getElementById("v");
const segCanvas = document.getElementById("seg");
const segCtx = segCanvas.getContext("2d");

// low resolution mask
const WGRID = 80;
const HGRID = 60;

segCanvas.width = WGRID;
segCanvas.height = HGRID;

// word field
const WORDS = [
  "FIELD","TEXT","BODY","SPACE","VOID","SIGNAL","FORM","NOW","HERE","MOTION","GRID","ECHO"
];

// grid of words (fixed positions)
let words = [];

// mask
let mask = new Uint8Array(WGRID * HGRID);

// resize
let W,H;
function resize(){
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  buildWords();
}
window.addEventListener("resize", resize);
resize();

// webcam
navigator.mediaDevices.getUserMedia({
  video: { facingMode: "user" },
  audio: false
}).then(stream=>{
  video.srcObject = stream;
});

// MediaPipe
const seg = new SelfieSegmentation({
  locateFile: (f)=>
    `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`
});

seg.setOptions({
  modelSelection: 1,
  selfieMode: true
});

seg.onResults(onSeg);

// continuous loop
async function loop(){
  await seg.send({ image: video });
  requestAnimationFrame(loop);
}
loop();

// build fixed word grid
function buildWords(){
  words = [];

  const stepX = 80;
  const stepY = 40;

  for(let y=50; y<H; y+=stepY){
    for(let x=50; x<W; x+=stepX){

      words.push({
        ox:x,
        oy:y,
        x:x,
        y:y,
        text: WORDS[Math.floor(Math.random()*WORDS.length)],
        w:0
      });

    }
  }
}

// segmentation → binary mask
function onSeg(res){
  if(!res.segmentationMask) return;

  segCtx.drawImage(res.segmentationMask,0,0,WGRID,HGRID);
  const d = segCtx.getImageData(0,0,WGRID,HGRID).data;

  for(let i=0;i<WGRID*HGRID;i++){
    mask[i] = d[i*4] > 80 ? 1 : 0;
  }
}

// check mask
function blocked(x,y){
  const gx = Math.floor((x/W)*WGRID);
  const gy = Math.floor((y/H)*HGRID);

  if(gx<0||gy<0||gx>=WGRID||gy>=HGRID) return 0;
  return mask[gy*WGRID + gx];
}

// resolve collision (only horizontal shift)
function resolve(w){
  let x = w.ox;

  // if inside body → push right until free
  while(blocked(x,w.oy)){
    x += 20;
    if(x > W-100) break;
  }

  w.x = x;
}

// render
function draw(){
  ctx.fillStyle = "black";
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle = "white";
  ctx.font = "16px monospace";

  for(let w of words){

    resolve(w);

    ctx.fillText(w.text, w.x, w.oy);
  }

  requestAnimationFrame(draw);
}
draw();
