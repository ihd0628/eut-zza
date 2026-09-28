import { argon2id, hash, verify } from "argon2";

// 회원가입에서 사용한다. salt는 라이브러리가 호출할 때마다 무작위로 생성한다.
// 반환 문자열에는 알고리즘, 계산 설정, salt, 해시 결과가 함께 들어 있다.
// 나중에 이 문자열 전체를 users.password_hash에 저장한다.
export const hashPassword = async (password: string): Promise<string> => {
  return hash(password, {
    type: argon2id,
    // 메모리 사용량과 반복 횟수 등은 라이브러리의 기본 설정을 사용한다.
  });
};

// 로그인에서 사용한다. 저장된 해시에서 기존 salt와 설정을 읽어 검증한다.
// 새로운 salt로 hashPassword()를 호출해 문자열끼리 비교하는 방식이 아니다.
export const verifyPassword = async (
  storedHash: string,
  password: string,
): Promise<boolean> => {
  // 비밀번호가 다르면 false를 반환한다. 잘못된 저장 형식 등으로 발생한 오류는
  // 비밀번호 불일치로 숨기지 않고 Promise rejection으로 호출자에게 전달한다.
  return verify(storedHash, password);
};
