import {
  asyncWork,
  runAsyncAwaitExperiment,
  runAsyncTimerExperiment,
} from "../../experiments/AsyncAwaitExperiment";

export const AsyncPlayground = () => {
  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        marginTop: "32px",
      }}
    >
      <h2>AsyncPlayground</h2>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <button
          type='button'
          onClick={() => {
            console.log("Running asyncWork experiment");
            asyncWork();
          }}
        >
          Run asyncWork
        </button>
        <button
          type='button'
          onClick={() => {
            console.log("Running runAsyncAwaitExperiment experiment");
            runAsyncAwaitExperiment();
          }}
        >
          Run runAsyncAwaitExperiment
        </button>
        <button
          type='button'
          onClick={() => {
            console.log("Running async timer experiment");
            runAsyncTimerExperiment();
          }}
        >
          Run async timer experiment
        </button>
      </div>
    </section>
  );
};
