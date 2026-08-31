# `setInterval` 실험으로 이해한 브라우저 Event Loop

> 학습일: 2026년 8월 31일
>
> 관련 코드: `src/experiments/TimerComparison.ts`
>
> 실험 주제: 메인 스레드를 의도적으로 차단했을 때 `setInterval`의 실제 실행 간격이 어떻게 달라지는가?

## 1. 실험 목적

100ms 간격의 `setInterval`을 실행하면서 약 1초 뒤 메인 스레드를 500ms 동안 차단했다.

```text
실험 시작
↓
100ms 간격으로 시간 측정
↓
1초 뒤 blockMainThread(500) 실행
↓
2.5초 뒤 clearInterval로 실험 종료
```

각 콜백에서는 `performance.now()`를 이용해 직전 콜백이 실제로 실행된 시각과의 차이를 계산했다.

```ts
const nowTime = performance.now();

timerSample.deltaTime = nowTime - timerSample.timestamp;
timerSample.timestamp = nowTime;
```

## 2. 실제 측정 결과

CPU 부하 전에는 `deltaTime`이 대체로 100ms에 가까웠다.

```text
99.6ms
101.6ms
100.5ms
100.2ms
```

CPU 부하가 발생한 구간에서는 다음과 같이 약 500ms가 측정됐다.

```text
count 10
timestamp: 2614.5ms
deltaTime: 98.9ms

count 11
timestamp: 3115.3ms
deltaTime: 500.8ms

count 12
timestamp: 3215.7ms
deltaTime: 100.4ms
```

계산하면 다음과 같다.

```text
3115.3 - 2614.5 = 500.8ms
```

핵심 결론은 다음과 같다.

> CPU 부하 중에 브라우저의 시간이 멈춘 것이 아니다. 메인 스레드가 바빠서 interval 콜백의 실제 실행이 지연됐고, 그 지연 시간이 `deltaTime`에 나타났다.

## 3. 반드시 구분해야 하는 네 가지 영역

### 브라우저 타이머 관리 영역

`setInterval`을 호출하면 즉시 콜백이 Task Queue에 들어가는 것이 아니다. 브라우저가 먼저 활성 타이머를 관리한다.

개념적으로 다음 정보가 등록된다.

```text
Timer ID
콜백 함수 참조
대기 시간 100ms
반복 여부
다음 만료 시각
```

### Task Queue

타이머의 대기 시간이 지나면 콜백을 실행하기 위한 Timer Task가 실행 가능한 상태가 되고 Task Queue에서 기다린다.

Task Queue에는 실행 컨텍스트가 들어가는 것이 아니다. 앞으로 처리할 작업인 Task가 들어간다.

### Event Loop

Event Loop는 실행 가능한 Task를 선택해 그 Task의 실행 단계를 진행한다.

Timer Task의 경우 실행 단계에서 등록된 콜백 함수를 호출한다.

### Call Stack

Task가 Call Stack으로 이동하는 것이 아니다. Task가 JavaScript 함수를 호출하는 순간 그 함수의 실행 컨텍스트가 만들어져 Call Stack에 추가된다.

```text
Task Queue에서 Timer Task 선택
↓
Timer Task가 콜백 함수 호출
↓
콜백 함수 실행 컨텍스트 생성
↓
Call Stack에 추가
```

## 4. 버튼 클릭부터 타이머 등록까지

`Run setInterval` 버튼을 클릭했을 때의 전체 흐름은 다음과 같다.

```text
사용자가 버튼 클릭
↓
브라우저가 Click Task를 Queue에 추가
↓
Event Loop가 Click Task 선택
↓
브라우저가 클릭 이벤트 전달
↓
React onClick 함수 호출
↓
runIntervalExperiment 호출
↓
startIntervalExperiment 호출
```

이때 Call Stack은 개념적으로 다음과 같다.

```text
┌───────────────────────────┐
│ startIntervalExperiment   │
├───────────────────────────┤
│ runIntervalExperiment     │
├───────────────────────────┤
│ onClick                   │
└───────────────────────────┘
```

`startIntervalExperiment`는 다음 작업을 수행한다.

```text
측정 상태 생성
↓
setInterval 등록
↓
interval을 중단할 함수 반환
↓
startIntervalExperiment 종료
```

`runIntervalExperiment`는 반환받은 중단 함수를 보관하고 다음 두 타이머도 등록한다.

```text
1초 뒤 blockMainThread(500)를 호출할 setTimeout
2.5초 뒤 stopInterval을 호출할 setTimeout
```

모든 등록이 끝난 뒤에야 `runIntervalExperiment`의 실행 컨텍스트가 제거된다. 이어서 `onClick` 실행도 끝나고 Click Task가 완료된다.

## 5. 정상적인 interval 한 회차

메인 스레드가 한가할 때는 다음 과정이 반복된다.

