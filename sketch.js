let cnv;
let sliderVal = 0.5; // 크기 컨트롤: 0..1, 0.5가 기준점
let posXVal = 0.5;  // 위치 X: 0..1 (좌→우)
let posYVal = 0.5;  // 위치 Y: 0..1 (상→하)
let dotSize = 20;   // 점 지름(px)
let selectedLetter = 'g'; // 선택된 글자
const controlRefs = { sizeBar: null, posXBar: null, posYBar: null, dotBar: null };
let faceVideo = null;
let faceMeshInstance = null;
let faceCamera = null;
const FACE_FILTER = 0.25;
const CONTROL_FILTER = 0.2;
const FACE_WIDTH_RANGE = { min: 0.02, max: 0.12 }; // 3m(약 0.03) ~ 1.5m(약 0.12) 정도로 대폭 하향
let faceData = { active: false, x: 0.5, y: 0.5, closeness: 0.5 };

function setup() {
  // 전체 화면 캔버스
  cnv = createCanvas(windowWidth, windowHeight);

  // 텍스트 설정: 헬베티카 선호, 없으면 시스템 산세리프 폴백
  textFont('Helvetica');
  textAlign(CENTER, CENTER);
  noStroke();

  // Export 버튼 클릭 → PNG 저장
  const btn = document.getElementById('exportBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      const ts = timestamp();
      // 파일명 예: g-730-630-550-500-YYYYMMDD-HHMMSS.png
      saveCanvas(cnv, `${selectedLetter}-outlines-${ts}`, 'png');
    });
  }

  // 사이즈 컨트롤 바 이벤트
  const bar = document.getElementById('sizeBar');
  if (bar) {
    controlRefs.sizeBar = bar;
    const update = () => {
      const v = Number(bar.value);
      sliderVal = constrain(v / 1000, 0, 1);
    };
    bar.addEventListener('input', update);
    bar.addEventListener('change', update);
    update();
  }

  // 수평 위치 컨트롤
  const posX = document.getElementById('posXBar');
  if (posX) {
    controlRefs.posXBar = posX;
    const updateX = () => {
      posXVal = constrain(Number(posX.value) / 1000, 0, 1);
    };
    posX.addEventListener('input', updateX);
    posX.addEventListener('change', updateX);
    updateX();
  }

  // 수직 위치 컨트롤
  const posY = document.getElementById('posYBar');
  if (posY) {
    controlRefs.posYBar = posY;
    const updateY = () => {
      posYVal = constrain(Number(posY.value) / 1000, 0, 1);
    };
    posY.addEventListener('input', updateY);
    posY.addEventListener('change', updateY);
    updateY();
  }

  // 점 크기 컨트롤
  const dot = document.getElementById('dotBar');
  if (dot) {
    controlRefs.dotBar = dot;
    const updateDot = () => {
      const v = Number(dot.value);
      dotSize = constrain(v, 1, 200);
    };
    dot.addEventListener('input', updateDot);
    dot.addEventListener('change', updateDot);
    updateDot();
  }

  // 글자 선택 컨트롤
  const letterSel = document.getElementById('letterSelect');
  if (letterSel) {
    const updateLetter = () => {
      selectedLetter = letterSel.value;
    };
    letterSel.addEventListener('change', updateLetter);
    updateLetter();
  }

  // Random 버튼 이벤트
  const randomBtn = document.getElementById('randomBtn');
  if (randomBtn) {
    randomBtn.addEventListener('click', () => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
      const randomChar = chars.charAt(Math.floor(Math.random() * chars.length));
      selectedLetter = randomChar;

      // select 요소가 있으면 동기화 (커스텀 글자일 경우 선택 해제되거나 무시될 수 있음)
      if (letterSel) {
        // 기존 옵션에 있으면 선택, 없으면 그냥 selectedLetter만 업데이트
        let found = false;
        for (let i = 0; i < letterSel.options.length; i++) {
          if (letterSel.options[i].value === randomChar) {
            letterSel.selectedIndex = i;
            found = true;
            break;
          }
        }
        // 만약 리스트에 없는 글자면? 그냥 선택된 상태 유지 혹은 첫번째로? 
        // 여기서는 그냥 selectedLetter만 바뀌면 draw에서 반영되므로 괜찮음.
      }
    });
  }

  initFaceTracking();
}
function draw() {
  // 흰 배경
  background(255);

  if (faceData.active) {
    applyFaceToControls();
  }

  // 슬라이더 기반 목표 위치와 중심, 오프셋
  const margin = 20;
  const targetX = map(posXVal, 0, 1, margin, width - margin);
  const targetY = map(posYVal, 0, 1, margin, height - margin);
  const centerX = width / 2;
  const centerY = height / 2;
  const dx = targetX - centerX;
  const dy = targetY - centerY;

  const { s500, s550, s630, s730 } = computeSizes(sliderVal);
  const sizeSet = [s730, s630, s550, s500]; // draw 큰 → 작은 순서로 겹치기
  const maxSize = s730;
  const minSize = s500;
  const sizeRange = Math.max(1, maxSize - minSize);

  const ctx = drawingContext; // p5의 2D 캔버스 컨텍스트
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 점 크기 및 간격 설정: 점 지름 = dotSize, 점-점 중심 간격 = dotSize * 2 (여백 = dotSize)
  ctx.setLineDash([0, dotSize * 2]);
  ctx.lineCap = 'round';
  ctx.lineWidth = dotSize;

  for (let i = 0; i < sizeSet.length; i += 1) {
    const size = sizeSet[i];
    const weight = sizeRange === 0 ? 0 : (size - minSize) / sizeRange;
    ctx.font = `${size}px Helvetica, Arial, sans-serif`;
    ctx.strokeText(selectedLetter, centerX + dx * weight, centerY + dy * weight);
  }

  // 디버그 정보 (나중에 필요 없으면 삭제)
  ctx.restore();
  if (faceData.active) {
    fill(0, 200, 0);
    textSize(14);
    textAlign(LEFT, TOP);
    text(`Face detected! Width: ${faceData.lastRawWidth?.toFixed(3)} | Closeness: ${faceData.closeness.toFixed(2)}`, 20, height - 30);
  } else {
    fill(200, 0, 0);
    textSize(14);
    textAlign(LEFT, TOP);
    text("No face detected", 20, height - 30);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function initFaceTracking() {
  if (typeof FaceMesh === 'undefined' || typeof Camera === 'undefined') {
    console.warn('Face tracking scripts not available.');
    showTrackingWarning('Face tracking script failed to load. Manual controls only.');
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('MediaDevices.getUserMedia is not supported in this environment.');
    showTrackingWarning('Camera access is not supported here. Manual controls only.');
    return;
  }

  faceVideo = createCapture({ video: { facingMode: 'user' }, audio: false });
  faceVideo.size(640, 480);
  faceVideo.elt.muted = true;
  faceVideo.elt.playsInline = true;
  faceVideo.hide();

  faceMeshInstance = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMeshInstance.setOptions({
    maxNumFaces: 4,
    refineLandmarks: false,
    minDetectionConfidence: 0.3, // 먼 거리 대응을 위해 낮춤
    minTrackingConfidence: 0.3,
  });
  faceMeshInstance.onResults(handleFaceResults);

  faceCamera = new Camera(faceVideo.elt, {
    width: 640,
    height: 480,
    onFrame: async () => {
      if (faceMeshInstance) {
        await faceMeshInstance.send({ image: faceVideo.elt });
      }
    },
  });
  faceCamera.start().then(() => {
    hideTrackingWarning();
  }).catch((err) => {
    console.warn('Face tracking camera failed to start:', err);
    showTrackingWarning('Could not start camera. Check permissions or use manual controls.');
  });
}

function handleFaceResults(results) {
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
    faceData.active = false;
    return;
  }

  // 모든 얼굴 중 가장 "가까운" (바운딩 박스가 가장 큰) 얼굴 찾기
  let closestFaceIndex = 0;
  let maxBoxWidth = -1;

  for (let f = 0; f < results.multiFaceLandmarks.length; f++) {
    const landmarks = results.multiFaceLandmarks[f];
    let minX = 1, maxX = 0;
    for (let i = 0; i < landmarks.length; i++) {
      minX = Math.min(minX, landmarks[i].x);
      maxX = Math.max(maxX, landmarks[i].x);
    }
    const currentWidth = maxX - minX;
    if (currentWidth > maxBoxWidth) {
      maxBoxWidth = currentWidth;
      closestFaceIndex = f;
    }
  }

  const landmarks = results.multiFaceLandmarks[closestFaceIndex];
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;

  for (let i = 0; i < landmarks.length; i += 1) {
    const lm = landmarks[i];
    if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) {
      continue;
    }
    minX = Math.min(minX, lm.x);
    maxX = Math.max(maxX, lm.x);
    minY = Math.min(minY, lm.y);
    maxY = Math.max(maxY, lm.y);
  }

  const boxWidth = Math.max(0, maxX - minX);
  if (boxWidth <= 0) {
    faceData.active = false;
    return;
  }
  const centerX = clamp01((minX + maxX) * 0.5);
  const centerY = clamp01((minY + maxY) * 0.5);
  const closenessRaw = map(boxWidth, FACE_WIDTH_RANGE.min, FACE_WIDTH_RANGE.max, 0, 1);
  const closeness = clamp01(closenessRaw);

  const mirroredX = clamp01(1 - centerX);

  faceData.active = true;
  faceData.lastRawWidth = boxWidth; // 디버그용
  faceData.x = lerp(faceData.x, mirroredX, FACE_FILTER);
  faceData.y = lerp(faceData.y, centerY, FACE_FILTER);
  faceData.closeness = lerp(faceData.closeness, closeness, FACE_FILTER);
}

