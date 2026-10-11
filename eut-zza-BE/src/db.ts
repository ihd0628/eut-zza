import pg from "pg";

// pg는 ORM이 아니라 PostgreSQL에 SQL을 보내고 결과를 받는 드라이버다.
// Pool은 DB 연결을 빌려주고 재사용하는 관리자다. SQL 조회 결과를 캐싱하지 않는다.
// 모듈에서 하나만 생성해 export하므로 요청마다 새로운 Pool을 만들 필요가 없다.
export const pool = new pg.Pool({
  // PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD는 pg가 process.env에서 읽는다.
  // npm 실행 명령의 --env-file=.env 옵션이 먼저 .env를 환경변수로 불러온다.
  // 최대 5개이며, 여기서 즉시 5개의 연결을 모두 생성하는 것은 아니다.
  max: 5,
  // 연결을 얻지 못할 때 무한히 기다리지 않도록 5초 뒤 오류로 처리한다.
  connectionTimeoutMillis: 5000,
});

// 사용하지 않는 연결도 DB 종료나 네트워크 문제로 오류가 발생할 수 있다.
// 쿼리 실행 중의 오류(Promise rejection)와 별도로 이 이벤트를 처리한다.
pool.on("error", (error: Error) => {
  console.error("[DB] 대기 중인 연결에서 오류 발생", error);
});

let closeDatabasePromise: Promise<void> | null = null;

// 종료 Signal을 여러 번 받더라도 PostgreSQL Pool 종료는 한 번만 수행한다.
export const closeDatabase = (): Promise<void> => {
  closeDatabasePromise ??= pool.end();
  return closeDatabasePromise;
};
