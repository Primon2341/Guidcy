-- Careers: make uploaded resumes work, and keep them private.
--
-- storage.objects has RLS enabled but not a single policy mentioned the
-- job-resumes bucket, so every candidate resume upload was rejected with 42501.
-- The client swallowed that error, fell back to whatever was typed in the
-- "Resume link" box, and the admin's applicant table showed "-" instead.
--
-- The bucket was also public, which would have made every CV - name, phone,
-- address, work history - readable by anyone holding the URL. Resumes are now
-- private: a candidate writes and reads only their own folder, admins read all,
-- and the app hands out short-lived signed URLs.
--
-- Safe to run as-is: the bucket held 0 objects and no application referenced a
-- resume, so nothing existing is invalidated.

update storage.buckets set public = false where id = 'job-resumes';

drop policy if exists "Candidates upload own resume" on storage.objects;
create policy "Candidates upload own resume"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'job-resumes'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "Candidates read own resume" on storage.objects;
create policy "Candidates read own resume"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-resumes'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Hiring team reads every resume; the app signs these for ~30 minutes at a time.
drop policy if exists "Admins read every resume" on storage.objects;
create policy "Admins read every resume"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'job-resumes'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
