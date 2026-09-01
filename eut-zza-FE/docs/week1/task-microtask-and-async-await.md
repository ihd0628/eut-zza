# Task, Microtask, `async`/`await` 실험으로 이해한 비동기 실행 순서

> 학습일: 2026년 9월 1일
>
> 관련 코드: `src/experiments/TaskMicrotaskExperiment.ts`, `src/experiments/AsyncAwaitExperiment.ts`
>
> 학습 주제: 일반 Task와 Microtask의 실행 순서, `await`가 async 함수를 중단하고 재개하는 과정

## 1. 이번 학습에서 바로잡은 핵심 이해

이번 실험에서 얻은 가장 중요한 결론은 다음과 같다.

```text
Promise 객체 자체가 Microtask Queue에 들어가는 것이 아니다.

await는 피연산자를 실행하기 전에 멈추는 것이 아니다.

await는 기다릴 값을 먼저 평가한 뒤,
Promise가 아직 pending이면 현재 async 함수의 실행을 중단한다.

기다리던 Promise가 settle되면
await 이후 코드를 재개할 일이 Microtask로 준비된다.
```

전체 흐름을 한 줄로 표현하면 다음과 같다.

```text
async 함수 호출
↓
await 이전까지 동기 실행
↓
await의 피연산자 평가
↓
Promise가 pending이면 현재 async 함수 중단
↓
호출자 코드 계속 실행
↓
Promise settle
↓
await continuation을 Microtask로 enqueue
↓
현재 Task 종료
↓
Microtask checkpoint
↓
await 이후 코드 재개
```

## 2. Task와 Microtask의 차이

### 일반 Task

Task는 브라우저가 처리해야 할 하나의 작업 단위다.

예시는 다음과 같다.

```text
사용자 클릭 이벤트 처리
Timer 콜백 실행
네트워크 이벤트 처리
```

Task가 함수나 실행 컨텍스트 자체인 것은 아니다.

```text
Task 선택
↓
Task의 실행 단계에서 JavaScript 함수 호출
↓
호출된 함수의 실행 컨텍스트 생성
↓
Call Stack에 추가
```

일반 Task Queue가 여러 개일 수 있는 구조는 [`task-queues-and-event-loop.md`](./task-queues-and-event-loop.md)에서 별도로 정리한다.

### Microtask

Microtask는 현재 실행 중인 JavaScript 작업의 결과를 이어서 처리하기 위한 우선순위가 높은 작업이다.

이번 실험에서 사용한 대표적인 Microtask는 다음과 같다.

```text
Promise.then에 등록된 reaction
queueMicrotask에 전달한 콜백
await 이후 async 함수의 continuation
```

브라우저는 일반적으로 현재 Task가 끝난 뒤 다음 일반 Task를 선택하기 전에 Microtask checkpoint를 수행한다.

```text
일반 Task 하나 실행
↓
그 Task에서 실행된 JavaScript 종료
↓
Microtask checkpoint
↓
Microtask Queue가 빌 때까지 처리
↓
다음 일반 Task 선택 가능
```

Microtask를 처리하는 중에 새로운 Microtask가 추가되면 그것도 같은 checkpoint에서 이어서 처리한다.

## 3. 첫 번째 Task와 Microtask 순서 실험

실험 코드는 다음 구조다.

```ts
export const runTaskMicrotaskExperiment = () => {
  console.log("[sync] start");

  setTimeout(() => {
    console.log("[task] setTimeout");
  }, 0);

  Promise.resolve().then(() => {
    console.log("[microtask] Promise.then");
  });

  queueMicrotask(() => {
    console.log("[microtask] queueMicrotask");
  });

  console.log("[sync] end");
};
```

처음 예상했던 순서는 다음과 같았다.

```text
[sync] start
[sync] end
[task] setTimeout
[microtask] Promise.then
[microtask] queueMicrotask
```

실제 결과는 다음과 같았다.

```text
[sync] start
[sync] end
[microtask] Promise.then
[microtask] queueMicrotask
[task] setTimeout
```

### 동기 로그가 먼저 출력되는 이유

`runTaskMicrotaskExperiment`를 실행하고 있는 현재 Task가 끝나기 전까지 함수 본문의 동기 코드는 계속 실행된다.

따라서 다음 두 로그가 먼저 출력된다.

```text
[sync] start
[sync] end
```

### Timer Task보다 Microtask가 먼저 실행되는 이유

`setTimeout(..., 0)`은 콜백을 즉시 호출한다는 뜻이 아니다. 브라우저에 Timer를 등록하고, 최소 지연 시간이 지난 뒤 관련 Timer Task가 실행될 수 있게 한다.

