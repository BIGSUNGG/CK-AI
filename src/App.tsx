import { useEffect, useRef, useState } from "react";
import {
	animate,
	useMotionValue,
	useMotionValueEvent,
	useReducedMotion,
} from "motion/react";
import { LAST_PAGE, INTERLUDE, OPENING, PAGES, type PageDef } from "./pages";
import { drawCurl, type CurlSource } from "./curl.ts";

type VideoDef = { src: string; trim?: number };
type FadeStyle = "paper" | "black";

/** 전환 영상 재생 시작 후 페이드 시작까지 유지 시간(ms) */
const OPENING_HOLD_MS = 1500;
const INTERLUDE_HOLD_MS = 2500;
/** 페이드 아웃·인 각각의 길이(ms) — 아웃 후 인 순서로 총 2×FADE_MS */
const FADE_MS = 500;

/* ---------- 단일 페이지 렌더 ---------- */

function PageView({
	def,
	active,
	onVideo,
}: {
	def: PageDef;
	active: boolean;
	onVideo?: (el: HTMLVideoElement | null) => void;
}) {
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
						ref={(el) => {
							videoRef.current = el;
							onVideo?.(el);
						}}
						className="page-media"
						src={def.src}
						playsInline
						preload="auto"
						style={
							def.trim
								? {
										height: `${100 / (1 - 2 * def.trim)}%`,
										top: "50%",
										left: "50%",
										transform: "translate(-50%, -50%)",
									}
								: undefined
						}
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
	x0: number;
	lastX: number;
	lastT: number;
	vel: number;
	started: boolean;
}