```text
브라우저 타이머 영역에서 대기
↓
최소 100ms 경과
↓
Timer Task 하나가 Task Queue에 추가
↓
Event Loop가 Timer Task 선택
↓
interval 콜백 호출
↓
콜백 실행 컨텍스트가 Call Stack에 추가
↓
performance.now()로 시간 측정
↓
timerSampleArray에 측정값 추가
↓
콜백 종료 및 실행 컨텍스트 제거
↓
다음 타이머 회차 준비
```

중요한 점은 하나의 콜백 실행 컨텍스트가 계속 Call Stack을 차지하는 것이 아니라는 것이다. 매 회차마다 콜백이 새로 호출되고, 실행이 끝나면 해당 실행 컨텍스트도 제거된다.

## 6. 클로저로 유지되는 측정 상태

`startIntervalExperiment`가 종료되면 그 실행 컨텍스트는 Call Stack에서 제거된다. 그렇다고 `timerSample`과 `timerSampleArray`까지 즉시 사라지는 것은 아니다.

```text
interval 콜백
├── timerSample 참조
└── timerSampleArray 참조

반환된 stopInterval 함수
├── Timer ID 참조
└── timerSampleArray 참조
```

interval 콜백과 반환된 중단 함수가 해당 렉시컬 환경을 클로저로 참조하고 있기 때문에 다음 실행에서도 같은 측정 상태를 사용할 수 있다.

즉, 다음 두 개념을 구분해야 한다.

```text
함수 실행 컨텍스트가 Call Stack에서 제거됨
≠
함수가 참조하던 모든 데이터가 즉시 사라짐
```

## 7. 500ms 메인 스레드 차단 중 발생하는 일

약 1초 뒤 CPU 부하용 Timer Task가 실행되면 해당 콜백이 `blockMainThread(500)`을 호출한다.

```text
┌─────────────────────────────┐
│ blockMainThread             │
├─────────────────────────────┤
│ CPU 부하용 setTimeout 콜백    │
└─────────────────────────────┘
```

`blockMainThread` 내부의 `while` 반복문은 약 500ms 동안 JavaScript 실행을 계속한다.

```ts
while (performance.now() - startedAt < duration) {}
```

그동안에는 다음 작업이 발생한다.

```text
브라우저의 시간은 계속 흐름
↓
interval의 다음 실행 시간이 됨
↓
Timer Task 하나가 실행을 기다림
↓
현재 CPU 부하 Task가 끝나지 않았으므로 Event Loop가 다음 Task를 실행하지 못함
↓
blockMainThread 종료
↓
Call Stack이 비워짐
↓
기다리던 Timer Task 실행
```

따라서 타이머가 멈춘 것이 아니라 콜백의 실제 호출이 지연된 것이다.

## 8. 동일 interval의 Task가 계속 쌓이는가?

처음에는 다음과 같이 이해했다.

```text
500ms 동안 메인 스레드 차단
↓
100ms마다 interval Task가 계속 추가
↓
Task 다섯 개가 Queue에 누적
↓
차단 종료 후 다섯 개를 연속 실행
```

하지만 실험 결과는 그렇지 않았다.

```text
count 10 → 약 100ms
count 11 → 약 500ms
count 12 → 약 100ms
```

만약 놓친 Task 여러 개가 누적됐다면 차단 직후 다음과 같은 결과가 나타났어야 한다.

```text
count 11 → 약 500ms
count 12 → 거의 0ms
count 13 → 거의 0ms
count 14 → 거의 0ms
```

실제 브라우저에서는 놓친 interval 호출을 모두 연속 재생하지 않았다. HTML 표준 기반의 모델에서는 현재 interval 회차의 Task가 콜백을 실행한 뒤 다음 반복 회차를 준비한다.

따라서 이번 실험은 다음과 같이 이해한다.

```text
다음 interval 회차 만료
↓
Timer Task 하나가 기다림
↓
메인 스레드 차단 중에는 실행되지 못함
↓
차단 종료 후 한 번 실행
↓
다음 회차 준비
```

이는 동일한 `setInterval` 하나에 대한 설명이다. 서로 다른 여러 타이머를 등록했다면 각 타이머에서 생성된 Task들이 함께 대기할 수 있다.

## 9. 헷갈렸던 부분과 바로잡은 이해

