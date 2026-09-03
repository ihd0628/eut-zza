# 브라우저 렌더링 파이프라인 실험

> 학습일: 2026년 9월 1일 ~ 9월 2일
>
> 관련 코드: `src/components/experiments/RenderingPipelineExperiment.tsx`, `src/App.tsx`
>
> 실험 주제: `width`, `background-color`, `transform` 변경이 브라우저 렌더링 파이프라인에 미치는 차이

## 1. 실험 목적

React 컴포넌트에서 같은 DOM 요소의 서로 다른 CSS 속성을 변경하고 Chrome DevTools의 Performance 패널에서 실제 브라우저 작업을 확인했다.

비교한 속성은 다음과 같다.

```text
width
background-color
transform
```

실험 전에 예상한 결과는 다음과 같았다.

```text
width 변경
→ 요소의 geometry가 바뀜
→ Layout과 Paint가 필요할 것

background-color 변경
→ geometry는 그대로이고 색상만 바뀜
→ Layout 없이 Paint가 필요할 것

transform 변경
→ Layout box는 그대로이고 시각적 변환만 적용됨
→ Layout을 피할 수 있고, 조건이 맞으면 compositor 중심으로 처리될 것
```

이번 실험의 목적은 각 작업의 정확한 소요 시간을 비교하는 것이 아니었다. 작은 예제이므로 대부분의 작업은 0.1ms 안팎에 끝났다.

핵심은 다음 두 가지였다.

```text
어떤 변경에서 Layout이 발생했는가?
어떤 변경에서 Paint가 발생했는가?
```

## 2. 학습용 브라우저 렌더링 파이프라인

초기 페이지를 화면에 표시하는 과정을 단순화하면 다음과 같다.

```text
HTML Parsing
↓
DOM

CSS Parsing
↓
CSSOM

DOM + CSSOM
↓
Style Calculation + Render/Layout Tree 구성
↓
Layout
↓
Paint
↓
Rasterization
↓
Composite
↓
화면 출력
```

이 흐름은 학습용 모델이다. 현대 Chrome의 내부 파이프라인은 다음처럼 더 세분화돼 있다.

```text
Style
↓
Layout
↓
Pre-paint
↓
Paint
↓
Compositor Commit / Layerize
↓
Raster
↓
Activate / Aggregate / Draw
```

Chrome DevTools에 표시되는 내부 이벤트 이름과 순서는 Chrome 버전 및 구현에 따라 이 개념도와 정확히 1:1로 대응하지 않을 수 있다. 예를 들어 이번 Performance 기록에는 `Paint → Layerize → Commit` 순서로 이벤트가 표시됐다.

중요한 것은 고정된 이벤트 이름을 암기하는 것이 아니라 각 단계가 어떤 데이터를 입력받아 무엇을 만들어내는지 구분하는 것이다.

## 3. DOM과 CSSOM

### DOM

DOM은 HTML 문서의 요소, 텍스트, 속성 및 부모·자식 관계를 객체 구조로 나타낸다.

```html
<section>
  <div>Note</div>
  <button>Start</button>
</section>
```

개념적인 DOM 구조는 다음과 같다.

```text
section
├── div
│   └── "Note"
└── button
    └── "Start"
```

DOM은 화면에 무엇이 존재하는지를 알려주지만 그것을 어떤 크기, 색상 및 위치로 표시할지는 완전히 결정하지 않는다.

`addEventListener`로 연결한 이벤트 리스너도 DOM Tree의 구조적 데이터로 보기보다는 해당 `EventTarget`과 연결해 브라우저가 관리하는 정보라고 이해한다.

### CSSOM

CSSOM은 브라우저가 해석한 CSS 규칙의 객체 구조다.

```css
.note {
  width: 50%;
  color: white;
  background-color: royalblue;
}
```

CSSOM에는 다음과 같은 규칙이 들어 있지만 요소의 최종 `x`, `y`, 실제 너비가 완성된 형태로 저장돼 있는 것은 아니다.

```text
width: 50%
color: white
background-color: royalblue
```

## 4. Style Calculation은 무엇을 계산하는가?

Style Calculation은 다음 정보들을 조합해 각 요소에 실제로 적용될 computed style을 계산한다.

```text
브라우저 기본 스타일
작성한 CSS
선택자 일치 여부
Cascade 우선순위
상속
인라인 스타일
CSS 변수
```

CSS 값은 개념적으로 다음 단계를 거친다.

