-- Taktik initial schema: teams, tactics, versions, comments, notifications, with row-level security.

create extension if not exists pgcrypto with schema extensions;

create type public.team_role as enum ('owner', 'coach', 'member', 'viewer');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  email text,
  avatar_color text not null default '#2563eb',
  email_digest boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

-- Invites without an email are shareable links (multi-use until expiry); email invites are single-use.
create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  email text,
  role public.team_role not null default 'member' check (role <> 'owner'),
  uses integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create index team_invites_team_idx on public.team_invites (team_id);

create table public.tactics (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  sport text not null,
  title text not null default 'Untitled tactic' check (char_length(title) <= 120),
  folder text check (char_length(folder) <= 60),
  tags text[] not null default '{}',
  doc_state bytea,
  thumbnail_url text,
  visibility text not null default 'team' check (visibility in ('team', 'link')),
  share_slug text unique,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tactics_team_idx on public.tactics (team_id, updated_at desc);

create table public.tactic_versions (
  id uuid primary key default gen_random_uuid(),
  tactic_id uuid not null references public.tactics (id) on delete cascade,
  name text not null check (char_length(name) <= 120),
  state jsonb not null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index tactic_versions_tactic_idx on public.tactic_versions (tactic_id, created_at desc);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  tactic_id uuid not null references public.tactics (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 5000),
  anchor_ms integer check (anchor_ms >= 0),
  anchor_x real,
  anchor_y real,
  mentions uuid[] not null default '{}',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index comments_tactic_idx on public.comments (tactic_id, created_at);

create table public.comment_reactions (
  comment_id uuid not null references public.comments (id) on delete cascade,
  tactic_id uuid not null references public.tactics (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  emoji text not null check (char_length(emoji) <= 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index comment_reactions_tactic_idx on public.comment_reactions (tactic_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('mention', 'reply')),
  tactic_id uuid references public.tactics (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies can consult team_members without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.team_role_of(p_team uuid)
returns public.team_role language sql stable security definer set search_path = '' as $$
  select role from public.team_members where team_id = p_team and user_id = auth.uid()
$$;

create or replace function public.is_team_member(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where team_id = p_team and user_id = auth.uid())
$$;

create or replace function public.can_edit_team(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = auth.uid() and role in ('owner', 'coach', 'member')
  )
$$;

create or replace function public.is_team_admin(p_team uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members
    where team_id = p_team and user_id = auth.uid() and role in ('owner', 'coach')
  )
$$;

create or replace function public.tactic_team(p_tactic uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select team_id from public.tactics where id = p_tactic
$$;

create or replace function public.shares_team_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members a
    join public.team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

/** Safe uuid parsing for text identifiers coming from topics and storage paths. */
create or replace function public.try_uuid(p text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email, avatar_color)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1),
      'Player'
    ), 60),
    new.email,
    (array['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#f97316', '#0891b2', '#db2777'])[1 + floor(random() * 7)::int]
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger tactics_touch before update on public.tactics
  for each row execute function public.touch_updated_at();
create trigger comments_touch before update on public.comments
  for each row execute function public.touch_updated_at();

create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
  v_parent_author uuid;
begin
  select team_id into v_team from public.tactics where id = new.tactic_id;

  insert into public.notifications (user_id, kind, tactic_id, comment_id, actor_id)
  select distinct m, 'mention', new.tactic_id, new.id, new.author_id
  from unnest(new.mentions) as m
  where m <> new.author_id
    and exists (select 1 from public.team_members tm where tm.team_id = v_team and tm.user_id = m);

  if new.parent_id is not null then
    select author_id into v_parent_author from public.comments where id = new.parent_id;
    if v_parent_author is not null
      and v_parent_author <> new.author_id
      and not (v_parent_author = any (new.mentions)) then
      insert into public.notifications (user_id, kind, tactic_id, comment_id, actor_id)
      values (v_parent_author, 'reply', new.tactic_id, new.id, new.author_id);
    end if;
  end if;
  return new;
end
$$;

create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_on_comment();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.create_team(p_name text)
returns public.teams language plpgsql security definer set search_path = '' as $$
declare
  v_team public.teams;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.teams (name, created_by) values (p_name, auth.uid()) returning * into v_team;
  insert into public.team_members (team_id, user_id, role) values (v_team.id, auth.uid(), 'owner');
  return v_team;
end
$$;

create or replace function public.get_invite_info(p_token text)
returns table (team_id uuid, team_name text, role public.team_role, expired boolean)
language sql stable security definer set search_path = '' as $$
  select i.team_id, t.name, i.role,
    (i.expires_at < now() or (i.email is not null and i.accepted_at is not null))
  from public.team_invites i join public.teams t on t.id = i.team_id
  where i.token = p_token
$$;

create or replace function public.accept_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.team_invites;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_invite from public.team_invites where token = p_token for update;
  if not found or v_invite.expires_at < now() then
    raise exception 'invite is invalid or expired';
  end if;
  if v_invite.email is not null then
    if v_invite.accepted_at is not null then
      raise exception 'invite has already been used';
    end if;
    select email into v_email from auth.users where id = auth.uid();
    if lower(coalesce(v_email, '')) <> lower(v_invite.email) then
      raise exception 'this invite was sent to a different email address';
    end if;
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_invite.team_id, auth.uid(), v_invite.role)
  on conflict (team_id, user_id) do nothing;

  update public.team_invites
  set uses = uses + 1, accepted_at = coalesce(accepted_at, now())
  where id = v_invite.id;

  return v_invite.team_id;
end
$$;

create or replace function public.get_public_tactic(p_slug text)
returns table (id uuid, title text, sport text, doc_state bytea, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select id, title, sport, doc_state, updated_at
  from public.tactics
  where share_slug = p_slug and visibility = 'link'
$$;

/** Realtime authorization for `tactic:<uuid>` topics. Writers must be able to edit; viewers may only listen. */
create or replace function public.realtime_tactic_access(p_topic text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_role public.team_role;
begin
  if p_topic is null or p_topic not like 'tactic:%' then
    return false;
  end if;
  select tm.role into v_role
  from public.tactics t
  join public.team_members tm on tm.team_id = t.team_id and tm.user_id = auth.uid()
  where t.id = public.try_uuid(substr(p_topic, 8));
  if v_role is null then
    return false;
  end if;
  return not p_write or v_role <> 'viewer';
end
$$;

create or replace function public.can_edit_tactic_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_edit_team(public.tactic_team(public.try_uuid(split_part(p_name, '.', 1))))
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.tactics enable row level security;
alter table public.tactic_versions enable row level security;
alter table public.comments enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.notifications enable row level security;

create policy "profiles: read self and teammates" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));
create policy "profiles: update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "teams: members read" on public.teams for select to authenticated
  using (public.is_team_member(id));
create policy "teams: admins update" on public.teams for update to authenticated
  using (public.is_team_admin(id)) with check (public.is_team_admin(id));
create policy "teams: owner deletes" on public.teams for delete to authenticated
  using (public.team_role_of(id) = 'owner');

create policy "members: members read" on public.team_members for select to authenticated
  using (public.is_team_member(team_id));
create policy "members: admins change roles" on public.team_members for update to authenticated
  using (public.team_role_of(team_id) = 'owner' or (public.is_team_admin(team_id) and role <> 'owner'))
  with check (public.team_role_of(team_id) = 'owner' or (public.is_team_admin(team_id) and role <> 'owner'));
create policy "members: admins remove, members leave" on public.team_members for delete to authenticated
  using (
    (public.team_role_of(team_id) = 'owner' and user_id <> auth.uid())
    or (public.is_team_admin(team_id) and role <> 'owner')
    or (user_id = auth.uid() and role <> 'owner')
  );

create policy "invites: admins read" on public.team_invites for select to authenticated
  using (public.is_team_admin(team_id));
create policy "invites: admins create" on public.team_invites for insert to authenticated
  with check (public.is_team_admin(team_id) and role <> 'owner');
create policy "invites: admins delete" on public.team_invites for delete to authenticated
  using (public.is_team_admin(team_id));

create policy "tactics: members read" on public.tactics for select to authenticated
  using (public.is_team_member(team_id));
create policy "tactics: editors create" on public.tactics for insert to authenticated
  with check (public.can_edit_team(team_id));
create policy "tactics: editors update" on public.tactics for update to authenticated
  using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));
create policy "tactics: editors delete" on public.tactics for delete to authenticated
  using (public.can_edit_team(team_id));

create policy "versions: members read" on public.tactic_versions for select to authenticated
  using (public.is_team_member(public.tactic_team(tactic_id)));
create policy "versions: editors create" on public.tactic_versions for insert to authenticated
  with check (public.can_edit_team(public.tactic_team(tactic_id)));
create policy "versions: admins delete" on public.tactic_versions for delete to authenticated
  using (public.is_team_admin(public.tactic_team(tactic_id)));

create policy "comments: members read" on public.comments for select to authenticated
  using (public.is_team_member(public.tactic_team(tactic_id)));
create policy "comments: members write own" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_team_member(public.tactic_team(tactic_id)));
create policy "comments: author or editors update" on public.comments for update to authenticated
  using (author_id = auth.uid() or public.can_edit_team(public.tactic_team(tactic_id)));
