-- Visual diary records are scoped to authenticated users. Supabase anonymous
-- sessions use the authenticated role and therefore receive the same isolation.

create table if not exists public.diary_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  entry_date date not null,
  text text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  last_operation_id text,
  primary key (user_id, id)
);

create table if not exists public.media_assets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  entry_id text not null,
  storage_path text not null,
  mime_type text not null,
  width integer,
  height integer,
  sort_order integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  last_operation_id text,
  primary key (user_id, id),
  foreign key (user_id, entry_id)
    references public.diary_entries (user_id, id)
    on delete cascade,
  unique (user_id, storage_path),
  check (width is null or width > 0),
  check (height is null or height > 0)
);

create table if not exists public.user_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null default 'background',
  background_mode text not null,
  pinned_background_asset_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  last_operation_id text,
  primary key (user_id, key),
  check (key = 'background'),
  check (background_mode in ('random', 'pinned')),
  check (
    (background_mode = 'random' and pinned_background_asset_id is null)
    or
    (background_mode = 'pinned' and pinned_background_asset_id is not null)
  )
);

create index if not exists diary_entries_user_id_idx
  on public.diary_entries (user_id);
create index if not exists diary_entries_user_date_created_idx
  on public.diary_entries (user_id, entry_date, created_at);
create index if not exists diary_entries_user_updated_idx
  on public.diary_entries (user_id, updated_at);

create index if not exists media_assets_user_id_idx
  on public.media_assets (user_id);
create index if not exists media_assets_user_updated_idx
  on public.media_assets (user_id, updated_at);
create index if not exists media_assets_entry_order_idx
  on public.media_assets (
    user_id,
    entry_id,
    sort_order,
    created_at,
    id
  );

create index if not exists user_preferences_user_id_idx
  on public.user_preferences (user_id);
create index if not exists user_preferences_user_updated_idx
  on public.user_preferences (user_id, updated_at);

alter table public.diary_entries enable row level security;
alter table public.media_assets enable row level security;
alter table public.user_preferences enable row level security;

grant select, insert, update
  on public.diary_entries, public.media_assets, public.user_preferences
  to authenticated;
grant delete on public.media_assets to authenticated;

drop policy if exists "users read own entries"
  on public.diary_entries;
create policy "users read own entries"
  on public.diary_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users insert own entries"
  on public.diary_entries;
create policy "users insert own entries"
  on public.diary_entries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own entries"
  on public.diary_entries;
create policy "users update own entries"
  on public.diary_entries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users read own media"
  on public.media_assets;
create policy "users read own media"
  on public.media_assets
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users insert own media"
  on public.media_assets;
create policy "users insert own media"
  on public.media_assets
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own media"
  on public.media_assets;
create policy "users update own media"
  on public.media_assets
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users delete own media"
  on public.media_assets;
create policy "users delete own media"
  on public.media_assets
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users read own preferences"
  on public.user_preferences;
create policy "users read own preferences"
  on public.user_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users insert own preferences"
  on public.user_preferences;
create policy "users insert own preferences"
  on public.user_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own preferences"
  on public.user_preferences;
create policy "users update own preferences"
  on public.user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('diary-images', 'diary-images', false)
on conflict (id) do update
set name = excluded.name,
    public = false;

drop policy if exists "users read own diary images"
  on storage.objects;
create policy "users read own diary images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'diary-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "users insert own diary images"
  on storage.objects;
create policy "users insert own diary images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'diary-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "users update own diary images"
  on storage.objects;
create policy "users update own diary images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'diary-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'diary-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "users delete own diary images"
  on storage.objects;
create policy "users delete own diary images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'diary-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
