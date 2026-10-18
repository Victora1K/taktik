-- Pending invitation visibility, decline, acceptance, and profile repair.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaa1111-1111-1111-1111-111111111111', 'coach@invite.test', '{"full_name":"Casey Coach"}'),
  ('bbbb2222-2222-2222-2222-222222222222', 'guest@invite.test', '{"full_name":"Gina Guest"}'),
  ('cccc3333-3333-3333-3333-333333333333', 'stranger@invite.test', '{"full_name":"Sam Stranger"}');

insert into teams (id, name, created_by) values
  ('dddd4444-4444-4444-4444-444444444444', 'Invite FC', 'aaaa1111-1111-1111-1111-111111111111');
insert into team_members (team_id, user_id, role) values
  ('dddd4444-4444-4444-4444-444444444444', 'aaaa1111-1111-1111-1111-111111111111', 'owner');
insert into team_invites (team_id, token, role, email, created_by) values
  ('dddd4444-4444-4444-4444-444444444444', 'guest-live', 'member', 'guest@invite.test', 'aaaa1111-1111-1111-1111-111111111111'),
  ('dddd4444-4444-4444-4444-444444444444', 'guest-expired', 'viewer', 'guest@invite.test', 'aaaa1111-1111-1111-1111-111111111111'),
  ('dddd4444-4444-4444-4444-444444444444', 'stranger-live', 'coach', 'stranger@invite.test', 'aaaa1111-1111-1111-1111-111111111111'),
  ('dddd4444-4444-4444-4444-444444444444', 'guest-accept', 'member', 'guest@invite.test', 'aaaa1111-1111-1111-1111-111111111111');
update team_invites set expires_at = now() - interval '1 day' where token = 'guest-expired';

set local role authenticated;
set local request.jwt.claims to '{"sub":"bbbb2222-2222-2222-2222-222222222222","role":"authenticated"}';

select is((select count(*)::int from list_my_pending_invites()), 2, 'invitee sees only their own live invitations');
select is((select team_name from list_my_pending_invites() where token = 'guest-live'), 'Invite FC',
  'invitation includes the team name');
select is((select role::text from list_my_pending_invites() where token = 'guest-live'), 'member',
  'invitation includes the offered role');
select is((select inviter_name from list_my_pending_invites() where token = 'guest-live'), 'Casey Coach',
  'invitation includes the inviter');
select is((select count(*)::int from team_invites), 0, 'invitee cannot read the invite table directly');

select lives_ok($$select decline_invite('guest-live')$$, 'invitee can decline their invitation');
select is((select count(*)::int from list_my_pending_invites()), 1, 'a declined invitation leaves the bell');

reset role;
select is((select declined_at is not null from team_invites where token = 'guest-live'), true,
  'declining keeps the invitation for the admin audit trail');

set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc3333-3333-3333-3333-333333333333","role":"authenticated"}';
select throws_ok(
  $$select accept_invite('guest-accept')$$,
  'P0001', 'this invite was sent to a different email address',
  'another account cannot accept the invitation');

set local request.jwt.claims to '{"sub":"bbbb2222-2222-2222-2222-222222222222","role":"authenticated"}';
select is(accept_invite('guest-accept'), 'dddd4444-4444-4444-4444-444444444444'::uuid,
  'the invited account can accept from the notification');

reset role;
delete from profiles where id = 'cccc3333-3333-3333-3333-333333333333';
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc3333-3333-3333-3333-333333333333","role":"authenticated"}';
select is((select id from ensure_profile()), 'cccc3333-3333-3333-3333-333333333333'::uuid,
  'ensure_profile repairs a missing first-login profile');

select * from finish();
rollback;