create policy "comments: author or admins delete" on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.is_team_admin(public.tactic_team(tactic_id)));

create policy "reactions: members read" on public.comment_reactions for select to authenticated
  using (public.is_team_member(public.tactic_team(tactic_id)));
create policy "reactions: members add own" on public.comment_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_team_member(public.tactic_team(tactic_id))
    and exists (select 1 from public.comments c where c.id = comment_id and c.tactic_id = comment_reactions.tactic_id)
  );
create policy "reactions: remove own" on public.comment_reactions for delete to authenticated
  using (user_id = auth.uid());

create policy "notifications: own" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications: mark own read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications: delete own" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: private broadcast channels per tactic + change feeds
-- ---------------------------------------------------------------------------

create policy "tactic channel: members receive" on realtime.messages for select to authenticated
  using (public.realtime_tactic_access((select realtime.topic()), false));

create policy "tactic channel: send" on realtime.messages for insert to authenticated
  with check (
    public.realtime_tactic_access(
      (select realtime.topic()),
      coalesce(realtime.messages.event, '') in ('update', 'sync-res', 'chunk')
    )
  );

alter publication supabase_realtime add table public.comments, public.comment_reactions, public.notifications;

-- ---------------------------------------------------------------------------
-- Storage: tactic thumbnails (public read, editors write). Object name = <tactic_id>.png
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

create policy "thumbnails: editors upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails' and public.can_edit_tactic_object(name));
create policy "thumbnails: editors replace" on storage.objects for update to authenticated
  using (bucket_id = 'thumbnails' and public.can_edit_tactic_object(name));
create policy "thumbnails: editors delete" on storage.objects for delete to authenticated
  using (bucket_id = 'thumbnails' and public.can_edit_tactic_object(name));