function applyFaceToControls() {
  // 가까워질수록(closeness ↑) 글자 간격/크기도 커지도록 수정 (기존 1 - faceData.closeness 에서 변경)
  const spacingTarget = faceData.closeness;

  // 3단계 거리 매핑 (3m: 100px, 2.5m: 40px, 2m: 6px)
  // closeness 0(3m) -> 100, 0.5(2.5m) -> 40, 1(2m) -> 6
  let dotTarget;
  if (faceData.closeness < 0.5) {
    dotTarget = map(faceData.closeness, 0, 0.5, 100, 40);
  } else {
    dotTarget = map(faceData.closeness, 0.5, 1, 40, 6);
  }

  sliderVal = clamp01(lerp(sliderVal, spacingTarget, CONTROL_FILTER));
  posXVal = clamp01(lerp(posXVal, faceData.x, CONTROL_FILTER));
  posYVal = clamp01(lerp(posYVal, faceData.y, CONTROL_FILTER));
  dotSize = constrain(lerp(dotSize, dotTarget, CONTROL_FILTER), 1, 200);

  syncControlUI();
}

function syncControlUI() {
  if (controlRefs.sizeBar) {
    controlRefs.sizeBar.value = Math.round(clamp01(sliderVal) * 1000);
  }
  if (controlRefs.posXBar) {
    controlRefs.posXBar.value = Math.round(clamp01(posXVal) * 1000);
  }
  if (controlRefs.posYBar) {
    controlRefs.posYBar.value = Math.round(clamp01(posYVal) * 1000);
  }
  if (controlRefs.dotBar) {
    controlRefs.dotBar.value = Math.round(constrain(dotSize, 1, 200));
  }
}

