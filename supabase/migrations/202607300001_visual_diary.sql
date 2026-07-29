-- The browser writes diary metadata only through the apply RPCs below. Each
-- apply call records its operation in the same transaction as the data change.
-- Anonymous Supabase users have the authenticated role and remain user-scoped.

do $$
begin
  create type public.visual_diary_operation_status as enum (
    'missing',
    'pending',
    'completed'
  );
exception
  when duplicate_object then null;
end;
$$;

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
  check (height is null or height > 0),
  check ((width is null) = (height is null)),
  check (sort_order >= 0),
  check (mime_type ~ '^image/[a-z0-9][a-z0-9.+-]*$'),
  check (storage_path !~ '(^|/)\.\.(/|$)')
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
  entity_id text not null,
  result_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, operation_id),
  check (length(operation_id) between 1 and 200),
  check (length(entity_id) between 1 and 200),
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

create or replace function public.visual_diary_get_operation_status(
  p_operation_id text,
  p_operation_kind text,
  p_entity_id text
)
returns public.visual_diary_operation_status
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_kind text;
  v_existing_entity_id text;
  v_completed_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
  end if;
  if p_operation_kind not in (
    'create-entry',
    'delete-entry',
    'upsert-preference'
  ) or p_entity_id is null or length(p_entity_id) not between 1 and 200 then
    raise exception 'Invalid operation binding';
  end if;

  select operation_kind, entity_id, completed_at
    into v_existing_kind, v_existing_entity_id, v_completed_at
  from public.sync_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if not found then
    return 'missing';
  end if;
  if (
    v_existing_kind <> p_operation_kind
    or v_existing_entity_id <> p_entity_id
  ) then
    raise exception 'Operation ID binding collision';
  end if;
  if v_completed_at is null then
    return 'pending';
  end if;
  return 'completed';
end;
$$;

