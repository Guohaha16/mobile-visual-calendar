-- The browser writes diary metadata only through the apply RPCs below. Each
-- apply call records its operation in the same transaction as the data change.
-- Anonymous Supabase users have the authenticated role and remain user-scoped.

create table if not exists public.diary_entries (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  text text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  last_operation_id text
);

create table if not exists public.media_assets (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_id uuid not null references public.diary_entries (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  width integer,
  height integer,
  sort_order integer not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  last_operation_id text,
  unique (user_id, storage_path),
  check (width is null or width > 0),
  check (height is null or height > 0)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  background_mode text not null,
  pinned_background_asset_id uuid
    references public.media_assets (id)
    on delete set null,
  updated_at timestamptz not null,
  last_operation_id text,
  check (background_mode in ('random', 'pinned')),
  check (
    (background_mode = 'random' and pinned_background_asset_id is null)
    or
    (background_mode = 'pinned' and pinned_background_asset_id is not null)
  )
);

create table if not exists public.sync_operations (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id text not null,
  operation_kind text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, operation_id),
  check (length(operation_id) between 1 and 200),
  check (operation_kind in ('create-entry', 'delete-entry', 'upsert-preference'))
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

create index if not exists user_preferences_user_updated_idx
  on public.user_preferences (user_id, updated_at);
create index if not exists sync_operations_user_completed_idx
  on public.sync_operations (user_id, completed_at);

alter table public.diary_entries enable row level security;
alter table public.media_assets enable row level security;
alter table public.user_preferences enable row level security;
alter table public.sync_operations enable row level security;

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
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.diary_entries as entry
      where entry.id = entry_id
        and entry.user_id = (select auth.uid())
    )
  );

drop policy if exists "users update own media"
  on public.media_assets;
create policy "users update own media"
  on public.media_assets
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.diary_entries as entry
      where entry.id = entry_id
        and entry.user_id = (select auth.uid())
    )
  );

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
  with check (
    (select auth.uid()) = user_id
    and (
      pinned_background_asset_id is null
      or exists (
        select 1
        from public.media_assets as media
        where media.id = pinned_background_asset_id
          and media.user_id = (select auth.uid())
          and media.deleted_at is null
      )
    )
  );

drop policy if exists "users update own preferences"
  on public.user_preferences;
create policy "users update own preferences"
  on public.user_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      pinned_background_asset_id is null
      or exists (
        select 1
        from public.media_assets as media
        where media.id = pinned_background_asset_id
          and media.user_id = (select auth.uid())
          and media.deleted_at is null
      )
    )
  );

drop policy if exists "users read own sync operations"
  on public.sync_operations;
create policy "users read own sync operations"
  on public.sync_operations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users insert own sync operations"
  on public.sync_operations;
create policy "users insert own sync operations"
  on public.sync_operations
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users update own sync operations"
  on public.sync_operations;
create policy "users update own sync operations"
  on public.sync_operations
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all
  on public.diary_entries,
     public.media_assets,
     public.user_preferences,
     public.sync_operations
  from public, anon, authenticated;
grant select
  on public.diary_entries,
     public.media_assets,
     public.user_preferences,
     public.sync_operations
  to authenticated;

