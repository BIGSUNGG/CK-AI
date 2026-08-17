

/* 페이지 구성: 22페이지 = 오프닝 영상 → 0~3컷 → 중간 영상(3-1) → 4~19컷 */
const img = (n) => ({ type: 'image', src: `assets/cut-${String(n).padStart(2, '0')}.png` });
const PAGES = [
  { type: 'video', src: 'assets/opening.mp4' },
  img(0), img(1), img(2), img(3),
  { type: 'video', src: 'assets/interlude.mp4' },
  ...Array.from({ length: 16 }, (_, i) => img(4 + i)),
];
const LAST = PAGES.length - 1;

const stage = document.getElementById('stage');
const baseEl = document.getElementById('base');
const flipEl = document.getElementById('flip');
const counter = document.getElementById('counter');
const barFill = document.getElementById('bar-fill');
const replayBtn = document.getElementById('replay');

let index = 0;      // 현재 페이지
let cur = null;     // 현재 페이지 엘리먼트 (평소에는 base 슬롯)
let animating = false;
let drag = null;    // 진행 중인 드래그 플립 { dir, p }
let pointer = null; // 진행 중인 포인터 { id, y0, lastY, lastT, vel, started }

function makePage(i) {
  const def = PAGES[i];
  const wrap = document.createElement('div');
  wrap.className = 'page';

  if (def.type === 'video') {
    const media = document.createElement('video');
    media.src = def.src;
    media.playsInline = true;
    media.preload = 'auto';
    media.className = 'page-media';

    const mute = document.createElement('button');
    mute.className = 'mute-btn';
    mute.type = 'button';
    mute.setAttribute('aria-label', '음소거 토글');
    mute.textContent = '🔊';
    mute.addEventListener('click', () => {
      media.muted = !media.muted;
      mute.textContent = media.muted ? '🔇' : '🔊';
    });

    wrap.append(media, mute);
    wrap.video = media;
    wrap.muteBtn = mute;
  } else {
    const media = document.createElement('img');
    media.src = def.src;
    media.alt = `${i + 1}번째 장면`;
    media.className = 'page-media';
    media.draggable = false;
    wrap.append(media);
  }

  const shade = document.createElement('div');
  shade.className = 'shade';
  wrap.append(shade);
  wrap.shade = shade;
  return wrap;
}

function updateHud() {
  counter.textContent = `${index + 1} / ${PAGES.length}`;
  barFill.style.width = `${((index + 1) / PAGES.length) * 100}%`;
  replayBtn.hidden = index !== LAST;
}

function preloadAround() {
  for (const j of [index + 1, index + 2, index - 1]) {
    if (j >= 0 && j < PAGES.length && PAGES[j].type === 'image') {
      new Image().src = PAGES[j].src;
    }
  }
}

/* 현재 페이지 영상 재생 시도 → 거부되면 음소거 재생으로 폴백 */
function playCurrent() {
  if (!cur || !cur.video) return;
  const wrap = cur;
  const v = wrap.video;
  v.currentTime = 0;
  v.muted = false;
  wrap.muteBtn.textContent = '🔊';
  v.play().catch(() => {
    if (wrap.video !== v) return; // 이미 다른 페이지로 넘어감
    v.muted = true;
    wrap.muteBtn.textContent = '🔇';
    v.play().catch(() => {});
  });
}

function resumeCurrent() {
  if (cur && cur.video) cur.video.play().catch(() => {});
}

function pauseCurrent() {
  if (cur && cur.video) cur.video.pause();
}

function setFlipAngle(deg, animate) {
  flipEl.style.transition = animate
    ? 'transform 340ms cubic-bezier(0.2, 0.7, 0.3, 1)'
    : 'none';
  flipEl.style.transform = `rotateX(${deg}deg)`;
}

function settle(i) {
  index = i;
  cur = makePage(i);
  baseEl.replaceChildren(cur);
  flipEl.replaceChildren();
  setFlipAngle(0, false);
  updateHud();
  preloadAround();
  playCurrent();
}

