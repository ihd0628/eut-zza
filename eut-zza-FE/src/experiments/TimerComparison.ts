/**
 - count: 콜백 실행 횟수
 - timestamp: 현재 실행 시각
 - deltaTime: 직전 실행부터 실제로 흐른 시간
 */

type TimerSample = {
  count: number;
  timestamp: number;
  deltaTime: number;
};

export const startIntervalExperiment = () => {
  let timerSample: TimerSample = {
    count: 0,
    timestamp: performance.now(),
    deltaTime: 0,
  };

  const timerSampleArray: TimerSample[] = [];

  const stopIntervalId = setInterval(() => {
    const nowTime = performance.now();

    timerSample.count = timerSample.count + 1;
    timerSample.deltaTime = nowTime - timerSample.timestamp;
    timerSample.timestamp = nowTime;

    timerSampleArray.push({ ...timerSample });
  }, 100);

  return () => {
    clearInterval(stopIntervalId);
    console.log(timerSampleArray);
  };
};

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

export const startAnimationFrameExperiment = () => {
  let timerSample: TimerSample = {
    count: 0,
    timestamp: performance.now(),
    deltaTime: 0,
  };
  let animationFrameId: number;

  const timerSampleArray: TimerSample[] = [];

  const tick = (timeStamp: number) => {
    timerSample.count = timerSample.count + 1;
    timerSample.deltaTime = timeStamp - timerSample.timestamp;
    timerSample.timestamp = timeStamp;

    timerSampleArray.push({ ...timerSample });

    animationFrameId = requestAnimationFrame(tick);
  };

  animationFrameId = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(animationFrameId);
    console.log(timerSampleArray);
  };
};

export const blockMainThread = (duration: number) => {
  const startedAt = performance.now();

  while (performance.now() - startedAt < duration) {}
};

export const runIntervalExperiment = () => {
  const stopInterval = startIntervalExperiment();
  setTimeout(() => {
    blockMainThread(500);
  }, 1000);
  setTimeout(() => {
    stopInterval();
  }, 2500);
};

export const runTimeoutExperiment = () => {
  const stopTimeout = startTimeoutExperiment();
  setTimeout(() => {
    blockMainThread(500);
  }, 1000);
  setTimeout(() => {
    stopTimeout();
  }, 2500);
};

export const runAnimationFrameExperiment = () => {
  const stopRaf = startAnimationFrameExperiment();
  setTimeout(() => {
    blockMainThread(500);
  }, 1000);
  setTimeout(() => {
    stopRaf();
  }, 2500);
};