```text
선언된 값
↓
Cascaded / Specified Value
↓
Computed Value
↓
Used Value
↓
Actual Value
```

이것은 CSS 값의 **개념적 모델**이다. 브라우저가 Style Calculation 한 번에
위 값을 모두 순서대로 확정한다는 뜻은 아니다. 속성마다 값을 확정할 수 있는
시점도 다르다.

이 문서에서 다루는 렌더링 파이프라인에 맞춰 단순화하면 다음과 같다.

```text
Style Calculation
→ cascade, 상속 등을 반영해 어떤 선언이 적용되는지 결정하고,
  Layout에 의존하지 않는 범위에서 Computed Value를 계산한다.

Layout
→ 부모 크기, 콘텐츠, viewport 같은 geometry 조건을 반영해
  아직 남아 있던 값을 Used Value로 해석한다.
  크기와 위치 같은 geometry 결과는 보통 CSS px 단위로 다뤄진다.

Paint / Raster
→ Used Value를 실제 화면에 그리는 과정에서 서브픽셀 처리, 반올림,
  기기 픽셀 비율 등의 제약이 적용될 수 있다. 이를 Actual Value라는
  개념과 연결해 이해할 수 있다.
```

따라서 `Actual Value`를 “Style Calculation의 최종 산출물” 또는 “항상 물리
픽셀(px) 값”이라고 이해하면 안 된다. `color`, `display`, `font-family`처럼
geometry가 아닌 속성도 있으므로 Layout이 모든 스타일 값을 px로 바꾸는 것도 아니다.

예를 들어 다음 규칙을 생각한다.

```css
.parent {
  width: 800px;
}

.child {
  width: 50%;
}
```

Style Calculation에서 자식의 `width`는 여전히 다음과 같은 의미를 가질 수 있다.

```text
Computed Value: 50%
```

부모의 실제 content width를 반영한 값은 Layout에서 결정된다.

```text
Used Value: 800px × 50% = 400 CSS px
```

따라서 다음 이해는 잘못됐다.

```text
Style Calculation이 끝나면 모든 요소의 최종 크기와 위치가 px로 결정된다. X
```

정확한 이해는 다음과 같다.

```text
Style Calculation
→ 어떤 스타일 값이 적용되는지 계산

Layout
→ 그 값과 주변 조건을 이용해 실제 geometry 계산
```

`getComputedStyle(element).width`가 px 단위로 보일 수 있지만, 이 API는 속성에 따라 Layout 이후의 resolved/used value를 반환하기도 한다. 이 결과만 보고 Style Calculation에서 Layout까지 끝났다고 판단하면 안 된다.

## 5. Render Tree와 Layout Tree

### Render Tree

Render Tree는 전통적인 Critical Rendering Path 설명에서 사용하는 비교적 추상적인 학습 용어다.

```text
화면에 렌더링할 DOM 내용
+
해당 내용에 적용된 스타일
```

### Layout Tree

Layout Tree는 브라우저가 Layout을 계산하기 위해 사용하는 box 구조에 더 가까운 표현이다.

DOM Tree와 Layout Tree는 반드시 1:1로 대응하지 않는다.

```text
display: none 요소
→ Layout box를 만들지 않음

텍스트
→ line box나 여러 fragment를 만들 수 있음

::before, ::after
→ DOM 노드는 아니지만 Layout에 참여할 수 있음
```

따라서 Render Tree와 Layout Tree를 완전히 같은 내부 자료구조의 서로 다른 이름이라고 단정하지 않는다.

이번 학습에서는 다음 의존 관계로 이해한다.

```text
DOM + CSSOM
↓
computed style 계산
↓
Layout에 참여할 box/tree 구성
↓
Layout으로 geometry 계산
```

## 6. Layout

Layout은 위치만 정하는 단계가 아니다. 각 Layout box의 크기와 위치를 함께 계산한다.

```text
x, y 위치
content width와 height
padding box
border box
margin
줄바꿈 위치
텍스트 line box
Flex/Grid 배치
스크롤 영역
```

예를 들어 기본 `box-sizing: content-box`에서 다음 스타일을 생각한다.

```css
.parent {
  width: 800px;
}

.child {
  width: 50%;
  height: 80px;
  padding: 10px;
  border: 2px solid;
}
```

Layout 결과는 개념적으로 다음과 같다.

```text
content width: 400px
좌우 padding: 20px
좌우 border: 4px

border box width: 424px
```

