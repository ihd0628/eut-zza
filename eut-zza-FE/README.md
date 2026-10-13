# Eut-zza Frontend — 아키텍처와 실행 흐름

현재 구현된 프론트엔드의 책임 분리와 데이터 흐름을 설명합니다. 제품 소개와 전체 실행 환경은 [루트 README](../README.md), 개발·학습 계획은 [로드맵](../road-map.md)을 참고합니다.

## 1. 핵심 설계: React UI와 게임 엔진 분리

일반적인 화면 상태는 React가 관리하지만, 매 프레임 변하는 노트 위치를 React state에 저장하지 않습니다. 게임 진행은 React에 의존하지 않는 TypeScript 클래스들이 담당합니다.

```text
React Router / TanStack Query
    │ 화면 이동, 서버 데이터, 경기 생성·결과 저장
    ▼
SoloGame / MultiplayerGamePage
    │ 모드별 시작 조건, 결과 처리, 상대방 점수 패널
    ▼
GameCanvas                         ← React와 게임 엔진의 연결 지점
    │ canvas DOM, GameEngine ref, 생명주기
    ▼
GameEngine
    ├── GameLoop                   requestAnimationFrame 예약·취소
    ├── AudioManager               음원 준비·재생·게임 기준 시간
    ├── InputManager               키보드 이벤트 수집
    ├── Judgment                   판정 후보 탐색·판정 규칙
    └── CanvasRenderer             현재 시간으로 노트 위치 계산·그리기
    │
    └── onProgress / onJudgment / onComplete
            └── React HUD·효과 갱신 / 네트워크 전송 / 결과 화면
```

이 구조는 React 렌더 횟수와 게임 시간·노트 이동을 분리하고, 솔로와 멀티플레이에서 같은 엔진을 재사용하기 위한 것입니다. 엔진은 React state나 HTTP API를 알지 못하며, 화면은 엔진 내부 상태를 직접 수정하지 않고 콜백으로 결과를 받습니다.

**React와 분리했다는 것은 별도 스레드에서 실행한다는 뜻이 아닙니다.** React, 키 입력 처리, rAF 콜백과 Canvas 그리기는 현재 모두 메인 스레드를 사용합니다. 무거운 동기 작업이 실행되면 노트 화면과 입력 처리가 지연될 수 있습니다. Web Worker나 OffscreenCanvas는 사용하지 않습니다.

## 2. 디렉터리와 상태 소유권

| 위치 | 책임 |
| --- | --- |
| [src/main.tsx](src/main.tsx) | StrictMode, QueryClientProvider, RouterProvider 구성 |
| [src/App.tsx](src/App.tsx) | URL과 화면·중첩 레이아웃 연결 |
| [src/pages](src/pages) | URL 파라미터, 서버 조회, 모드별 화면 흐름 조정 |
| [src/components](src/components) | 인증·선택·기록 UI와 게임 연결 컴포넌트 |
| [src/game](src/game) | React에 의존하지 않는 게임 엔진과 브라우저 API 어댑터 |
| [src/api](src/api) | HTTP 요청, 응답 타입, API별 함수 |
| [src/query](src/query) | 공유 QueryClient와 Query Key |
| [src/constants.ts](src/constants.ts) | 현재 플레이에 사용하는 샘플 노트 |
| [src/experiments](src/experiments) | 타이머·이벤트 루프 등 학습 실험 |
| [docs](docs) | 주차별 학습 기록 |

상태도 성격에 따라 나눕니다.

| 상태 | 보관 위치 | 이유 |
| --- | --- | --- |
| 사용자, 곡, 기록, 방 스냅샷 | TanStack Query | 서버에서 조회·갱신하는 데이터 |
| 시작·저장 상태, 오류, HUD, 판정 표시 | React state | 변경 시 UI 갱신 필요 |
| Canvas DOM, 엔진, 소켓, 타이머 ID | React ref 또는 Effect 내부 변수 | 렌더 간 자원을 유지하고 명시적으로 정리 |
| 처리된 노트, 점수·콤보, 탐색 커서 | GameEngine 필드 | 게임 규칙의 원본 상태 |
| AudioContext, 음원 버퍼, 재생 시작 시각 | AudioManager 필드 | 오디오 자원과 시간 기준 |

현재 별도 Zustand 스토어는 없습니다. React HUD의 점수는 엔진이 콜백으로 전달한 표시용 복사본입니다. `useRef`는 렌더 간 인스턴스를 유지할 뿐, 새로고침·언마운트 이후까지 보존하지 않습니다.

