import { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { LAST_PAGE, PAGES, type PageDef } from "./pages";

/* ---------- 단일 페이지 렌더 ---------- */

function PageView({ def, active }: { def: PageDef; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.muted = false;
      setMuted(false);
      v.play().catch(() => {
        // 사운드 재생이 거부되면 음소거 재생으로 폴백
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      });
    } else {
      v.pause();
    }
  }, [active]);

  return (
    <div className="page">
      {def.type === "video" ? (
        <>
          <video
            ref={videoRef}
            className="page-media"
            src={def.src}
            playsInline
            preload="auto"
          />
          <button
            type="button"
            className="mute-btn"
            aria-label="음소거 토글"
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.muted = !v.muted;
              setMuted(v.muted);
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </>
      ) : (
        <img className="page-media" src={def.src} alt="" draggable={false} />
      )}
    </div>
  );
}

/* ---------- 플립 북 ---------- */

type Phase = "idle" | "forward" | "backward";

interface PointerState {
  id: number;
  y0: number;
  lastY: number;
  lastT: number;
  vel: number;
  started: boolean;
}

export default function App() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const stageRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<PointerState | null>(null);
  const dirRef = useRef<1 | -1>(1);
  const animatingRef = useRef(false);
  const reduceMotion = useReducedMotion();

  // 드래그 진행률 0~1 → 플립 각도·그림자
  const p = useMotionValue(0);
  const rotFwd = useTransform(p, [0, 1], [0, 180]);
  const rotBwd = useTransform(p, [0, 1], [180, 0]);
  const shadeFwd = useTransform(p, [0, 1], [0, 0.6]);
  const shadeBwd = useTransform(p, [0, 1], [0.6, 0]);

  const releaseTransition = () =>
    reduceMotion
      ? ({ type: "tween", duration: 0.01 } as const)
      : ({ type: "spring", stiffness: 300, damping: 30 } as const);

  const finalize = (commit: boolean) => {
    if (commit) setIndex((i) => i + dirRef.current);
    setPhase("idle");
    animatingRef.current = false;
    p.set(0);
  };

  const beginFlip = (dir: 1 | -1): boolean => {
    if (animatingRef.current) return false;
    if (dir > 0 && index >= LAST_PAGE) return false;
    if (dir < 0 && index <= 0) return false;
    animatingRef.current = true;
    dirRef.current = dir;
    p.set(0);
    setPhase(dir > 0 ? "forward" : "backward");
    return true;
  };

  const finishFlip = (commit: boolean) => {
    animate(p, commit ? 1 : 0, {
      ...releaseTransition(),
      onComplete: () => finalize(commit),
    });
  };

  const turn = (dir: 1 | -1) => {
    if (!beginFlip(dir)) return;
    finishFlip(true);
  };

  /* ---------- 포인터 드래그 ---------- */

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    stageRef.current?.setPointerCapture(e.pointerId);
    pointerRef.current = {
      id: e.pointerId,
      y0: e.clientY,
      lastY: e.clientY,
      lastT: performance.now(),
      vel: 0,
      started: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pt = pointerRef.current;
    if (!pt || e.pointerId !== pt.id) return;
    const dy = e.clientY - pt.y0;
    const now = performance.now();
    pt.vel = (e.clientY - pt.lastY) / Math.max(now - pt.lastT, 1);
    pt.lastY = e.clientY;
    pt.lastT = now;

    if (!pt.started) {
      if (Math.abs(dy) < 8) return; // 움직임 감지 임계값(슬롭)
      if (!beginFlip(dy > 0 ? 1 : -1)) {
        pointerRef.current = null;
        return;
      }
      pt.started = true;
    }
    const h = stageRef.current?.clientHeight ?? 1;
    p.set(Math.min(Math.max(Math.abs(dy) / (h * 0.5), 0), 1));
  };

  const endPointer = (e: React.PointerEvent, cancel: boolean) => {
    const pt = pointerRef.current;
    if (!pt || e.pointerId !== pt.id) return;
    pointerRef.current = null;
    if (!pt.started) return; // 단순 탭: 아무 동작 없음
    // 넘김 확정: 진행률 30% 이상 또는 빠른 플릭
    const progress = p.get();
    const commit =
      !cancel && (progress >= 0.3 || (Math.abs(pt.vel) >= 0.5 && progress >= 0.05));
    finishFlip(commit);
  };

  /* ---------- 휠·키보드 ---------- */

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let lastWheel = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - lastWheel < 400) return;
      lastWheel = now;
      turn(e.deltaY > 0 ? 1 : -1);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        turn(1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        turn(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  /* ---------- 이웃 페이지 프리로드 ---------- */

  useEffect(() => {
    for (const j of [index + 1, index + 2, index - 1]) {
      const def = PAGES[j];
      if (def?.type === "image") new Image().src = def.src;
    }
  }, [index]);

  /* ---------- 렌더 ---------- */

  const flipDef =
    phase === "forward" ? PAGES[index] : phase === "backward" ? PAGES[index - 1] : null;
  const baseDef = phase === "forward" ? PAGES[index + 1] : PAGES[index];
  const baseKey = phase === "forward" ? index + 1 : index;

  return (
    <div
      ref={stageRef}
      className="stage"
      role="region"
      aria-label="만화 페이지"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
    >
      <div className="slot base">
        <PageView key={baseKey} def={baseDef} active={phase === "idle"} />
      </div>

      {flipDef && (
        <motion.div
          className="slot flip"
          style={{
            rotateX: phase === "forward" ? rotFwd : rotBwd,
            transformOrigin: "top",
            backfaceVisibility: "hidden",
          }}
        >
          <PageView key={phase === "forward" ? index : index - 1} def={flipDef} active={false} />
          <motion.div
            className="shade"
            style={{ opacity: phase === "forward" ? shadeFwd : shadeBwd }}
          />
        </motion.div>
      )}

      <div className="bar">
        <div
          className="bar-fill"
          style={{ width: `${((index + 1) / PAGES.length) * 100}%` }}
        />
      </div>
      <div className="hud" aria-live="polite">
        {index + 1} / {PAGES.length}
      </div>

      {phase === "idle" && index === LAST_PAGE && (
        <button type="button" className="replay" onClick={() => setIndex(0)}>
          다시 보기
        </button>
      )}
    </div>
  );
}
