# 여러 Task Queue와 Event Loop의 정확한 관계

> 학습일: 2026년 8월 31일
>
> 관련 실험: `setInterval`, 재등록 `setTimeout`, `requestAnimationFrame` 비교
>
> 학습 주제: 하나의 Event Loop에는 Task Queue가 정말 하나뿐인가?

## 1. 이번에 바로잡은 핵심 이해

처음에는 브라우저의 실행 구조를 다음과 같이 이해했다.

```text
브라우저
└── Event Loop 하나
    ├── Task Queue 하나
    └── Microtask Queue 하나
```

이 그림은 비동기 JavaScript를 처음 이해하기 위한 단순 모델로는 유용하다. 하지만 HTML 표준의 정확한 모델은 다음과 같다.

```text
하나의 Event Loop
├── 일반 Task Queue 하나 이상
└── Microtask Queue 하나
```

그리고 브라우저 전체에 Event Loop가 무조건 하나뿐인 것도 아니다.

이번 내용의 가장 중요한 문장은 다음과 같다.

> 하나의 Event Loop는 하나 이상의 일반 Task Queue를 관리한다. 매 반복마다 실행 가능한 Task Queue 하나를 선택한 뒤, 그 Queue에서 Task 하나만 실행한다.

Task Queue가 여러 개라는 사실은 Task 여러 개를 메인 스레드에서 동시에 실행한다는 뜻이 아니다.

## 2. 학습용 단순 모델과 표준 모델

### 입문용 단순 모델

많은 강의와 그림은 다음처럼 설명한다.

```text
Web APIs
   ↓
Task Queue
   ↓
Event Loop
   ↓
Call Stack
```

이 그림은 다음 핵심을 배우는 데 적합하다.

```text
비동기 콜백은 즉시 실행되지 않는다.
현재 동기 코드가 끝나야 다음 작업이 실행될 수 있다.
Microtask는 일반 Task와 다른 시점에 처리된다.
```

하지만 다음 내용은 생략한다.

```text
Task Source
여러 개일 수 있는 Task Queue
Queue 선택 정책
Rendering Task Source
문서가 실행 가능한 상태인지 여부
```

### HTML 표준의 모델

```text
Event Loop
│
├── Task Queue A
│   ├── Task
│   └── Task
│
├── Task Queue B
│   └── Task
│
├── Task Queue C
│   └── Task
│
└── Microtask Queue
    ├── Microtask
    └── Microtask
```

따라서 “Task Queue”라는 단수 표현을 봤다고 해서 실제 표준에서도 반드시 Queue가 하나뿐이라고 이해하면 안 된다.

## 3. 브라우저 전체에 Event Loop가 하나뿐인가?

아니다. HTML 표준에서는 JavaScript 실행 주체인 agent마다 관련 Event Loop가 있다.

대표적으로 다음 실행 환경을 구분할 수 있다.

```text
Window 환경
└── Window Event Loop

Dedicated/Shared/Service Worker 환경
└── Worker Event Loop

Worklet 환경
└── Worklet Event Loop
```

일부 Window들은 실행 조건에 따라 같은 agent와 Event Loop를 공유할 수 있다. 반면 Worker는 별도의 실행 환경과 Event Loop를 가질 수 있다.

현재 eut-zza의 React 페이지를 공부할 때는 다음처럼 단순화해도 충분하다.

```text
현재 페이지의 메인 JavaScript
↓
현재 페이지와 관련된 Window Event Loop
↓
하나 이상의 일반 Task Queue + 하나의 Microtask Queue
```

중요한 점은 “Chrome 프로그램 전체에 Event Loop가 정확히 하나 있다”가 아니라 “지금 분석하는 JavaScript 실행 환경에 책임이 있는 Event Loop가 있다”는 것이다.

## 4. Task는 무엇인가?

Task는 브라우저가 처리해야 할 하나의 작업을 나타낸다.

표준 모델에서 Task는 개념적으로 다음 정보를 가진다.

```text
Task
├── steps
│   └── 이 Task가 수행해야 할 작업
├── source
│   └── 어떤 종류에서 만들어진 Task인지
├── document
│   └── 관련된 Document 또는 null
└── script 관련 실행 환경 정보
```

예를 들면 다음과 같은 것들이 Task가 될 수 있다.

```text
클릭 이벤트를 전달하는 작업
Timer 콜백을 호출하는 작업
네트워크 결과를 처리하는 작업
화면 렌더링을 갱신하는 작업
HTML을 계속 파싱하는 작업
```