create or replace function public.visual_diary_operation_completed(
  p_operation_id text
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
  end if;

  return exists (
    select 1
    from public.sync_operations
    where user_id = v_user_id
      and operation_id = p_operation_id
      and completed_at is not null
  );
end;
$$;

create or replace function public.visual_diary_apply_create(
  p_operation_id text,
  p_entry jsonb,
  p_media jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_kind text;
  v_completed_at timestamptz;
  v_entry_id uuid;
  v_media_row jsonb;
  v_media_id uuid;
  v_media_entry_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_operation_id, 0)
  );
  select operation_kind, completed_at
    into v_existing_kind, v_completed_at
  from public.sync_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if found then
    if v_existing_kind <> 'create-entry' then
      raise exception 'Operation ID already belongs to %', v_existing_kind;
    end if;
    if v_completed_at is not null then
      return jsonb_build_object('already_applied', true);
    end if;
    raise exception 'Operation ledger contains an incomplete create';
  end if;

  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'Create entry payload must be an object';
  end if;
  if p_media is null or jsonb_typeof(p_media) <> 'array' then
    raise exception 'Create media payload must be an array';
  end if;

  insert into public.sync_operations (
    user_id,
    operation_id,
    operation_kind
  )
  values (
    v_user_id,
    p_operation_id,
    'create-entry'
  );

  v_entry_id := (p_entry ->> 'id')::uuid;

  update public.diary_entries
  set entry_date = (p_entry ->> 'entry_date')::date,
      text = coalesce(p_entry ->> 'text', ''),
      created_at = (p_entry ->> 'created_at')::timestamptz,
      updated_at = (p_entry ->> 'updated_at')::timestamptz,
      deleted_at = case
        when p_entry ->> 'deleted_at' is null then null
        else (p_entry ->> 'deleted_at')::timestamptz
      end,
      last_operation_id = p_operation_id
  where id = v_entry_id
    and user_id = v_user_id;

  if not found then
    insert into public.diary_entries (
      id,
      user_id,
      entry_date,
      text,
      created_at,
      updated_at,
      deleted_at,
      last_operation_id
    )
    values (
      v_entry_id,
      v_user_id,
      (p_entry ->> 'entry_date')::date,
      coalesce(p_entry ->> 'text', ''),
      (p_entry ->> 'created_at')::timestamptz,
      (p_entry ->> 'updated_at')::timestamptz,
      case
        when p_entry ->> 'deleted_at' is null then null
        else (p_entry ->> 'deleted_at')::timestamptz
      end,
      p_operation_id
    );
  end if;

  for v_media_row in
    select value
    from jsonb_array_elements(p_media)
  loop
    if jsonb_typeof(v_media_row) <> 'object' then
      raise exception 'Each media payload must be an object';
    end if;
    v_media_id := (v_media_row ->> 'id')::uuid;
    v_media_entry_id := (v_media_row ->> 'entry_id')::uuid;
    if v_media_entry_id <> v_entry_id then
      raise exception 'Media entry ID does not match create entry';
    end if;
    if exists (
      select 1
      from public.media_assets
      where id = v_media_id
        and user_id = v_user_id
        and entry_id <> v_entry_id
    ) then
      raise exception 'Media ID already belongs to another entry';
    end if;

    update public.media_assets
    set entry_id = v_entry_id,
        storage_path = v_media_row ->> 'storage_path',
        mime_type = v_media_row ->> 'mime_type',
        width = nullif(v_media_row ->> 'width', '')::integer,
        height = nullif(v_media_row ->> 'height', '')::integer,
        sort_order = (v_media_row ->> 'sort_order')::integer,
        created_at = (v_media_row ->> 'created_at')::timestamptz,
        updated_at = (v_media_row ->> 'updated_at')::timestamptz,
        deleted_at = case
          when v_media_row ->> 'deleted_at' is null then null
          else (v_media_row ->> 'deleted_at')::timestamptz
        end,
        last_operation_id = p_operation_id
    where id = v_media_id
      and user_id = v_user_id;

    if not found then
      insert into public.media_assets (
        id,
        user_id,
        entry_id,
        storage_path,
        mime_type,
        width,
        height,
        sort_order,
        created_at,
        updated_at,
        deleted_at,
        last_operation_id
      )
      values (
        v_media_id,
        v_user_id,
        v_entry_id,
        v_media_row ->> 'storage_path',
        v_media_row ->> 'mime_type',
        nullif(v_media_row ->> 'width', '')::integer,
        nullif(v_media_row ->> 'height', '')::integer,
        (v_media_row ->> 'sort_order')::integer,
        (v_media_row ->> 'created_at')::timestamptz,
        (v_media_row ->> 'updated_at')::timestamptz,
        case
          when v_media_row ->> 'deleted_at' is null then null
          else (v_media_row ->> 'deleted_at')::timestamptz
        end,
        p_operation_id
      );
    end if;
  end loop;

  update public.sync_operations
  set completed_at = clock_timestamp()
  where user_id = v_user_id
    and operation_id = p_operation_id;

  return jsonb_build_object('already_applied', false);
end;
$$;

create or replace function public.visual_diary_apply_delete(
  p_operation_id text,
  p_entry_id uuid,
  p_deleted_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_kind text;
  v_completed_at timestamptz;
  v_storage_paths text[];
  v_operation_found boolean;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_operation_id, 0)
  );
  select operation_kind, completed_at
    into v_existing_kind, v_completed_at
  from public.sync_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;
  v_operation_found := found;

  select coalesce(
    array_agg(storage_path order by storage_path),
    array[]::text[]
  )
  into v_storage_paths
  from public.media_assets
  where user_id = v_user_id
    and entry_id = p_entry_id;

  if v_operation_found then
    if v_existing_kind <> 'delete-entry' then
      raise exception 'Operation ID already belongs to %', v_existing_kind;
    end if;
    if v_completed_at is not null then
      return jsonb_build_object(
        'already_applied', true,
        'storage_paths', to_jsonb(v_storage_paths)
      );
    end if;
    raise exception 'Operation ledger contains an incomplete delete';
  end if;

  if p_entry_id is null or p_deleted_at is null then
    raise exception 'Delete entry ID and timestamp are required';
  end if;

  insert into public.sync_operations (
    user_id,
    operation_id,
    operation_kind
  )
  values (
    v_user_id,
    p_operation_id,
    'delete-entry'
  );

  update public.diary_entries
  set deleted_at = p_deleted_at,
      updated_at = p_deleted_at,
      last_operation_id = p_operation_id
  where id = p_entry_id
    and user_id = v_user_id;
  if not found then
    raise exception 'Diary entry not found or not owned';
  end if;

  update public.media_assets
  set deleted_at = p_deleted_at,
      updated_at = p_deleted_at,
      last_operation_id = p_operation_id
  where entry_id = p_entry_id
    and user_id = v_user_id;

  update public.sync_operations
  set completed_at = clock_timestamp()
  where user_id = v_user_id
    and operation_id = p_operation_id;

  return jsonb_build_object(
    'already_applied', false,
    'storage_paths', to_jsonb(v_storage_paths)
  );
