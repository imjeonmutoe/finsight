import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UploadFlow } from "@/components/UploadFlow";
import { columnMappingSchema, kstMonthStart, nextKstMonthStart, requireUserId } from "@/lib/api";
import { parseStatementRows } from "@/lib/statement";
import { decodeCsv } from "@/lib/encoding";
import { ownsStoragePath } from "@/lib/storage-path";
import { getMonthlyTrend } from "@/lib/queries";
import { createServerSupabase } from "@/services/supabase";
import type { MappingResponse } from "@/types/api";
import type { Plan } from "@/types/billing";
import type { FinancialSource } from "@/types/upload";

// 추이 조회에 쓰는 개월 수입니다. "1개월치뿐인가"만 판단하므로 1년이면 충분합니다.
const TREND_MONTHS = 12;
const BUCKET = "statements";
// POST /api/uploads가 돌려주는 미리보기와 같은 행 수입니다.
const PREVIEW_ROWS = 5;
const RESUME_COLUMNS = "id,source_id,filename,storage_path,column_mapping,mapping_confidence,encoding";

const sourcesSchema = z.array(z.object({
  id: z.string(), label: z.string(), kind: z.enum(["card", "bank"]),
}));
const profileSchema = z.object({
  plan: z.enum(["free", "pro"]),
  plan_expires_at: z.string().nullable().default(null),
});
const resumeSchema = z.object({
  id: z.string(), source_id: z.string(), filename: z.string(), storage_path: z.string(),
  column_mapping: z.unknown(),
  mapping_confidence: z.number().nullable().default(null),
  encoding: z.enum(["utf-8", "euc-kr"]).nullable().default(null),
});

type Resume = NonNullable<Parameters<typeof UploadFlow>[0]["resume"]>;

/**
 * 업로드 이력(S11)의 "이어서 진행"이 보내는 경로입니다. 매핑 확인에서 이탈한 업로드는
 * 원본이 Storage에 남아 있으므로 파일을 다시 고르게 하지 않고 2단계부터 시작합니다.
 * 읽지 못하면 조용히 1단계로 둡니다 — 파일 선택은 언제나 가능한 경로입니다.
 */
async function loadResume(
  supabase: ReturnType<typeof createServerSupabase>, userId: string, uploadId: string,
  sources: FinancialSource[],
): Promise<Resume | null> {
  if (!z.uuid().safeParse(uploadId).success) return null;

  // status가 mapped인 것만 이어서 진행합니다. parsed는 이미 저장이 끝났습니다.
  const found = resumeSchema.safeParse((await supabase.from("uploads").select(RESUME_COLUMNS)
    .eq("user_id", userId).eq("id", uploadId).eq("status", "mapped").maybeSingle()).data);
  if (!found.success) return null;

  const mapping = columnMappingSchema.safeParse(found.data.column_mapping);
  if (!mapping.success) return null;

  // storage_path는 클라이언트가 직접 INSERT할 수 있는 컬럼이다(0004). 남의 폴더면 이어 하지 않는다.
  if (!ownsStoragePath(userId, found.data.storage_path)) return null;

  const encoding = found.data.encoding ?? "utf-8";
  const stored = await supabase.storage.from(BUCKET).download(found.data.storage_path);
  if (stored.error || !stored.data) return null;

  let rows: string[][];
  try {
    rows = parseStatementRows(decodeCsv(new Uint8Array(await stored.data.arrayBuffer()), encoding));
  } catch {
    return null;
  }

  return {
    mapping: {
      uploadId: found.data.id, sourceId: found.data.source_id, status: "mapped", reused: true,
      mapping: mapping.data, confidence: found.data.mapping_confidence ?? 0,
      preview: rows.slice(0, PREVIEW_ROWS), totalRows: rows.length,
      // 이어서 진행은 저장된 매핑이 있으므로 그 헤더 행이 곧 폴백 값이다.
      headerRowIndex: mapping.data.skipRows,
    } satisfies MappingResponse,
    filename: found.data.filename,
    sourceKind: sources.find((source) => source.id === found.data.source_id)?.kind ?? "card",
    encoding,
  };
}

export default async function UploadPage({ searchParams }: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = createServerSupabase(await cookies());
  // 미들웨어가 이미 막지만, 세션이 끊긴 채 렌더되면 빈 화면이 되므로 한 겹 더 둡니다.
  const userId = await requireUserId(supabase);
  if (!userId) redirect("/login");

  const sources = sourcesSchema.safeParse((await supabase.from("financial_sources")
    .select("id,label,kind").eq("user_id", userId).order("created_at", { ascending: true })).data);

  const profile = profileSchema.safeParse((await supabase.from("profiles")
    .select("plan,plan_expires_at").eq("id", userId).maybeSingle()).data);
  const now = new Date();
  const pro = profile.success && profile.data.plan === "pro"
    && (profile.data.plan_expires_at === null || Date.parse(profile.data.plan_expires_at) > now.getTime());
  const plan: Plan = pro ? "pro" : "free";

  // 라우트와 같은 기준으로 셉니다. 카운터 테이블을 두지 않습니다(ADR-005).
  const { count } = await supabase.from("uploads").select("id", { count: "exact", head: true })
    .eq("user_id", userId).gte("created_at", kstMonthStart(now));
  const limitReached = !pro && (count ?? 0) >= 1;

  // 집계는 step 6의 queries.ts만 씁니다. 여기서 다시 구현하지 않습니다.
  let monthsHeld = 0;
  try {
    monthsHeld = (await getMonthlyTrend(supabase, userId, TREND_MONTHS))
      .filter((summary) => summary.byCategory.length > 0).length;
  } catch {
    // 추이를 읽지 못해도 업로드는 계속할 수 있어야 합니다. 안내 문구만 보수적으로 감춥니다.
    monthsHeld = TREND_MONTHS;
  }

  const list: FinancialSource[] = sources.success ? sources.data : [];

  const requested = (await searchParams).resume;
  const resume = typeof requested === "string" ? await loadResume(supabase, userId, requested, list) : null;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-16">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold leading-snug text-text">명세서 올리기</h1>
        <p className="text-sm leading-relaxed text-text-body">
          파일을 올리면 매핑 확인까지 1분, 요약까지 5분입니다.
        </p>
      </header>

      <UploadFlow
        sources={list}
        plan={plan}
        limitReached={limitReached}
        resetsAt={limitReached ? nextKstMonthStart(now) : null}
        monthsHeld={monthsHeld}
        resume={resume}
      />
    </main>
  );
}
