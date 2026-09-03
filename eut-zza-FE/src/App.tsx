import "./App.css";
import { GameCanvas } from "./components/GameCanvas";

function App() {
  // App은 현재 학습 중인 Canvas 게임 화면만 페이지에 배치한다.
  // 이전 RenderingPipelineExperiment 코드는 삭제하지 않았으므로 필요할 때 다시 연결할 수 있다.
  return <GameCanvas />;
}

export default App;
