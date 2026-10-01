-- uploads 쓰기 권한을 컬럼 단위로 좁힙니다.
--
-- Free 월 1회 한도는 uploads를 이번 달 created_at으로 셉니다(POST /api/uploads). 서버 라우트도
-- 사용자 세션(authenticated)으로 쓰기 때문에, 표 단위로 열어 두면 브라우저가 anon 키와 자기 JWT로
-- PostgREST를 직접 불러 created_at을 과거로 바꾸는 것만으로 한도가 풀립니다. RLS는 자기 행이라 막지 않습니다.
--
-- 열어 두는 컬럼은 라우트의 insert·update 레코드와 confirm_upload(security invoker)의 update set
-- 목록 그대로입니다. 새로 쓰는 컬럼이 생기면 여기에도 추가해야 합니다 — 빠지면 그 쓰기가
-- permission denied로 실패합니다(조용히 넘어가지 않습니다).
-- DELETE는 그대로 둡니다. 업로드를 지우면 거래도 CASCADE로 함께 지워지므로(ADR-008) 한도를
-- 되돌려도 데이터가 쌓이지 않습니다.

revoke insert, update on table public.uploads from authenticated;

grant insert (
  user_id, source_id, file_hash, storage_path, filename, byte_size,
  encoding, row_count, import_context, status, error_message
) on table public.uploads to authenticated;

grant update (
  filename, byte_size, encoding, row_count, import_context, status, error_message,
  column_mapping, mapping_confidence, inserted_count, duplicate_count, unclassified_count
) on table public.uploads to authenticated;