여기에 부모와 이전 형제들의 Layout 결과를 반영해 `x`, `y` 위치도 결정한다.

Layout 결과는 CSS pixel 단위의 geometry이며 소수점 값을 가질 수 있다. 아직 각 물리 픽셀의 색상값이 만들어진 것은 아니다.

`Reflow`는 일반적으로 Layout을 다시 계산하는 작업을 가리키는 표현이다.

## 7. Pre-paint와 Paint

### Pre-paint

Pre-paint는 Layout 결과를 바탕으로 Paint 이전에 필요한 정보를 준비한다.

개념적으로 다음과 같은 일을 포함한다.

```text
어떤 영역의 Paint 결과가 더 이상 유효하지 않은지 판단
Transform, Clip, Effect 등 property 정보 준비
기존 display list 또는 texture tile의 invalidation 결정
Hit test 관련 정보 갱신
```

Chrome Performance 패널에서 `Pre-paint`가 보였다고 해서 실제 `Paint`까지 발생했다고 단정하면 안 된다. `Pre-paint`와 `Paint`는 서로 다른 이벤트다.

### Paint

Paint는 Layout geometry와 computed style을 사용해 순서가 있는 그리기 명령을 만든다.

```text
1. x=100, y=200 위치에 배경 사각형을 그려라.
2. 사각형 주변에 테두리를 그려라.
3. 지정된 위치에 글자를 그려라.
```

Chrome에서는 이런 명령을 display item, paint record 또는 display list와 같은 개념으로 관리한다.

Paint에서 중요한 것은 픽셀 자체보다 무엇을 어떤 순서로 그릴지 정한다는 점이다.

```text
배경
↓
테두리
↓
이미지
↓
텍스트
↓
앞에 겹치는 요소
```

`z-index`, stacking context, clip, 그림자 등도 그리기 순서에 영향을 준다.

Canvas API에 비유하면 다음과 같은 그리기 명령을 준비하는 것과 비슷하다.

```ts
context.fillStyle = "royalblue";
context.fillRect(100, 200, 424, 104);

context.strokeStyle = "black";
context.strokeRect(100, 200, 424, 104);
```

브라우저가 실제로 위 Canvas 코드를 생성한다는 뜻은 아니며, 순서가 있는 그리기 명령이라는 개념이 비슷하다는 뜻이다.

## 8. Layerize와 Compositor Commit

### Layerize

Layerize는 Rasterization이 아니다.

Paint가 만든 paint chunk와 display item을 어떤 composited layer에 묶을지 결정한다.

```text
Paint chunk A ─┐
Paint chunk B ─┼→ Composited Layer 1
Paint chunk C ─┘

Paint chunk D ──→ Composited Layer 2
```

DOM 요소 하나마다 별도 레이어 하나가 생기는 것은 아니다.

브라우저는 다음 사이의 균형을 고려한다.

```text
레이어를 많이 분리
→ 독립적인 animation과 raster 갱신에 유리
→ GPU 메모리 사용 증가

레이어를 많이 합침
→ GPU 메모리 절약
→ 일부 변경에도 더 넓은 영역을 다시 raster할 수 있음
```

### Compositor Commit

Chrome Performance 기록에 나타난 `Commit`은 React Commit과 다른 개념이다.

```text
React Commit
→ React가 계산한 변경을 실제 DOM에 반영

Chrome Compositor Commit
→ 렌더링 데이터와 property 정보를 compositor 쪽으로 전달
```

이름은 같지만 서로 다른 시스템의 작업이다.

## 9. Rasterization

Rasterization은 Paint가 만든 명령을 실제 픽셀 데이터로 변환한다.

```text
Display list
↓
Rasterize paint
↓
픽셀로 이루어진 tile / GPU texture
```

브라우저는 화면을 하나의 거대한 이미지로 항상 다시 만들지 않고 여러 tile로 나눠 필요한 부분을 raster할 수 있다.

```text
Viewport
├── Tile A
├── Tile B
├── Tile C
└── Tile D
```

Chrome Performance 패널에서 Rasterization은 Main 트랙이 아니라 `Thread pool`, Raster 관련 worker 또는 GPU/Viz 관련 트랙에 표시될 수 있다.

이번 Width 실험에서는 `Thread pool worker` 아래에서 `Rasterize paint`가 두 번 나타났다.

두 번 나타난 것은 브라우저가 Raster 작업을 여러 tile 또는 작업 단위로 나눴기 때문일 수 있다. React가 DOM을 두 번 변경했다는 뜻은 아니다.