## 3. 게임 엔진 내부

### GameEngine: 모듈 연결과 게임 진행의 조정자

[GameEngine.ts](src/game/GameEngine.ts)는 노트를 복사·시간순 정렬하고 레인별 배열을 구성합니다. 루프와 입력 콜백을 연결하고 판정 결과, 점수, 콤보, 완료 여부를 관리합니다.

- `prepare()`: 음원을 준비합니다. 루프와 입력은 아직 시작하지 않습니다.
- `start(delayMs)`: 오디오 재생을 예약하고 입력 리스너와 rAF 루프를 시작합니다. 지연 시작이라도 루프와 입력은 즉시 붙으며, 예약 시각 전의 게임 시간은 음수일 수 있습니다.
- `stop()`: 루프와 입력만 중단합니다. **음원 종료나 일시 정지 기능이 아닙니다.**
- `dispose()`: `stop()` 이후 AudioContext까지 닫습니다.
- 모든 노트의 판정이 끝나면 완료 플래그를 세우고 루프·입력을 중단한 뒤 `onComplete(result)`를 한 번 전달합니다.

엔진 한 개는 한 번의 플레이를 위한 객체입니다. 재시작 시 점수와 커서를 초기화해 재사용하는 구조가 아니라 새 인스턴스를 생성합니다.

### GameLoop와 AudioManager: 화면 갱신 주기와 게임 시계는 다르다

[GameLoop.ts](src/game/GameLoop.ts)는 rAF의 `timestamp`, `deltaTime`을 계산해 콜백에 전달합니다. 하지만 현재 GameEngine은 이 값을 게임 시간으로 사용하지 않고, [AudioManager.ts](src/game/AudioManager.ts)가 제공하는 시간을 사용합니다.

```ts
currentTimeMs = (audioContext.currentTime - startedAtSeconds) * 1000;
```

```text
rAF 콜백
→ 오디오 기준 현재 시간 조회
→ 기한이 지난 미판정 노트를 MISS 처리
→ 게임 완료 여부 확인
→ 화면 범위의 미판정 노트 수집
→ CanvasRenderer.render(notes, currentTimeMs)
→ 다음 rAF 예약
```

프레임이 누락되어도 다음 프레임은 현재 오디오 시간에 맞는 위치를 그립니다. `y += speed`처럼 프레임 수에 비례해 이동시키지 않습니다. 이는 프레임 드롭 후 노트 위치가 음악을 따라잡게 하는 설계이지, 메인 스레드가 멈춘 동안 입력까지 정확히 처리한다는 보장은 아닙니다.

### InputManager와 Judgment: 입력 수집과 판정 분리

[InputManager.ts](src/game/InputManager.ts)는 `KeyboardEvent.code`의 `KeyD`, `KeyF`, `KeyJ`, `KeyK`를 게임 키로 변환합니다. 키를 길게 눌러 발생하는 반복 keydown은 제외하고, attach/detach로 리스너 생명주기를 관리합니다.

판정은 keydown에만 반응합니다. 입력 이벤트에 `performance.now()`도 기록하지만 엔진은 **입력 콜백 처리 시 오디오 시간을 다시 읽어** 노트 시간과 비교합니다. 서로 다른 시간 기준을 직접 섞지 않기 위해서입니다.

[Judgment.ts](src/game/Judgment.ts)는 해당 레인의 ±120ms 범위를 이진 탐색과 범위 순회로 확인해 가장 가까운 미판정 노트를 선택합니다.

| 시간 오차의 절댓값 | 판정 | 점수 |
| --- | --- | --- |
| 30ms 이하 | PERFECT | 1,000 |
| 30ms 초과, 70ms 이하 | GREAT | 700 |
| 70ms 초과, 120ms 이하 | GOOD | 300 |
| 미판정 노트의 예정 시각을 120ms 초과 | 자동 MISS | 0, 콤보 초기화 |

범위 안에 노트가 없는 키 입력 자체는 MISS로 기록하지 않습니다. `judgedNoteIds`로 같은 노트의 중복 판정을 막습니다.

### 노트 탐색 최적화

전체 노트를 매 프레임 `filter()`로 순회하지 않도록 범위를 줄였습니다.

