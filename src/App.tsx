import { useEffect, useRef, useState } from "react";
import {
	animate,
	useMotionValue,
	useMotionValueEvent,
	useReducedMotion,
} from "motion/react";
import { LAST_PAGE, PAGES, type PageDef } from "./pages";
import { peelGeometry } from "./peel";

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

/** 접힘선이 대각선 끝을 완전히 지나가도록 하는 여유분 */
const OVERSHOOT = 1.06;
/** 대기 상태의 코너 컬 크기 (대각선 길이 대비 비율) */
const IDLE_T = 0.07;

export default function App() {
	const [index, setIndex] = useState(0);
	const [phase, setPhase] = useState<Phase>("idle");
	const phaseRef = useRef<Phase>("idle");
	const stageRef = useRef<HTMLDivElement>(null);
	const flatRef = useRef<HTMLDivElement>(null);
	const flapWrapRef = useRef<HTMLDivElement>(null);
	const flapRef = useRef<HTMLDivElement>(null);
	const flapShadeRef = useRef<HTMLDivElement>(null);
	const shadowRef = useRef<HTMLDivElement>(null);
	const creaseRef = useRef<HTMLDivElement>(null);
	const pointerRef = useRef<PointerState | null>(null);
	const dirRef = useRef<1 | -1>(1);
	const animatingRef = useRef(false);
	const reduceMotion = useReducedMotion();

	const setPhaseBoth = (ph: Phase) => {
		phaseRef.current = ph;
		setPhase(ph);
	};

	// 드래그 진행률 0~1 — 스프링/확정 애니메이션도 이 값을 따라간다
	const p = useMotionValue(0);

	/** 진행률 → 접힘선 위치(t) → 클리핑·반사·그림자를 매 프레임 DOM에 반영 */
	const applyPeel = (progress: number) => {
		const stage = stageRef.current;
		if (!stage) return;
		const W = stage.clientWidth;
		const H = stage.clientHeight;
		const L = Math.hypot(W, H);
		const ph = phaseRef.current;
		const t =
			ph === "idle"
				? IDLE_T * L
				: ph === "forward"
					? progress * L * OVERSHOOT
					: (1 - progress) * L * OVERSHOOT;
		const g = peelGeometry(W, H, t);
		// 그림자 강도: 시작/끝에서 작고 중반에 큼
		const strength = Math.sin(Math.PI * Math.min(t / L, 1));
		// 접힘선에서 코너 쪽으로 내려가는 방향의 CSS 그라디언트 각도
		// (방향 벡터 (sinθ, −cosθ) = (W/L, H/L) 기준)
		const gradDeg = (Math.atan2(W / L, -H / L) * 180) / Math.PI;
		const foldPos = L - t; // 좌상단 모서리 기준 접힘선 위치

		if (flatRef.current) flatRef.current.style.clipPath = g.flatPoly;
		if (flapRef.current) flapRef.current.style.clipPath = g.cornerPoly;
		if (flapWrapRef.current) flapWrapRef.current.style.transform = g.matrix;
		if (flapShadeRef.current) {
			// 접힌 종이의 휘어짐 음영: 접힘선에서 어둡다가 코너 쪽으로 사라짐
			flapShadeRef.current.style.background = `linear-gradient(${gradDeg}deg, rgba(0,0,0,0.34) ${foldPos}px, rgba(0,0,0,0.12) ${foldPos + 90}px, rgba(255,255,255,0.06) ${foldPos + 260}px)`;
		}
		if (shadowRef.current) {
			const s = shadowRef.current.style;
			// 들어 올린 종이가 아래 페이지에 드리우는 그림자 (접힘선 바로 아래)
			s.clipPath = g.cornerPoly;
			s.background = `linear-gradient(${gradDeg}deg, rgba(0,0,0,0.42) ${foldPos}px, rgba(0,0,0,0) ${foldPos + 130}px)`;
			s.opacity = String(0.35 + 0.65 * strength);
		}
		if (creaseRef.current) {
			const c = creaseRef.current.style;
			const len = Math.hypot(g.foldB[0] - g.foldA[0], g.foldB[1] - g.foldA[1]);
			if (len < 1) {
				c.opacity = "0";
			} else {
				const ang =
					(Math.atan2(g.foldB[1] - g.foldA[1], g.foldB[0] - g.foldA[0]) * 180) /
					Math.PI;
				c.opacity = String(0.25 + 0.75 * strength);
				c.width = `${len}px`;
				c.transform = `translate(${g.foldA[0]}px, ${g.foldA[1]}px) rotate(${ang}deg)`;
			}
		}
	};

	useMotionValueEvent(p, "change", applyPeel);
	useEffect(() => {
		applyPeel(p.get());
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase, index]);

	const releaseTransition = () =>
		reduceMotion
			? ({ type: "tween", duration: 0.01 } as const)
			: ({ type: "spring", stiffness: 300, damping: 30 } as const);

	const finalize = (commit: boolean) => {
		if (commit) setIndex((i) => i + dirRef.current);
		setPhaseBoth("idle");
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
		setPhaseBoth(dir > 0 ? "forward" : "backward");
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
			!cancel &&
			(progress >= 0.3 || (Math.abs(pt.vel) >= 0.5 && progress >= 0.05));
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

	const peelIndex = phase === "backward" ? index - 1 : index;
	const peelDef = PAGES[peelIndex];
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
			<div className="slot">
				<PageView key={baseKey} def={baseDef} active={phase === "idle"} />
			</div>

			{/* 아직 평평하게 남아 있는 페이지 부분 (forward 진행 중) */}
			{phase === "forward" && (
				<div className="slot peel-flat" ref={flatRef}>
					<PageView key={`flat-${index}`} def={peelDef} active={false} />
				</div>
			)}

			{/* 들어 올린 종이가 아래 페이지에 드리우는 그림자 */}
			<div className="peel-shadow" ref={shadowRef} />

			{/* 접혀 넘어간 코너 (페이지 뒷면: 반사된 콘텐츠) */}
			<div className="peel-flap-wrap" ref={flapWrapRef}>
				<div className="slot peel-flap" ref={flapRef}>
					<PageView key={`flap-${peelIndex}`} def={peelDef} active={false} />
					<div className="flap-shade" ref={flapShadeRef} />
				</div>
			</div>

			{/* 접힘선 하이라이트 */}
			<div className="crease" ref={creaseRef} />

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
