/**
 * Web Audio API의 AudioContext를 소유하고,
 * 음원을 불러와 재생하며 게임에서 사용할 기준 시간을 제공한다.
 */

export class AudioManager {
  private readonly audioContext: AudioContext;

  // AudioContext가 실행된 순간의 currentTime을 저장한다.
  // AudioContext.currentTime의 단위는 초다.
  private startedAtSeconds: number | null = null;

  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  constructor() {
    this.audioContext = new AudioContext();
  }

  async start(audioUrl: string): Promise<void> {
    // 사용자 클릭 흐름 안에서 가장 먼저 resume()을 요청한다.
    await this.audioContext.resume();

    // 실제 음원을 내려받고 디코딩한다.
    await this.load(audioUrl);

    if (this.audioBuffer === null) {
      throw new Error("재생할 AudioBuffer가 없습니다.");
    }

    // AudioBufferSourceNode는 AudioBuffer를 실제로 재생하는 노드다.
    const sourceNode = this.audioContext.createBufferSource();

    sourceNode.buffer = this.audioBuffer;

    // 음원 재생 노드를 스피커 출력에 연결한다.
    sourceNode.connect(this.audioContext.destination);

    // 음원이 시작하는 AudioContext의 절대 시각을 저장한다.
    const startedAtSeconds = this.audioContext.currentTime;

    this.startedAtSeconds = startedAtSeconds;
    this.sourceNode = sourceNode;

    sourceNode.onended = () => {
      sourceNode.disconnect();

      if (this.sourceNode === sourceNode) {
        this.sourceNode = null;
      }
    };

    // 음악과 게임 시간이 정확히 같은 시점에서 시작된다.
    sourceNode.start(startedAtSeconds);
  }

  getCurrentTimeMs(): number {
    if (this.startedAtSeconds === null) {
      return 0;
    }

    // AudioContext.currentTime은 초 단위지만
    // Note.hitTimeMs는 밀리초 단위이므로 1000을 곱한다.
    return (this.audioContext.currentTime - this.startedAtSeconds) * 1000;
  }

  async close(): Promise<void> {
    this.startedAtSeconds = null;
    this.audioBuffer = null;

    if (this.sourceNode !== null) {
      // 아직 재생 중인 음원을 중단한다.
      this.sourceNode.stop();

      // Audio Graph에서 스피커와의 연결을 끊는다.
      this.sourceNode.disconnect();

      this.sourceNode = null;
    }

    // close()는 영구 종료이므로 중복 호출을 방지한다.
    if (this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }
  }

  async load(audioUrl: string): Promise<void> {
    // 서버 또는 Vite public 폴더에서 MP3 파일을 요청한다.
    const response = await fetch(audioUrl);

    if (!response.ok) {
      throw new Error(`음원 요청에 실패했습니다: ${response.status}`);
    }

    // MP3 파일의 바이너리 데이터를 ArrayBuffer로 가져온다.
    const encodedAudioData = await response.arrayBuffer();

    // 압축된 MP3 데이터를 Web Audio가 재생할 수 있는
    // AudioBuffer 형태로 디코딩한다.
    this.audioBuffer =
      await this.audioContext.decodeAudioData(encodedAudioData);
  }
}
