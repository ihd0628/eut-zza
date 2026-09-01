# `requestAnimationFrame` 실험으로 이해한 브라우저 렌더링 스케줄링

> 학습일: 2026년 8월 31일
>
> 관련 코드: `src/experiments/TimerComparison.ts`
>
> 실험 주제: 메인 스레드를 의도적으로 차단했을 때 `requestAnimationFrame` 콜백의 실행 간격은 어떻게 달라지는가?

## 1. 실험 목적

`requestAnimationFrame`으로 매 화면 갱신 시점의 시간을 측정하면서 약 1초 뒤 메인 스레드를 500ms 동안 차단했다.

```text
실험 시작
↓
requestAnimationFrame(tick) 등록
↓
화면 갱신 시점마다 시간 측정
↓
1초 뒤 blockMainThread(500) 실행
↓
2.5초 뒤 cancelAnimationFrame으로 실험 종료
```

실험 코드는 전달받은 `timestamp`와 직전 프레임의 `timestamp` 차이를 `deltaTime`으로 기록한다.

```ts
const tick = (timestamp: number) => {
  timerSample.count = timerSample.count + 1;
  timerSample.deltaTime = timestamp - timerSample.timestamp;
  timerSample.timestamp = timestamp;

  timerSampleArray.push({ ...timerSample });

  animationFrameId = requestAnimationFrame(tick);
};
```

## 2. 실제 측정 결과

CPU 부하 전후에는 `deltaTime`이 대체로 약 16.7ms였다.

```text
16.6ms
16.7ms
17.1ms
15.7ms
```

이는 실험한 브라우저가 당시 약 60Hz 주기로 화면 갱신 기회를 만들고 있었다는 뜻이다.

```text
1000ms ÷ 60 ≈ 16.7ms
```

CPU 부하 구간에서는 다음 결과가 기록됐다.

```text
count 62
timestamp: 3395.4ms
deltaTime: 16.8ms

count 63
timestamp: 3878.2ms
deltaTime: 482.8ms

count 64
timestamp: 3895.3ms
deltaTime: 17.1ms
```

계산하면 다음과 같다.

```text
3878.2 - 3395.4 = 482.8ms
```

핵심 결론은 다음과 같다.

> 메인 스레드가 차단된 동안 브라우저의 시간은 계속 흘렀지만 `tick`은 실행될 수 없었다. 차단이 끝난 뒤 다음 화면 갱신 과정에서 `tick`이 다시 호출됐고, 건너뛴 시간이 큰 `deltaTime`으로 나타났다.

## 3. 먼저 구분해야 하는 네 가지 개념

### `requestAnimationFrame`

다음 화면 갱신 과정에서 실행할 콜백을 브라우저에 등록하는 API다.

```ts
const id = requestAnimationFrame(tick);
```

이 호출은 다음을 의미하지 않는다.

```text
tick을 즉시 호출한다.                      X
tick을 Timer Task로 등록한다.              X
tick을 즉시 일반 Task Queue에 넣는다.       X
정확히 16.7ms 뒤 실행을 보장한다.           X
```

### Animation Frame Callback Map

`requestAnimationFrame(tick)`을 호출하면 브라우저는 렌더링 대상이 관리하는 순서 있는 콜백 목록에 `tick`을 저장하고 식별자인 handle을 반환한다.

개념적으로는 다음과 같다.

```text
Animation Frame Callback Map

handle 41 → tick
handle 42 → anotherCallback
```

이 목록은 일반 Task Queue도 아니고 Microtask Queue도 아니다.

### Rendering Opportunity

브라우저가 현재 문서의 화면을 갱신할 수 있다고 판단한 기회다.

판단에는 다음과 같은 요소가 영향을 준다.

```text
디스플레이 주사율
페이지 성능
탭의 표시 여부
브라우저의 throttling 정책
실제로 갱신할 내용이 있는지
```

Rendering Opportunity는 함수, Task, Queue가 아니다. 브라우저가 화면 갱신을 스케줄링할 수 있는 시점에 관한 개념이다.

60Hz 환경에서는 보통 최대 약 16.7ms마다 기회가 생길 수 있지만 정확한 횟수와 시점은 보장되지 않는다. 120Hz 환경이라면 약 8.3ms에 가까울 수 있고, 숨겨진 탭에서는 훨씬 느려지거나 실행이 중단될 수 있다.

### Rendering Task Source

브라우저가 화면 갱신 Task를 만들 때 그 Task의 출처를 나타내는 분류다.

