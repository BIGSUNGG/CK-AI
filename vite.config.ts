import { cpSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** assets/는 import하지 않는 정적 파일이라 빌드 후 dist에 직접 복사 */
function copyAssets(): Plugin {
	return {
		name: "copy-assets",
		closeBundle() {
			cpSync("assets", "dist/assets", { recursive: true });
		},
	};
}

// GitHub Pages 프로젝트 사이트 서브경로(/repo-name/) 호환을 위한 상대 경로 base
export default defineConfig({
	plugins: [react(), copyAssets()],
	base: "./",
});
