import { useEffect, useState } from "react";
import "./App.css";
import { GameLoop } from "./game/GameLoop";
import { InputManager } from "./game/InputManager";

function App() {
  const [isShowSample, setIsShowSample] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        backgroundColor: "#f0f0f0",
      }}
    >
      <h1>Game Loop Playground</h1>
      <button onClick={() => setIsShowSample((value) => !value)}>
        {isShowSample ? "Hide" : "Show"} Sample Game Loop
      </button>
      {isShowSample && <SampleGameLoop />}
      {isShowSample && <SampleInputManager />}
    </div>
  );
}

export default App;

const SampleGameLoop = () => {
  useEffect(() => {
    let lastLoggedAt = 0;

    const loop = new GameLoop((timestamp, delta) => {
      if (timestamp - lastLoggedAt >= 1000) {
        lastLoggedAt = timestamp;
        console.log(`Timestamp: ${timestamp}, Delta: ${delta}`);
      }
    });

    loop.start();
    return () => {
      loop.stop();
    };
  }, []);

  return <div>Check the console for game loop logs.</div>;
};

const SampleInputManager = () => {
  useEffect(() => {
    const inputManager = new InputManager((event) => {
      console.log(event);
    });
    inputManager.attach();

    return () => inputManager.detach();
  }, []);

  return <div>Check the console for input logs</div>;
};