Task는 함수나 실행 컨텍스트와 같은 개념이 아니다.

```text
Task
└── 해야 할 작업의 단위

함수
└── 호출 가능한 JavaScript 값

실행 컨텍스트
└── 함수가 실제로 호출됐을 때 만들어지는 실행 정보
```

## 5. Task Source는 무엇인가?

Task Source는 관련된 Task들을 논리적으로 구분하고 순서를 유지하기 위한 출처 또는 분류다.

예를 들면 다음과 같은 Source들이 있다.

```text
User Interaction Task Source
Timer Task Source
Networking 관련 Task Source
DOM Manipulation Task Source
Rendering Task Source
```

개념적으로 Task에 다음과 같은 꼬리표가 붙는다고 생각할 수 있다.

```text
Task A
source: User Interaction

Task B
source: Timer

Task C
source: Rendering
```

Task Source는 다음 중 어느 것도 아니다.

```text
Task Source = Task                 X
Task Source = 함수                 X
Task Source = Call Stack           X
Task Source = Task Queue           X
```

Task Source는 어디에서 온 Task인지 나타내는 논리적 분류다.

## 6. Task Source와 Task Queue의 연결

각 Event Loop 안에서 모든 Task Source는 특정 Task Queue와 연결되어야 한다.

이 말은 Event Loop가 개념적으로 다음과 같은 매핑을 가지고 있다는 뜻이다.

```text
Task Source → Task Queue
```

예를 들어 어떤 브라우저가 다음처럼 연결할 수 있다.

```text
User Interaction Source ──→ Task Queue A
Timer Source            ──→ Task Queue B
Networking Source       ──→ Task Queue B
Rendering Source        ──→ Task Queue C
```

여기서 Timer와 Networking이라는 서로 다른 Task Source가 같은 Task Queue B를 공유한다.

다른 브라우저나 다른 스케줄링 정책은 다음처럼 연결할 수도 있다.

```text
User Interaction Source ─┐
Timer Source            ─┤
Networking Source       ─┼─→ Task Queue A
Rendering Source        ─┘
```

따라서 다음 두 문장은 모두 잘못된 일반화다.

```text
Task Source마다 반드시 전용 Task Queue가 하나씩 있다.   X
모든 Task Source가 반드시 하나의 Task Queue만 공유한다. X
```

정확한 표현은 다음과 같다.

> 각 Task Source는 특정 Task Queue와 연결된다. 여러 Source가 같은 Queue를 사용할 수도 있고, 브라우저가 여러 Queue로 분리할 수도 있다.

이 연결은 JavaScript에서 조회하거나 설정하는 Map 객체가 아니다. HTML 표준과 브라우저 스케줄러가 사용하는 개념적 관계다. 실제 브라우저 엔진의 내부 자료구조가 표준 용어와 정확히 1:1로 대응한다고 가정해서도 안 된다.

## 7. Task가 Queue에 추가되는 과정

Task를 특정 Source에 queue하는 과정을 단순화하면 다음과 같다.

```text
수행할 steps 준비
↓
새 Task 생성
↓
Task.source에 Task Source 기록
↓
해당 Event Loop에서 Source와 연결된 Queue 찾기
↓
그 Queue에 Task 추가
```

예를 들어 화면 갱신 Task라면 다음과 같다.

```text
Task 생성
├── source: Rendering Task Source
└── steps: 화면 갱신

Rendering Source → Task Queue C 매핑 확인
↓
Task Queue C에 화면 갱신 Task 추가
```

`Rendering Task Source와 연결된 Task Queue에 넣는다`는 문장은 바로 이 과정을 말한다. Rendering Task Source라는 별도 이름의 Queue가 반드시 존재한다는 뜻이 아니다.

## 8. 여러 Queue에 Task가 있으면 무엇을 먼저 실행하는가?

실행 가능한 Task가 여러 Queue에 있다면 Event Loop는 그중 Queue 하나를 선택한다.

```text
Task Queue A: [click A] [keydown B]
Task Queue B: [timer C] [timer D]
Task Queue C: [update rendering E]
```

한 번의 Event Loop 반복을 단순화하면 다음과 같다.

```text
1. 실행 가능한 Task가 있는 Queue들을 확인한다.
2. 그중 Queue 하나를 선택한다.
3. 선택한 Queue의 첫 번째 실행 가능한 Task를 선택한다.
4. 그 Task의 steps를 수행한다.
5. Microtask checkpoint를 수행한다.
6. 다시 반복한다.
```

