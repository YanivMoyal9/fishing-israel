-- יומן תפיסות — סכימה ל-Supabase
-- הריצו את הקובץ הזה ב-Supabase: SQL Editor > New query > הדביקו והריצו (Run)

create table if not exists public.catches (
  id uuid primary key default gen_random_uuid(),
  fish text not null,
  weight numeric,
  method text,
  notes text,
  spot text,
  caught_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- אבטחה בסיסית: פתוח לקריאה/כתיבה עם מפתח anon (מתאים לשימוש אישי).
-- אם תרצו בעתיד משתמשים והתחברות — נחליף ל-policies לפי auth.uid().
alter table public.catches enable row level security;

create policy "anon read" on public.catches
  for select to anon using (true);

create policy "anon insert" on public.catches
  for insert to anon with check (true);

create policy "anon delete" on public.catches
  for delete to anon using (true);
