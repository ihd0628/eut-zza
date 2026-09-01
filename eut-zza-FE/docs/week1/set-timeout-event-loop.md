# 재등록 `setTimeout` 실험으로 이해한 브라우저 Event Loop

> 학습일: 2026년 8월 31일
>
> 관련 코드: `src/experiments/TimerComparison.ts`
>
> 실험 주제: `tick`이 다음 `setTimeout`을 등록하는 반복 구조에서 메인 스레드 차단이 실제 실행 간격에 어떤 영향을 주는가?

## 1. 실험 목적

이번 실험은 일회성 `setTimeout`을 이용해 약 100ms 간격의 반복 동작을 직접 만들고, 약 1초 뒤 메인 스레드를 500ms 동안 차단한다.

```text
실험 시작
↓
100ms 뒤 tick을 실행할 일회성 Timer 등록
↓
tick 실행
↓
tick이 다음 100ms Timer 등록
↓
위 과정 반복
↓
1초 뒤 blockMainThread(500) 실행
↓
2.5초 뒤 clearTimeout으로 실험 종료
```

각 `tick`에서는 `performance.now()`를 이용해 직전 실행 시각과 현재 실행 시각의 차이를 측정한다.

```ts
const nowTime = performance.now();

timerSample.count = timerSample.count + 1;
timerSample.deltaTime = nowTime - timerSample.timestamp;
timerSample.timestamp = nowTime;
```

핵심 질문은 다음과 같다.

```text
setTimeout(tick, 100)은 정확히 무엇을 등록하는가?
tick은 자신을 재귀 호출하는가?
메인 스레드가 막힌 동안 다음 tick들은 계속 쌓이는가?
timeoutIdRef에는 왜 항상 최신 ID를 저장하는가?
clearTimeout은 이미 Queue에 들어간 Timer Task도 취소할 수 있는가?
```

## 2. 실험 코드의 구조

현재 구현은 다음과 같다.

```ts
export const startTimeoutExperiment = () => {
  let timerSample: TimerSample = {
    count: 0,
    timestamp: performance.now(),
    deltaTime: 0,
  };
  let timeoutIdRef: number;

  const timerSampleArray: TimerSample[] = [];

  const tick = () => {
    const nowTime = performance.now();

    timerSample.count = timerSample.count + 1;
    timerSample.deltaTime = nowTime - timerSample.timestamp;
    timerSample.timestamp = nowTime;

    timerSampleArray.push({ ...timerSample });

    timeoutIdRef = setTimeout(tick, 100);
  };

  timeoutIdRef = setTimeout(tick, 100);

  return () => {
    clearTimeout(timeoutIdRef);
    console.log(timerSampleArray);
  };
};
```

`runTimeoutExperiment`는 여기에 CPU 부하용 Timer와 종료용 Timer를 추가한다.

```ts
export const runTimeoutExperiment = () => {
  const stopTimeout = startTimeoutExperiment();

  setTimeout(() => {
    blockMainThread(500);
  }, 1000);

  setTimeout(() => {
    stopTimeout();
  }, 2500);
};
```

따라서 동시에 관리되는 Timer는 개념적으로 세 종류다.

```text
1. 현재 대기 중인 다음 tick용 Timer
2. 1초 뒤 메인 스레드를 차단할 Timer
3. 2.5초 뒤 실험을 종료할 Timer
```

## 3. 예상되는 측정 결과

CPU 부하 전후에는 `deltaTime`이 대체로 약 100ms 이상으로 측정된다.

```text
약 100ms
약 100ms
약 100ms
...
```

CPU 부하 구간을 사이에 둔 두 `tick` 사이에는 큰 `deltaTime`이 한 번 나타난다.

```text
약 100ms
↓
약 500ms 이상일 수 있는 큰 간격
↓
다시 약 100ms
```

큰 값이 반드시 정확히 500ms일 필요는 없다. 이 실험은 각 `tick` 안에서 `performance.now()`를 직접 측정하므로 차단을 사이에 둔 두 측정값의 차이는 최소 약 500ms이며, 마지막 `tick`과 차단 시작 사이의 시간 및 브라우저의 추가 스케줄링 지연만큼 더 커질 수 있다.