표시 시간이 `0.0ms`였던 것은 작업이 없었다는 뜻이 아니라 표시 정밀도보다 짧아 반올림됐다는 뜻이다.

Layout의 CSS pixel과 Rasterization 결과의 물리 pixel도 구분해야 한다.

```text
devicePixelRatio = 2인 환경의 단순 예

400 CSS px
→ 약 800 device pixels
```

브라우저 확대율과 장치 해상도에 따라 실제 Rasterization되는 pixel 수가 달라질 수 있다.

## 10. Composite와 GPU

Composite는 Rasterization된 layer와 tile을 최종 위치에 조합해 compositor frame을 만든다.

```text
배경 레이어
게임 Canvas 레이어
React UI 레이어
팝업 레이어
↓
최종 프레임
```

이 단계에서는 layer에 다음과 같은 시각 효과를 적용할 수 있다.

```text
transform
opacity
clip
scroll offset
```

GPU는 Rasterization과 최종 Draw를 빠르게 수행하는 데 활용될 수 있다.

Chrome DevTools에서 반드시 `Composite`라는 단일 이벤트 이름이 보이는 것은 아니다. 실제로는 Compositor, GPU, Activate, Aggregate, Draw 등 여러 내부 작업으로 나타날 수 있다.

따라서 최종 화면이 바뀌었다면 어떤 형태로든 합성과 출력은 수행됐지만, 특정 이름의 이벤트가 없다는 이유로 Composite가 없었다고 단정하면 안 된다.

## 11. Main Thread, Compositor Thread, Thread Pool

이번 Performance 기록에서 여러 실행 주체를 확인했다.

### Main Thread

주로 다음 작업을 담당한다.

```text
클릭 이벤트 전달
JavaScript 실행
React render 및 commit
Style Calculation
Layout
Pre-paint
Paint
```

Main Thread가 긴 JavaScript 작업에 막히면 Style, Layout, Paint도 제때 처리되지 못해 프레임이 늦어질 수 있다.

### Compositor Thread

주로 layer 합성, scrolling, compositor에서 실행 가능한 animation과 Raster 작업 조정을 담당한다.

조건이 맞는 `transform` 또는 `opacity` animation은 Layout과 Paint를 반복하지 않고 compositor 쪽에서 처리될 수 있다.

### Thread Pool Worker

이번 기록에 나온 `Thread pool worker`는 애플리케이션에서 만든 Web Worker가 아니다.

```text
Chrome 내부 작업용 worker thread
```

Width 실험의 `Rasterize paint`가 이 영역에서 확인됐다.

### GPU

GPU는 tile을 Rasterization하거나 compositor frame을 실제 화면용 pixel로 그리는 작업에 활용될 수 있다.

구체적인 Thread와 Process 구성은 운영체제, Chrome 버전 및 그래픽 환경에 따라 달라질 수 있다.

## 12. React render와 브라우저 rendering

React render와 브라우저 rendering은 이름만 비슷한 별개의 작업이다.

### React render

```text
state 또는 props 변경
↓
컴포넌트 함수 실행
↓
새 React Element 결과 계산
↓
이전 결과와 비교
↓
필요한 변경사항 결정
```

Fiber는 이 작업을 관리하기 위한 React 내부 자료구조다.

컴포넌트 함수가 실행됐다고 바로 DOM이 바뀌거나 pixel이 그려지는 것은 아니다.

### React commit

초기 렌더링에서는 DOM 노드를 만들고 연결한다. 이후 재렌더링에서는 필요한 최소한의 DOM 변경만 적용한다.

이번 컴포넌트에서는 같은 `<div>`를 계속 반환하므로 버튼을 클릭할 때마다 새로운 DOM 요소를 만드는 것이 아니다.

```text
기존 div 재사용
↓
변경된 style property만 DOM에 반영
```

컴포넌트가 다시 실행돼도 결과가 이전과 같다면 DOM을 전혀 변경하지 않을 수도 있다.

### 브라우저 rendering

React가 DOM 변경을 commit한 뒤 브라우저는 필요한 렌더링 단계만 수행한다.

```text
setState
↓
React render
↓
React commit
↓
DOM style 변경
↓
브라우저가 필요한 Rendering Pipeline 실행
↓
화면 갱신
```