-- DETERMINISTIC RETRY AND ORPHAN MAINTENANCE
-- Storage uploads use an exact user/date/media path with upsert=true. After an
-- ambiguous response, clients first call visual_diary_get_operation_status:
-- missing retries upload plus apply, completed retries only local metadata, and
-- pending pauses for operator inspection. A scheduled maintenance job may remove
-- diary-images objects older than its safety window when no media_assets row
-- references the exact owned path. The safety window must exceed the maximum
-- client retry period so an in-flight upload is never collected as an orphan.
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
  v_existing_entity_id text;
  v_completed_at timestamptz;
  v_entry_id uuid;
  v_entry_date date;
  v_entry_created_at timestamptz;
  v_entry_updated_at timestamptz;
  v_entry_deleted_at timestamptz;
  v_entry_exists boolean;
  v_entry_accepts_media boolean;
  v_media_row jsonb;
  v_media_id uuid;
  v_media_entry_id uuid;
  v_media_storage_path text;
  v_media_mime_type text;
  v_media_width integer;
  v_media_height integer;
  v_media_sort_order integer;
  v_media_created_at timestamptz;
  v_media_updated_at timestamptz;
  v_media_deleted_at timestamptz;
  v_expected_extension text;
  v_expected_storage_path text;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
  end if;
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'Create entry payload must be an object';
  end if;
  if p_media is null or jsonb_typeof(p_media) <> 'array' then
    raise exception 'Create media payload must be an array';
  end if;
  begin
    v_entry_id := (p_entry ->> 'id')::uuid;
    v_entry_date := (p_entry ->> 'entry_date')::date;
    v_entry_created_at := (p_entry ->> 'created_at')::timestamptz;
    v_entry_updated_at := (p_entry ->> 'updated_at')::timestamptz;
    v_entry_deleted_at := case
      when p_entry ->> 'deleted_at' is null then null
      else (p_entry ->> 'deleted_at')::timestamptz
    end;
  exception
    when others then
      raise exception 'Invalid create entry payload';
  end;
  if (
    v_entry_id is null
    or v_entry_id::text <> p_entry ->> 'id'
    or v_entry_date is null
    or v_entry_date::text <> p_entry ->> 'entry_date'
    or v_entry_created_at is null
    or v_entry_updated_at is null
  ) then
    raise exception 'Invalid create entry payload';
  end if;

  for v_media_row in
    select value
    from jsonb_array_elements(p_media)
  loop
    if jsonb_typeof(v_media_row) <> 'object' then
      raise exception 'Each media payload must be an object';
    end if;
    begin
      v_media_id := (v_media_row ->> 'id')::uuid;
      v_media_entry_id := (v_media_row ->> 'entry_id')::uuid;
      v_media_storage_path := v_media_row ->> 'storage_path';
      v_media_mime_type := v_media_row ->> 'mime_type';
      v_media_width := nullif(v_media_row ->> 'width', '')::integer;
      v_media_height := nullif(v_media_row ->> 'height', '')::integer;
      v_media_sort_order := (v_media_row ->> 'sort_order')::integer;
      v_media_created_at := (v_media_row ->> 'created_at')::timestamptz;
      v_media_updated_at := (v_media_row ->> 'updated_at')::timestamptz;
      v_media_deleted_at := case
        when v_media_row ->> 'deleted_at' is null then null
        else (v_media_row ->> 'deleted_at')::timestamptz
      end;
    exception
      when others then
        raise exception 'Invalid media payload';
    end;
    if (
      v_media_id is null
      or v_media_id::text <> v_media_row ->> 'id'
      or v_media_entry_id is null
      or v_media_entry_id::text <> v_media_row ->> 'entry_id'
      or v_media_entry_id <> v_entry_id
      or v_media_storage_path is null
      or v_media_mime_type !~ '^image/[a-z0-9][a-z0-9.+-]*$'
      or (v_media_width is not null and v_media_width <= 0)
      or (v_media_height is not null and v_media_height <= 0)
      or (v_media_width is null) <> (v_media_height is null)
      or v_media_sort_order is null
      or v_media_sort_order < 0
      or v_media_created_at is null
      or v_media_updated_at is null
    ) then
      raise exception 'Invalid media payload';
    end if;
    if (
      select count(*)
      from jsonb_array_elements(p_media) as candidate(value)
      where candidate.value ->> 'id' = v_media_id::text
    ) > 1 then
      raise exception 'Duplicate media ID in create payload';
    end if;

    v_expected_extension := case
      when v_media_mime_type = 'image/jpeg' then 'jpg'
      when v_media_mime_type = 'image/svg+xml' then 'svg'
      else regexp_replace(
        split_part(split_part(v_media_mime_type, '/', 2), '+', 1),
        '[^a-z0-9]',
        '',
        'g'
      )
    end;
    if v_expected_extension = '' then
      raise exception 'Invalid media MIME extension';
    end if;
    v_expected_storage_path :=
      v_user_id::text
      || '/'
      || to_char(v_entry_date, 'YYYY/MM')
      || '/'
      || v_media_id::text
      || '.'
      || v_expected_extension;
    if v_media_storage_path <> v_expected_storage_path then
      raise exception 'Media storage path is not the exact owned path';
    end if;
  end loop;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':operation:' || p_operation_id, 0)
  );
  select operation_kind, entity_id, completed_at
    into v_existing_kind, v_existing_entity_id, v_completed_at
  from public.sync_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if found then
    if (
      v_existing_kind <> 'create-entry'
      or v_existing_entity_id <> v_entry_id::text
    ) then
      raise exception 'Operation ID binding collision';
    end if;
    if v_completed_at is not null then
      return jsonb_build_object('already_applied', true);
    end if;
    raise exception 'Operation ledger contains an incomplete create';
  end if;

  insert into public.sync_operations (
    user_id,
    operation_id,
    operation_kind,
    entity_id
  )
  values (
    v_user_id,
    p_operation_id,
    'create-entry',
    v_entry_id::text
  );

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':entry:' || v_entry_id::text, 0)
  );

  if exists (
    select 1
    from public.diary_entries
    where id = v_entry_id
      and user_id <> v_user_id
  ) then
    raise exception 'Diary entry ID is not owned by the session user';
  end if;
  select exists (
    select 1
    from public.diary_entries
    where id = v_entry_id
      and user_id = v_user_id
  )
  into v_entry_exists;

  if v_entry_exists then
    update public.diary_entries
    set entry_date = v_entry_date,
        text = coalesce(p_entry ->> 'text', ''),
        created_at = v_entry_created_at,
        updated_at = v_entry_updated_at,
        deleted_at = v_entry_deleted_at,
        last_operation_id = p_operation_id
    where id = v_entry_id
      and user_id = v_user_id
      and deleted_at is null
      and v_entry_deleted_at is null
      and v_entry_updated_at > updated_at;
  else
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
      v_entry_date,
      coalesce(p_entry ->> 'text', ''),
      v_entry_created_at,
      v_entry_updated_at,
      v_entry_deleted_at,
      p_operation_id
    );
  end if;

  select deleted_at is null
  into v_entry_accepts_media
  from public.diary_entries
  where id = v_entry_id
    and user_id = v_user_id;

  if v_entry_accepts_media and v_entry_deleted_at is null then
    for v_media_row in
      select value
      from jsonb_array_elements(p_media)
    loop
    if jsonb_typeof(v_media_row) <> 'object' then
      raise exception 'Each media payload must be an object';
    end if;
    begin
      v_media_id := (v_media_row ->> 'id')::uuid;
      v_media_entry_id := (v_media_row ->> 'entry_id')::uuid;
      v_media_storage_path := v_media_row ->> 'storage_path';
      v_media_mime_type := v_media_row ->> 'mime_type';
      v_media_width := nullif(v_media_row ->> 'width', '')::integer;
      v_media_height := nullif(v_media_row ->> 'height', '')::integer;
      v_media_sort_order := (v_media_row ->> 'sort_order')::integer;
      v_media_created_at := (v_media_row ->> 'created_at')::timestamptz;
      v_media_updated_at := (v_media_row ->> 'updated_at')::timestamptz;
      v_media_deleted_at := case
        when v_media_row ->> 'deleted_at' is null then null
        else (v_media_row ->> 'deleted_at')::timestamptz
      end;
    exception
      when others then
        raise exception 'Invalid media payload';
    end;
    if (
      v_media_id is null
      or v_media_id::text <> v_media_row ->> 'id'
      or v_media_entry_id is null
      or v_media_entry_id::text <> v_media_row ->> 'entry_id'
      or v_media_entry_id <> v_entry_id
      or v_media_storage_path is null
      or v_media_mime_type !~ '^image/[a-z0-9][a-z0-9.+-]*$'
      or (v_media_width is not null and v_media_width <= 0)
      or (v_media_height is not null and v_media_height <= 0)
      or (v_media_width is null) <> (v_media_height is null)
      or v_media_sort_order is null
      or v_media_sort_order < 0
      or v_media_created_at is null
      or v_media_updated_at is null
    ) then
      raise exception 'Invalid media payload';
    end if;
    v_expected_extension := case
      when v_media_mime_type = 'image/jpeg' then 'jpg'
      when v_media_mime_type = 'image/svg+xml' then 'svg'
      else regexp_replace(
        split_part(split_part(v_media_mime_type, '/', 2), '+', 1),
        '[^a-z0-9]',
        '',
        'g'
      )
    end;
    v_expected_storage_path :=
      v_user_id::text
      || '/'
      || to_char(v_entry_date, 'YYYY/MM')
      || '/'
      || v_media_id::text
      || '.'
      || v_expected_extension;
    if v_media_storage_path <> v_expected_storage_path then
      raise exception 'Media storage path is not the exact owned path';
    end if;
    if exists (
      select 1
      from public.media_assets
      where id = v_media_id
        and (
          user_id <> v_user_id
          or entry_id <> v_entry_id
        )
    ) then
      raise exception 'Media ID already belongs to another owner or entry';
    end if;

    if exists (
      select 1
      from public.media_assets
      where id = v_media_id
        and user_id = v_user_id
    ) then
      update public.media_assets
      set entry_id = v_entry_id,
          storage_path = v_media_storage_path,
          mime_type = v_media_mime_type,
          width = v_media_width,
          height = v_media_height,
          sort_order = v_media_sort_order,
          created_at = v_media_created_at,
          updated_at = v_media_updated_at,
          deleted_at = v_media_deleted_at,
          last_operation_id = p_operation_id
      where id = v_media_id
        and user_id = v_user_id
        and deleted_at is null
        and v_media_deleted_at is null
        and v_media_updated_at > updated_at;
    else
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
        v_media_storage_path,
        v_media_mime_type,
        v_media_width,
        v_media_height,
        v_media_sort_order,
        v_media_created_at,
        v_media_updated_at,
        v_media_deleted_at,
        p_operation_id
      );
    end if;
    end loop;
  end if;

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
  v_existing_entity_id text;
  v_completed_at timestamptz;
  v_result_payload jsonb;
  v_storage_paths text[];
  v_operation_found boolean;
  v_delete_applies boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
  end if;
  if p_entry_id is null or p_deleted_at is null then
    raise exception 'Delete entry ID and timestamp are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':operation:' || p_operation_id, 0)
  );
  select operation_kind, entity_id, completed_at, result_payload
    into
      v_existing_kind,
      v_existing_entity_id,
      v_completed_at,
      v_result_payload
  from public.sync_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;
  v_operation_found := found;

  if v_operation_found then
    if (
      v_existing_kind <> 'delete-entry'
      or v_existing_entity_id <> p_entry_id::text
    ) then
      raise exception 'Operation ID binding collision';
    end if;
    if v_completed_at is not null then
      return jsonb_build_object(
        'already_applied', true,
        'storage_paths',
        coalesce(v_result_payload -> 'storage_paths', '[]'::jsonb)
      );
    end if;
    raise exception 'Operation ledger contains an incomplete delete';
  end if;

  insert into public.sync_operations (
    user_id,
    operation_id,
    operation_kind,
    entity_id
  )
  values (
    v_user_id,
    p_operation_id,
    'delete-entry',
    p_entry_id::text
  );

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':entry:' || p_entry_id::text, 0)
  );
  select exists (
    select 1
    from public.diary_entries
    where id = p_entry_id
      and user_id = v_user_id
      and p_deleted_at >= greatest(
        updated_at,
        coalesce(deleted_at, '-infinity'::timestamptz)
      )
  )
  into v_delete_applies;

  if v_delete_applies then
    select coalesce(
      array_agg(storage_path order by storage_path),
      array[]::text[]
    )
    into v_storage_paths
    from public.media_assets
    where user_id = v_user_id
      and entry_id = p_entry_id
      and p_deleted_at >= greatest(
        updated_at,
        coalesce(deleted_at, '-infinity'::timestamptz)
      );

    update public.diary_entries
    set deleted_at = p_deleted_at,
        updated_at = p_deleted_at,
        last_operation_id = p_operation_id
    where id = p_entry_id
      and user_id = v_user_id
      and p_deleted_at >= greatest(
        updated_at,
        coalesce(deleted_at, '-infinity'::timestamptz)
      );

    update public.media_assets
    set deleted_at = p_deleted_at,
        updated_at = p_deleted_at,
        last_operation_id = p_operation_id
    where entry_id = p_entry_id
      and user_id = v_user_id
      and p_deleted_at >= greatest(
        updated_at,
        coalesce(deleted_at, '-infinity'::timestamptz)
      );

    update public.user_preferences
    set background_mode = 'random',
        pinned_background_asset_id = null,
        updated_at = greatest(updated_at, p_deleted_at),
        last_operation_id = p_operation_id
    where user_id = v_user_id
      and pinned_background_asset_id in (
        select id
        from public.media_assets
        where user_id = v_user_id
          and entry_id = p_entry_id
      );
  else
    v_storage_paths := array[]::text[];
  end if;

  update public.sync_operations
  set completed_at = clock_timestamp(),
      result_payload = jsonb_build_object(
        'storage_paths',
        to_jsonb(v_storage_paths)
      )
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
  v_existing_entity_id text;
  v_completed_at timestamptz;
  v_existing_updated_at timestamptz;
  v_existing_preference_key text;
  v_incoming_preference_key text;
  v_should_apply boolean;