- `nextMissNoteIndex`: 이미 처리한 과거 노트 앞부분을 다시 검사하지 않습니다.
- `renderEndNoteIndex`: 아직 화면에 진입하지 않은 미래 노트를 제외합니다.
- `renderNotes.length = 0`: 동일한 배열 객체를 비우고 채워 매 프레임 새 배열 객체 생성을 피합니다.
- 입력 판정은 전체 N개가 아니라 해당 레인의 시간 범위만 탐색합니다.

렌더 후보 수를 V라고 하면 매 프레임의 후보 수집 순회는 O(V)이며, 두 커서의 전진 비용은 **곡 전체에 걸쳐 O(N)**입니다. 긴 멈춤 이후 한 프레임에 여러 노트를 건너뛸 수 있으므로 모든 프레임의 전체 작업량이 무조건 O(V)라는 뜻은 아닙니다. 배열 객체 재사용이 엔진 내부 저장공간의 재할당까지 없앤다는 보장도 없습니다.

## 4. Canvas와 React가 함께 화면을 그리는 방식

[CanvasRenderer.ts](src/game/CanvasRenderer.ts)는 배경·레인·노트·판정선·키 라벨을 그립니다. Canvas 내부 크기는 GameCanvas에서 `480 × 720`으로 지정하고 표시 크기는 CSS로 조정합니다.

```ts
noteCenterY = judgmentLineY
  - (note.hitTimeMs - currentTimeMs) * NOTE_SPEED_PX_PER_MS;
```

노트는 위치를 누적 저장하지 않습니다. 렌더러가 매번 시간으로 위치를 구하며 다음 순서로 그립니다.

```text
clear → 배경 → 레인 → 노트 → 판정선 → 키 라벨
```

Canvas는 노트를 개별 DOM 요소로 관리하지 않으므로 이전 프레임을 지우고 다시 그립니다. 뒤에 그린 것이 앞의 그림을 덮기 때문에 호출 순서가 겹침 순서입니다. 노트별 React reconciliation과 DOM 업데이트를 피할 수 있지만, Canvas가 모든 상황에서 DOM보다 빠르거나 메인 스레드 부담을 없애는 것은 아닙니다.

반면 **점수 패널과 판정 효과는 Canvas가 아니라 React DOM + CSS Modules**입니다.

- `onProgress`: 판정 발생 시 HUD 점수·콤보 갱신
- `onJudgment`: 해당 레인에 판정 텍스트와 성공 시 빛 효과 표시
- 같은 레인의 연속 판정은 이전 표시를 교체하고, 고유 ID를 React key로 사용해 CSS 애니메이션 재시작
- 650ms 후 표시 제거, MISS에는 빛 효과 없음

노트의 연속 이동은 Canvas 루프가 맡고, 사건이 발생했을 때의 UI 변경은 React가 맡습니다.

## 5. GameCanvas: React와 엔진을 연결하는 경계

[GameCanvas.tsx](src/components/GameCanvas.tsx)는 Canvas DOM과 엔진 ref를 소유합니다. 엔진을 컴포넌트 함수 본문에서 매 렌더마다 생성하지 않고, 시작할 때 생성해 `gameEngineRef`에 저장합니다.

```text
시작 버튼 / 멀티플레이 자동 시작
→ 중복 시작 검사
→ GameEngine 생성
→ Promise.all([engine.prepare(), onCreateGame()])
→ 아직 마운트되어 있고 같은 엔진인지 확인
→ engine.start(delayMs)
```

`prepare()`에서는 `AudioContext.resume()`을 요청한 후 `fetch(audioUrl) → arrayBuffer() → decodeAudioData()`로 음원을 준비합니다. public 폴더에 있다는 이유만으로 접속 시 자동 다운로드되는 것은 아닙니다. 준비한 같은 URL은 AudioManager 인스턴스 안에서 재사용합니다.

음원 준비와 경기 생성은 병렬로 기다리지만 **둘 다 성공하기 전에는 음악을 재생하지 않습니다.** 시작 실패 시 엔진을 정리하고 오류와 재시도 UI를 표시합니다.

언마운트 cleanup에서는 판정 표시 타이머를 취소하고 `engine.dispose()`로 rAF, 키 리스너, 오디오를 정리합니다. 비동기 준비 중 화면을 떠났을 때 나중에 음악이 시작되는 상황도 ref와 mounted 검사로 방지합니다.

## 6. 솔로와 멀티플레이 연결

### 솔로: 서버 경기 생성 후 플레이, 완료 시 결과 저장