DOM을 변경한 JavaScript 줄에서 항상 즉시 Layout과 Paint가 실행되는 것도 아니다. 브라우저는 가능한 경우 변경사항을 모아뒀다가 Rendering Opportunity에서 처리한다.

```text
Click Task
↓
JavaScript 및 Microtask 처리
↓
Rendering Opportunity
↓
Style / Layout / Paint
```

## 13. 실제 실험 코드

`src/components/experiments/RenderingPipelineExperiment.tsx`에 다음 컴포넌트를 작성했다.

```tsx
import { useState } from "react";

export const RenderingPipelineExperiment = () => {
  console.count("RenderingPipelineExperiment render");

  const [isWide, setIsWide] = useState(false);
  const [isBlue, setIsBlue] = useState(false);
  const [isMoved, setIsMoved] = useState(false);

  return (
    <section>
      <div
        style={{
          width: isWide ? "400px" : "200px",
          height: "200px",
          backgroundColor: isBlue ? "royalblue" : "tomato",
          transform: isMoved ? "translateX(150px)" : "translateX(0)",
        }}
      />
      <div>
        <button onClick={() => setIsWide((value) => !value)}>
          Change Width
        </button>
        <button onClick={() => setIsBlue((value) => !value)}>
          Change Background
        </button>
        <button onClick={() => setIsMoved((value) => !value)}>
          Change Transform
        </button>
      </div>
    </section>
  );
};
```

`src/App.tsx`에서는 기록에 불필요한 작업을 줄이기 위해 실험 컴포넌트만 렌더링했다.

```tsx
import "./App.css";
import { RenderingPipelineExperiment } from "./components/experiments/RenderingPipelineExperiment";

function App() {
  return <RenderingPipelineExperiment />;
}

export default App;
```

세 개의 state는 서로 독립적이며 각 버튼은 한 CSS 속성만 변경한다.

```text
isWide
→ width만 변경

isBlue
→ backgroundColor만 변경

isMoved
→ transform만 변경
```

컴포넌트 렌더링마다 인라인 style 객체는 새로 만들어지지만 React는 실제로 값이 달라진 style property만 DOM에 반영한다.

`main.tsx`가 `StrictMode`를 사용하므로 개발 환경에서는 `console.count`가 예상보다 두 번씩 증가할 수 있다. 이는 DOM 변경과 Browser Paint도 반드시 두 번 발생했다는 뜻이 아니다.

## 14. Chrome Performance 기록 방법

이번 실험은 페이지 로딩 성능이 아니라 실행 중 버튼 클릭을 측정하므로 `Record and reload`가 아닌 일반 `Record`를 사용했다.

각 CSS 속성을 다음 절차로 별도 기록했다.

```text
페이지 새로고침
↓
Performance 패널의 Record 시작
↓
측정할 버튼 한 번 클릭
↓
약 1초 대기
↓
Stop
↓
클릭 주변 구간 확대
```

각 실험을 하나의 긴 기록에 섞지 않고 별도로 기록한 이유는 어떤 버튼이 어떤 렌더링 작업을 만들었는지 쉽게 구분하기 위해서다.

주로 확인한 트랙은 다음과 같다.

```text
Interactions
Components
Main
Thread pool
GPU
```

`Main` 트랙의 `Event: click` 주변을 확대하고 아래 `Event Log`에서 다음 항목을 확인했다.

```text
Recalculate style
Layout
Pre-paint
Paint
Layerize
Commit
```

Rasterization은 `Thread pool`을 펼쳐 `Rasterize paint`를 찾았다.

기록에는 브라우저 extension의 `content script` 등 실험과 무관한 작업도 나타날 수 있다. 이런 항목은 애플리케이션 렌더링 파이프라인 결과와 구분해 무시했다.

## 15. Width 변경 실험

### 실행한 코드

```tsx
<button onClick={() => setIsWide((value) => !value)}>
  Change Width
</button>
```

```tsx
width: isWide ? "400px" : "200px"
```

### 관찰 결과

한 번의 기록에서 다음 이벤트를 확인했다.

```text
2765.4ms  Event: click
2768.7ms  Recalculate style
2768.8ms  Layout
2768.9ms  Pre-paint
2769.1ms  Paint
2769.1ms  Layerize
2769.2ms  Commit
2769.3ms  Rasterize paint
```

실제 시간값은 실행할 때마다 달라진다. 위 숫자는 이벤트의 순서와 존재 여부를 기록하기 위한 한 번의 측정 결과다.

### 원인

