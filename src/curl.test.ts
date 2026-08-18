/**
 * curl 기하 셀프체크 — 실행: node src/curl.test.ts (테스트 러너 불필요)
 */
import assert from "node:assert";
import { OVERSHOOT, contentBox, curlGeom } from "./curl.ts";

const W = 660;

// q=0: 완전히 평평 — 접촉점이 우측 끝, 감김 없음
let g = curlGeom(W, 0);
assert.ok(Math.abs(g.xc - W) < 1e-9, "q=0 접촉점");
assert.strictEqual(g.thetaMax, 0, "q=0 감김 없음");

// q=1: 종이가 화면 왼쪽으로 완전히 빠짐 (롤 우측 끝 xc+r < 0)
g = curlGeom(W, 1);
assert.ok(g.xc < 0, "q=1 접촉점이 화면 밖");
assert.ok(g.xc + g.r < 0, "q=1 롤 전체가 화면 밖");

// 접촉점은 q에 대해 단조 감소
let prev = Infinity;
for (let i = 0; i <= 20; i++) {
	const q = i / 20;
	const { xc } = curlGeom(W, q);
	assert.ok(xc <= prev, `xc 단조 감소 (q=${q})`);
	prev = xc;
}

// 반지름 곡선: 양 끝에서 최소, 중간에서 최대, 대칭
const rAt = (q: number) => curlGeom(W, q).r;
assert.ok(rAt(0.5) > rAt(0.1) && rAt(0.5) > rAt(0.9), "반지름 중간 최대");
assert.ok(Math.abs(rAt(0.2) - rAt(0.8)) < 1e-9, "반지름 대칭");
assert.ok(rAt(0) >= 0.09 * W && rAt(0) <= 0.11 * W, "R_MIN 범위");

// 감김 각도는 2π 이하로 capped
for (let i = 0; i <= 10; i++) {
	const { thetaMax } = curlGeom(W, i / 10);
	assert.ok(thetaMax <= Math.PI * 2 + 1e-9, `thetaMax cap (q=${i / 10})`);
}

// contain 박스: 소스 비율이 스테이지보다 넓으면 좌우 레터박스
const b = contentBox(1600, 900, 660, 1172);
assert.ok(Math.abs(b.w - 660) < 1e-9, "contain 너비");
assert.ok(b.h < 1172 && b.y0 > 0, "contain 세로 레터박스");
// 소스 비율이 스테이지와 같으면 가득 참
const b2 = contentBox(941, 1672, 941, 1672);
assert.ok(
	Math.abs(b2.w - 941) < 1e-9 && Math.abs(b2.h - 1672) < 1e-9,
	"contain 가득",
);

// OVERSHOOT 상수 점검 (q=1 퇴장 여유의 전제)
assert.ok(OVERSHOOT > 0.1, "OVERSHOOT ≥ 0.1이어야 q=1에서 롤이 화면 밖");

console.log("curl.test: all assertions passed");
