-- P3.8: the public bucket for the ODbL extract (D-013 D1, BUDGET §5). Anyone can download a file by
-- its public URL (/storage/v1/object/public/public-exports/...). There are no storage.objects
-- policies for it, so no client can list, upload, change or delete a file: only the pipeline's
-- service role writes (`npm run pipeline -- export odbl`).

-- 50 MB is the free-tier per-file cap; the OFF products CSV is ≈ 8 MB gzipped (BUDGET §5).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-exports', 'public-exports', true, 52428800, array['application/gzip', 'text/markdown'])
on conflict (id) do nothing;