`width`가 `200px`에서 `400px`로 바뀌면 요소의 Layout geometry가 바뀐다.

```text
content width 변경
↓
border box geometry 변경 가능
↓
부모, 자식 또는 형제의 배치에 영향 가능
↓
Layout 필요
```

화면에서 새로 넓어진 영역을 그려야 하므로 Paint와 Rasterization도 발생했다.

### 결론

> `width` 변경은 요소의 geometry를 바꾸므로 이번 실험에서 Style Calculation, Layout, Paint 및 Rasterization이 모두 발생했다.

## 16. Background Color 변경 실험

### 실행한 코드

```tsx
<button onClick={() => setIsBlue((value) => !value)}>
  Change Background
</button>
```

```tsx
backgroundColor: isBlue ? "royalblue" : "tomato"
```

### 관찰 결과

한 번의 기록에서 다음 이벤트를 확인했다.

```text
1356.0ms  Event: click
1360.1ms  Pre-paint
1360.3ms  Paint
1360.4ms  Layerize
1360.4ms  Commit
```

클릭 이후 Paint가 실행됐지만 그 사이에 Layout 이벤트는 없었다.

### 원인

배경색은 다음 정보를 바꾸지 않는다.

```text
요소의 x, y 위치
너비와 높이
주변 요소의 배치
```

따라서 기존 Layout geometry를 재사용할 수 있다.

하지만 사각형을 구성할 픽셀의 색상은 바뀌므로 그리기 명령과 픽셀 결과의 갱신이 필요하다.

```text
기존 Paint 명령
→ tomato 색상으로 사각형을 그려라

변경된 Paint 명령
→ royalblue 색상으로 사각형을 그려라
```

### 주의할 점

별도의 `Recalculate style` 이벤트가 보이지 않았다고 해서 스타일 처리가 전혀 없었다고 단정하면 안 된다.

작업 시간이 너무 짧거나 Chrome이 다른 내부 이벤트와 합쳐 표시했을 수 있다. 또한 클릭 전의 `Schedule style recalculation`은 버튼의 `hover`, `active` 같은 포인터 상태로 발생했을 수도 있다.

### 결론

> `background-color` 변경은 geometry를 바꾸지 않아 Layout을 유발하지 않았지만 화면의 색상 픽셀을 변경해야 하므로 Paint를 유발했다.

## 17. Transform 변경 실험

### 실행한 코드

```tsx
<button onClick={() => setIsMoved((value) => !value)}>
  Change Transform
</button>
```

```tsx
transform: isMoved ? "translateX(150px)" : "translateX(0)"
```

### 관찰 결과

한 번의 기록에서 다음 이벤트를 확인했다.

```text
1248.9ms  Event: click
1253.9ms  Pre-paint
1254.1ms  Paint
1254.2ms  Layerize
1254.3ms  Commit
```

Layout 이벤트는 없었지만 Paint 이벤트는 있었다.

### Layout이 없었던 이유

`transform`은 요소의 Layout box를 새 위치로 다시 배치하지 않는다.

```text
Layout상 위치: x = 0
Layout상 너비: 200px

transform: translateX(150px)

화면에 보이는 위치: x = 150px
Layout상 위치와 크기: 그대로
```

형제 요소도 해당 요소가 Layout상으로는 움직이지 않은 것처럼 배치된다.

따라서 Layout geometry를 다시 계산할 필요가 없었다.

### DOM을 다시 만들지 않아서 Layout이 없는 것인가?

아니다. Width, Background Color, Transform 세 실험 모두 기존 DOM 요소를 재사용했다.

차이는 새 DOM 생성 여부가 아니라 변경한 CSS 속성이 Layout geometry에 영향을 주는가였다.

```text
width
→ geometry 변경
→ Layout 필요

background-color
→ geometry 유지
→ Layout 불필요

transform
→ Layout box의 geometry 유지
→ Layout 불필요
```

### Paint가 스타일을 기록하는 단계인가?

아니다.

```text
React Commit
→ 기존 DOM 요소의 style.transform 변경

Style 처리
→ translateX 값을 transform matrix로 해석

Paint
→ 필요한 경우 그리기 명령 갱신

Composite
→ transform matrix를 적용해 layer를 새 위치에 합성
```

Paint는 DOM style을 작성하는 단계가 아니다.

### 왜 Transform인데 Paint가 나타났는가?

`transform`을 사용한다고 항상 compositor-only 처리가 보장되는 것은 아니다.