```text
화면 갱신 Task
├── source: Rendering Task Source
└── steps: 화면 갱신 절차
```

Rendering Task Source 자체가 Task Queue는 아니다. 각 Task Source는 Event Loop가 가진 특정 Task Queue와 연결된다. 자세한 내용은 [`task-queues-and-event-loop.md`](./task-queues-and-event-loop.md)에서 정리한다.

## 4. 버튼 클릭부터 첫 콜백 등록까지

`Run requestAnimationFrame` 버튼을 클릭하면 먼저 사용자 입력을 처리하는 Click Task가 실행된다.

```text
사용자가 버튼 클릭
↓
Click Task 실행
↓
React onClick 함수 호출
↓
runAnimationFrameExperiment 호출
↓
startAnimationFrameExperiment 호출
```

이때 Call Stack은 개념적으로 다음과 같다.

```text
┌───────────────────────────────────┐
│ startAnimationFrameExperiment     │
├───────────────────────────────────┤
│ runAnimationFrameExperiment       │
├───────────────────────────────────┤
│ onClick                           │
└───────────────────────────────────┘
```

`startAnimationFrameExperiment` 내부의 첫 등록은 다음과 같다.

```ts
animationFrameId = requestAnimationFrame(tick);
```

브라우저가 수행하는 작업을 단순화하면 다음과 같다.

```text
새 handle 생성
↓
Animation Frame Callback Map에 저장

handle → tick
↓
handle 반환
```

이 시점에는 `tick`의 실행 컨텍스트가 만들어지지 않는다. 아직 `tick`이 호출되지 않았기 때문이다.

이후 `runAnimationFrameExperiment`는 다음 Timer도 등록한다.

```text
1초 뒤 blockMainThread(500)를 호출할 Timer
2.5초 뒤 stopRaf를 호출할 Timer
```

모든 등록이 끝나 함수들이 반환되면 Click Task가 완료된다.

## 5. Rendering Opportunity에서 `tick` 호출까지

현재 HTML 표준을 기준으로 한 흐름을 한 페이지에 맞게 단순화하면 다음과 같다.

```text
Rendering Opportunity 발생
↓
화면 갱신 Task 생성
source = Rendering Task Source
↓
해당 source와 연결된 Task Queue에서 대기
↓
Event Loop가 화면 갱신 Task 선택
↓
화면 갱신 절차 실행
↓
Animation Frame Callback Map 확인
↓
등록된 tick 제거 후 tick(timestamp) 호출
↓
tick 실행 컨텍스트가 Call Stack에 생성
```

화면 갱신 절차에는 고수준에서 다음과 같은 작업들이 포함된다.

```text
resize와 scroll 관련 처리
↓
CSS animation 등 갱신
↓
requestAnimationFrame 콜백 실행
↓
스타일 재계산과 Layout
↓
현재 상태를 화면에 반영
```

따라서 `tick` 안에서 DOM이나 Canvas 상태를 변경하면 브라우저는 이어지는 렌더링 작업에 그 결과를 반영할 수 있다.

## 6. `tick`은 별도의 Task가 아니다

다음 표현은 정확하지 않다.

```text
매 프레임 tick Task가 Task Queue에 들어간다.
```

더 정확한 표현은 다음과 같다.

```text
화면 갱신 Task가 실행된다.
↓
그 Task의 화면 갱신 절차 안에서
등록된 requestAnimationFrame 콜백을 호출한다.
```

즉, 일반적으로 `tick` 콜백 하나마다 별도의 일반 Task가 만들어지는 모델로 이해하지 않는다. 하나의 화면 갱신 작업 안에서 같은 프레임에 등록된 여러 Animation Frame Callback이 함께 호출될 수도 있다.

Task 자체가 Call Stack으로 이동하는 것도 아니다.

```text
화면 갱신 Task 실행
↓
Task의 단계가 tick 함수 호출
↓
tick 실행 컨텍스트 생성
↓
Call Stack에 추가
```

## 7. `tick` 내부의 다음 등록은 재귀 호출이 아니다

`tick` 마지막에는 다음 코드가 있다.

```ts
animationFrameId = requestAnimationFrame(tick);
```

이는 다음 코드와 다르다.

```ts
tick(); // 동기 재귀 호출
```

동기 재귀 호출이었다면 현재 `tick` 위에 새로운 `tick` 실행 컨텍스트가 즉시 쌓였을 것이다.

```text
Call Stack

tick 3
tick 2
tick 1
```

하지만 `requestAnimationFrame(tick)`은 현재 `tick`을 다시 호출하지 않는다.