어느 Queue를 선택할지는 HTML 표준에서 `implementation-defined`로 남겨 둔다. 즉 브라우저가 구현과 현재 상황에 맞게 결정한다.

예를 들어 사용자 입력에 더 빠르게 반응하기 위해 다음과 같은 비율로 선택할 수 있다.

```text
User Interaction Queue
→ 자주 선택

다른 일반 Queue
→ 굶지 않을 정도로 함께 선택
```

다음과 같은 고정된 전역 우선순위가 표준에 적혀 있는 것은 아니다.

```text
Click은 언제나 Timer보다 먼저다.       X
Timer는 언제나 Rendering보다 먼저다.   X
Rendering은 언제나 Network보다 먼저다. X
```

브라우저 종류에 따라 다를 수 있을 뿐 아니라 같은 브라우저에서도 입력 상태, 렌더링 마감 시각, 페이지 표시 여부, 성능 상태 등에 따라 선택이 달라질 수 있다.

## 9. 그래도 브라우저가 지켜야 하는 순서

Queue 선택 정책이 자유롭다고 해서 모든 순서를 마음대로 뒤집을 수 있다는 뜻은 아니다.

동일한 Task Source에서 나온 Task는 그 Source에 대해 정해진 순서를 유지해야 한다.

```text
같은 User Interaction Task Source

click A가 먼저 queue됨
click B가 나중에 queue됨

실행 순서
click A → click B
```

서로 다른 Task Source 또는 서로 다른 Queue 사이에는 일반적으로 하나의 전역 FIFO 순서가 존재하지 않는다.

```text
Timer Task가 먼저 queue됨
Rendering Task가 나중에 queue됨

반드시 Timer Task가 먼저 실행된다고 단정할 수 없음
```

각 API가 추가로 정의한 규칙과 브라우저의 Queue 선택 정책까지 고려해야 한다.

## 10. Task Queue는 엄밀히는 단순 FIFO Queue가 아니다

이름은 Task Queue이지만 HTML 표준은 이를 엄밀하게는 Task의 set으로 정의한다.

Event Loop는 선택한 Task Queue에서 무조건 자료구조의 맨 앞 항목을 꺼내는 것이 아니라 첫 번째로 실행 가능한 Task를 찾는다.

예를 들어 Task와 연결된 Document가 더 이상 활성 상태가 아니라면 그 Task는 현재 실행 가능하지 않을 수 있다.

다만 학습 초기에는 다음처럼 이해해도 된다.

```text
같은 Source의 Task 순서는 유지된다.
↓
선택한 Queue에서 실행 가능한 앞쪽 Task 하나를 실행한다.
```

중요한 것은 모든 종류의 Task가 하나의 거대한 전역 FIFO 줄에만 서 있다고 가정하지 않는 것이다.

## 11. Microtask Queue는 일반 Task Queue 중 하나가 아니다

각 Event Loop는 일반 Task Queue들과 별도로 하나의 Microtask Queue를 가진다.

```text
Event Loop
├── 일반 Task Queue A
├── 일반 Task Queue B
├── 일반 Task Queue C
└── Microtask Queue
```

대표적인 Microtask는 다음과 같다.

```text
Promise.then/catch/finally 반응
await 이후 continuation
queueMicrotask 콜백
```

일반 Task 하나가 끝나면 Event Loop는 다음 일반 Task Queue를 선택하기 전에 Microtask checkpoint를 수행한다.

```text
일반 Task 하나 실행 완료
↓
Microtask Queue의 오래된 Microtask 실행
↓
그 과정에서 새 Microtask가 생기면 뒤에 추가
↓
Microtask Queue가 빌 때까지 계속 실행
↓
다음 일반 Task Queue 선택
```

예를 들어 다음 상태를 보자.

```text
Timer Queue:       [Timer B]
Rendering Queue:   [Render C]
Microtask Queue:   [Promise A]
```

현재 일반 Task가 방금 끝났다면 `Promise A`를 먼저 처리한다. 그다음 Timer B와 Render C 중 어떤 일반 Task를 선택할지는 브라우저의 Queue 선택 정책에 달려 있다.

Microtask가 실행 중에 Microtask를 계속 추가하면 일반 Task와 렌더링이 오래 지연될 수도 있다.

## 12. Event Loop, Task, 함수, Call Stack의 관계

다음 표현은 학습용 비유로 자주 사용되지만 정확하지 않다.