[SoloGame.tsx](src/components/SoloGame.tsx)는 GameCanvas에 `onCreateGame`을 전달합니다. 생성에 성공한 경기 정보는 ref에 보관해 음원 준비 재시도 시 같은 화면에서 경기 생성을 반복하지 않습니다.

엔진 완료 콜백이 오면 결과를 React state에 먼저 보관하고 HTTP로 저장합니다. 실패 시 같은 결과로 재시도하며, 성공하면 내 기록·최고 점수 Query를 무효화하고 서버 경기 ID가 포함된 결과 URL로 이동합니다.

### 멀티플레이: RoomBoundary가 방 단위 자원 유지

[RoomBoundary.tsx](src/pages/RoomBoundary.tsx)는 대기실·플레이·결과 화면의 공통 부모입니다. 같은 방의 하위 경로를 이동하는 동안 소켓과 준비한 AudioManager를 공유합니다.

```text
HTTP로 방 조회 → WebSocket 연결
                     ├── room_updated → 방 Query 캐시 교체
                     ├── game_progress → 같은 경기의 참가자 진행 상태 갱신
                     ├── time_sync → 서버·브라우저 시계 차이 추정
                     └── room_deleted → 방 목록으로 이동

Query 캐시 변경 → RoomBoundary 재렌더 → Outlet context → 하위 화면
```

`Outlet context`가 소켓 메시지를 직접 전송하는 채널인 것은 아닙니다. 방 데이터와 조작 함수를 하위 화면에 전달하는 React 경계이며, 소켓 수신 결과가 Query 캐시에 반영되어 화면에 전파됩니다.

### 음원 준비와 동시 시작

[RoomLobbyPage.tsx](src/pages/RoomLobbyPage.tsx)는 음원 다운로드·디코딩 완료를 서버에 알린 후 준비 상태를 변경합니다. 사용자의 준비 의사와 실제 음원 준비 여부는 별개이며, 채보가 바뀌면 새 채보의 음원 준비도 확인합니다.

현재 시계 보정은 소켓 연결 후 3개 표본을 보내고 가장 짧은 왕복 시간의 표본을 선택하는 간단한 방식입니다.

```text
clockOffsetMs = serverTimeMs - (clientSentAtMs + clientReceivedAtMs) / 2
startAtClientMs = startAtServerMs - clockOffsetMs
delayMs = startAtClientMs - Date.now()
```

[MultiplayerGamePage.tsx](src/pages/MultiplayerGamePage.tsx)는 이 시각과 준비된 AudioManager를 GameCanvas에 전달합니다. 경기 생성은 이미 서버에서 끝났으므로 솔로처럼 참가자마다 경기를 생성하지 않습니다.

AudioManager는 양수 delay를 오디오 시계의 미래 시각으로 예약합니다. 늦게 합류해 delay가 음수라면 경과한 만큼 음원을 건너뛰어 같은 시간대에 합류합니다. 이 보정은 네트워크 지연의 비대칭이나 출력 장치 지연까지 제거하는 완벽한 동기화를 의미하지 않습니다.

### 실시간 진행과 최종 결과

중간 score/combo는 최신 값을 ref에 모아 약 250ms 간격으로 WebSocket 전송을 제한합니다. 완료 시 마지막 진행 상태를 보내고 **최종 결과를 HTTP로 제출**합니다.

실시간 패널은 진행 상황을 보여주기 위한 것이며 저장된 최종 결과를 대신하지 않습니다. 현재 설계는 클라이언트 판정 결과를 서버가 신뢰하며, 서버 권위 판정이나 예측·롤백을 구현하지 않습니다.

## 7. 라우팅, 재연결, 새로고침

주요 경로는 [App.tsx](src/App.tsx)에 정의합니다.

```text
/login, /signup
/                         모드 선택
/solo                     곡·난이도 선택
/solo/play/:beatmapId      솔로 플레이
/solo/results/:gameSessionId
/records
/multiplayer/rooms        방 목록·매칭
/multiplayer/rooms/:roomId
    ├── (index)           대기실
    ├── play              멀티플레이
    └── results/:gameSessionId
```

