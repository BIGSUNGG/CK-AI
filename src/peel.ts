export interface PeelGeom {
	/** 아직 평평하게 남아 있는 부분(접힘선의 좌상단 쪽) clip-path */
	flatPoly: string;
	/** 벗겨진 코너 부분(접힘선의 우하단 쪽, 변환 전 로컬 좌표) clip-path */
	cornerPoly: string;
	/** 접힘선 기준 반사 행렬: CSS matrix() — 코너 부분이 뒤집혀 얹히는 변환 */
	matrix: string;
	/** 접힘선이 페이지 가장자리와 만나는 교점(현) */
	foldA: [number, number];
	foldB: [number, number];
}

const poly = (pts: [number, number][]) =>
	pts.length >= 3
		? `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(", ")})`
		: "polygon(0px 0px, 0px 0px, 0px 0px)";

/**
 * 우측 하단 코너를 좌측 상단 방향으로 들어 올리는 코너 필 기하.
 * t = 접힘선이 대각선을 따라 이동한 거리 (0 = 평평, ≥ 대각선 길이 = 완전히 벗겨짐).
 * 평평한 부분은 접힘선의 좌상단 쪽 반평면, 벗겨진 코너는 반대쪽을
 * 접힘선으로 반사해 접힌 종이(페이지 뒷면)를 만든다.
 */
export function peelGeometry(W: number, H: number, t: number): PeelGeom {
	const L = Math.hypot(W, H);
	// u: 우측 하단에서 좌측 상단으로 가는 단위 벡터 (접힘선 이동 방향)
	const ux = -W / L;
	const uy = -H / L;
	// F: 접힘선 위의 점 (대각선 위를 이동)
	const fx = W + t * ux;
	const fy = H + t * uy;
	const dot = (x: number, y: number) => (x - fx) * ux + (y - fy) * uy;

	const rect: [number, number][] = [
		[0, 0],
		[W, 0],
		[W, H],
		[0, H],
	];
	// 사각형을 반평면으로 클리핑 (Sutherland–Hodgman). side=1: 좌상단 쪽, -1: 코너 쪽
	const clipHalf = (side: 1 | -1) => {
		const out: [number, number][] = [];
		for (let i = 0; i < rect.length; i++) {
			const a = rect[i];
			const b = rect[(i + 1) % rect.length];
			const da = dot(a[0], a[1]) * side;
			const db = dot(b[0], b[1]) * side;
			if (da >= 0) out.push(a);
			if (da >= 0 !== db >= 0) {
				const k = da / (da - db);
				out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
			}
		}
		return out;
	};

	const flat = clipHalf(1);
	const corner = clipHalf(-1);

	// 접힘선 기준 반사: R(X) = X − 2·((X−F)·u)·u
	const fu = fx * ux + fy * uy;
	const a = 1 - 2 * ux * ux;
	const bc = -2 * ux * uy;
	const d = 1 - 2 * uy * uy;
	const e = 2 * fu * ux;
	const f = 2 * fu * uy;

	// 접힘선 현: 사각형 변과의 교점
	const chord: [number, number][] = [];
	for (let i = 0; i < rect.length; i++) {
		const A = rect[i];
		const B = rect[(i + 1) % rect.length];
		const da = dot(A[0], A[1]);
		const db = dot(B[0], B[1]);
		if (da >= 0 !== db >= 0) {
			const k = da / (da - db);
			chord.push([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k]);
		}
	}

	return {
		flatPoly: poly(flat),
		cornerPoly: poly(corner),
		matrix: `matrix(${a}, ${bc}, ${bc}, ${d}, ${e}, ${f})`,
		foldA: chord[0] ?? [fx, fy],
		foldB: chord[1] ?? chord[0] ?? [fx, fy],
	};
}