```text
Event Loop가 Task를 Call Stack으로 옮긴다.
```

Task는 실행 컨텍스트가 아니므로 Call Stack에 그대로 쌓이지 않는다.

정확한 흐름은 다음과 같다.

```text
Event Loop가 Queue와 Task 선택
↓
Task의 steps 수행
↓
steps가 JavaScript 콜백 함수 호출
↓
그 함수의 실행 컨텍스트 생성
↓
실행 컨텍스트가 Call Stack에 추가
```

예를 들어 Click Task라면 다음과 같다.

```text
Click Task 선택
↓
click 이벤트 전달
↓
React onClick 함수 호출
↓
onClick 실행 컨텍스트가 Call Stack에 생성
```

Timer Task라면 다음과 같다.

```text
Timer Task 선택
↓
등록된 Timer 콜백 호출
↓
콜백 실행 컨텍스트가 Call Stack에 생성
```

화면 갱신 Task라면 다음과 같다.

```text
화면 갱신 Task 선택
↓
화면 갱신 절차 수행
↓
Animation Frame Callback 호출
↓
tick 실행 컨텍스트가 Call Stack에 생성
```

## 13. 세 실험을 Task Source 관점에서 연결하기

### `Run setInterval`

```text
Click Task
↓
setInterval로 활성 Timer 등록
↓
대기 시간 만료
↓
Timer Task Source를 가진 Task가 관련 Queue에서 대기
↓
Event Loop가 해당 Queue와 Task 선택
↓
interval 콜백 호출
```

자세한 내용은 [`set-interval-event-loop.md`](./set-interval-event-loop.md)를 참고한다.

### `Run setTimeout`

```text
Click Task
↓
일회성 Timer 등록
↓
대기 시간 만료
↓
Timer Task가 관련 Queue에서 대기
↓
Event Loop가 Task 선택
↓
tick 호출
↓
tick이 다음 일회성 Timer 등록
```

`tick()`을 동기 재귀 호출하는 것이 아니라 다음 Timer를 등록한다.

### `Run requestAnimationFrame`

```text
Click Task
↓
Animation Frame Callback Map에 tick 등록
↓
Rendering Opportunity
↓
Rendering Task Source를 가진 화면 갱신 Task가 관련 Queue에서 대기
↓
Event Loop가 해당 Queue와 Task 선택
↓
화면 갱신 절차 안에서 tick 호출
```

자세한 내용은 [`request-animation-frame-event-loop.md`](./request-animation-frame-event-loop.md)를 참고한다.

## 14. 500ms 차단이 여러 Queue에 미치는 영향

`blockMainThread(500)`이 실행되고 있다면 메인 스레드는 현재 Task를 끝내지 못한 상태다.

```text
현재 실행 중인 CPU 부하 Task
└── blockMainThread 실행 중
```

그동안 다른 Queue에 실행 가능한 Task가 있어도 Event Loop는 다음 Task를 실행할 수 없다.

```text
User Interaction Queue: [대기 중]
Timer Queue:            [대기 중]
Rendering Queue:        [대기 중]

현재 Task가 아직 실행 중
↓
어느 Queue에서도 다음 Task를 실행하지 못함
```

Task Queue가 여러 개라는 사실이 메인 스레드 병렬 실행을 의미하지 않기 때문이다.

차단이 끝나면 Event Loop는 실행 가능한 Queue 중 하나를 브라우저 정책에 따라 선택한다. 따라서 서로 다른 Source에서 나온 Timer Task와 Rendering Task가 모두 준비되어 있을 때 단순히 “먼저 등록된 것이 반드시 먼저 실행된다”고 단정할 수 없다.

## 15. 헷갈렸던 부분과 바로잡은 이해

