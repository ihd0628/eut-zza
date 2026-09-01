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

export const runNestedMicrotaskExperiment = () => {
  console.log("[sync] start");

  setTimeout(() => {
    console.log("[task 1] start");

    Promise.resolve().then(() => {
      console.log("[microtask inside task 1]");
    });

    console.log("[task 1] end");
  }, 0);

  setTimeout(() => {
    console.log("[task 2]");
  }, 0);

  Promise.resolve().then(() => {
    console.log("[microtask 1]");

    queueMicrotask(() => {
      console.log("[nested microtask]");
    });
  });

  console.log("[sync] end");
};
