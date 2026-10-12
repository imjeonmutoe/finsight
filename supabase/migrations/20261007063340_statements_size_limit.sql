-- statements 버킷에 파일 크기 상한을 겁니다.
--
-- 4MB 상한(MAX_FILE_BYTES)은 POST /api/uploads에서만 검사합니다. Storage 정책은 자기 폴더에 쓰기를
-- 허용하므로(0001), 사용자는 Storage API로 자기 storage_path의 파일을 큰 파일로 덮어쓸 수 있습니다.
-- 라우트(confirm)와 업로드 화면도 다운로드한 뒤 크기를 다시 보지만, 다운로드 자체는 이미 메모리에
-- 올린 뒤입니다. 버킷 상한은 업로드 시점에 Storage가 거절합니다.
--
-- 값은 MAX_FILE_BYTES와 같습니다(src/lib/limits.ts). 한쪽을 바꾸면 함께 바꿉니다.
-- 이미 올라간 객체에는 영향이 없습니다(적용 전 확인: 4MB 초과 객체 0개).

begin;

update storage.buckets set file_size_limit = 4000000 where id = 'statements';

commit;
