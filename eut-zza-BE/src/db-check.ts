import { pool } from "./db.js";

// DB 연결만 확인하는 일회성 실행 파일이다. Fastify 서버를 시작하지 않는다.
// ESM 프로젝트이므로 파일 최상위에서도 await를 사용할 수 있다.
try {
  // pg가 SQL을 보내고 PostgreSQL이 실행한다. query()는 Promise를 반환한다.
  // await는 응답을 기다리지만 Node.js 메인 스레드 전체를 막지는 않는다.
  const result = await pool.query(`
    SELECT
      current_database() AS database,
      current_user AS db_user
  `);

  // result에는 쿼리 정보도 들어 있고, rows가 실제 결과 행들의 배열이다.
  console.log("[DB] PostgreSQL 연결 성공");
  console.table(result.rows);
} catch (error: unknown) {
  // 연결 실패 또는 SQL 오류로 Promise가 reject되면 여기로 온다.
  console.error("[DB] PostgreSQL 연결 확인 실패", error);
  process.exitCode = 1;
} finally {
  // 일회성 확인이 끝나면 연결을 닫는다. API 요청마다 end()하면 안 된다.
  await pool.end();
}
