import { useState } from "react";

export const RenderingPipelineExperiment = () => {
  console.count("RenderingPipelineExperiment render");

  const [isWide, setIsWide] = useState(false);
  const [isBlue, setIsBlue] = useState(false);
  const [isMoved, setIsMoved] = useState(false);

  return (
    <section>
      <div
        style={{
          width: isWide ? "400px" : "200px",
          height: "200px",
          backgroundColor: isBlue ? "royalblue" : "tomato",
          transform: isMoved ? "translateX(150px)" : "translateX(0)",
        }}
      />
      <div>
        <button onClick={() => setIsWide((value) => !value)}>
          Change Width
        </button>
        <button onClick={() => setIsBlue((value) => !value)}>
          Change Background
        </button>
        <button onClick={() => setIsMoved((value) => !value)}>
          Change Transform
        </button>
      </div>
    </section>
  );
};