가능한 원인은 다음과 같다.

```text
대상 요소가 독립된 composited layer가 아니었을 수 있음
레이어 생성 또는 재구성에 Paint가 필요했을 수 있음
클릭한 버튼의 active/focus 상태가 별도로 Paint됐을 수 있음
Performance 기록이 대상 사각형 외 페이지 전체의 Paint를 포함함
```

따라서 이 기록의 `Paint` 이벤트가 반드시 transform 대상 사각형을 다시 그렸다는 뜻도 아니다.

대상 요소의 실제 repaint 여부를 구분하려면 Chrome Rendering 도구의 Paint flashing을 함께 사용하거나 Paint 이벤트의 상세 정보에서 대상 영역을 확인해야 한다.

### Compositor-only의 의미

요소가 별도의 composited layer로 준비돼 있고 다른 조건도 충족한다면 다음처럼 기존 Raster 결과를 재사용할 수 있다.

```text
기존에 Rasterization된 texture 재사용
↓
transform matrix 변경
↓
Compositor가 layer를 새 위치에 합성
```

이 경우 Layout과 Paint를 피할 수 있다.

그러나 React 버튼 클릭에는 여전히 다음 작업이 필요하다.

```text
Click Task
React render
React commit
일부 style/property 처리
```

따라서 compositor-only는 애플리케이션 전체에서 아무 일도 발생하지 않는다는 뜻이 아니다. 화면 갱신 프레임에서 Layout과 Paint를 피할 수 있다는 의미다.

### 결론

> `transform`은 Layout box의 geometry를 변경하지 않으므로 이번 실험에서 Layout을 유발하지 않았다. 다만 현재 기록에는 Paint가 있었으므로 이번 한 번의 기록만으로 transform 대상이 compositor-only로 처리됐다고 결론 내릴 수는 없다.

## 18. 세 실험 최종 비교

| CSS 변경 | Layout geometry 변경 | 관찰된 Layout | 관찰된 Paint | 이번 실험의 결론 |
|---|---:|---:|---:|---|
| `width` | 예 | 있음 | 있음 | Geometry 변경으로 Layout부터 다시 수행 |
| `background-color` | 아니요 | 없음 | 있음 | Geometry는 재사용하고 시각 정보만 다시 Paint |
| `transform` | 아니요 | 없음 | 있음 | Layout은 피했지만 compositor-only 여부는 추가 확인 필요 |

가장 중요한 비교는 다음과 같다.

```text
width 변경
→ Style → Layout → Paint → Raster → Composite

background-color 변경
→ Style → Paint → Raster → Composite

transform 변경
→ Layout 생략 가능
→ 조건이 맞으면 기존 Raster 결과를 Composite에서 재사용 가능
```

위 흐름은 대표적인 경향이며 브라우저가 매번 모든 단계를 반드시 같은 방식으로 수행한다는 뜻은 아니다.

## 19. 이번에 바로잡은 오해

### 오해 1: CSSOM에 최종 위치와 크기가 들어 있다

```text
CSSOM
→ CSS 규칙

Style Calculation
→ computed style

Layout
→ 최종 사용 geometry
```

### 오해 2: Style Calculation에서 모든 실제 px가 계산된다

percentage, `auto`, 콘텐츠 크기, Flex/Grid 배치 등은 Layout 과정이 필요하다.

### 오해 3: Render Tree와 Layout Tree는 완전히 같은 말이다

Render Tree는 전통적인 학습용 개념이고 Layout Tree는 Layout box 구조에 더 가까운 표현이다. 실제 브라우저 자료구조는 더 세분화돼 있다.

### 오해 4: Layout은 위치만 계산한다

Layout은 위치뿐 아니라 width, height, box model, 줄바꿈과 주변 배치까지 계산한다.

### 오해 5: Paint는 CSS style을 DOM에 작성한다

DOM style 변경은 React Commit에서 일어난다. Paint는 스타일과 geometry를 그리기 명령으로 변환한다.

### 오해 6: Rasterization이 곧 모니터 출력이다

Rasterization은 메모리 또는 GPU texture의 pixel tile을 만든다. 이후 Composite와 Draw가 필요하다.

### 오해 7: Layerize가 Rasterization이다

```text
Layerize
→ paint chunk를 composited layer로 그룹화

Rasterization
→ display list를 실제 pixel tile로 변환
```

### 오해 8: Background Color 변경에는 Composite가 필요 없다

