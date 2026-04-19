-- 2023 양평동교회 장로 1차 선거 기준 스키마
-- Excel 핵심 로직 이식:
-- 1) 득표율 = 후보득표수 / 총투표자수
-- 2) 당선기준 = 득표율 >= 0.666
-- 3) 순위 = RANK() (동점 공동순위, 다음 순위 건너뜀)
-- 4) 무효표는 팀별 입력값을 합산 (Excel 조별합계표 62행과 동일)

create extension if not exists pgcrypto;

create table if not exists elections (
  id bigserial primary key,
  name text not null,
  seats int not null default 0,
  pass_threshold numeric(6,3) not null default 0.666,
  max_choices_per_ballot int not null default 3,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id bigserial primary key,
  election_id bigint not null references elections(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order int not null,
  unique (election_id, code)
);

create table if not exists team_credentials (
  team_id bigint primary key references teams(id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists candidates (
  id bigserial primary key,
  election_id bigint not null references elections(id) on delete cascade,
  ballot_no int not null,
  name text not null,
  is_active boolean not null default true,
  unique (election_id, ballot_no),
  unique (election_id, name)
);

create table if not exists team_results (
  election_id bigint not null references elections(id) on delete cascade,
  team_id bigint not null references teams(id) on delete cascade,
  valid_ballots int not null default 0 check (valid_ballots >= 0),
  invalid_ballots int not null default 0 check (invalid_ballots >= 0),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (election_id, team_id)
);

create table if not exists team_candidate_votes (
  election_id bigint not null references elections(id) on delete cascade,
  team_id bigint not null references teams(id) on delete cascade,
  candidate_id bigint not null references candidates(id) on delete cascade,
  votes int not null default 0 check (votes >= 0),
  updated_at timestamptz not null default now(),
  primary key (election_id, team_id, candidate_id)
);

create or replace view election_summary as
select
  e.id as election_id,
  coalesce(sum(tr.valid_ballots), 0) as total_valid_ballots,
  coalesce(sum(tr.invalid_ballots), 0) as total_invalid_ballots,
  coalesce(sum(tr.valid_ballots + tr.invalid_ballots), 0) as total_voters
from elections e
left join team_results tr on tr.election_id = e.id
group by e.id;

create or replace view election_candidate_totals as
with totals as (
  select
    c.election_id,
    c.id as candidate_id,
    c.ballot_no,
    c.name,
    coalesce(sum(tcv.votes), 0) as votes
  from candidates c
  left join team_candidate_votes tcv
    on tcv.candidate_id = c.id
    and tcv.election_id = c.election_id
  where c.is_active = true
  group by c.election_id, c.id, c.ballot_no, c.name
),
scored as (
  select
    t.*,
    s.total_voters,
    case
      when s.total_voters > 0 then t.votes::numeric / s.total_voters::numeric
      else 0::numeric
    end as vote_rate,
    e.pass_threshold
  from totals t
  join election_summary s on s.election_id = t.election_id
  join elections e on e.id = t.election_id
)
select
  election_id,
  candidate_id,
  ballot_no,
  name,
  votes,
  total_voters,
  vote_rate,
  rank() over (partition by election_id order by vote_rate desc) as vote_rank,
  case when vote_rate >= pass_threshold then true else false end as is_elected
from scored;

create or replace function verify_team_password(p_election_id bigint, p_team_code text, p_password text)
returns table(team_id bigint, team_name text)
language sql
security definer
set search_path = public
as $$
  select t.id, t.name
  from teams t
  join team_credentials tc on tc.team_id = t.id
  where t.election_id = p_election_id
    and t.code = upper(trim(p_team_code))
    and tc.password_hash = crypt(p_password, tc.password_hash)
  limit 1;
$$;

create or replace function upsert_team_result(
  p_election_id bigint,
  p_team_code text,
  p_valid_ballots int,
  p_invalid_ballots int,
  p_votes jsonb,
  p_updated_by text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id bigint;
  v_item jsonb;
  v_candidate_id bigint;
  v_votes int;
begin
  select id
  into v_team_id
  from teams
  where election_id = p_election_id
    and code = upper(trim(p_team_code));

  if v_team_id is null then
    raise exception 'Unknown team code: %', p_team_code;
  end if;

  insert into team_results (election_id, team_id, valid_ballots, invalid_ballots, updated_at, updated_by)
  values (p_election_id, v_team_id, greatest(p_valid_ballots, 0), greatest(p_invalid_ballots, 0), now(), p_updated_by)
  on conflict (election_id, team_id)
  do update set
    valid_ballots = excluded.valid_ballots,
    invalid_ballots = excluded.invalid_ballots,
    updated_at = now(),
    updated_by = excluded.updated_by;

  for v_item in select * from jsonb_array_elements(p_votes)
  loop
    v_candidate_id := (v_item ->> 'candidate_id')::bigint;
    v_votes := greatest(coalesce((v_item ->> 'votes')::int, 0), 0);

    insert into team_candidate_votes (election_id, team_id, candidate_id, votes, updated_at)
    values (p_election_id, v_team_id, v_candidate_id, v_votes, now())
    on conflict (election_id, team_id, candidate_id)
    do update set votes = excluded.votes, updated_at = now();
  end loop;
end;
$$;

alter table elections enable row level security;
alter table teams enable row level security;
alter table candidates enable row level security;
alter table team_results enable row level security;
alter table team_candidate_votes enable row level security;

create policy if not exists "Public can read elections"
on elections for select using (true);

create policy if not exists "Public can read teams"
on teams for select using (true);

create policy if not exists "Public can read candidates"
on candidates for select using (true);

create policy if not exists "Public can read team_results"
on team_results for select using (true);

create policy if not exists "Public can read team_candidate_votes"
on team_candidate_votes for select using (true);

-- 시드 데이터 (초기 1회)
insert into elections (id, name, seats, pass_threshold, max_choices_per_ballot)
values (1, '2023 양평동교회 장로 1차 선거', 0, 0.666, 3)
on conflict (id) do nothing;

insert into teams (election_id, code, name, sort_order)
values
  (1, 'A', 'A조', 1),
  (1, 'B', 'B조', 2),
  (1, 'C', 'C조', 3)
on conflict (election_id, code) do nothing;

-- 비밀번호는 운영 시 반드시 변경
insert into team_credentials (team_id, password_hash)
select t.id, crypt('change-me-' || t.code, gen_salt('bf'))
from teams t
where t.election_id = 1
on conflict (team_id) do nothing;

insert into candidates (election_id, ballot_no, name)
values
  (1, 1, '문동학'),
  (1, 2, '이주이'),
  (1, 3, '이종수'),
  (1, 4, '조근배'),
  (1, 5, '심효섭'),
  (1, 6, '이강우'),
  (1, 7, '반재수'),
  (1, 8, '장태익'),
  (1, 9, '정용석'),
  (1, 10, '유양준'),
  (1, 11, '황영수'),
  (1, 12, '원종철'),
  (1, 13, '진인식'),
  (1, 14, '김희정'),
  (1, 15, '김관형'),
  (1, 16, '김남영'),
  (1, 17, '조규현'),
  (1, 18, '최영철'),
  (1, 19, '최인석'),
  (1, 20, '백운재'),
  (1, 21, '최광호'),
  (1, 22, '윤진'),
  (1, 23, '이준호'),
  (1, 24, '김태성'),
  (1, 25, '이규현'),
  (1, 26, '이현준'),
  (1, 27, '김홍균'),
  (1, 28, '강지원'),
  (1, 29, '손성길'),
  (1, 30, '김홍철'),
  (1, 31, '권오성'),
  (1, 32, '남홍주'),
  (1, 33, '문용오'),
  (1, 34, '이한수'),
  (1, 35, '김정운'),
  (1, 36, '김성옥'),
  (1, 37, '정재호'),
  (1, 38, '배지훈'),
  (1, 39, '정보람'),
  (1, 40, '송학수'),
  (1, 41, '강동일'),
  (1, 42, '손유재'),
  (1, 43, '박재환'),
  (1, 44, '강명구'),
  (1, 45, '김한경'),
  (1, 46, '백선일'),
  (1, 47, '안방선')
on conflict (election_id, ballot_no) do nothing;
