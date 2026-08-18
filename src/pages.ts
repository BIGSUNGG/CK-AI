export type PageDef =
	| { type: "image"; src: string }
	| {
			type: "video";
			src: string;
			/** 소스 영상 상하에 구워진 검은 레터박스 비율(높이 대비) — 세로 맞춤 시 잘라낸다 */
			trim?: number;
	  };

const img = (n: number): PageDef => ({
	type: "image",
	src: `assets/cut-${String(n).padStart(2, "0")}.png`,
});

/** 오프닝 영상 — 페이지가 아니라 1→2 전환 연출로만 재생됨 */
// ponytail: 원본 720×1280 프레임에 720×1080 장면이 상하 100px 검은 밴드로 구워져 있음 — 에셋 고정이라 상수로 보정
export const OPENING = {
	src: "assets/opening.mp4",
	trim: 0.078125,
} as const;

/** 중간 영상 — 4→5페이지 전환 연출로만 재생됨 */
export const INTERLUDE = { src: "assets/interlude.mp4" } as const;

/** 20페이지: 0~3컷 → 4~19컷 (오프닝·인터루드는 각각 1→2·4→5 전환 연출로 재생) */
export const PAGES: PageDef[] = [
	img(0),
	img(1),
	img(2),
	img(3),
	...Array.from({ length: 16 }, (_, i) => img(4 + i)),
];

export const LAST_PAGE = PAGES.length - 1;
