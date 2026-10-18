-- Pending email invitations can be listed, accepted, or declined by the invited account.
-- Direct table access stays limited to team admins.

alter table public.team_invites
  add column if not exists declined_at timestamptz;

create index if not exists team_invites_email_pending_idx
  on public.team_invites (lower(email))
  where email is not null and accepted_at is null and declined_at is null;

create or replace function public.get_invite_info(p_token text)
returns table (team_id uuid, team_name text, role public.team_role, expired boolean)
language sql stable security definer set search_path = '' as $$
  select i.team_id, t.name, i.role,
    (i.expires_at < now() or i.declined_at is not null or (i.email is not null and i.accepted_at is not null))
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
  if not found or v_invite.expires_at < now() or v_invite.declined_at is not null then
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

create or replace function public.list_my_pending_invites()
returns table (
  id uuid,
  token text,
  team_id uuid,
  team_name text,
  role public.team_role,
  inviter_name text,
  created_at timestamptz,
  expires_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select i.id, i.token, i.team_id, t.name, i.role,
    coalesce(p.display_name, 'A teammate'), i.created_at, i.expires_at
  from public.team_invites i
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.created_by
  where auth.uid() is not null
    and i.email is not null
    and i.accepted_at is null
    and i.declined_at is null
    and i.expires_at > now()
    and lower(i.email) = lower(coalesce((select email from auth.users where id = auth.uid()), ''))
  order by i.created_at desc
$$;

create or replace function public.decline_invite(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.team_invites;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_invite from public.team_invites where token = p_token for update;
  if not found or v_invite.email is null or v_invite.expires_at < now() or v_invite.accepted_at is not null then
    raise exception 'invite is invalid or expired';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  if lower(coalesce(v_email, '')) <> lower(v_invite.email) then
    raise exception 'this invite was sent to a different email address';
  end if;
  update public.team_invites set declined_at = coalesce(declined_at, now()) where id = v_invite.id;
end
$$;

-- Creates the caller's profile if the signup trigger has not finished yet.
create or replace function public.ensure_profile()
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_user auth.users;
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if found then
    return v_profile;
  end if;
  select * into v_user from auth.users where id = auth.uid();
  if not found then
    raise exception 'not authenticated';
  end if;
  insert into public.profiles (id, display_name, email, avatar_color)
  values (
    v_user.id,
    left(coalesce(
      v_user.raw_user_meta_data ->> 'full_name',
      v_user.raw_user_meta_data ->> 'name',
      split_part(v_user.email, '@', 1),
      'Player'
    ), 60),
    v_user.email,
    (array['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#f97316', '#0891b2', '#db2777'])[1 + floor(random() * 7)::int]
  )
  on conflict (id) do nothing;
  select * into v_profile from public.profiles where id = auth.uid();
  return v_profile;
end
$$;

revoke all on function public.list_my_pending_invites() from public, anon;
revoke all on function public.decline_invite(text) from public, anon;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.list_my_pending_invites() to authenticated;
grant execute on function public.decline_invite(text) to authenticated;
grant execute on function public.ensure_profile() to authenticated;