begin
  if v_user_id is null then
    raise exception 'Authenticated user required';
  end if;
  if p_operation_id is null or length(p_operation_id) not between 1 and 200 then
    raise exception 'Invalid operation ID';
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
  -- Equal timestamps are arrival-order independent: random wins over pinned,
  -- and equal-time pinned values use lexical UUID order.
  v_incoming_preference_key := case
    when p_background_mode = 'pinned'
      then '0:' || p_pinned_background_asset_id::text
    else '1:'
  end;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':operation:' || p_operation_id, 0)
  );
  select operation_kind, entity_id, completed_at
    into v_existing_kind, v_existing_entity_id, v_completed_at
  from public.sync_operations
  where user_id = v_user_id
    and operation_id = p_operation_id;

  if found then
    if (
      v_existing_kind <> 'upsert-preference'
      or v_existing_entity_id <> 'background'
    ) then
      raise exception 'Operation ID binding collision';
    end if;
    if v_completed_at is not null then
      return jsonb_build_object('already_applied', true);
    end if;
    raise exception 'Operation ledger contains an incomplete preference';
  end if;

  insert into public.sync_operations (
    user_id,
    operation_id,
    operation_kind,
    entity_id
  )
  values (
    v_user_id,
    p_operation_id,
    'upsert-preference',
    'background'
  );

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':preference:background', 0)
  );
  select
    updated_at,
    case
      when background_mode = 'pinned'
        then '0:' || pinned_background_asset_id::text
      else '1:'
    end
  into v_existing_updated_at, v_existing_preference_key
  from public.user_preferences
  where user_id = v_user_id;

  v_should_apply :=
    not found
    or p_updated_at > v_existing_updated_at
    or (
      p_updated_at = v_existing_updated_at
      and v_incoming_preference_key > v_existing_preference_key
    );

  if v_should_apply then
    if p_pinned_background_asset_id is not null and not exists (
      select 1
      from public.media_assets as media
      join public.diary_entries as entry
        on entry.id = media.entry_id
       and entry.user_id = media.user_id
      where media.id = p_pinned_background_asset_id
        and media.user_id = v_user_id
        and media.deleted_at is null
        and entry.deleted_at is null
    ) then
      raise exception 'Pinned media not found, live, or owned';
    end if;

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
  end if;

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
stable
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

revoke all on function public.visual_diary_get_operation_status(
  text,
  text,
  text
)
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

grant execute on function public.visual_diary_get_operation_status(
  text,
  text,
  text
)
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
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^(0[1-9]|1[0-2])$'
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$'
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
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^(0[1-9]|1[0-2])$'
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$'
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
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^(0[1-9]|1[0-2])$'
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$'
  )
  with check (
    bucket_id = 'diary-images'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^(0[1-9]|1[0-2])$'
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$'
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
    and array_length(storage.foldername(name), 1) = 3
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^(0[1-9]|1[0-2])$'
    and storage.filename(name) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$'
  );