| 처음의 이해 | 바로잡은 이해 |
|---|---|
| 브라우저 전체에 Event Loop는 무조건 하나다. | Window, Worker 등 JavaScript 실행 환경의 agent마다 관련 Event Loop가 있다. |
| Event Loop 하나에는 일반 Task Queue가 하나뿐이다. | 하나 이상의 일반 Task Queue를 가질 수 있다. |
| Task Source는 Task Queue의 다른 이름이다. | Source는 Task의 논리적 분류이고 Queue는 Task가 실제로 기다리는 곳이다. |
| Task Source마다 전용 Queue가 반드시 하나씩 있다. | 여러 Source가 하나의 Queue를 공유할 수도 있고 여러 Queue로 나뉠 수도 있다. |
| 여러 Queue의 Task는 동시에 실행된다. | 현재 Event Loop는 한 반복에 Queue 하나를 골라 Task 하나만 실행한다. |
| 여러 Queue에서는 먼저 등록된 Task가 무조건 먼저 실행된다. | Queue 선택은 브라우저 정책이며 서로 다른 Queue 사이에 하나의 전역 FIFO는 없다. |
| Queue 선택은 완전히 무작위다. | 브라우저가 반응성과 렌더링 등을 고려하며 동일 Source의 순서 같은 규칙은 지켜야 한다. |
| Microtask Queue도 여러 일반 Task Queue 중 하나다. | Event Loop가 별도로 가진 하나의 Queue이며 일반 Task 뒤 checkpoint에서 처리한다. |
| Task가 Call Stack으로 이동한다. | Task의 steps가 함수를 호출할 때 실행 컨텍스트가 Call Stack에 생성된다. |
| `macrotask`가 HTML 표준의 공식 Task 이름이다. | HTML 표준은 일반적으로 `Task`라는 용어를 사용한다. `macrotask`는 Microtask와 대비할 때 쓰는 비공식 표현이다. |

## 16. 머릿속에 남겨 둘 최종 모델

```text
브라우저의 현재 JavaScript 실행 환경
↓
관련 Event Loop
│
├── Task Queue A ← User Interaction Source
│
├── Task Queue B ← Timer Source, Networking Source
│
├── Task Queue C ← Rendering Source
│
└── Microtask Queue ← Promise, await continuation, queueMicrotask
```

Event Loop의 반복은 다음과 같다.

```text
실행 가능한 일반 Task Queue 하나 선택
↓
그 Queue에서 실행 가능한 Task 하나 선택
↓
Task의 steps 수행
↓
필요하면 JavaScript 콜백 호출
↓
콜백 실행 컨텍스트가 Call Stack에 생성되어 실행
↓
Task 완료
↓
Microtask Queue가 빌 때까지 처리
↓
다시 일반 Task Queue 선택
```

위 Queue 구분은 가능한 매핑을 보여 주기 위한 학습용 예시다. 실제로 어떤 Source들을 같은 Queue에 연결하고 어느 Queue를 얼마나 자주 선택할지는 브라우저가 결정한다.

## 17. 나중에 다시 설명해야 할 핵심 문장

아래 문장을 스스로 설명할 수 있다면 이번 내용을 유지하고 있는 것이다.

> HTML 표준에서 하나의 Event Loop는 하나 이상의 일반 Task Queue와 하나의 별도 Microtask Queue를 가진다. Task에는 Task Source라는 논리적 출처가 있고, 각 Source는 해당 Event Loop의 특정 Task Queue와 연결된다. 브라우저는 실행 가능한 일반 Queue 중 하나를 구현 정책에 따라 선택하고 그 Queue의 Task 하나를 실행한 뒤 Microtask checkpoint를 수행한다. Queue가 여러 개여도 같은 메인 스레드에서는 Task를 한 번에 하나만 실행한다.

다음 질문에도 답할 수 있어야 한다.

1. Task와 Task Source와 Task Queue는 각각 어떻게 다른가?
2. Task Source마다 별도의 Task Queue가 반드시 존재하는가?
3. 하나의 Event Loop에는 일반 Task Queue가 몇 개 존재할 수 있는가?
4. 여러 Queue에 Task가 있다면 어느 Queue를 먼저 선택하는가?
5. 서로 다른 Queue에 있는 Task 사이에 전역 FIFO가 보장되는가?
6. 동일한 Task Source의 Task 순서는 왜 유지되는가?
7. Microtask Queue는 일반 Task Queue 중 하나인가?
8. 일반 Task가 끝난 직후 다음 일반 Task보다 Microtask를 먼저 실행하는 이유는 무엇인가?
9. Task가 Call Stack으로 직접 이동하지 않는 이유는 무엇인가?
10. Task Queue가 여러 개여도 메인 스레드가 한 번에 Task 하나만 실행하는 이유는 무엇인가?

## 참고 자료

- [HTML Standard — Event loops and Task Queues](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [HTML Standard — Event loop processing model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model)
- [HTML Standard — Animation frames](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames)
- [`setInterval` 실험으로 이해한 브라우저 Event Loop](./set-interval-event-loop.md)
- [`requestAnimationFrame` 실험으로 이해한 브라우저 렌더링 스케줄링](./request-animation-frame-event-loop.md)
- 프로젝트 구현: `src/experiments/TimerComparison.ts`
