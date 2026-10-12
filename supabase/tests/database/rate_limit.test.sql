begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(6);

select is((select allowed from check_rate_limit('t:1', 2, 60)), true, 'first request is allowed');
select is((select allowed from check_rate_limit('t:1', 2, 60)), true, 'second request is allowed');
select is((select allowed from check_rate_limit('t:1', 2, 60)), false, 'third request in the window is blocked');
select ok((select retry_after from check_rate_limit('t:1', 2, 60)) between 1 and 60, 'retry_after counts down the window');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok($$select * from check_rate_limit('t:2', 1, 60)$$, '42501', null, 'signed-in users cannot call the limiter');
select is((select count(*)::int from rate_limits), 0, 'signed-in users cannot read limiter state');

select * from finish();
rollback;