중요한 관찰은 다음과 같다.

> `setTimeout(..., 100)`은 콜백을 정확히 100ms 뒤에 실행한다는 뜻이 아니다. 최소 대기 시간이 지난 뒤 콜백을 실행할 Timer Task가 준비될 수 있다는 뜻이며, 실제 호출 시각은 Event Loop와 메인 스레드 상태에 따라 더 늦어진다.

## 4. 반드시 구분해야 하는 네 가지 개념

### 일회성 Timer

`setTimeout(tick, 100)`을 호출하면 브라우저의 타이머 관리 상태에 일회성 Timer가 등록된다.

개념적으로 다음 정보가 필요하다.

```text
Timer ID
tick 함수 참조
대기 시간 100ms
반복 여부 false
만료 시각
```

정확한 HTML 표준 모델에는 외부에 반환하는 Timer ID를 관리하는 Map과 내부 활성 Timer를 관리하는 Map이 있다. 실제 브라우저 구현의 자료구조가 이 표준 추상화와 반드시 1:1로 같을 필요는 없다.

### Timer Task

최소 대기 시간이 지난 뒤 브라우저는 등록된 콜백을 처리하기 위한 Task를 Timer Task Source에 queue한다.

```text
일회성 Timer 등록
↓
최소 대기 시간 경과
↓
Timer Task가 실행 가능한 상태로 Queue에서 대기
```

Timer를 등록하는 것과 Timer Task를 Queue에 넣는 것은 서로 다른 단계다.

### Task Queue와 Event Loop

Timer Task Source는 Task의 논리적 출처다. 그 Source와 연결된 실제 Task Queue에서 Timer Task가 기다린다.

Event Loop는 실행 가능한 일반 Task Queue들 중 하나를 고르고, 선택한 Queue에서 Task 하나를 실행한다.

Task Queue가 여러 개일 수 있다는 내용은 [`task-queues-and-event-loop.md`](./task-queues-and-event-loop.md)에서 자세히 정리한다.

### Call Stack과 실행 컨텍스트

Timer Task 자체가 Call Stack으로 이동하는 것은 아니다.

```text
Event Loop가 Timer Task 선택
↓
Timer Task의 실행 단계 시작
↓
등록된 tick 함수 호출
↓
tick 실행 컨텍스트 생성
↓
Call Stack에 추가
```

## 5. 버튼 클릭부터 첫 Timer 등록까지

`Run setTimeout` 버튼을 클릭하면 먼저 사용자 입력을 처리하는 Click Task가 실행된다.

```text
사용자가 버튼 클릭
↓
Click Task 실행
↓
React onClick 함수 호출
↓
runTimeoutExperiment 호출
↓
startTimeoutExperiment 호출
```

이때 Call Stack은 개념적으로 다음과 같다.

```text
┌───────────────────────────────┐
│ startTimeoutExperiment        │
├───────────────────────────────┤
│ runTimeoutExperiment          │
├───────────────────────────────┤
│ onClick                       │
└───────────────────────────────┘
```

`startTimeoutExperiment`는 먼저 측정 상태와 `tick` 함수를 만든다.

```text
timerSample 생성
timerSampleArray 생성
timeoutIdRef 바인딩 생성
tick 함수 생성
```

그다음 첫 번째 Timer를 등록한다.

```ts
timeoutIdRef = setTimeout(tick, 100);
```

이때 일어나는 일을 단순화하면 다음과 같다.

```text
새 Timer ID 생성
↓
tick과 100ms 정보를 가진 일회성 Timer 등록
↓
Timer ID 반환
↓
timeoutIdRef에 저장
```

`tick`은 아직 호출되지 않았으므로 `tick`의 실행 컨텍스트도 아직 존재하지 않는다.

`startTimeoutExperiment`는 중단 함수를 반환한다.

```ts
return () => {
  clearTimeout(timeoutIdRef);
  console.log(timerSampleArray);
};
```

