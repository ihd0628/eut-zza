# AudioContext clock과 메인 스레드 차단

## 실험 목적

JavaScript 메인 스레드가 멈춰도 Web Audio로 시작한 음악과
`AudioContext.currentTime`이 계속 진행되는지 확인했다.

게임에서는 다음 MP3를 `fetch()`로 가져와 `AudioBuffer`로 디코딩한 뒤,
`AudioBufferSourceNode`를 `audioContext.destination`에 연결해 재생했다.

```text
MP3 URL
→ fetch
→ ArrayBuffer
→ decodeAudioData
→ AudioBuffer
→ AudioBufferSourceNode
→ destination
```

## 메인 스레드와 오디오 렌더링 스레드

`AudioContext`를 다루는 JavaScript와 실제 오디오 처리는 역할이 나뉜다.

```text
JavaScript 메인 스레드
├─ AudioContext와 AudioNode 생성
├─ AudioNode 연결
├─ source.start()로 재생 시각 예약
└─ currentTime 읽기

오디오 렌더링 스레드
├─ 예약된 Audio Graph 처리
├─ 오디오 샘플 생성
├─ currentTime 진행
└─ 오디오 장치로 출력
```

즉, `source.start()`를 호출한 JavaScript가 음악 재생 내내 Call Stack을
점유하는 것이 아니다. JavaScript는 재생 명령을 전달하고, 미리 준비된
오디오는 브라우저의 오디오 렌더링 시스템에서 처리된다.

## 500ms 메인 스레드 차단 실험

게임 시작 약 1.8초 후 `while`문으로 메인 스레드를 500ms 점유했다.

```ts
const audioTimeBefore = audioManager.getCurrentTimeMs();
const blockStartedAt = performance.now();

while (performance.now() - blockStartedAt < 500) {
  // 의도적으로 메인 스레드를 점유한다.
}

const audioTimeAfter = audioManager.getCurrentTimeMs();
```

실제 측정 결과는 다음과 같았다.

```text
audioTimeBefore: 1802.6667ms
audioTimeAfter:  2304ms
audioTimeDelta:  501.3333ms
```

차단 중에는 Call Stack이 비워지지 않았기 때문에 Event Loop가 다음 일을
진행하지 못했다. 따라서 `requestAnimationFrame` 콜백과 Canvas 갱신도
실행되지 않아 화면은 멈췄다.

반면 미리 시작한 음악은 계속 재생됐고 AudioContext clock도 약 501ms
진행했다. 차단이 끝난 뒤 첫 프레임은 현재 오디오 시간을 다시 읽어,
노트를 지나간 시간에 맞는 위치에 즉시 그렸다.

```text
메인 스레드 차단
├─ 다른 Task와 JavaScript 콜백 실행 불가
├─ requestAnimationFrame 콜백 실행 불가
└─ Canvas 갱신 불가

오디오 렌더링
├─ 미리 시작한 음악 계속 처리
└─ AudioContext clock 계속 진행
```

## 측정값이 2.6667ms 단위로 보인 이유

Web Audio는 오디오를 `render quantum`이라는 블록 단위로 처리한다.
현재 환경의 측정값은 48kHz에서 기본 128 sample frames 단위로 처리된
결과로 추론할 수 있다.

```text
128 / 48,000 × 1000 ≈ 2.6667ms
```

`currentTime`도 이 처리 단위에 맞춰 증가하므로 측정값이 정확히
`1800ms`, `2300ms`로 떨어지지 않을 수 있다.

## 결론

> AudioContext를 조작하는 JavaScript는 메인 스레드에서 실행되지만,
> 예약된 Audio Graph의 실제 처리는 오디오 렌더링 스레드에서 진행된다.
> 따라서 메인 스레드가 잠시 차단돼도 미리 준비하고 시작한 음악과
> AudioContext clock은 계속 진행될 수 있다.

이 구조 덕분에 화면 프레임이 누락돼도 노트 위치를 오디오 시간으로 다시
계산하여 음악의 시간축을 따라갈 수 있다. 다만 시스템 전체의 CPU가
부족하거나 오디오를 미리 준비·예약하지 않았다면 실제 소리가 끊길 수 있다.

## 참고

- [W3C Web Audio API: BaseAudioContext.currentTime](https://www.w3.org/TR/webaudio/#dom-baseaudiocontext-currenttime)
- [W3C Web Audio API: Rendering an Audio Graph](https://www.w3.org/TR/webaudio/#rendering-audio-graph)
