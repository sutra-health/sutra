create extension if not exists pgcrypto;

create table if not exists tenant (
  id uuid primary key,
  slug text not null unique,
  display_name text not null,
  status text not null default 'onboarding' check (status in ('onboarding','shadow','live','suspended')),
  created_at timestamptz not null default now()
);

create table if not exists tenant_identity_binding (
  provider text not null,
  provider_org_id text not null,
  tenant_id uuid not null references tenant(id),
  created_at timestamptz not null default now(),
  primary key (provider,provider_org_id),
  unique (provider,tenant_id)
);

create table if not exists hospital_unit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  code text not null,
  display_name text not null,
  unique (tenant_id, code)
);

create table if not exists app_user (
  id text primary key,
  display_name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists membership (
  tenant_id uuid not null references tenant(id),
  user_id text not null references app_user(id),
  unit_id uuid references hospital_unit(id),
  role text not null check (role in ('doctor','nurse','coordinator','records_clerk','admin','analyst','auditor','clinical_lead')),
  active boolean not null default true,
  primary key (tenant_id,user_id,role)
);

create table if not exists onboarding_state (
  tenant_id uuid primary key references tenant(id),
  current_stage text not null default 'organisation',
  stages jsonb not null default '{"organisation":"pending","identity":"pending","clinical_source":"pending","scheduler":"pending","whatsapp":"pending","documents":"pending","speech":"pending","abdm":"optional","pathway":"pending","shadow_mode":"pending","go_live":"blocked"}'::jsonb,
  go_live_allowed boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists integration (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  kind text not null,
  adapter_id text not null,
  endpoint text,
  capabilities jsonb not null default '[]',
  status text not null default 'unverified',
  last_probe_at timestamptz,
  last_probe jsonb,
  secret_reference text,
  unique (tenant_id,kind)
);

create table if not exists patient_link (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  source_system text not null,
  source_patient_id text not null,
  hospital_identifier text,
  masked_abha text,
  abha_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id,source_system,source_patient_id)
);

create table if not exists caregiver_link (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  patient_link_id uuid not null references patient_link(id),
  phone_hash text not null,
  relationship text not null,
  preferred_language text not null default 'hi',
  consent_status text not null check (consent_status in ('pending','granted','revoked')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id,patient_link_id,phone_hash)
);

create table if not exists care_case (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  unit_id uuid references hospital_unit(id),
  patient_link_id uuid not null references patient_link(id),
  title text not null,
  status text not null default 'active',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists care_plan_version (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  patient_ref text not null,
  version integer not null,
  title text not null,
  content jsonb not null,
  signed_by text not null,
  signed_at timestamptz not null default now(),
  supersedes uuid references care_plan_version(id),
  unique (tenant_id,patient_ref,version)
);

create table if not exists prescription_version (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  patient_ref text not null,
  version integer not null,
  content jsonb not null,
  signed_by text not null,
  signed_at timestamptz not null default now(),
  ehr_write_status text not null default 'not_requested',
  ehr_reference jsonb,
  unique (tenant_id,patient_ref,version)
);

create table if not exists document (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  patient_ref text,
  object_key text not null,
  sha256 text not null,
  media_type text not null,
  document_type text not null default 'unknown',
  source_channel text not null,
  verification_status text not null default 'pending',
  uploaded_by text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id,sha256)
);

create table if not exists extraction_version (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  document_id uuid not null references document(id),
  engine text not null,
  engine_version text not null,
  source_sha256 text not null,
  fields jsonb not null,
  status text not null default 'draft',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists work_item (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  patient_ref text,
  kind text not null,
  owner_role text not null,
  owner_id text,
  status text not null default 'open',
  due_at timestamptz,
  source_reference jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists event_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  patient_ref text,
  event_type text not null,
  actor_ref text not null,
  source_system text not null,
  correlation_id text not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now()
);
create index if not exists event_log_patient_time on event_log(tenant_id,patient_ref,occurred_at desc);

create table if not exists webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  source text not null,
  external_event_id text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (tenant_id,source,external_event_id)
);

create table if not exists outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  topic text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempt integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

do $$
declare table_name text;
begin
  foreach table_name in array array['tenant_identity_binding','hospital_unit','membership','onboarding_state','integration','patient_link','caregiver_link','care_case','care_plan_version','prescription_version','document','extraction_version','work_item','event_log','webhook_inbox','outbox']
  loop
    execute format('alter table %I enable row level security', table_name);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=table_name and policyname='tenant_isolation') then
      execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
    end if;
  end loop;
end $$;
