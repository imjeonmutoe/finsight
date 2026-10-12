// @vitest-environment node

import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 원격 supabase_migrations.schema_migrations (2026-10-12 list_migrations로 확인)
const REMOTE_HISTORY: [version: string, name: string][] = [
  ["20260916045636", "init"],
  ["20260916045651", "analytics"],
  ["20260916084517", "upload_confirm"],
  ["20261001070154", "upload_column_grants"],
  ["20261007053655", "rls_initplan"],
  ["20261007063340", "statements_size_limit"],
  ["20261007064500", "close_client_cost_paths"],
  ["20261007082023", "keep_count_after_upload_delete"],
];

const REASON = "원격 schema_migrations와 버전이 어긋나면 Branching이 이미 적용된 마이그레이션을 다시 돌린다";

const files = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .filter((f) => f.endsWith(".sql"))
  .sort();

describe("supabase/migrations 파일명", () => {
  it("모든 파일이 <UTC 14자리 타임스탬프>_<snake_case>.sql 형식이다", () => {
    const bad = files.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f));
    expect(bad, `형식이 틀린 파일이 있다. ${REASON}`).toEqual([]);
  });

  it("버전이 중복 없이 오름차순이다", () => {
    const versions = files.map((f) => f.slice(0, 14));
    expect(new Set(versions).size, `버전이 중복된다. ${REASON}`).toBe(versions.length);
    expect(versions, `버전이 오름차순이 아니다. ${REASON}`).toEqual([...versions].sort());
  });

  it("원격 이력 8개가 앞에서부터 그대로 들어 있다", () => {
    const actual = files.slice(0, REMOTE_HISTORY.length).map((f) => {
      const m = /^(\d{14})_(.+)\.sql$/.exec(f);
      return m ? [m[1], m[2]] : [f, ""];
    });
    expect(actual, `원격 이력과 다르다. ${REASON}`).toEqual(REMOTE_HISTORY);
  });
});