이후 `runTimeoutExperiment`가 CPU 부하용 Timer와 종료용 Timer까지 등록한 뒤 반환하고, `onClick`까지 끝나면 Click Task가 완료된다.

## 6. 정상적인 `tick` 한 회차

첫 Timer의 최소 대기 시간이 지나고 Timer Task가 선택되면 다음 과정이 실행된다.

```text
Timer Task 실행
↓
Timer가 아직 유효한지 확인
↓
tick 함수 호출
↓
tick 실행 컨텍스트가 Call Stack에 추가
↓
performance.now() 측정
↓
count, timestamp, deltaTime 갱신
↓
timerSampleArray에 측정값 복사본 추가
↓
다음 100ms 일회성 Timer 등록
↓
새 Timer ID를 timeoutIdRef에 저장
↓
tick 종료
↓
tick 실행 컨텍스트 제거
↓
현재 Timer Task 완료
```

이 과정에서 중요한 점은 다음 Timer가 이전 Timer의 만료와 동시에 자동으로 만들어지는 것이 아니라는 것이다.

```text
현재 tick이 실제로 실행됨
↓
tick 마지막 줄까지 도달함
↓
그제야 다음 setTimeout(tick, 100)을 호출함
```

따라서 메인 스레드가 바빠서 현재 `tick`이 늦게 실행되면 다음 Timer의 등록 시점도 함께 늦어진다.

## 7. 이것은 동기 재귀 호출이 아니다

현재 코드를 재귀라고 부르기도 하지만 정확히는 비동기 자기 재등록 패턴이다.

`tick` 내부에는 다음 코드가 없다.

```ts
tick(); // 동기 재귀 호출
```

대신 다음 코드가 있다.

```ts
setTimeout(tick, 100);
```

동기 재귀 호출이라면 다음처럼 실행 컨텍스트가 계속 쌓인다.

```text
Call Stack

tick 3
tick 2
tick 1
```

현재 구현은 다음처럼 동작한다.

```text
tick 1 실행
↓
미래의 tick 2를 위한 Timer 등록
↓
tick 1 종료 및 실행 컨텍스트 제거
↓
최소 100ms 대기
↓
새 Timer Task가 tick 2 호출
```

따라서 이전 `tick` 실행 컨텍스트 위에 다음 `tick` 실행 컨텍스트가 계속 누적되지 않는다.

정확한 표현은 다음과 같다.

> `tick`은 자신을 동기적으로 재귀 호출하지 않는다. 다음 `tick` 실행을 위한 새 일회성 Timer를 등록한다.

## 8. 클로저로 유지되는 상태

`startTimeoutExperiment`가 반환되면 해당 함수의 실행 컨텍스트는 Call Stack에서 제거된다.

하지만 다음 값들은 계속 사용된다.

```text
timerSample
timerSampleArray
timeoutIdRef
tick
```

그 이유는 `tick`과 반환된 중단 함수가 `startTimeoutExperiment`의 렉시컬 환경을 계속 참조하기 때문이다.

```text
tick 클로저
├── timerSample 바인딩
├── timerSampleArray 바인딩
└── timeoutIdRef 바인딩

stopTimeout 클로저
├── timerSampleArray 바인딩
└── timeoutIdRef 바인딩
```

따라서 다음 두 문장은 서로 다르다.

```text
startTimeoutExperiment 실행 컨텍스트가 Call Stack에서 제거됨
≠
그 함수의 모든 렉시컬 상태가 즉시 사라짐
```

## 9. `timeoutIdRef`가 항상 최신 ID를 가리키는 이유

`setTimeout`을 새로 호출할 때마다 새로운 Timer ID가 반환된다.

```text
첫 Timer 등록  → ID 11
두 번째 등록   → ID 12
세 번째 등록   → ID 13
```

현재 대기 중인 다음 Timer를 중단하려면 가장 최근에 반환된 ID가 필요하다.

```ts
timeoutIdRef = setTimeout(tick, 100);
```