export default function App() {
	const [index, setIndex] = useState(0);
	const [phase, setPhase] = useState<Phase>("idle");
	/** 페이드 전환 상태 */
	const [fade, setFade] = useState<"none" | "out" | "in">("none");
	/** 전환 연출 영상 오버레이 (1→2 오프닝, 4→5 인터루드) */
	const [overlayVideo, setOverlayVideo] = useState<VideoDef | null>(null);
	/** 페이드 색: 1↔2 종이, 4↔5 검정 */
	const [fadeStyle, setFadeStyle] = useState<FadeStyle | null>(null);
	const phaseRef = useRef<Phase>("idle");
	const busyRef = useRef(false); // 페이드·영상 전환 중 입력 차단
	const openingArmed = useRef(false);
	const openingSafety = useRef(0);
	const videoTargetRef = useRef(1);
	const videoHoldRef = useRef(OPENING_HOLD_MS);
	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const pointerRef = useRef<PointerState | null>(null);
	const dirRef = useRef<1 | -1>(1);
	const animatingRef = useRef(false);
	/** 넘기는 페이지의 콘텐츠 소스 (캔버스 drawImage용) */
	const videoEls = useRef(new Map<number, HTMLVideoElement>());
	const imgCache = useRef(new Map<string, HTMLImageElement>());
	const reduceMotion = useReducedMotion();

	const setPhaseBoth = (ph: Phase) => {
		phaseRef.current = ph;
		setPhase(ph);
	};

	// 드래그 진행률 0~1 — 스프링/확정 애니메이션도 이 값을 따라간다
	const p = useMotionValue(0);

	const ensureImage = (src: string): HTMLImageElement => {
		let im = imgCache.current.get(src);
		if (!im) {
			im = new Image();
			im.src = src;
			imgCache.current.set(src, im);
		}
		return im;
	};

	/** 진행률 → 컬 기하 → 매 프레임 캔버스에 렌더 */
	const applyCurl = (progress: number) => {
		const stage = stageRef.current;
		const canvas = canvasRef.current;
		if (!stage || !canvas || phaseRef.current === "idle") return;
		const W = stage.clientWidth;
		const H = stage.clientHeight;
		const dpr = window.devicePixelRatio || 1;
		if (
			canvas.width !== Math.round(W * dpr) ||
			canvas.height !== Math.round(H * dpr)
		) {
			canvas.width = Math.round(W * dpr);
			canvas.height = Math.round(H * dpr);
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const ph = phaseRef.current;
		const flipIndex = ph === "backward" ? index - 1 : index;
		const def = PAGES[flipIndex];
		let src: CurlSource | null = null;
		if (def.type === "image") {
			const im = ensureImage(def.src);
			if (im.complete && im.naturalWidth > 0)
				src = { el: im, sw: im.naturalWidth, sh: im.naturalHeight };
		} else {
			const v = videoEls.current.get(flipIndex);
			if (v && v.videoWidth > 0)
				src = {
					el: v,
					sw: v.videoWidth,
					sh: v.videoHeight,
					crop: def.trim
						? [def.trim * v.videoHeight, (1 - def.trim) * v.videoHeight]
						: undefined,
				};
		}
		drawCurl(ctx, W, H, ph === "backward" ? 1 - progress : progress, src);
	};

	useMotionValueEvent(p, "change", applyCurl);
	useEffect(() => {
		if (phase !== "idle") applyCurl(p.get());
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

	/* ---------- 1↔2 페이지: 페이드 전환 (컬 대신) ---------- */

	/** 페이드 아웃 → 페이지 교체 → 페이드 인 후 잠금 해제 */
	const fadeSwap = (target: number, afterOut?: () => void) => {
		setFade("out");
		window.setTimeout(() => {
			afterOut?.();
			setIndex(target);
			setFade("in");
			window.setTimeout(() => {
				setFade("none");
				setFadeStyle(null);
				busyRef.current = false;
			}, FADE_MS);
		}, FADE_MS);
	};

	const onOverlayPlay = () => {
		if (openingArmed.current) return;
		openingArmed.current = true;
		clearTimeout(openingSafety.current);
		const target = videoTargetRef.current;
		window.setTimeout(
			() => fadeSwap(target, () => setOverlayVideo(null)),
			videoHoldRef.current,
		);
	};

	const startVideo = (
		video: VideoDef,
		target: number,
		style: FadeStyle,
		holdMs: number,
	) => {
		clearTimeout(openingSafety.current);
		busyRef.current = true;
		openingArmed.current = false;
		videoTargetRef.current = target;
		videoHoldRef.current = holdMs;
		setFadeStyle(style);
		setOverlayVideo(video);
		// 안전망: autoplay가 막혀 onPlay가 안 와도 3초 뒤에는 전환 진행
		openingSafety.current = window.setTimeout(onOverlayPlay, 3000);
	};

	const fadeTo = (target: number, style: FadeStyle) => {
		busyRef.current = true;
		setFadeStyle(style);
		fadeSwap(target);
	};

	const beginFlip = (dir: 1 | -1): boolean => {
		if (busyRef.current || animatingRef.current) return false;
		// 1↔2·4↔5 페이지는 컬 대신 페이드 (정방향은 전환 영상 재생 후, 4↔5는 검정)
		if (dir > 0 && index === 0) {
			startVideo(OPENING, 1, "paper", OPENING_HOLD_MS);
			return false;
		}
		if (dir < 0 && index === 1) {
			fadeTo(0, "paper");
			return false;
		}
		if (dir > 0 && index === 3) {
			startVideo(INTERLUDE, 4, "black", INTERLUDE_HOLD_MS);
			return false;
		}
		if (dir < 0 && index === 4) {
			fadeTo(3, "black");
			return false;
		}
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

	/* ---------- 포인터 드래그 (좌우) ---------- */

	const onPointerDown = (e: React.PointerEvent) => {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		stageRef.current?.setPointerCapture(e.pointerId);
		pointerRef.current = {
			id: e.pointerId,
			x0: e.clientX,
			lastX: e.clientX,
			lastT: performance.now(),
			vel: 0,
			started: false,
		};
	};

	const onPointerMove = (e: React.PointerEvent) => {
		const pt = pointerRef.current;
		if (!pt || e.pointerId !== pt.id) return;
		const dx = e.clientX - pt.x0;
		const now = performance.now();
		pt.vel = (e.clientX - pt.lastX) / Math.max(now - pt.lastT, 1);
		pt.lastX = e.clientX;
		pt.lastT = now;

		if (!pt.started) {
			if (Math.abs(dx) < 8) return; // 움직임 감지 임계값(슬롭)
			// 좌(−)로 드래그 = 다음 페이지, 우(+)로 드래그 = 이전 페이지
			if (!beginFlip(dx < 0 ? 1 : -1)) {
				pointerRef.current = null;
				return;
			}
			pt.started = true;
		}
		const w = stageRef.current?.clientWidth ?? 1;
		p.set(Math.min(Math.max(Math.abs(dx) / (w * 0.5), 0), 1));
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
		for (const j of [index, index + 1, index + 2, index - 1]) {
			const def = PAGES[j];
			if (def?.type === "image") ensureImage(def.src);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [index]);

	/* ---------- 렌더 ---------- */

	const flipIndex = phase === "backward" ? index - 1 : index;
	const flipDef = PAGES[flipIndex];
	const baseDef = phase === "forward" ? PAGES[index + 1] : PAGES[index];
	const baseKey = phase === "forward" ? index + 1 : index;
	const fadeCls =
		fade === "out" ? " fade-out" : fade === "in" ? " fade-in" : "";

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
			<div className={`slot${fadeCls}`}>
				{/* 영상 첫 프레임 전까지 현재 페이지 유지(마운트 깜빡임 방지),
					페이드아웃부터 비움(떠나온 페이지 비치기 방지) */}
				{(!overlayVideo || fade === "none") && (
					<PageView key={baseKey} def={baseDef} active={phase === "idle"} />
				)}
			</div>

			{/* 넘기는 페이지: 넘김 중에는 숨기고 캔버스가 그린다 */}
			{phase !== "idle" && (
				<div className="slot flipper-offscreen">
					<PageView
						key={`flip-${flipIndex}`}
						def={flipDef}
						active={false}
						onVideo={(el) => {
							if (el) videoEls.current.set(flipIndex, el);
							else videoEls.current.delete(flipIndex);
						}}
					/>
				</div>
			)}

			<canvas className="curl-canvas" ref={canvasRef} aria-hidden="true" />

			{/* 전환 연출: 영상 오버레이 (무음, 1.5초 후 페이드) */}
			{overlayVideo && (
				<div className={`slot opening${fadeCls}`}>
					<video
						className="page-media"
						src={overlayVideo.src}
						autoPlay
						muted
						playsInline
						preload="auto"
						onPlay={onOverlayPlay}
						style={
							overlayVideo.trim
								? {
										height: `${100 / (1 - 2 * overlayVideo.trim)}%`,
										top: "50%",
										left: "50%",
										transform: "translate(-50%, -50%)",
									}
								: undefined
						}
					/>
				</div>
			)}

			{/* 검정 페이드 커튼 (4↔5) */}
			{fadeStyle === "black" && <div className={`curtain${fadeCls}`} />}

			<div className="gutter" />

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