- `RequireAuth`가 현재 사용자 Query를 확인하고 인증된 하위 화면에 사용자를 전달합니다. 실제 API 권한 검증은 Backend의 책임입니다.
- 같은 방의 하위 화면 이동은 참가를 유지합니다. 방 밖으로 이동하는 SPA 내비게이션은 `useBlocker`로 기다리게 한 뒤 HTTP 퇴장을 처리합니다.
- 새로고침 시 HTTP 퇴장을 보내지 않습니다. 소켓 단절은 서버의 재접속 유예로 처리합니다.
- 소켓 close 이후 1초 뒤 재연결하며, open 때 방 Query를 다시 조회하고 시계 보정을 반복합니다. 연결 중 놓친 변경을 최신 서버 상태로 회복하기 위해서입니다.
- 경기 중 새로고침으로 오디오 자원을 잃으면 사용자 클릭으로 음원을 다시 준비해 합류합니다.

URL 복원과 실행 중 메모리 복원은 다릅니다. 솔로 새로고침은 기존 엔진의 점수·진행 상태를 복구하지 않습니다. 멀티플레이 역시 재접속으로 기존 로컬 판정 내역까지 복원하는 구조는 아닙니다.

## 8. HTTP, 스타일, 배포 경계

[api/http.ts](src/api/http.ts)는 API 주소와 `credentials: "include"`, 오류 변환을 공통 처리합니다. API별 함수는 요청을 만들고, 화면의 Query/Mutation이 로딩·오류·캐시 갱신을 처리합니다. TypeScript 타입 선언만으로 응답의 런타임 검증까지 수행하는 것은 아닙니다.

`VITE_API_BASE_URL`에서 HTTP 주소를 정하고 `http → ws`, `https → wss`로 바꿔 WebSocket URL을 만듭니다. `/audio/...` 같은 상대 음원 주소는 API 기본 주소가 아니라 **현재 FE Origin**에서 요청됩니다.

정적 컴포넌트 스타일은 인접한 `이름.module.css`에 둡니다. `index.css`는 전역 변수·reset·페이지 기본 스타일을 담당합니다. Canvas 내부 그림의 색·좌표는 CanvasRenderer가 담당하므로 CSS와 변경 위치가 다릅니다.

[Dockerfile](Dockerfile)은 Node 빌드 단계에서 `dist`를 생성하고 Nginx 런타임 이미지로 복사합니다. [nginx.conf.template](nginx.conf.template)의 SPA fallback은 React Router 경로로 직접 접근했을 때 `index.html`을 반환합니다.

`VITE_*`는 빌드 결과에 포함되는 공개 설정입니다. 비밀값을 넣으면 안 되며, 배포 후 API 주소를 바꾸려면 FE를 다시 빌드해야 합니다.

## 9. 실행·검증과 현재 한계

Backend와 데이터베이스 준비는 [루트 실행 안내](../README.md#로컬-실행)를 따릅니다. 이 폴더에서:

```sh
npm ci
VITE_API_BASE_URL=http://localhost:3001 npm run dev

npm run lint
npm run build
```

브라우저는 `http://localhost:5173`으로 접속합니다. API도 `localhost`로 맞춰 로컬 쿠키 정책에서 호스트 혼용을 피합니다.

현재 알아둘 제한사항:

- 서버 곡·채보 메타데이터를 조회하지만 실제 노트 배열은 아직 [SAMPLE_NOTES](src/constants.ts)를 사용합니다.
- 엔진 커서는 시간이 앞으로 흐르는 것을 전제로 합니다. 임의 탐색·되감기·일시 정지/재개 기능은 구현하지 않았습니다.
- Canvas의 DPR별 backing store 조정은 아직 없습니다.
- FE package에는 자동 테스트 스크립트가 아직 없습니다. lint/build만으로 판정·오디오·재접속 동작을 보장할 수 없습니다.

변경 시 게임 시작 중 이탈, 연속 판정, 결과 저장 재시도, 방 내부 이동, 새로고침 후 재접속을 함께 확인합니다. Playwright 검증의 임시 산출물은 검증 후 삭제합니다.

## 코드 읽기 추천 순서

1. [GameCanvas](src/components/GameCanvas.tsx): 엔진 생성과 정리, React로 돌아오는 콜백
2. [GameEngine](src/game/GameEngine.ts): 한 프레임·한 입력·한 경기 완료의 흐름
3. [AudioManager](src/game/AudioManager.ts), [CanvasRenderer](src/game/CanvasRenderer.ts), [Judgment](src/game/Judgment.ts): 시간·좌표·판정의 연결
4. [SoloGame](src/components/SoloGame.tsx): 엔진 결과와 HTTP 저장의 연결
5. [RoomBoundary](src/pages/RoomBoundary.tsx), [MultiplayerGamePage](src/pages/MultiplayerGamePage.tsx): 공유 자원, 시계 보정, 실시간 상태