```text
현재 tick 실행
↓
미래 화면 갱신용 콜백으로 tick 등록
↓
현재 tick 종료
↓
현재 tick 실행 컨텍스트 제거
↓
나중의 화면 갱신 과정에서 새로운 tick 호출
```

브라우저는 현재 화면 갱신에서 실행할 callback handle 목록을 먼저 확보한다. 현재 `tick`이 실행되는 도중 새로 등록한 handle은 그 목록에 없으므로 미래의 화면 갱신을 기다린다.

따라서 다음 표현이 정확하다.

> `tick`은 자신을 재귀적으로 호출하지 않는다. 다음 화면 갱신에서 자신을 다시 호출해 달라고 등록한다.

## 8. 500ms 메인 스레드 차단 중 발생한 일

약 1초 뒤 CPU 부하용 Timer Task가 선택되면 해당 Task가 콜백을 호출하고, 콜백은 `blockMainThread(500)`을 호출한다.

```ts
while (performance.now() - startedAt < duration) {}
```

이 반복문은 약 500ms 동안 메인 스레드에서 JavaScript를 계속 실행한다.

```text
CPU 부하용 Timer Task 실행
↓
blockMainThread 실행 컨텍스트가 Call Stack 점유
↓
시간과 디스플레이 갱신 시점은 계속 지나감
↓
하지만 메인 스레드는 다음 Task나 tick을 실행할 수 없음
↓
blockMainThread 종료
↓
CPU 부하용 Timer Task 완료
↓
이후 Event Loop가 실행 가능한 작업을 다시 선택
↓
다음 화면 갱신 과정에서 tick 호출
```

이 때문에 차단 전후의 프레임 timestamp 차이가 크게 나타났다.

```text
차단 전 tick: 3395.4ms
차단 후 tick: 3878.2ms

deltaTime: 482.8ms
```

`deltaTime`이 정확히 500ms가 아닌 것은 이상하지 않다. 차단 시작 시각이 프레임 timestamp와 정확히 일치하지 않고, Rendering Opportunity와 Task 선택 시점도 서로 다르기 때문이다. `blockMainThread(500)`은 CPU 부하 함수가 최소 약 500ms 동안 실행된다는 뜻이지, 두 Animation Frame timestamp의 차이가 반드시 정확히 500ms라는 뜻은 아니다.

## 9. 놓친 프레임의 콜백이 모두 쌓이지 않는 이유

처음에는 다음 흐름을 예상할 수 있다.

```text
500ms 차단
↓
약 16.7ms마다 tick 실행 작업 누적
↓
약 30개의 tick이 차단 뒤 연속 실행
```

실제로는 그렇지 않았다.

```text
16.8ms
↓
482.8ms
↓
17.1ms
```

이 실험 코드에서는 한 번에 다음 `tick` 하나만 등록한다.

```text
tick 호출
↓
기존 callback handle은 Map에서 제거됨
↓
tick 내부에서 다음 callback handle 하나 등록
```

메인 스레드가 차단되어 `tick`이 호출되지 않는 동안에는 `tick` 내부의 다음 `requestAnimationFrame(tick)`도 실행되지 않는다. 따라서 이 코드가 프레임마다 새로운 콜백을 계속 등록해서 수십 개를 쌓는 일은 없다.

또한 브라우저는 필요 없는 렌더링을 건너뛰거나 이미 대기 중인 화면 갱신 작업과 중복되는 작업을 합칠 수 있다. 화면에 표시하지 못한 과거 프레임을 차단 종료 후 모두 빠르게 재생하는 것이 아니다.

## 10. `timestamp`는 정확히 무엇인가?

브라우저는 Animation Frame Callback을 호출하면서 `DOMHighResTimeStamp`를 전달한다.

```ts
const tick = (timestamp: number) => {
  // timestamp 사용
};
```

이 값은 `Date.now()` 같은 Unix 시간이 아니다. 문서의 time origin을 기준으로 한 고해상도 시간이며 `performance.now()`와 같은 시간 기준을 사용한다.

하지만 다음 두 값이 항상 완전히 같지는 않다.

```ts
timestamp
performance.now()
```

`timestamp`는 해당 화면 갱신에 대해 브라우저가 정한 frame timestamp다. 콜백 함수 본문 안에서 새로 호출한 `performance.now()`는 그 코드를 실제로 실행하는 더 나중의 현재 시각이다. 같은 화면 갱신에서 여러 rAF 콜백이 실행되면 모두 같은 frame timestamp를 전달받을 수 있다.

