/**
 * 휘어지는 종이 컬 기하 + 캔버스 화가 (원통 롤링 모델).
 *
 * 페이지가 우측 가장자리에서 들리며 반지름 r인 가상 원통에 감긴다.
 * 접촉점 xc는 진행률 q(0 = 평평, 1 = 완전 넘김)가 커질수록 우→좌 이동.
 * 재료 좌표 m(0..W):
 *   - m ≤ xc : 평평하게 제자리 (앞면)
 *   - m > xc : 원통에 감김. θ = (m−xc)/r, 화면 x = xc + r·sinθ
 *     · θ ∈ (0, π)  : 접촉점 오른쪽으로 솟는 컬 (앞면 보임)
 *     · θ ∈ (π, 2π): 평평한 나머지 위로 왼쪽을 쓰는 꼬리 (뒷면 = 반사 콘텐츠)
 * θ는 2π에서 capped — 그 이상 감긴 부분은 롤 안쪽에 가려 보이지 않는다.
 */

/** 종이가 화면 밖으로 완전히 빠지도록 접촉점에 주는 여유 */
export const OVERSHOOT = 0.12;
/** 컬 반지름 (W 대비 비율): 넘김 시작/끝에서 조이고 중반에 활짝 */
const R_MIN = 0.1;
const R_MAX = 0.3;
/** 스트립 하나당 감김 각도 (라디안) — 작을수록 매끄러운 곡면 */
const D_THETA = 0.03;

/** 종이 바탕색 (style.css의 --paper와 일치해야 함) */
export const PAPER = "#f6f1e7";

export interface CurlGeom {
	/** 접촉점 x — 평평한 남은 부분 [0, xc]과 컬의 경계 */
	xc: number;
	/** 컬 반지름 */
	r: number;
	/** 감긴 부분의 총 감김 각도 (≤ 2π) */
	thetaMax: number;
}

export function curlGeom(W: number, q: number): CurlGeom {
	const qc = Math.min(Math.max(q, 0), 1);
	const xc = W - q * W * (1 + OVERSHOOT);
	const r = W * (R_MIN + (R_MAX - R_MIN) * Math.sin(Math.PI * qc));
	const thetaMax = Math.min(Math.max(W - xc, 0) / r, Math.PI * 2);
	return { xc, r, thetaMax };
}

export interface ContentBox {
	x0: number;
	y0: number;
	w: number;
	h: number;
}

/** 소스(이미지/영상 고유 크기) → 스테이지 세로 맞춤 박스 (.page-media와 동일: 높이 기준, 가로 넘침 중앙 크롭) */
export function contentBox(
	sw: number,
	sh: number,
	W: number,
	H: number,
	crop?: [number, number],
): ContentBox {
	const ch = crop ? crop[1] - crop[0] : sh;
	const ar = sw / ch;
	return { x0: (W - H * ar) / 2, y0: 0, w: H * ar, h: H };
}

export interface CurlSource {
	el: HTMLImageElement | HTMLVideoElement;
	/** 소스 고유 크기 (naturalWidth / videoWidth) */
	sw: number;
	sh: number;
	/** 세로 크롭 범위(소스 픽셀) — 구운 레터박스 절단용 */
	crop?: [number, number];
}

/**
 * 재료 슬라이스 [a, b](스테이지 x 좌표)를 목적 구간 [dx, dx+dw]에 그린다.
 * 콘텐츠 박스 밖은 종이 바탕색. flip=true면 뒷면(좌우 반사).
 */
function drawStrip(
	ctx: CanvasRenderingContext2D,
	src: CurlSource | null,
	box: ContentBox | null,
	H: number,
	a: number,
	b: number,
	dx: number,
	dw: number,
	flip: boolean,
	paper: boolean,
): void {
	if (dw < 0.05) return;
	if (paper) {
		ctx.fillStyle = PAPER;
		ctx.fillRect(dx, 0, dw, H);
	}
	if (!src || !box) return;
	const sy0 = src.crop ? src.crop[0] : 0;
	const syh = (src.crop ? src.crop[1] : src.sh) - sy0;
	const s0 = Math.max(a, box.x0);
	const s1 = Math.min(b, box.x0 + box.w);
	if (s1 <= s0) return;
	const span = b - a || 1;
	const d0 = dx + ((s0 - a) / span) * dw;
	const d1 = dx + ((s1 - a) / span) * dw;
	const sx = ((s0 - box.x0) / box.w) * src.sw;
	const sw = ((s1 - s0) / box.w) * src.sw;
	const dxa = Math.min(d0, d1);
	const dwa = Math.abs(d1 - d0);
	if (flip) {
		ctx.save();
		ctx.scale(-1, 1);
		ctx.drawImage(src.el, sx, sy0, sw, syh, -(dxa + dwa), box.y0, dwa, box.h);
		ctx.restore();
	} else {
		ctx.drawImage(src.el, sx, sy0, sw, syh, dxa, box.y0, dwa, box.h);
	}
}

