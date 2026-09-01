export const asyncWork = async () => {
  console.log("[async] before await");

  await Promise.resolve();

  console.log("[async] after await");
};

export const runAsyncAwaitExperiment = () => {
  console.log("[sync] start");

  void asyncWork();

  console.log("[sync] end");
};

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