현재 Task가 끝나면 Event Loop는 다음 일반 Task를 실행하기 전에 Microtask checkpoint를 수행한다. 따라서 두 Microtask가 Timer Task보다 먼저 실행된다.

### 두 Microtask 사이의 순서

다음 두 작업은 모두 같은 Microtask Queue에 들어간다.

```ts
Promise.resolve().then(/* 첫 번째 Microtask */);
queueMicrotask(/* 두 번째 Microtask */);
```

같은 실행 흐름에서 `Promise.then`을 먼저 등록하고 `queueMicrotask`를 나중에 호출했기 때문에 enqueue된 순서대로 실행된다.

```text
Promise.then reaction
↓
queueMicrotask callback
```

`queueMicrotask`는 전달받은 함수를 다음 Microtask checkpoint에서 실행하도록 직접 등록하는 API다. Promise를 만들지 않고 Microtask를 예약해야 할 때 사용할 수 있다.

## 4. 중첩 Microtask 실험

실제 실행 결과는 다음과 같았다.

```text
[sync] start
[sync] end
[microtask 1]
[nested microtask]
[task 1] start
[task 1] end
[microtask inside task 1]
[task 2]
```

### 첫 checkpoint

현재 Click Task가 끝났을 때 `[microtask 1]`이 실행된다. 이 Microtask 안에서 다시 `queueMicrotask`를 호출한다.

```text
첫 번째 Microtask 실행
↓
nested Microtask 추가
↓
Microtask Queue가 아직 비어 있지 않음
↓
같은 checkpoint에서 nested Microtask 실행
```

따라서 `[task 1]`보다 `[nested microtask]`가 먼저 출력된다.

### Task 1과 Task 2 사이

`Task 1`이 실행되는 동안 Promise reaction Microtask를 추가한다.

```text
[task 1] start
↓
Microtask 등록
↓
[task 1] end
↓
Task 1 완료
↓
Microtask checkpoint
↓
[microtask inside task 1]
↓
[task 2]
```

이 실험으로 확인한 규칙은 다음과 같다.

> 일반 Task 하나가 끝나면 Event Loop는 다음 일반 Task를 선택하기 전에 Microtask Queue를 빌 때까지 처리한다.

## 5. 이미 완료된 Promise를 `await`하는 실험

실험 코드는 다음 구조다.

```ts
const asyncWork = async () => {
  console.log("[async] before await");

  await Promise.resolve();

  console.log("[async] after await");
};

export const runAsyncAwaitExperiment = () => {
  console.log("[sync] start");

  void asyncWork();

  console.log("[sync] end");
};
```

실제 실행 순서는 다음과 같았다.

```text
[sync] start
[async] before await
[sync] end
[async] after await
```

### async 함수 전체가 비동기적으로 실행되는 것은 아니다

`asyncWork()`를 호출하면 함수 본문은 첫 번째 `await`를 만날 때까지 동기적으로 실행된다.

```text
asyncWork 호출
↓
[async] before await 출력
↓
Promise.resolve() 평가
↓
await에서 asyncWork 실행 중단
```

따라서 `[async] before await`은 호출자의 `[sync] end`보다 먼저 출력된다.

### 완료된 Promise인데도 즉시 이어서 실행되지 않는 이유

`Promise.resolve()`가 반환한 Promise는 이미 fulfilled 상태다. 하지만 `await` 이후 코드를 같은 Call Stack에서 즉시 실행하지는 않는다.

`asyncWork`는 실행을 중단하고, await 이후 continuation을 Microtask로 실행할 수 있게 준비한다. 호출자인 `runAsyncAwaitExperiment`가 계속 실행되므로 `[sync] end`가 먼저 출력된다.

현재 Task가 끝난 뒤 Microtask checkpoint에서 `asyncWork`가 재개되어 `[async] after await`이 출력된다.

### `void asyncWork()`의 의미

`async` 함수는 항상 Promise를 반환한다.

```text
asyncWork() 호출
↓
Promise 반환
```

`void asyncWork()`의 `void`는 그 반환값을 사용하지 않겠다는 뜻이다. 다음 의미는 아니다.

```text
asyncWork 실행 취소        X
Promise 생성 방지          X
Microtask 실행 방지         X
```

## 6. Timer로 Promise를 완료시키는 `await` 실험

### 실험 코드

실제로 실행한 `src/experiments/AsyncAwaitExperiment.ts`의 코드는 다음과 같다.

```ts
const waitWithTimer = () => {
  return new Promise<string>((resolve) => {
    setTimeout(() => {
      console.log("[task] resolve Promise");
      resolve("완료");
    }, 0);
  });
};

const asyncTimerWork = async () => {
  console.log("[async] before await");

  const result = await waitWithTimer();

  console.log("[async] after await:", result);
};

export const runAsyncTimerExperiment = () => {
  console.log("[sync] start");

  void asyncTimerWork();

  setTimeout(() => {
    console.log("[task] another timer");
  }, 0);

  console.log("[sync] end");
};
```

