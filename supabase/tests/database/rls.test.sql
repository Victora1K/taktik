-- Row-level security tests. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(43);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres): one team with an owner, coach, member and viewer, plus an outsider.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.dev', '{"full_name":"Olivia Owner"}'),
  ('22222222-2222-2222-2222-222222222222', 'coach@test.dev', '{"full_name":"Carl Coach"}'),
  ('33333333-3333-3333-3333-333333333333', 'member@test.dev', '{"full_name":"Mia Member"}'),
  ('44444444-4444-4444-4444-444444444444', 'viewer@test.dev', '{"full_name":"Vic Viewer"}'),
  ('55555555-5555-5555-5555-555555555555', 'outsider@test.dev', '{}');

select is((select display_name from profiles where id = '11111111-1111-1111-1111-111111111111'), 'Olivia Owner',
  'signup trigger creates a profile from metadata');
select is((select display_name from profiles where id = '55555555-5555-5555-5555-555555555555'), 'outsider',
  'profile name falls back to the email local part');

insert into teams (id, name, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test FC', '11111111-1111-1111-1111-111111111111');
insert into team_members (team_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'coach'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'member'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'viewer');
insert into tactics (id, team_id, sport, title, share_slug) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'soccer', 'High press', 'press-slug');
insert into team_invites (team_id, token, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'link-token', 'member');
insert into team_invites (team_id, token, role, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'email-token', 'coach', 'someone-else@test.dev');

-- ---------------------------------------------------------------------------
-- Outsider: sees nothing.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is((select count(*)::int from teams), 0, 'outsider cannot read teams');
select is((select count(*)::int from tactics), 0, 'outsider cannot read tactics');
select is((select count(*)::int from team_members), 0, 'outsider cannot read memberships');
select is((select count(*)::int from profiles), 1, 'outsider can only read their own profile');
select throws_ok(
  $$insert into tactics (team_id, sport) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'soccer')$$,
  '42501', null, 'outsider cannot create tactics in a foreign team');
select throws_ok(
  $$insert into comments (tactic_id, body) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'sneaky')$$,
  '42501', null, 'outsider cannot comment');
select throws_ok(
  $$insert into team_members (team_id, user_id, role)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'owner')$$,
  '42501', null, 'outsider cannot add themselves to a team');
select is(realtime_tactic_access('tactic:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false), false,
  'outsider cannot join the realtime channel');
select is(realtime_tactic_access('tactic:not-a-uuid', false), false, 'malformed topics are rejected');

select throws_ok($$select accept_invite('email-token')$$, 'P0001',
  'this invite was sent to a different email address', 'email invites are bound to the recipient');
select is(accept_invite('link-token'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'link invites can be accepted');
select is((select count(*)::int from tactics), 1, 'accepted invitee can read team tactics');
select is((select role::text from team_members where user_id = auth.uid()), 'member', 'invite grants its role');

select isnt((select id from create_team('Outsider United')), null, 'create_team returns the new team');
select is(
  (select role::text from team_members where user_id = auth.uid() and team_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'owner', 'create_team makes the caller owner');

-- ---------------------------------------------------------------------------
-- Viewer: read-only.
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is((select count(*)::int from tactics), 1, 'viewer can read tactics');
select throws_ok(
  $$insert into tactics (team_id, sport) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'soccer')$$,
  '42501', null, 'viewer cannot create tactics');
update tactics set title = 'Hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select is(realtime_tactic_access('tactic:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false), true,
  'viewer can listen on the realtime channel');
select is(realtime_tactic_access('tactic:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true), false,
  'viewer cannot write document updates');
select lives_ok(
  $$insert into comments (tactic_id, body) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Looks good')$$,
  'viewer can still comment');
select lives_ok(
  $$insert into team_messages (team_id, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'See you at training')$$,
  'viewer can send a team message');

-- ---------------------------------------------------------------------------
-- Member: edits tactics, cannot administer.
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is((select body from team_messages), 'See you at training', 'member can read the team chat');
delete from team_messages where body = 'See you at training';
select is((select count(*)::int from team_messages), 1, 'member cannot delete someone else''s message');
select is((select title from tactics where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 'High press',
  'viewer update was silently ignored');
select lives_ok(
  $$update tactics set title = 'Mid block' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'member can update tactics');
select is(realtime_tactic_access('tactic:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true), true,
  'member can write document updates');
select lives_ok(
  $$insert into tactic_versions (tactic_id, name, state) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'v1', '{}')$$,
  'member can save versions');
select lives_ok(
  $$insert into comments (tactic_id, body, mentions)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '@Olivia check this', array['11111111-1111-1111-1111-111111111111'::uuid])$$,
  'member can comment with mentions');
select is((select count(*)::int from team_invites), 0, 'member cannot read invites');
select throws_ok(
  $$insert into team_invites (team_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'member')$$,
  '42501', null, 'member cannot create invites');
update team_members set role = 'owner'
  where team_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and user_id = auth.uid();
select is((select role::text from team_members where team_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and user_id = auth.uid()),
  'member', 'member cannot promote themselves');

-- ---------------------------------------------------------------------------
-- Coach: administers below owner.
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$insert into team_invites (team_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'viewer')$$,
  'coach can create invites');
select throws_ok(
  $$insert into team_invites (team_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'owner')$$,
  '42501', null, 'nobody can invite an owner');
delete from team_members
  where team_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and user_id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- Owner: notifications are private.
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from team_members where user_id = auth.uid()), 1, 'coach cannot remove the owner');
select is((select count(*)::int from notifications where kind = 'mention'), 1, 'mentions notify the mentioned user');

set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select count(*)::int from notifications), 0, 'users cannot read other users'' notifications');

-- ---------------------------------------------------------------------------
-- Public links.
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select is((select count(*)::int from get_public_tactic('press-slug')), 0, 'team-only tactics are not public');
reset role;
update tactics set visibility = 'link' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
set local role anon;
select is((select title from get_public_tactic('press-slug')), 'Mid block', 'link tactics are readable anonymously');

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'newbie@test.dev', '{"full_name":"Ned New"}');
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
select is((select count(*)::int from team_messages), 0, 'a non-member cannot read the team chat');
select throws_ok(
  $$insert into team_messages (team_id, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'let me in')$$,
  '42501', null, 'a non-member cannot send a team message');
reset role;
insert into team_members (team_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'member');
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
select is((select body from team_messages), 'See you at training', 'a new member can read chat from before they joined');

select * from finish();
rollback;