## 11. 첫 번째 `deltaTime`이 음수였던 이유

실제 결과의 첫 항목은 다음과 같았다.

```text
timestamp: 2378.7ms
deltaTime: -9.4ms
```

현재 코드는 초기값에 `performance.now()`를 사용한다.

```ts
let timerSample: TimerSample = {
  count: 0,
  timestamp: performance.now(),
  deltaTime: 0,
};
```

그런데 첫 번째 콜백 인수는 콜백 함수가 호출되는 바로 그 순간에 새로 측정한 `performance.now()`가 아니라, 해당 Rendering Opportunity에 연결된 frame timestamp다.

가능한 흐름은 다음과 같다.

```text
Rendering Opportunity의 frame timestamp 결정
↓
화면 갱신 Task 대기
↓
그 사이 startAnimationFrameExperiment에서 performance.now() 측정
↓
대기하던 화면 갱신 Task 실행
↓
조금 더 이른 frame timestamp를 tick에 전달
```

따라서 서로 같은 time origin을 사용하더라도 첫 비교에서 `frame timestamp - 나중에 측정한 performance.now()`가 되어 작은 음수가 나올 수 있다. 이는 실험 결과를 바탕으로 현재 표준의 스케줄링 흐름을 적용한 해석이다.

첫 프레임부터 rAF timestamp끼리만 비교하려면 다음 방식이 더 명확하다.

```ts
let previousTimestamp: number | null = null;

const tick = (timestamp: number) => {
  const deltaTime =
    previousTimestamp === null ? 0 : timestamp - previousTimestamp;

  previousTimestamp = timestamp;
  animationFrameId = requestAnimationFrame(tick);
};
```

이것은 문서에서 권장하는 실험 개선안이며, 현재 실험 코드 자체를 변경한 것은 아니다.

## 12. `cancelAnimationFrame`은 무엇을 취소하는가?

`requestAnimationFrame`은 callback handle을 반환한다.

```ts
animationFrameId = requestAnimationFrame(tick);
```

아직 실행되지 않은 handle을 다음과 같이 취소할 수 있다.

```ts
cancelAnimationFrame(animationFrameId);
```

표준 모델에서는 해당 handle에 연결된 콜백을 Animation Frame Callback Map에서 제거한다.

```text
취소 전
handle 41 → tick

cancelAnimationFrame(41)

취소 후
handle 41 없음
```

현재 `tick`이 이미 실행 중이라면 그 실행을 중간에 강제로 멈추는 API는 아니다. 이 실험에서는 `tick`이 매번 미래 콜백 하나의 ID를 `animationFrameId`에 저장하므로, `stopRaf`는 아직 실행되지 않은 다음 콜백을 취소한다.

## 13. `setInterval`, 재등록 `setTimeout`, rAF 비교

| 구분 | `setInterval` | 재등록 `setTimeout` | `requestAnimationFrame` |
|---|---|---|---|
| 등록 대상 | 반복 Timer | 일회성 Timer | Animation Frame Callback |
| 주요 대기 장소 | 브라우저의 활성 타이머 관리 영역 | 브라우저의 활성 타이머 관리 영역 | Animation Frame Callback Map |
| 실행 기준 | 최소 지연 시간이 지난 Timer Task | 최소 지연 시간이 지난 Timer Task | Rendering Opportunity와 화면 갱신 과정 |
| 일반적인 실험 간격 | 약 100ms | 약 100ms + 콜백 실행 지연 | 화면 주사율에 따라 약 16.7ms 또는 8.3ms 등 |
| 화면 갱신과의 관계 | 직접 동기화되지 않음 | 직접 동기화되지 않음 | 화면 갱신 전에 콜백 실행 |
| 숨겨진 탭의 영향 | throttling 가능 | throttling 가능 | 강하게 throttling되거나 중단 가능 |

세 방식 모두 메인 스레드에서 실행할 JavaScript 콜백은 긴 Task가 실행되는 동안 호출될 수 없다.

## 14. 이 실험이 게임 루프에 주는 교훈

`requestAnimationFrame`은 Canvas 화면을 갱신하는 게임 루프에 적합하지만 정확한 프레임 수를 보장하지 않는다.

다음 방식은 프레임이 항상 같은 간격으로 실행된다고 가정한다.

```ts
position += 5;
```

프레임 드롭이 발생하면 실제 시간과 게임 상태가 어긋날 수 있다.

실제로 흐른 시간을 반영해야 한다.

```ts
const deltaTime = timestamp - previousTimestamp;
position += speedPerMs * deltaTime;
```