end;
$$;

create or replace function public.visual_diary_apply_preference(
  p_operation_id text,
  p_background_mode text,
  p_pinned_background_asset_id uuid,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_kind text;
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_operation_id, 0)
  );
  select operation_kind, completed_at
    into v_existing_kind, v_completed_at
  from public.sync_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if found then
    if v_existing_kind <> 'upsert-preference' then
      raise exception 'Operation ID already belongs to %', v_existing_kind;
    end if;
    if v_completed_at is not null then
      return jsonb_build_object('already_applied', true);
    end if;
    raise exception 'Operation ledger contains an incomplete preference';
  end if;

  if p_background_mode not in ('random', 'pinned') or p_updated_at is null then
    raise exception 'Invalid preference payload';
  end if;
  if (
    (p_background_mode = 'random' and p_pinned_background_asset_id is not null)
    or
    (p_background_mode = 'pinned' and p_pinned_background_asset_id is null)
  ) then
    raise exception 'Pinned preference requires exactly one owned media ID';
  end if;
  if p_pinned_background_asset_id is not null and not exists (
    select 1
    from public.media_assets
    where id = p_pinned_background_asset_id
      and user_id = v_user_id
      and deleted_at is null
  ) then
    raise exception 'Pinned media not found or not owned';
  end if;

  insert into public.sync_operations (
    user_id,
    operation_id,
    operation_kind
  )
  values (
    v_user_id,
    p_operation_id,
    'upsert-preference'
  );

  insert into public.user_preferences (
    user_id,
    background_mode,
    pinned_background_asset_id,
    updated_at,
    last_operation_id
  )
  values (
    v_user_id,
    p_background_mode,
    p_pinned_background_asset_id,
    p_updated_at,
    p_operation_id
  )
  on conflict (user_id) do update
  set background_mode = excluded.background_mode,
      pinned_background_asset_id = excluded.pinned_background_asset_id,
      updated_at = excluded.updated_at,
      last_operation_id = excluded.last_operation_id;

  update public.sync_operations
  set completed_at = clock_timestamp()
  where user_id = v_user_id
    and operation_id = p_operation_id;

  return jsonb_build_object('already_applied', false);
end;
$$;

-- For demo correctness this function returns a complete own-user snapshot on
-- every call. p_cursor is informational only. This costs more bandwidth than a
-- delta feed but avoids permanent skips until CDC or a composite cursor exists.
create or replace function public.visual_diary_snapshot(
  p_cursor text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_entries jsonb;
  v_media jsonb;
  v_preference jsonb;
  v_server_cursor timestamptz := statement_timestamp();
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'entry_date', entry_date,
        'text', text,
        'created_at', created_at,
        'updated_at', updated_at,
        'deleted_at', deleted_at
      )
      order by updated_at, id
    ),
    '[]'::jsonb
  )
  into v_entries
  from public.diary_entries
  where user_id = v_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'user_id', user_id,
        'entry_id', entry_id,
        'storage_path', storage_path,
        'mime_type', mime_type,
        'width', width,
        'height', height,
        'sort_order', sort_order,
        'created_at', created_at,
        'updated_at', updated_at,
        'deleted_at', deleted_at
      )
      order by entry_id, sort_order, created_at, id
    ),
    '[]'::jsonb
  )
  into v_media
  from public.media_assets
  where user_id = v_user_id;

  select jsonb_build_object(
    'user_id', user_id,
    'background_mode', background_mode,
    'pinned_background_asset_id', pinned_background_asset_id,
    'updated_at', updated_at
  )
  into v_preference
  from public.user_preferences
  where user_id = v_user_id;

  return jsonb_build_object(
    'entries', v_entries,
    'media', v_media,
    'preference', v_preference,
    'cursor', v_server_cursor
  );
end;
$$;

revoke all on function public.visual_diary_operation_completed(text)
  from public, anon;
revoke all on function public.visual_diary_apply_create(text, jsonb, jsonb)
  from public, anon;
revoke all on function public.visual_diary_apply_delete(text, uuid, timestamptz)
  from public, anon;
revoke all on function public.visual_diary_apply_preference(
  text,
  text,
  uuid,
  timestamptz
)
  from public, anon;
revoke all on function public.visual_diary_snapshot(text)
  from public, anon;

grant execute on function public.visual_diary_operation_completed(text)
  to authenticated;
grant execute on function public.visual_diary_apply_create(text, jsonb, jsonb)
  to authenticated;
grant execute on function public.visual_diary_apply_delete(
  text,
  uuid,
  timestamptz
)
  to authenticated;
grant execute on function public.visual_diary_apply_preference(
  text,
  text,
  uuid,
  timestamptz
)
  to authenticated;
grant execute on function public.visual_diary_snapshot(text)
  to authenticated;

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
