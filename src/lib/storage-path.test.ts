import { expect, it } from "vitest";
import { ownsStoragePath } from "./storage-path";

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const FILE = "11111111-1111-4111-8111-111111111111.csv";

it("자기 폴더 아래 서버가 만든 모양의 경로만 받습니다", () => {
  expect(ownsStoragePath(USER, `${USER}/${FILE}`)).toBe(true);
});

it.each([
  ["다른 사용자 폴더", `${OTHER}/${FILE}`],
  ["폴더 없는 경로", FILE],
  ["상위 폴더로 빠지는 경로", `${USER}/../${OTHER}/${FILE}`],
  ["하위 폴더를 낀 경로", `${USER}/x/${FILE}`],
  ["사용자 id를 앞부분으로 가진 다른 폴더", `${USER}0/${FILE}`],
  ["csv가 아닌 파일", `${USER}/11111111-1111-4111-8111-111111111111.txt`],
])("%s는 거절합니다", (_label, path) => {
  // uploads.storage_path는 클라이언트가 PostgREST로 직접 INSERT할 수 있는 컬럼입니다(0004).
  // Storage 정책 하나에만 기대지 않도록 쓰기 전에 한 번 더 확인합니다.
  expect(ownsStoragePath(USER, path)).toBe(false);
});