/* 드래그 방향 플립 준비. dir 1 = 다음(아래 드래그), -1 = 이전(위 드래그) */
function beginDrag(dir) {
  if (animating) return false;
  if (dir > 0 && index >= LAST) return false;
  if (dir < 0 && index <= 0) return false;
  animating = true;
  drag = { dir, p: 0 };
  if (dir > 0) {
    baseEl.replaceChildren(makePage(index + 1)); // 다음 페이지를 아래에
    flipEl.replaceChildren(cur);                 // 현재 페이지가 넘어감
    setFlipAngle(0, false);
  } else {
    flipEl.replaceChildren(makePage(index - 1)); // 이전 페이지가 뒤집혀 위에서 나타남
    setFlipAngle(180, false);
  }
  pauseCurrent();
  return true;
}

function applyDrag(dy) {
  const p = Math.min(Math.max(Math.abs(dy) / (stage.clientHeight * 0.5), 0), 1);
  drag.p = p;
  const deg = drag.dir > 0 ? 180 * p : 180 * (1 - p);
  setFlipAngle(deg, false);
  const wrap = flipEl.firstElementChild;
  if (wrap && wrap.shade) {
    wrap.shade.style.opacity = (drag.dir > 0 ? p : 1 - p) * 0.6;
  }
}

function finishFlip(commit) {
  const dir = drag.dir;
  let target;
  if (dir > 0) target = commit ? 180 : 0;
  else target = commit ? 0 : 180;
  setFlipAngle(target, true);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    flipEl.removeEventListener('transitionend', done);
    animating = false;
    drag = null;
    const incoming = flipEl.firstElementChild; // dir<0 확정 시 새 현재 페이지
    flipEl.replaceChildren();
    setFlipAngle(0, false);
    if (commit) {
      index += dir;
      cur = dir > 0 ? baseEl.firstElementChild : incoming;
      if (cur.shade) cur.shade.style.opacity = 0;
      baseEl.replaceChildren(cur);
      updateHud();
      preloadAround();
      playCurrent();
    } else {
      if (dir > 0) {
        if (cur.shade) cur.shade.style.opacity = 0;
        baseEl.replaceChildren(cur); // 아래에 깔린 다음 페이지 제거, 현재 복원
      }
      resumeCurrent();
    }
  };
  flipEl.addEventListener('transitionend', done);
  setTimeout(done, 500); // transitionend 누락 안전장치
}

/* 휠/키보드용 프로그램식 넘김 */
function turn(dir) {
  if (!beginDrag(dir)) return;
  applyDrag(dir > 0 ? stage.clientHeight * 0.5 : -stage.clientHeight * 0.5);
  finishFlip(true);
}

/* ---------- 입력 처리 ---------- */

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
  stage.setPointerCapture(e.pointerId);
  pointer = { id: e.pointerId, y0: e.clientY, lastY: e.clientY, lastT: performance.now(), vel: 0, started: false };
});

stage.addEventListener('pointermove', (e) => {
  if (!pointer || e.pointerId !== pointer.id) return;
  const dy = e.clientY - pointer.y0;
  const now = performance.now();
  const dt = Math.max(now - pointer.lastT, 1);
  pointer.vel = (e.clientY - pointer.lastY) / dt;
  pointer.lastY = e.clientY;
  pointer.lastT = now;

  if (!pointer.started) {
    if (Math.abs(dy) < 8) return; // 움직임 감지 임계값(슬롭)
    if (!beginDrag(dy > 0 ? 1 : -1)) { pointer = null; return; }
    pointer.started = true;
  }
  applyDrag(dy);
});

stage.addEventListener('pointerup', (e) => {
  if (!pointer || e.pointerId !== pointer.id) return;
  const p = pointer;
  pointer = null;
  if (!p.started) return; // 단순 탭: 아무 동작 없음
  const commit = drag.p >= 0.3 || (Math.abs(p.vel) >= 0.5 && drag.p >= 0.05);
  finishFlip(commit);
});

stage.addEventListener('pointercancel', (e) => {
  if (!pointer || e.pointerId !== pointer.id) return;
  const p = pointer;
  pointer = null;
  if (p.started) finishFlip(false);
});

let lastWheel = 0;
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const now = performance.now();
  if (now - lastWheel < 400) return;
  lastWheel = now;
  turn(e.deltaY > 0 ? 1 : -1);
}, { passive: false });

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
    e.preventDefault();
    turn(1);
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    turn(-1);
  }
});

replayBtn.addEventListener('click', () => {
  if (!animating) settle(0);
});

settle(0);