function showTrackingWarning(message) {
  let el = document.getElementById('trackingWarning');
  if (!el) {
    el = document.createElement('div');
    el.id = 'trackingWarning';
    document.body.appendChild(el);
    el.style.position = 'fixed';
    el.style.bottom = '20px';
    el.style.right = '20px';
    el.style.padding = '12px 16px';
    el.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    el.style.color = '#fff';
    el.style.fontFamily = 'Helvetica, Arial, sans-serif';
    el.style.fontSize = '14px';
    el.style.borderRadius = '6px';
    el.style.maxWidth = '260px';
    el.style.zIndex = '9999';
  }
  el.textContent = message;
  el.style.display = 'block';
}

function hideTrackingWarning() {
  const el = document.getElementById('trackingWarning');
  if (el) {
    el.style.display = 'none';
  }
}

// 간단한 타임스탬프(YYYYMMDD-HHMMSS)
function timestamp() {
  const d = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}${m}${da}-${h}${mi}${s}`;
}

// 슬라이더(0..1)에 따라 550/630/730의 목표 크기를 계산
function computeSizes(t) {
  // 기준 크기
  const baseSize = 500;
  const baseMax = 730;
  const grow = 200; // 오른쪽 끝에서 추가로 커지는 최대값

  let maxSize = baseMax;
  if (t < 0.5) {
    const p = (0.5 - t) / 0.5;
    maxSize = lerp(baseMax, baseSize, p);
  } else if (t > 0.5) {
    const p = (t - 0.5) / 0.5;
    maxSize = baseMax + grow * p;
  }

  const step = (maxSize - baseSize) / 3;
  const s500 = baseSize;
  const s550 = baseSize + step;
  const s630 = baseSize + step * 2;
  const s730 = baseSize + step * 3;

  return { s500, s550, s630, s730 };
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function lerp(a, b, t) { return a + (b - a) * t; }
