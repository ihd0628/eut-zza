import {
  runNestedMicrotaskExperiment,
  runTaskMicrotaskExperiment,
} from "../../experiments/TaskMicrotaskExperiment";

export const TaskPlayground = () => {
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
      <h2>Task Playground</h2>
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
            console.log("Running task microtask experiment");
            runTaskMicrotaskExperiment();
          }}
        >
          Run task microtask
        </button>
        <button
          type='button'
          onClick={() => {
            console.log("Running nested microtask experiment");
            runNestedMicrotaskExperiment();
          }}
        >
          Run nested microtask
        </button>
      </div>
    </section>
  );
};
