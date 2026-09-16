import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { UploadHistory, type UploadHistoryItem } from "@/components/UploadHistory";
import { requireUserId } from "@/lib/api";
import { createServerSupabase } from "@/services/supabase";

export const metadata: Metadata = {
  title: "업로드 이력 | FinSight",
  description: "올린 명세서의 처리 상태를 확인하고 이어서 진행하거나 지웁니다.",
};

// POST /api/uploads가 죽은 pending을 판정하는 기준과 같은 값입니다.
const PENDING_TIMEOUT_MS = 300_000;
const COLUMNS = "id,source_id,filename,status,inserted_count,duplicate_count,error_message,created_at";

const SECONDARY = "rounded-md border border-border-default px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const uploadsSchema = z.array(z.object({
  id: z.string(),
  source_id: z.string(),
  filename: z.string(),
  status: z.enum(["pending", "mapped", "parsed", "failed"]),
  inserted_count: z.number(),
  duplicate_count: z.number(),
  error_message: z.string().nullable().default(null),
  created_at: z.string(),
}));
const sourcesSchema = z.array(z.object({ id: z.string(), label: z.string() }));

export default async function UploadsPage() {
  const supabase = createServerSupabase(await cookies());
  // 미들웨어가 이미 막지만, 세션이 끊긴 채 렌더되면 빈 화면이 되므로 한 겹 더 둡니다.
  const userId = await requireUserId(supabase);
  if (!userId) redirect("/login");

  // 죽은 pending의 기준 시각입니다. 행을 고쳐 쓰지 않고 목록에서만 실패로 보여줍니다 —
  // 목록을 여는 것만으로 DB를 바꾸지 않기 위해서고, 같은 파일을 다시 올리면
  // POST /api/uploads가 그 행을 그대로 재사용합니다.
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PENDING_TIMEOUT_MS).toISOString();

  // 복합 FK는 PostgREST 임베딩이 보장되지 않으므로 별칭은 따로 읽어 붙입니다.
  const uploads = uploadsSchema.safeParse((await supabase.from("uploads").select(COLUMNS)
    .eq("user_id", userId).order("created_at", { ascending: false })).data);
  const sources = sourcesSchema.safeParse((await supabase.from("financial_sources").select("id,label")
    .eq("user_id", userId)).data);

  const labels = new Map((sources.success ? sources.data : []).map((source) => [source.id, source.label]));
  const list: UploadHistoryItem[] = (uploads.success ? uploads.data : []).map((upload) => ({
    id: upload.id,
    filename: upload.filename,
    sourceLabel: labels.get(upload.source_id) ?? "삭제된 카드·계좌",
    createdAt: upload.created_at,
    status: upload.status,
    insertedCount: upload.inserted_count,
    duplicateCount: upload.duplicate_count,
    errorMessage: upload.error_message,
  }));

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10 font-sans">
      <header className="space-y-2">
        <p className="text-sm text-muted">FinSight · 대시보드</p>
        <h1 className="text-2xl font-semibold leading-snug text-text">업로드 이력</h1>
        <p className="text-sm leading-relaxed text-muted">
          원본 CSV는 본인만 접근할 수 있는 비공개 저장소에 보관합니다. 다시 내려받는 기능은 두지 않습니다.
        </p>
      </header>

      <UploadHistory uploads={list} staleBefore={staleBefore} />

      <nav aria-label="다음 화면" className="flex flex-wrap gap-3">
        <Link href="/dashboard/upload" className={SECONDARY}>명세서 올리기</Link>
        <Link href="/dashboard" className={SECONDARY}>대시보드로 돌아가기</Link>
      </nav>
    </main>
  );
}