매 `tick`이 `timeoutIdRef` 바인딩의 값을 새 ID로 교체한다.

```text
timeoutIdRef

11 → 12 → 13 → 14 → ...
```

반환된 `stopTimeout` 함수는 오래된 숫자 하나를 복사해 보관하는 것이 아니다. 클로저를 통해 같은 `timeoutIdRef` 바인딩을 참조하므로 실행되는 순간의 최신 값을 읽는다.

```ts
return () => {
  clearTimeout(timeoutIdRef); // 가장 최근에 대입된 ID 읽기
  console.log(timerSampleArray);
};
```

여기서 `timeoutIdRef`는 React의 `useRef` 객체가 아니다. 다음 Timer ID를 계속 교체해서 보관하는 일반 지역 변수의 바인딩이다.

## 10. 왜 다음 Timer는 하나만 존재하는가?

이 반복 구조에서는 `tick` 한 번이 다음 Timer 하나만 등록한다.

```text
tick 1
└── Timer 2 하나 등록

tick 2
└── Timer 3 하나 등록

tick 3
└── Timer 4 하나 등록
```

Timer 2의 `tick`이 아직 실행되지 않았다면 Timer 3은 아직 등록되지 않았다.

```text
Timer 2 대기 또는 Task 대기 중
↓
tick 2가 아직 호출되지 않음
↓
Timer 3을 등록하는 코드도 아직 실행되지 않음
```

따라서 이 체인 자체는 메인 스레드 차단 중에 100ms마다 다음 `tick` Task를 계속 만들어 쌓지 않는다. 현재 단계의 Timer Task 또는 콜백이 기다리고 있을 뿐이며, 그 `tick`이 실행돼야 다음 Timer가 생긴다.

다만 CPU 부하용 Timer와 종료용 Timer처럼 별도로 등록한 다른 Timer들의 Task는 각각 준비되어 함께 기다릴 수 있다.

## 11. 500ms 메인 스레드 차단 중 발생하는 일

약 1초 뒤 CPU 부하용 Timer Task가 실행되면 그 Task의 콜백이 `blockMainThread(500)`을 호출한다.

```ts
while (performance.now() - startedAt < duration) {}
```

이 반복문은 약 500ms 동안 JavaScript 실행을 계속한다.

```text
CPU 부하용 Timer Task 실행
↓
blockMainThread 실행 컨텍스트가 Call Stack 점유
↓
현재 tick용 Timer의 최소 대기 시간 경과 가능
↓
Timer Task가 실행을 기다림
↓
하지만 현재 CPU 부하 Task가 끝나지 않음
↓
Event Loop가 다음 Task를 실행할 수 없음
↓
blockMainThread 종료
↓
CPU 부하용 Timer Task 완료
↓
이후 기다리던 Timer Task 선택 가능
↓
tick 호출
```

이때 브라우저의 단조 증가 시간은 계속 흐른다. 따라서 차단 뒤 `performance.now()`로 시간을 측정하면 직전 `tick` 이후 실제로 흐른 긴 시간이 `deltaTime`에 반영된다.

## 12. 큰 `deltaTime`이 정확히 500ms보다 커질 수 있는 이유

`blockMainThread(500)`은 해당 함수가 약 500ms 동안 메인 스레드를 점유한다는 의미다.

하지만 `deltaTime`은 다음 두 시각의 차이다.

```text
직전 tick이 실제로 실행된 시각
↓
차단 이후 다음 tick이 실제로 실행된 시각
```

다음 요소들이 함께 포함된다.

```text
직전 tick과 차단 시작 사이의 시간
500ms CPU 부하 시간
차단 종료 뒤 Timer Task가 선택될 때까지의 시간
다른 Task와 Microtask를 처리한 시간
브라우저의 Timer padding과 스케줄링 오차
```

또한 약 1초 시점에는 다음 두 Timer Task가 비슷한 시기에 실행 가능해질 수 있다.

```text
다음 tick을 실행할 Timer Task
CPU 부하를 시작할 Timer Task
```