다만 리듬게임의 음악과 판정을 화면 프레임에 종속시키면 안 된다. 이후에는 다음처럼 책임을 분리한다.

```text
Web Audio clock
└── 음악 진행 시간과 판정의 기준

requestAnimationFrame
└── 현재 시간에 맞는 화면을 그리는 시점
```

즉, 프레임이 한동안 누락되어도 다음 프레임에서는 실제 시간으로부터 현재 노트 위치를 계산해야 한다.

## 15. 헷갈렸던 부분과 바로잡은 이해

| 처음의 이해 | 바로잡은 이해 |
|---|---|
| `requestAnimationFrame`은 React의 메서드다. | 브라우저가 제공하는 Web API이며 React 없이도 사용할 수 있다. |
| rAF는 브라우저의 Timer 영역에 등록된다. | Animation Frame Callback Map에 등록된다. |
| `tick`이 매 프레임 Task Queue에 별도 Task로 들어간다. | 화면 갱신 Task의 실행 과정에서 등록된 `tick`이 호출된다. |
| Rendering Opportunity는 Queue다. | 브라우저가 화면을 갱신할 수 있다고 판단한 기회다. |
| Rendering Task Source는 별도의 Queue 이름이다. | 화면 갱신 Task의 논리적 출처이며 실제 Queue와는 별개다. |
| `requestAnimationFrame(tick)`은 `tick()` 재귀 호출이다. | 미래 화면 갱신을 위해 `tick`을 다시 등록한다. |
| 차단 중 놓친 rAF 콜백이 모두 쌓인다. | 이 루프는 다음 콜백 하나만 대기시키며 놓친 프레임을 나중에 몰아서 재생하지 않는다. |
| 60Hz에서는 반드시 16.7ms마다 실행된다. | 주사율과 브라우저 정책에 맞춰 실행 기회가 생길 뿐 정확한 간격은 보장되지 않는다. |
| rAF의 `timestamp`는 콜백 안의 `performance.now()`와 항상 같다. | 같은 time origin을 사용하지만 frame timestamp와 실제 코드 실행 시각은 다를 수 있다. |
| `cancelAnimationFrame`은 현재 실행 중인 콜백을 강제 종료한다. | 아직 실행되지 않은 callback handle을 Map에서 제거한다. |

## 16. 나중에 다시 설명해야 할 핵심 문장

아래 문장을 스스로 설명할 수 있다면 이번 내용을 유지하고 있는 것이다.

> `requestAnimationFrame(tick)`은 `tick`을 Timer Task나 일반 Task Queue에 직접 넣지 않는다. 브라우저가 관리하는 Animation Frame Callback Map에 콜백을 등록한다. Rendering Opportunity가 생기면 Rendering Task Source를 가진 화면 갱신 Task가 실행을 기다리고, Event Loop가 그 Task를 선택하면 화면 갱신 절차 안에서 `tick(timestamp)`이 호출된다. 메인 스레드가 긴 Task로 차단되면 프레임은 건너뛰며, 차단 뒤 다음 콜백의 큰 `deltaTime`에 실제 경과 시간이 드러난다.

다음 질문에도 답할 수 있어야 한다.

1. `requestAnimationFrame(tick)`을 호출하면 `tick`은 어디에 저장되는가?
2. Rendering Opportunity는 함수, Task, Queue 중 무엇인가?
3. Rendering Task Source와 Task Queue는 어떻게 다른가?
4. `tick`이 별도의 Task가 아니라고 설명하는 이유는 무엇인가?
5. `tick` 내부의 `requestAnimationFrame(tick)`이 동기 재귀 호출이 아닌 이유는 무엇인가?
6. 메인 스레드가 막힌 동안 놓친 콜백이 모두 누적되지 않은 이유는 무엇인가?
7. 첫 번째 `deltaTime`이 작은 음수가 될 수 있는 이유는 무엇인가?
8. `cancelAnimationFrame`은 무엇을 취소하는가?
9. 리듬게임의 판정 시간을 rAF 호출 횟수로 계산하면 안 되는 이유는 무엇인가?

## 참고 자료

- [HTML Standard — Event loop processing model and rendering opportunities](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model)
- [HTML Standard — Animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames)
- [`setInterval` 실험으로 이해한 브라우저 Event Loop](./set-interval-event-loop.md)
- [여러 Task Queue와 Event Loop의 정확한 관계](./task-queues-and-event-loop.md)
- 프로젝트 구현: `src/experiments/TimerComparison.ts`
