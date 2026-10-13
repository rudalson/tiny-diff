# 🚀 TinyDiff (Rust + Tauri v2 + React + TypeScript)

Beyond Compare에서 영감을 받은 초고속 프리미엄 데스크톱 폴더 및 텍스트 파일 비교/동기화 도구입니다.

기존 Electron 기반 프로토타입에서 검증된 모든 UI/UX 기능, 색상 규칙, 단축키 및 디테일을 100% 보존하면서, 백엔드 파일 시스템 I/O와 Diff 알고리즘을 **Rust 네이티브 코드로 구현하여 극한의 성능**을 달성했습니다.

---

## 🛠️ 기술 스택 (Tech Stack)

- **Core & Backend**:
  - **Rust** (Edition 2021)
  - **Tauri v2** (`tauri`, `tauri-plugin-dialog`, `tauri-plugin-opener`)
  - **similar** (초고속 네이티브 Myers Diff 알고리즘)
  - **filetime** (파일 복사 시 원본 atime / mtime 타임스탬프 완벽 보존)
  - **walkdir** (빠르고 안전한 재귀 디렉터리 탐색)
  - **rayon** (병렬 처리 지원)
  - **Windows 네이티브 숨김 속성 감지**: `std::os::windows::fs::MetadataExt` (`FILE_ATTRIBUTE_HIDDEN`, `FILE_ATTRIBUTE_SYSTEM`)
- **Frontend**:
  - **React** + **TypeScript** + **Vite**
  - **lucide-react** (모던 벡터 아이콘)
  - **CSS Variables & Glassmorphism** (프리미엄 다크 테마 시스템)

---

## 💡 주요 기능 (Key Features)

### 1. 멀티 탭 & 상태 보존 (Multi-Tab Architecture)
- 좌측 상단 로고 클릭 시 Home 화면 전환.
- 탭 전환 시 컴포넌트를 언마운트하지 않고 `display: block / none` 토글 방식을 적용하여 폴더 트리의 펼침 상태, 스크롤 위치, 편집 내용 완벽 보존.
- 선택한 대상에 따른 탭 타이틀 실시간 업데이트 (`FC: {folder}`, `Left ↔ Right`, `TC: {file}`).

### 2. 폴더 비교 & 동기화 (Folder Compare)
- **독립 경로 캐싱**: 좌/우 최근 10개 경로를 `localStorage`에 각각 저장하여 `<datalist>` 자동완성 지원.
- **계층형 디렉터리 우선 정렬 (Directory-First)**: 동일 계층에서 디렉터리가 파일보다 항상 상단에 위치.
- **2초(2000ms) 타임스탬프 오차 허용**: 파일 복사 후 파일시스템 정밀도 차이에 따른 불필요한 차이 판정 방지.
- **Beyond Compare 스타일 색상 규칙**:
  - 선택된 행 외 배경색은 항상 투명 유지.
  - **빨간색 (`#ef4444`)**: 수정일시가 더 최신이거나 크기가 다른 파일 및 상위 폴더.
  - **파란색 (`#60a5fa`)**: 한쪽에만 존재하는 고아(Orphan) 파일 및 상위 폴더.
  - **회색 (`#9ca3af`)**: 수정일시가 오래된 파일 또는 동일/일반 폴더.
- **필터링 & 계층 보존**: `All`, `Differences`, `Identical`, `Left Only`, `Right Only` 필터링 시 조건에 맞는 파일의 조상 폴더들을 보존하여 트리 구조 유지.
- **숨김 파일 감지 및 토글**: Dotfiles(`.git`), 시스템 파일(`desktop.ini`), OS 숨김/시스템 속성 감지 및 툴바 토글 지원.
- **중앙 Sync 컬럼 & 컬럼 리사이저**: 54px 고정 Sync 컬럼, Size/Modified 컬럼 드래그 리사이즈 및 더블클릭 초기화.
- **다중 선택, 벌크 액션, 우클릭 메뉴 & 삭제 모달**: Ctrl/Shift 다중 선택 시 벌크 액션 바 표시, 커스텀 컨텍스트 메뉴, 확인 모달.
- **단축키**: `F5` / `Ctrl+R` (새로고침), `Ctrl+A` (전체 선택), `Delete` (삭제 모달), `Enter` (삭제 실행), `Esc` (모달 닫기 / 선택 해제).

### 3. 텍스트 비교 & 인라인 편집/병합 (Text Compare)
- **Rust Myers Diff 엔진**: 비 UTF-8 손실 없는 복구(`String::from_utf8_lossy`), 대용량 파일 밀리초 단위 Diff.
- **Modified 페어링**: 연속된 삭제와 추가를 1:1 매칭하여 `modified` 행으로 처리.
- **5컬럼 22px 고정 높이 레이아웃**:
  - `[Left Line Numbers (45px) | Left Editor | Merge Buttons (46px) | Right Line Numbers (45px) | Right Editor]`
  - 모든 라인 셀의 높이를 `22px`로 엄격히 고정하고 스크롤을 100% 실시간 동기화.
- **가로형 병합 버튼 (`<` `>`)**: 중앙 컬럼에 18x18px 버튼을 가로 한 줄로 배치하여 클릭 즉시 양방향 병합.
- **Diff Only 타이트 뷰**: 변경된 라인만 표시하고, 생략된 동일 라인 구간에는 점선 구분선(`··· N unchanged lines omitted ···`) 표시.
- **인라인 실시간 편집 & 단축키 저장**: 각 행 직접 편집 가능, `Ctrl+S`로 양쪽 파일 일괄 저장.

### 4. 하단 플로팅 캡슐 토스트 (Floating Capsule Toast)
- 화면 하단 중앙에 복사 진행 상태(인디고 글로우, 회전 애니메이션) 및 완료 메시지(에메랄드 글로우)를 플로팅 캡슐 배지로 표시.

---

## 🚀 실행 및 빌드 방법 (Getting Started)

### 개발 모드 실행
```bash
npm run tauri dev
```

### 프론트엔드 빌드 검증
```bash
npm run build
```

### Rust 백엔드 빌드 검증
```bash
cd src-tauri
cargo check
cargo build
```

### 최종 데스크톱 배포 패키징
```bash
npm run tauri build
```