다음 `tick`이 먼저 실행되고 CPU 부하가 시작될 수도 있고, CPU 부하가 먼저 시작돼 `tick`이 뒤로 밀릴 수도 있다. 따라서 이 실험에서 차단을 가로지르는 `deltaTime`은 최소 약 500ms이고 보통 그보다 커질 수 있다. 실험의 핵심은 정확히 500이라는 숫자가 아니라 정상 구간보다 훨씬 큰 간격이 관찰된다는 점이다.

## 13. `clearTimeout`이 실제로 하는 일

`clearTimeout(id)`의 관찰 가능한 보장은 다음과 같다.

> 해당 ID로 등록한 Timer의 handler가 이후 실행되지 않게 한다.

HTML 표준의 개념적 절차에서는 `clearTimeout(id)`이 Timer ID 관리 Map에서 해당 ID를 제거한다.

Timer Task가 실행될 때는 콜백을 호출하기 전에 다음을 확인한다.

```text
이 Timer ID가 아직 Map에 존재하는가?
↓
이 ID가 원래 Timer의 내부 handle과 여전히 일치하는가?
```

확인에 실패하면 Task는 콜백을 호출하지 않고 실행 단계를 중단한다.

따라서 이미 Timer Task가 관련 Task Queue에 들어간 뒤 `clearTimeout(id)`이 호출된 경우에도 handler는 실행되지 않는다.

중요한 점은 이를 반드시 다음처럼 상상할 필요가 없다는 것이다.

```text
clearTimeout이 Task Queue를 직접 검색함
↓
Queue 중간에서 Timer Task 객체를 물리적으로 꺼냄
```

표준 모델에서는 Task가 나중에 선택되더라도 유효성 검사에서 중단될 수 있다. 실제 브라우저는 최적화를 통해 애초에 Task queueing을 생략하거나 대기 작업을 제거할 수도 있지만, JavaScript에서 관찰할 수 있는 핵심 결과는 취소된 handler가 호출되지 않는다는 것이다.

현재 실행 중인 `tick`을 `clearTimeout`이 중간에 강제로 멈추는 것은 아니다. 아직 실행되지 않은 Timer를 취소하는 API다.

## 14. 종료용 Timer가 실행될 때

약 2.5초 뒤 종료용 Timer Task가 선택되면 그 Task의 콜백이 `stopTimeout()`을 호출한다.

```text
종료용 Timer Task 실행
↓
stopTimeout 호출
↓
최신 timeoutIdRef 값 읽기
↓
clearTimeout(최신 ID)
↓
다음 tick용 Timer handler 실행 방지
↓
timerSampleArray 출력
```

`stopTimeout` 자체도 `setTimeout(..., 2500)`으로 등록됐으므로 정확히 2.5초에 실행된다고 보장되지는 않는다. 메인 스레드가 바쁘다면 실행이 늦어질 수 있다.

종료용 Task와 다음 `tick`용 Task가 모두 실행 가능한 상태라면 어떤 것이 먼저 처리됐는지에 따라 마지막 측정 개수가 달라질 수도 있다.

## 15. `setInterval`과 가장 중요한 차이

두 실험 모두 약 100ms마다 콜백 실행을 시도하지만 반복을 만드는 주체가 다르다.

### `setInterval`

```text
setInterval을 한 번 호출
↓
브라우저의 반복 Timer가 다음 회차 관리
↓
같은 콜백을 반복해서 호출
```

### 재등록 `setTimeout`

```text
setTimeout을 한 번 호출
↓
tick을 한 번 호출
↓
tick이 새로운 setTimeout을 직접 등록
↓
다음 tick을 한 번 호출
```

재등록 `setTimeout`에서는 다음 Timer의 100ms 대기가 현재 `tick` 끝부분의 등록 시점부터 시작한다.

```text
현재 tick이 늦게 실행됨
↓
다음 Timer 등록도 늦어짐
↓
전체 반복 시각이 뒤로 이동함
```

또한 콜백 자체가 오래 걸리면 그 실행 시간이 다음 Timer 등록 시점 앞에 포함된다.

