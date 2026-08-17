# 만화 뷰어

세로 비율 전용 만화 뷰어. 스크롤 대신 화면을 **아래로 드래그하면 책장이 넘어가는 3D 플립** 연출로 다음 컷을 봅니다.

- React 19 + Vite 7 + TypeScript, 플립 연출은 motion(motion/react)
- 총 22페이지: 오프닝 영상 → 0~3컷 → 중간 영상(3-1) → 4~19컷
- 드래그/스와이프·마우스 휠·키보드(↓/↑, Space, PageUp/Down) 지원
- 마지막 컷에서 "다시 보기" 버튼 제공

기획 상세는 [SPEC.md](./SPEC.md) 참고.

## 로컬 실행

```bash
npm install
npm run dev        # 개발 서버 (기본 http://localhost:5173)
```

프로덕션 빌드 미리보기:

```bash
npm run build
npm run preview
```

## GitHub Pages 배포

push 시 GitHub Actions가 `npm ci && npm run build` 후 `dist/`를 Pages에 배포합니다
(`.github/workflows/deploy.yml`). 절차:

1. GitHub에 저장소를 만들고 이 폴더를 push합니다.

   ```bash
   gh auth login                     # 최초 1회
   gh repo create <저장소명> --public --source=. --push
   ```

   (또는 GitHub에서 저장소를 직접 만든 뒤 `git remote add origin … && git push -u origin main`)

2. GitHub 저장소 **Settings → Pages → Build and deployment → Source**를
   **GitHub Actions**로 선택합니다.

3. push가 끝나면 Actions 탭에서 배포 워크플로가 완료되고,
   `https://<사용자명>.github.io/<저장소명>/` 에서 열립니다.

vite `base: './'`(상대 경로)라 프로젝트 사이트 서브경로(`/repo-name/`)에서도 그대로 동작합니다.

## 구조

```text
src/main.tsx          엔트리
src/App.tsx           플립 북 (드래그 제스처·영상·HUD)
src/pages.ts          22페이지 시퀀스 정의
src/style.css         세로 스테이지·HUD 스타일
assets/               컷 20개(cut-00~19.png) + 영상 2개(opening/interlude.mp4)
vite.config.ts        base './' + 빌드 시 assets 복사 플러그인
SPEC.md               기획 문서
```