화면에서는 `src/components/experiments/AsyncPlayground.tsx`의 버튼으로 실험 함수를 호출했다.

```tsx
<button
  type='button'
  onClick={() => {
    console.log("Running async timer experiment");
    runAsyncTimerExperiment();
  }}
>
  Run async timer experiment
</button>
```

사용자가 이 버튼을 누르면 Click Task가 실행되고, React의 `onClick` 함수가 `runAsyncTimerExperiment()`를 호출하면서 실험이 시작된다.

### 실제 실행 결과

버튼의 실험 시작 안내 로그를 제외한 실험 함수 내부의 출력 순서는 다음과 같았다.

```text
[sync] start
[async] before await
[sync] end
[task] resolve Promise
[async] after await: 완료
[task] another timer
```

이 실험에서 가장 크게 헷갈렸던 부분은 다음 코드의 평가 순서였다.

```ts
const result = await waitWithTimer();
```

### 잘못 생각했던 흐름

처음에는 다음처럼 생각했다.

```text
await를 만남
↓
waitWithTimer를 아직 호출하지 않은 채 async 함수 중단
↓
await 이후 Microtask가 즉시 Queue에 들어감
↓
나중에 Microtask가 waitWithTimer를 다시 실행
```

하지만 실제 실행은 이와 다르다.

### 정확한 평가 순서

`await`는 기다릴 표현식을 먼저 평가해야 한다.

```text
waitWithTimer() 호출
↓
new Promise(...) 실행
↓
Promise executor 동기 실행
↓
resolve용 setTimeout 등록
↓
pending Promise 반환
↓
await가 그 Promise를 기다림
↓
asyncTimerWork 중단
```

개념적으로 다음과 같이 이해할 수 있다.

```ts
const pendingPromise = waitWithTimer(); // 먼저 동기적으로 실행

// pendingPromise가 완료될 때까지 asyncTimerWork 중단

const result = pendingPromise의_완료값;
```

이 코드는 실제 변환 결과가 아니라 평가 순서를 이해하기 위한 표현이다.

## 7. 두 Promise를 구분하기

Timer 실험에는 개념적으로 중요한 Promise가 두 개 있다.

| Promise | 역할 |
|---|---|
| `waitWithTimer()`가 반환한 Promise | Timer가 `resolve("완료")`할 때까지 `await`가 기다리는 Promise |
| `asyncTimerWork()`가 반환한 Promise | `asyncTimerWork` 전체 실행의 완료 상태를 나타내는 Promise |

두 Promise 모두 Microtask Queue에 들어가는 것이 아니다.

```text
Promise
└── 상태와 결과를 관리하는 객체

Promise reaction / await continuation
└── Promise가 settle된 뒤 실행할 동작

Microtask
└── 실행 가능해진 reaction 또는 continuation을 수행할 작업
```

pending Promise에는 나중에 수행할 reaction 정보가 연결된다. Promise가 settle되어 실행 가능해졌을 때 비로소 관련 작업이 Microtask Queue에 추가된다.

## 8. Timer를 사용하는 `await`의 전체 실행 과정

### Click Task의 동기 실행

```text
runAsyncTimerExperiment 호출
↓
[sync] start
↓
asyncTimerWork 호출
↓
[async] before await
↓
waitWithTimer 호출
↓
첫 번째 Timer 등록: resolve Promise
↓
pending Promise 반환
↓
asyncTimerWork 중단
↓
호출자 runAsyncTimerExperiment로 복귀
↓
두 번째 Timer 등록: another timer
↓
[sync] end
↓
Click Task 완료
```

이때 await continuation은 pending Promise에 연결되어 있지만 아직 실행 가능한 Microtask는 아니다.

```text
등록된 Timer 순서
1. resolve Promise
2. another timer

await continuation용 Microtask
아직 없음
```

### 첫 번째 Timer Task 실행

먼저 등록된 Timer의 Task가 실행된다.

```text
[task] resolve Promise
↓
resolve("완료")
↓
기다리던 Promise fulfilled
↓
await continuation을 Microtask로 enqueue
↓
현재 Timer Task 종료
```

`resolve("완료")`가 async 함수를 그 자리에서 즉시 재개하는 것은 아니다. 현재 Timer Task가 먼저 끝나야 한다.

### Microtask에서 async 함수 재개

첫 번째 Timer Task가 끝난 뒤 Microtask checkpoint가 수행된다.

