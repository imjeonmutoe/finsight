const FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.csv$/;

/**
 * uploads.storage_path가 이 사용자의 것인지 본다. 서버는 `${userId}/${uuid}.csv`로만 만든다.
 * 이 컬럼은 클라이언트가 PostgREST로 직접 INSERT할 수 있으므로(0004) DB 값이라고 믿지 않는다 —
 * Storage 정책(statements_own)이 잘못 고쳐져도 남의 원본 CSV를 읽거나 지우지 못하게 하는 한 겹이다.
 */
export function ownsStoragePath(userId: string, path: string): boolean {
  const slash = path.indexOf("/");
  return slash > 0 && path.slice(0, slash) === userId && FILE.test(path.slice(slash + 1));
}