새로 만들어진 색상 픽셀을 최종 프레임에 포함하고 화면에 출력하려면 합성 및 Draw 과정이 필요하다.

### 오해 9: Transform은 DOM을 새로 만들지 않아서 Layout을 피한다

세 실험 모두 같은 DOM을 재사용했다. Transform이 Layout을 피한 이유는 Layout box의 geometry를 변경하지 않았기 때문이다.

### 오해 10: Transform은 항상 Composite만 실행한다

Compositor-only 처리는 layer 구성 등 조건에 따라 달라진다. 이번 기록에도 Paint가 나타났다.

### 오해 11: DevTools에 이벤트가 없으면 해당 개념적 처리가 전혀 없었다

Chrome이 단계를 생략하거나 병합할 수 있고, 너무 짧은 작업은 별도 이벤트로 보이지 않을 수 있다. Performance trace는 표준 파이프라인을 그대로 출력하는 로그가 아니라 현재 Chrome 구현의 실제 작업 기록이다.

## 20. Reflow, Repaint, Layout Thrashing

### Reflow

일반적으로 Layout을 다시 계산하는 작업을 가리킨다.

이번 Width 실험이 대표적인 예다.

```text
width 변경
→ Layout geometry 무효화
→ Reflow/Layout
```

### Repaint

Layout geometry는 그대로지만 시각적 결과를 다시 Paint하는 작업을 가리킨다.

이번 Background Color 실험이 대표적인 예다.

```text
background-color 변경
→ Layout 재사용
→ Repaint
```

### Layout Thrashing

DOM style을 변경한 뒤 Layout 값을 동기적으로 읽는 작업을 반복하면 브라우저가 미뤄뒀던 Layout을 즉시 수행해야 할 수 있다.

```ts
element.style.width = "200px"; // Write
element.offsetWidth;            // Read: 강제 Layout 가능
element.style.width = "300px"; // Write
element.offsetWidth;            // Read: 또 강제 Layout 가능
```

이처럼 Write와 Layout Read를 번갈아 반복해 한 프레임 안에서 Layout이 여러 번 강제로 발생하는 현상을 Layout Thrashing이라고 한다.

이번 실험에서는 Layout Thrashing을 직접 구현하거나 측정하지 않았다. 이후 Canvas와 DOM 렌더링 성능을 비교할 때 별도 실험으로 확인한다.

## 21. 최종 정리

각 단계가 다루는 결과를 표로 정리하면 다음과 같다.

| 단계 | 주요 결과 |
|---|---|
| DOM | 요소와 콘텐츠의 구조 |
| CSSOM | CSS 규칙 |
| Style Calculation | 요소별 computed style |
| Layout Tree 구성 | Layout에 참여하는 box 구조 |
| Layout | box의 실제 크기와 위치 |
| Pre-paint | invalidation과 property 정보 준비 |
| Paint | 순서가 있는 그리기 명령/display list |
| Layerize | paint chunk를 composited layer로 그룹화 |
| Compositor Commit | 렌더링 데이터를 compositor 쪽으로 전달 |
| Rasterization | 그리기 명령을 pixel tile/texture로 변환 |
| Composite/Draw | layer를 합쳐 최종 화면 출력 |

이번 학습의 핵심 문장은 다음과 같다.

```text
Style은 무엇을 적용할지 계산한다.

Layout은 어디에 얼마나 크게 배치할지 계산한다.

Paint는 무엇을 어떤 순서로 그릴지 명령을 만든다.

Rasterization은 그 명령을 pixel로 바꾼다.

Composite는 pixel layer를 합쳐 최종 frame을 만든다.
```

CSS 속성 선택이 중요한 이유도 다음과 같이 정리할 수 있다.

> 같은 시각적 결과라도 Layout을 유발하는 속성과 기존 Raster 결과를 재사용할 수 있는 속성은 브라우저가 수행해야 하는 작업량이 다르다.

## 22. 참고 자료

- [Chrome RenderingNG architecture](https://developer.chrome.com/docs/chromium/renderingng-architecture)
- [Chrome RenderingNG data structures](https://developer.chrome.com/docs/chromium/renderingng-data-structures)
- [Chrome DevTools Performance panel](https://developer.chrome.com/docs/devtools/performance)
- [web.dev Render-tree Construction, Layout, and Paint](https://web.dev/articles/critical-rendering-path/render-tree-construction)
- [React Render and Commit](https://react.dev/learn/render-and-commit)
