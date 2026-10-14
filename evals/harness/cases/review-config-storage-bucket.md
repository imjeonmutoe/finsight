---
id: review-config-storage-bucket
track: review
expect: violation
rule: supabase/config.toml에 [storage.buckets]를 선언한다
---
`supabase/config.toml` 변경분

```toml
# 로컬 개발에서 업로드 버킷을 매번 손으로 만들지 않도록 선언해 둔다.
[storage.buckets.statements]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["text/csv"]
```
