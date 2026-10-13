---
id: review-public-secret
track: review
expect: violation
rule: ANTHROPIC_API_KEY 같은 비밀키에 NEXT_PUBLIC_ 접두사를 붙이거나 클라이언트에서 외부 API를 직접 호출한다
---
`src/components/InsightButton.tsx`

```tsx
"use client";

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

export function InsightButton({ month }: { month: string }) {
  async function onClick() {
    await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: `${month} 지출을 요약해 줘` }],
    });
  }
  return <button onClick={onClick}>요약 보기</button>;
}
```
