-- One chat room per team. Membership is the only gate, so anyone who joins later can read the history.

create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index team_messages_team_idx on public.team_messages (team_id, created_at);

alter table public.team_messages replica identity full;
alter table public.team_messages enable row level security;

create policy "messages: members read history" on public.team_messages for select to authenticated
  using (public.is_team_member(team_id));
create policy "messages: members send" on public.team_messages for insert to authenticated
  with check (author_id = auth.uid() and public.is_team_member(team_id));
create policy "messages: author or admins delete" on public.team_messages for delete to authenticated
  using (author_id = auth.uid() or public.is_team_admin(team_id));

grant select, insert, delete on public.team_messages to authenticated;

alter publication supabase_realtime add table public.team_messages;