```text
tick 실행 시간
+
다음 Timer 최소 대기 100ms
+
Task Queue 대기 시간
=
실제 다음 tick 간격
```

따라서 재등록 `setTimeout`은 정확한 고정 주기 시계가 아니다.

## 16. Timer Task와 Microtask 구분

이번 실험에서 다음 콜백들은 모두 일반 Timer Task를 통해 실행된다.

```text
tick 콜백
blockMainThread를 호출하는 콜백
stopTimeout을 호출하는 콜백
```

Microtask Queue에 들어가는 작업이 아니다.

```text
일반 Task
├── Click Task
├── setTimeout의 Timer Task
└── setInterval의 Timer Task

Microtask
├── Promise.then/catch/finally 반응
├── await 이후 continuation
└── queueMicrotask 콜백
```

하나의 일반 Task가 끝나면 Event Loop는 다음 일반 Task를 선택하기 전에 Microtask checkpoint를 수행한다.

```text
Timer Task 완료
↓
Microtask Queue가 빌 때까지 처리
↓
다음 일반 Task Queue와 Task 선택
```

따라서 Microtask가 많이 쌓여 있다면 다음 `tick`용 Timer Task의 실행도 추가로 늦어질 수 있다.

## 17. 중첩 Timer의 최소 지연 시간

HTML 표준에서는 Timer가 여러 단계로 중첩되고 요청한 지연 시간이 4ms보다 작다면, 일정 단계 이후 지연 시간을 최소 4ms로 보정한다.

현재 실험은 다음과 같이 100ms를 요청한다.

```ts
setTimeout(tick, 100);
```

100ms는 4ms보다 크므로 이 최소 지연 보정은 현재 측정에 직접적인 영향을 주지 않는다.

어떤 경우에도 `setTimeout(..., 0)`이 현재 동기 코드보다 먼저 또는 정확히 0ms 뒤에 실행된다는 뜻은 아니다.

## 18. 이 실험이 게임 루프에 주는 교훈

재등록 `setTimeout`도 정확한 게임 시계로 사용하면 안 된다.

다음 방식은 실제 지연을 반영하지 못한다.

```ts
elapsedTime += 100;
```

메인 스레드가 오랫동안 막혔어도 콜백 한 번에 100만 증가하기 때문이다.

실제로 흐른 시간을 기준으로 계산해야 한다.

```ts
const elapsedTime = performance.now() - startedAt;
```

또는 콜백 사이의 실제 차이를 사용한다.

```ts
const deltaTime = currentTime - previousTime;
```

리듬게임에서는 최종적으로 다음처럼 책임을 분리한다.

```text
Web Audio clock
└── 음악 진행 시간과 판정의 기준

requestAnimationFrame
└── 실제 시간에 맞는 화면을 그리는 시점

setTimeout
└── 정확한 프레임이나 음악 시계가 필요하지 않은 지연 작업
```

## 19. 헷갈렸던 부분과 바로잡은 이해

