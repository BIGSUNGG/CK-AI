export type PageDef =
  | { type: "image"; src: string }
  | { type: "video"; src: string };

const img = (n: number): PageDef => ({
  type: "image",
  src: `assets/cut-${String(n).padStart(2, "0")}.png`,
});

/** 22페이지: 오프닝 영상 → 0~3컷 → 중간 영상(3-1) → 4~19컷 */
export const PAGES: PageDef[] = [
  { type: "video", src: "assets/opening.mp4" },
  img(0),
  img(1),
  img(2),
  img(3),
  { type: "video", src: "assets/interlude.mp4" },
  ...Array.from({ length: 16 }, (_, i) => img(4 + i)),
];

export const LAST_PAGE = PAGES.length - 1;
