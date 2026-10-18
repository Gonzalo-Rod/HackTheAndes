-- Route proposal snapshots are encrypted; no continuous phone-location tracking.
create table private.route_intake (
 phone_key text primary key check(phone_key ~ '^[a-f0-9]{64}$'),
 ciphertext bytea not null, iv bytea not null check(octet_length(iv)=12),
 auth_tag bytea not null check(octet_length(auth_tag)=16), key_version text not null,
 expires_at timestamptz not null
);
alter table private.route_intake enable row level security;
revoke all on private.route_intake from public,anon,authenticated;
grant select,insert,update,delete on private.route_intake to peruroad_backend;
create policy backend_access on private.route_intake to peruroad_backend using(true) with check(true);
