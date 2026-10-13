---
id: review-insight-cache-bypass
track: review
expect: violation
rule: insight_cache를 먼저 읽지 않고 인사이트 모델을 바로 호출하는 경로를 만든다
---
`src/app/api/insights/refresh/route.ts`

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/services/supabase";
import { generateInsights } from "@/services/claude";
import { buildInsightInput } from "@/lib/insights";

// '다시 분석' 버튼. 사용자가 최신 결과를 원할 때 누른다.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { month } = (await request.json()) as { month: string };
  const { data: profile } = await supabase.from("profiles").select("plan").eq("id", user.id).single();
  const input = await buildInsightInput(supabase, user.id, month);
  const insight = await generateInsights(input, profile?.plan ?? "free");

  await supabase.from("insight_cache").upsert({ user_id: user.id, month, payload: insight });
  return NextResponse.json(insight);
}
```
