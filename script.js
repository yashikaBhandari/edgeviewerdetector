/* ============================================================
   Real-Time Edge Detection demo
   ------------------------------------------------------------
   – Loads OpenCV.js (with CDN fallback)
   – Obtains camera via getUserMedia
   – Processes frames with selected filter
   – Falls back to raw Canvas if OpenCV fails
   – Displays FPS & processing time
   ============================================================
*/

/* ---------- DOM references --------------------------------- */
const video    = document.getElementById('video');
const canvas   = document.getElementById('canvasOutput');
const ctx      = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const controls = document.getElementById('controls');
const metrics  = document.getElementById('metrics');

/* ---------- Application state ------------------------------ */
let filter      = 'raw';
let streaming   = false;
let isOpenCV    = false;

/* OpenCV objects (allocated later) */
let cap, src, dst, gray, blurred;

/* Performance counters */
let frameCnt = 0;
let lastSec  = Date.now();
let lastProc = 0;

/* ---------- Utility: status banner & console --------------- */
function setStatus(msg, cls = 'loading') {
  console.info('[STATUS]', msg);
  statusEl.textContent = msg;
  statusEl.className   = `status ${cls}`;
}

/* Button helper */
function setFilter(name) {
  filter = name;
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(name + 'Btn').classList.add('active');
  console.debug('[UI] Filter switched to', name);
}

/* ---------- Load OpenCV (two possible CDNs) ---------------- */
const cdnList = [
  'https://docs.opencv.org/4.8.0/opencv.js',
  'https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/dist/opencv.js'
];
let cdnIndex = 0;

(function loadOpenCV() {
  setStatus(`Loading OpenCV.js (CDN ${cdnIndex + 1}/${cdnList.length})…`);
  const script = document.createElement('script');
  script.src   = cdnList[cdnIndex];
  script.async = true;

  script.onload = () => {
    console.log('✔ OpenCV script loaded');
    if (typeof cv !== 'undefined') {
      cv.onRuntimeInitialized = () => {
        isOpenCV = true;
        console.log('✔ OpenCV runtime ready');
        setStatus('OpenCV ready – requesting camera…', 'ready');
        startCamera();
      };
    }
  };

  script.onerror = () => {
    console.warn('✘ Failed to load OpenCV from this CDN');
    cdnIndex++;
    if (cdnIndex < cdnList.length) {
      loadOpenCV();          // try the next CDN
    } else {
      setStatus('OpenCV failed – falling back to Canvas', 'error');
      startCamera();         // still show something
    }
  };

  document.head.appendChild(script);
})();

/* ---------- Camera handling -------------------------------- */
function startCamera() {
  console.log('[CAMERA] Requesting getUserMedia…');

  navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    audio: false
  })
  .then(stream => {
    console.log('✔ Camera stream obtained');
    video.srcObject = stream;
    return video.play();
  })
  .then(() => {
    video.style.display = 'block';
  })
  .catch(err => {
    console.error('✘ Camera error:', err);
    setStatus(`Camera error: ${err.message}`, 'error');
  });

  /* When metadata is known we finally know the resolution */
  video.addEventListener('loadedmetadata', () => {
    /* Copy real resolution into width/height attributes –
       cv.VideoCapture internally uses *attributes*, not videoWidth/Height */
    video.width  = video.videoWidth;
    video.height = video.videoHeight;

    document.getElementById('resolutionValue').textContent =
      `${video.width}×${video.height}`;

    if (!streaming) initialiseProcessing();
  });
}

/* ---------- OpenCV Mat helpers ----------------------------- */
function allocateMats() {
  if (src) {  // clean up existing ones
    src.delete(); dst.delete(); gray.delete(); blurred.delete();
  }
  const h = video.height, w = video.width;
  src     = new cv.Mat(h, w, cv.CV_8UC4);
  dst     = new cv.Mat(h, w, cv.CV_8UC1);
  gray    = new cv.Mat(h, w, cv.CV_8UC1);
  blurred = new cv.Mat(h, w, cv.CV_8UC1);
  console.debug('[OpenCV] Mats allocated', w, '×', h);
}

/* ---------- Init after camera is ready --------------------- */
function initialiseProcessing() {
  console.log('[INIT] Building processing pipeline…');

  canvas.width  = video.width;
  canvas.height = video.height;
  canvas.style.display = 'block';

  if (isOpenCV) {
    allocateMats();
    cap = new cv.VideoCapture(video);
  }

  streaming   = true;
  controls.style.display = 'flex';
  metrics.style.display  = 'flex';

  setStatus('✅ Ready – processing…', 'ready');

  requestAnimationFrame(processLoop);
}

/* ---------- Main processing loop --------------------------- */
function processLoop() {
  if (!streaming) return;

  const start = performance.now();

  try {
    /* OpenCV branch --------------------------------------- */
    if (isOpenCV) {
      /* Re-allocate Mats if resolution ever changes (mobile rotation) */
      if (src.rows !== video.height || src.cols !== video.width) {
        console.warn('[OpenCV] Resolution changed – re-allocating Mats');
        allocateMats();
      }

      cap.read(src);

      switch (filter) {
        case 'gray':
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.imshow('canvasOutput', gray);
          break;

        case 'blur':
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.GaussianBlur(gray, blurred, new cv.Size(15, 15), 0);
          cv.imshow('canvasOutput', blurred);
          break;

        case 'edge':
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.Canny(gray, dst, 50, 150);
          cv.imshow('canvasOutput', dst);
          break;

        case 'threshold':
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.threshold(gray, dst, 127, 255, cv.THRESH_BINARY);
          cv.imshow('canvasOutput', dst);
          break;

        default:    // raw
          cv.imshow('canvasOutput', src);
      }

    /* Canvas-only fallback -------------------------------- */
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      /* You could add JS-only filters here if desired */
    }

  } catch (err) {
    console.error('✘ Processing error:', err);
  }

  /* -------- metrics -------- */
  lastProc = Math.round(performance.now() - start);
  updateMetrics();

  requestAnimationFrame(processLoop);
}

/* ---------- Metrics (FPS etc.) ----------------------------- */
function updateMetrics() {
  frameCnt++;
  const now = Date.now();
  if (now - lastSec >= 1000) {             // once per second
    const fps = Math.round(frameCnt * 1000 / (now - lastSec));
    document.getElementById('fpsValue').textContent         = fps;
    document.getElementById('processTimeValue').textContent = lastProc;
    frameCnt = 0;
    lastSec  = now;
  }
}

/* ---------- Cleanup on page unload ------------------------- */
window.addEventListener('beforeunload', () => {
  streaming = false;
  if (src) { src.delete(); dst.delete(); gray.delete(); blurred.delete(); }
  console.log('[CLEANUP] OpenCV Mats freed');
});