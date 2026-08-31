import { useEffect, useState } from "react";
import "./App.css";
import { TimerComparisonPlayground } from "./components/TimerComparisonPlayground";
import { GameEngine } from "./game/GameEngine";

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
      {isShowSample && <SampleGameEngine />}
      <TimerComparisonPlayground />
    </div>
  );
}

export default App;

const SampleGameEngine = () => {
  useEffect(() => {
    const gameEngine = new GameEngine();
    gameEngine.start();

    return () => gameEngine.stop();
  }, []);

  return <div>GameEngine is Started</div>;
};