| 처음의 이해 | 바로잡은 이해 |
|---|---|
| `setInterval`을 호출하면 Timer Task가 즉시 Queue에 들어간다. | 먼저 브라우저 타이머 영역에 등록되고, 대기 시간이 지난 뒤 Timer Task가 Queue에 추가된다. |
| `setInterval(..., 100)`은 정확히 100ms마다 실행된다. | 100ms는 정확한 실행 시각이 아니라 최소 대기 시간에 가깝다. 실제 실행은 더 늦어질 수 있다. |
| 100ms마다 동일 interval의 Task가 무조건 계속 누적된다. | 실행할 회차의 Timer Task가 기다리며, 놓친 모든 회차가 무한히 누적되어 재생되는 것은 아니다. |
| Task가 Task Queue에서 Call Stack으로 이동한다. | Event Loop가 Task를 선택하고, Task가 호출한 함수의 실행 컨텍스트가 Call Stack에 생성된다. |
| Task Queue에는 함수의 실행 컨텍스트가 들어간다. | Task Queue에는 처리할 작업인 Task가 들어가며 실행 컨텍스트는 함수 호출 시 생성된다. |
| 타이머 콜백은 Microtask Queue에 들어간다. | `setInterval`과 `setTimeout` 콜백은 Timer Task다. Promise 반응과 `queueMicrotask` 등이 Microtask다. |
| 메인 스레드가 막히면 브라우저 타이머도 멈춘다. | 타이머 시간은 계속 흐르지만 Event Loop가 콜백을 실행하지 못한다. |
| `setInterval` 등록 직후 `runIntervalExperiment` 실행 컨텍스트가 사라진다. | CPU 부하용·종료용 타이머까지 모두 등록하고 함수가 반환된 뒤 실행 컨텍스트가 제거된다. |
| 실행 컨텍스트가 제거되면 측정 배열도 사라진다. | interval 콜백과 중단 함수가 렉시컬 환경을 클로저로 참조하므로 측정 상태가 유지된다. |

## 10. Task와 Microtask의 위치

이번 실험의 interval 콜백, CPU 부하 콜백, 종료 콜백은 모두 Timer Task다.

```text
Task
├── 클릭 이벤트 처리
├── setInterval 콜백 실행
└── setTimeout 콜백 실행

Microtask
├── Promise.then 콜백
├── Promise.catch/finally 콜백
├── await 이후 continuation
└── queueMicrotask 콜백
```

단순화한 Event Loop의 한 순환은 다음과 같다.

```text
Task 하나 선택 및 실행
↓
Call Stack이 비워짐
↓
Microtask Queue를 전부 처리
↓
필요하면 화면 렌더링
↓
다음 Task 선택
```

Task나 Microtask 자체가 Call Stack으로 이동하는 것은 아니다. 각각의 작업이 콜백을 호출할 때 해당 함수의 실행 컨텍스트가 Call Stack에 생성된다.

## 11. 이 실험이 게임 루프에 주는 교훈

타이머의 호출 횟수를 기준으로 게임 시간을 계산하면 안 된다.

다음 방식은 실제 지연 시간을 반영하지 못한다.

```ts
elapsedTime += 100;
```

메인 스레드가 500ms 막혀도 위 값은 다음 콜백에서 100만 증가하기 때문이다.

실제로 흐른 시간을 기준으로 계산해야 한다.

```ts
const elapsedTime = performance.now() - startedAt;
```

또는 프레임 사이의 실제 시간 차이를 사용한다.

```ts
const deltaTime = currentTimestamp - previousTimestamp;
```

리듬게임에서는 특히 다음 원칙이 중요하다.

> Callback Count가 아니라 실제 Time을 기준으로 게임 상태를 계산한다.

## 12. 나중에 다시 설명해야 할 핵심 문장

아래 문장을 스스로 설명할 수 있다면 이번 내용을 유지하고 있는 것이다.

> `setInterval`은 콜백을 정확한 시간에 실행해 주는 API가 아니다. 브라우저 타이머 영역에 반복 타이머를 등록하고, 대기 시간이 지나면 Timer Task가 실행을 기다린다. Event Loop가 그 Task를 선택하면 Task가 콜백을 호출하고, 그때 콜백 실행 컨텍스트가 Call Stack에 생성된다. 메인 스레드가 긴 Task로 점유되어 있으면 콜백 실행은 지연되며, 그 지연은 `performance.now()`로 계산한 `deltaTime`에 나타난다.

다음 질문에도 답할 수 있어야 한다.

1. Timer Task는 언제 Task Queue에 들어가는가?
2. Task가 Call Stack으로 직접 이동하지 않는 이유는 무엇인가?
3. 함수 실행 컨텍스트는 언제 생성되는가?
4. 메인 스레드가 막혀도 `performance.now()`가 계속 증가하는 이유는 무엇인가?
5. 500ms 차단 뒤 놓친 interval 콜백들이 모두 연속 실행되지 않은 이유는 무엇인가?
6. `timerSampleArray`는 `startIntervalExperiment`가 끝난 뒤에도 왜 유지되는가?
7. 게임 시간을 콜백 횟수가 아니라 실제 시간으로 계산해야 하는 이유는 무엇인가?

## 참고 자료

- [HTML Standard — Timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)
- 프로젝트 구현: `src/experiments/TimerComparison.ts`