| 처음의 이해 | 바로잡은 이해 |
|---|---|
| `setTimeout(tick, 100)`은 Timer Task를 즉시 Queue에 넣는다. | 먼저 일회성 Timer를 등록하고 최소 대기 시간이 지난 뒤 Timer Task가 queue된다. |
| 100ms는 정확한 실행 시각이다. | 최소 대기 시간이며 실제 콜백 호출은 더 늦어질 수 있다. |
| Timer 자체를 Task Queue에 등록한다. | Timer를 브라우저의 Timer 관리 상태에 등록하고, 이후 Timer Task가 Queue에서 실행을 기다린다. |
| `tick`이 자기 자신을 재귀 호출한다. | 다음 `tick` 실행을 위한 새 일회성 Timer를 등록한다. |
| 매 `tick`의 실행 컨텍스트가 Call Stack에 누적된다. | 이전 `tick`이 종료된 뒤 미래 Timer Task가 새로운 `tick` 실행 컨텍스트를 만든다. |
| 차단 중에도 100ms마다 이 체인의 다음 Task가 계속 쌓인다. | 현재 `tick`이 실행돼야 다음 Timer가 등록되므로 체인에는 다음 단계 하나만 대기한다. |
| `timeoutIdRef`는 첫 Timer ID를 보관한다. | 매번 최신 Timer ID로 갱신되며 중단 함수는 같은 바인딩의 최신 값을 읽는다. |
| `timeoutIdRef`는 React의 `useRef`다. | 클로저가 공유하는 일반 `let` 바인딩이다. |
| `clearTimeout`은 반드시 Queue에서 Task를 물리적으로 삭제한다. | ID를 무효화하며, 대기 Task가 선택되더라도 유효성 검사에서 handler 호출을 중단할 수 있다. |
| `clearTimeout`은 현재 실행 중인 `tick`도 강제로 종료한다. | 아직 실행되지 않은 Timer handler를 취소한다. |
| 큰 `deltaTime`은 반드시 정확히 500ms다. | `performance.now()` 측정 사이에 전체 차단 시간이 포함되므로 최소 약 500ms이고, Task의 상대적 시점과 추가 지연만큼 더 커질 수 있다. |
| Timer 콜백은 Microtask다. | `setTimeout` 콜백은 Timer Task를 통해 실행되는 일반 Task다. |

## 20. 나중에 다시 설명해야 할 핵심 문장

아래 문장을 스스로 설명할 수 있다면 이번 내용을 유지하고 있는 것이다.

> `setTimeout(tick, 100)`은 `tick`을 즉시 Task Queue에 넣거나 정확히 100ms 뒤 실행하는 API가 아니다. 브라우저에 일회성 Timer를 등록하고, 최소 대기 시간이 지난 뒤 Timer Task가 관련 Queue에서 실행을 기다리게 한다. Event Loop가 그 Task를 선택하면 Task가 `tick`을 호출하고, 그때 `tick` 실행 컨텍스트가 Call Stack에 생성된다. 현재 `tick`은 다음 `setTimeout`을 등록한 뒤 완전히 종료되므로 동기 재귀가 아니며, 메인 스레드가 막히면 실제 호출 간격은 그만큼 늘어난다.

다음 질문에도 답할 수 있어야 한다.

1. `setTimeout(tick, 100)`을 호출한 직후 무엇이 등록되는가?
2. Timer와 Timer Task는 어떻게 다른가?
3. Timer Task Source와 Task Queue는 어떻게 다른가?
4. `tick`의 실행 컨텍스트는 언제 생성되는가?
5. `tick` 내부의 `setTimeout(tick, 100)`이 동기 재귀 호출이 아닌 이유는 무엇인가?
6. 현재 `tick`이 늦게 실행되면 다음 Timer 등록도 늦어지는 이유는 무엇인가?
7. `timeoutIdRef`가 최신 Timer ID를 가리킬 수 있는 이유는 무엇인가?
8. `startTimeoutExperiment`가 반환된 뒤에도 측정 상태가 유지되는 이유는 무엇인가?
9. 메인 스레드 차단 중 이 Timer 체인의 Task가 계속 누적되지 않는 이유는 무엇인가?
10. `clearTimeout`이 이미 queue된 Timer Task의 handler 실행도 막을 수 있는 이유는 무엇인가?
11. 큰 `deltaTime`이 정확히 500ms보다 커질 수 있는 이유는 무엇인가?
12. 게임 시간을 `tick` 호출 횟수가 아니라 실제 시간으로 계산해야 하는 이유는 무엇인가?

## 참고 자료

- [HTML Standard — Timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)
- [HTML Standard — Event loops and Task Queues](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [`setInterval` 실험으로 이해한 브라우저 Event Loop](./set-interval-event-loop.md)
- [`requestAnimationFrame` 실험으로 이해한 브라우저 렌더링 스케줄링](./request-animation-frame-event-loop.md)
- [여러 Task Queue와 Event Loop의 정확한 관계](./task-queues-and-event-loop.md)
- 프로젝트 구현: `src/experiments/TimerComparison.ts`