/** 스트립 위에 휘어짐 음영 + 접힘(θ≈π) 하이라이트 */
function shadeStrip(
	ctx: CanvasRenderingContext2D,
	dx: number,
	dw: number,
	H: number,
	tm: number,
	back: boolean,
): void {
	const dark = back
		? 0.42 - 0.28 * ((tm - Math.PI) / Math.PI) // 뒷면: 접힘 근처에서 짙다가 끝으로 옅어짐
		: 0.3 * Math.sin(tm); // 앞면: 컬 꼭대기(θ→π) 쪽으로 어두워짐
	if (dark > 0.003) {
		ctx.fillStyle = `rgba(15,10,5,${dark.toFixed(3)})`;
		ctx.fillRect(dx, 0, dw, H);
	}
	const dFold = Math.abs(tm - Math.PI);
	if (dFold < 0.4) {
		ctx.fillStyle = `rgba(255,255,255,${(0.16 * (1 - dFold / 0.4)).toFixed(3)})`;
		ctx.fillRect(dx, 0, dw, H);
	}
}

/**
 * 진행률 q로 컬 상태를 캔버스에 그린다.
 * W×H는 스테이지 CSS 픽셀 크기 (dpr 변환은 호출 측이 ctx에 설정).
 */
export function drawCurl(
	ctx: CanvasRenderingContext2D,
	W: number,
	H: number,
	q: number,
	src: CurlSource | null,
): void {
	const qc = Math.min(Math.max(q, 0), 1);
	const { xc, r, thetaMax } = curlGeom(W, q);
	const box =
		src && src.sw > 0 && src.sh > 0
			? contentBox(src.sw, src.sh, W, H, src.crop)
			: null;
	ctx.clearRect(0, 0, W, H);

	// 1) 롤이 아래 페이지·평평한 남은 부분에 드리우는 그림자
	const strength = Math.sin(Math.PI * qc);
	if (strength > 0.02) {
		let g = ctx.createLinearGradient(xc, 0, xc + 1.6 * r, 0);
		g.addColorStop(0, `rgba(0,0,0,${(0.42 * strength).toFixed(3)})`);
		g.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = g;
		ctx.fillRect(xc, 0, 1.6 * r, H);
		g = ctx.createLinearGradient(xc, 0, xc - 1.1 * r, 0);
		g.addColorStop(0, `rgba(0,0,0,${(0.3 * strength).toFixed(3)})`);
		g.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = g;
		ctx.fillRect(xc - 1.1 * r, 0, 1.1 * r, H);
	}

	// 2) 아직 평평하게 남은 부분 [0, xc]
	const flatW = Math.min(xc, W);
	if (flatW > 0) drawStrip(ctx, src, box, H, 0, flatW, 0, flatW, false, true);

	// 3) 감긴 부분: 스트립 데스트 범위 합집합에 종이 바탕 1회 칠하기
	//    (스트립별 바탕 칠은 겹침 확장부 때문에 이웃 콘텐츠 위에 솔기를 남긴다)
	const xRight = xc + r * Math.sin(Math.min(thetaMax, Math.PI / 2));
	const xLeft =
		xc + r * (thetaMax >= 1.5 * Math.PI ? -1 : Math.min(0, Math.sin(thetaMax)));
	if (xRight > xLeft) {
		ctx.fillStyle = PAPER;
		ctx.fillRect(xLeft, 0, xRight - xLeft, H);
	}
	// 3) 감긴 부분: 재료 공간 스트립 순회 (감김 각도 오름차순 = 화가 순서)
	const mStart = Math.max(xc, 0);
	const mEnd = Math.min(xc + r * thetaMax, W);
	const dm = r * D_THETA;
	for (let m = mStart; m < mEnd - 1e-3; m += dm) {
		const ma = m;
		const mb = Math.min(m + dm, mEnd);
		const ta = (ma - xc) / r;
		const tb = (mb - xc) / r;
		const tm = (ta + tb) / 2;
		const xa = xc + r * Math.sin(ta);
		const xb = xc + r * Math.sin(tb);
		// 서브픽셀 겹침(0.8px)으로 스트립 사이 안티앨리어싱 솔기 제거
		const dx = Math.min(xa, xb) - 0.4;
		const dw = Math.abs(xb - xa) + 0.8;
		const back = tm > Math.PI;
		drawStrip(ctx, src, box, H, ma, mb, dx, dw, back, false);
		shadeStrip(ctx, dx, dw, H, tm, back);
	}
}