```text
await 다음 지점부터 asyncTimerWork 재개
↓
Promise의 완료값 "완료"를 result에 저장
↓
[async] after await: 완료
↓
asyncTimerWork 완료
```

`waitWithTimer()`를 다시 호출하거나 `await` 표현식 전체를 처음부터 재실행하지 않는다. 중단됐던 지점에서 Promise의 완료값을 전달받아 이어서 실행한다.

`result`가 `undefined`가 아닌 이유는 다음 값을 전달했기 때문이다.

```ts
resolve("완료");
```

`resolve()`처럼 값을 전달하지 않았다면 `result`는 `undefined`가 된다.

### 두 번째 Timer Task 실행

Microtask Queue가 비워진 후 다음 일반 Task가 실행된다.

```text
[task] another timer
```

따라서 `another timer`보다 `after await`이 먼저 출력된다.

## 9. 완료된 Promise와 pending Promise의 차이

두 async 실험의 차이는 await 시점의 Promise 상태다.

### 이미 fulfilled인 Promise

```text
await Promise.resolve()
↓
이미 fulfilled
↓
await continuation을 Microtask로 준비
↓
현재 동기 코드 종료
↓
Microtask에서 재개
```

### 아직 pending인 Promise

```text
await waitWithTimer()
↓
아직 pending
↓
continuation 정보만 Promise에 연결
↓
현재 async 함수 중단
↓
Timer Task가 resolve("완료") 실행
↓
Promise fulfilled
↓
await continuation을 Microtask로 enqueue
↓
현재 Timer Task 종료
↓
Microtask에서 재개
```

따라서 다음 표현은 정확하지 않다.

```text
await를 만나면 항상 Microtask가 즉시 추가된다. X
```

정확한 표현은 다음과 같다.

> `await`가 기다리는 Promise가 완료되어 continuation을 실행할 수 있게 되면, await 이후 실행은 Microtask를 통해 재개된다.

## 10. 이번에 바로잡은 오해

### 오해 1: Promise가 Microtask Queue에 들어간다

```text
Promise 객체가 Queue에 들어감                       X
Promise reaction을 실행할 Job이 Microtask로 들어감 O
```

### 오해 2: async 함수 내부는 전부 비동기적으로 실행된다

```text
함수 호출 직후 전체 본문을 나중에 실행       X
첫 await 이전까지 현재 Call Stack에서 실행    O
```

### 오해 3: await는 피연산자를 실행하기 전에 중단된다

```text
먼저 중단한 뒤 나중에 waitWithTimer 호출 X
먼저 waitWithTimer를 호출한 뒤 결과를 await O
```

### 오해 4: 재개할 때 await 표현식을 처음부터 다시 실행한다

```text
waitWithTimer를 다시 호출                         X
Promise 완료값을 받아 await 다음 지점부터 재개    O
```

### 오해 5: await는 메인 스레드 전체를 막는다

```text
브라우저 메인 스레드 전체 중단       X
현재 async 함수의 실행만 중단         O
```

호출자와 Event Loop는 계속 작업할 수 있다.

### 오해 6: `setTimeout(..., 0)`은 즉시 실행된다

```text
콜백 즉시 호출                             X
Timer 등록 후, 현재 Task가 끝난 뒤 실행 가능 O
```

## 11. 최종 정리

이번 실험을 통해 확정한 실행 모델은 다음과 같다.

```text
현재 일반 Task에서 동기 코드 실행
↓
함수 호출 시 실행 컨텍스트가 Call Stack에 추가
↓
Promise reaction과 queueMicrotask가 Microtask를 준비
↓
현재 일반 Task 종료
↓
Microtask checkpoint
↓
Microtask Queue가 빌 때까지 실행
↓
다음 일반 Task 실행
```

`async`/`await`는 이 실행 모델 위에서 다음처럼 동작한다.

```text
async 함수는 Promise를 반환한다.

async 함수의 본문은 첫 await 이전까지 동기적으로 실행된다.

await는 피연산자를 먼저 평가한다.

Promise가 pending이면 현재 async 함수만 중단된다.

Promise가 settle되면 await 이후 continuation이 Microtask로 실행된다.

continuation은 await 표현식을 처음부터 다시 실행하지 않고
중단된 지점부터 Promise의 결과를 받아 이어서 실행한다.
```

이번 Week 1 학습의 핵심 문장은 다음 두 문장으로 요약할 수 있다.

> 일반 Task 하나가 끝나면 Event Loop는 다음 일반 Task를 선택하기 전에 Microtask Queue를 빌 때까지 처리한다.

> `await`는 메인 스레드 전체를 막는 것이 아니라 현재 async 함수의 실행만 중단한다. 기다리던 Promise가 완료되면 await 이후 코드는 Microtask를 통해 다시 실행된다.
