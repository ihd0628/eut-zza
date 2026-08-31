import {
  runAnimationFrameExperiment,
  runIntervalExperiment,
  runTimeoutExperiment,
} from "../experiments/TimerComparison";

export const TimerComparisonPlayground = () => {
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
      <h2>Timer Comparison</h2>
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
            console.log("Running setInterval experiment");
            runIntervalExperiment();
          }}
        >
          Run setInterval
        </button>
        <button
          type='button'
          onClick={() => {
            console.log("Running setTimeout experiment");
            runTimeoutExperiment();
          }}
        >
          Run setTimeout
        </button>
        <button
          type='button'
          onClick={() => {
            console.log("Running requestAnimationFrame experiment");
            runAnimationFrameExperiment();
          }}
        >
          Run requestAnimationFrame
        </button>
      </div>
    </section>
  );
};
