alter table patient_link add column if not exists display_name text;
alter table patient_link add column if not exists gender text;
alter table patient_link add column if not exists birth_date date;
alter table patient_link add column if not exists source_snapshot jsonb not null default '{}'::jsonb;
alter table patient_link add column if not exists last_synced_at timestamptz;

alter table caregiver_link add column if not exists display_name text;
alter table caregiver_link add column if not exists consent_recorded_by text;
alter table caregiver_link add column if not exists consent_source text;
alter table caregiver_link add column if not exists revoked_at timestamptz;

create table if not exists care_step (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant(id),
  care_plan_version_id uuid not null references care_plan_version(id),
  patient_ref text not null,
  sequence integer not null,
  code text,
  title text not null,
  owner_role text not null,
  due_rule text not null,
  due_start timestamptz,
  due_end timestamptz,
  evidence_required text not null,
  family_wording text not null,
  status text not null default 'planned' check (status in (
    'planned','awaiting_booking','booked','evidence_due','evidence_received',
    'verified','reviewed','completed','exception','cancelled'
  )),
  source_reference jsonb not null default '{}'::jsonb,
  evidence_reference jsonb not null default '{}'::jsonb,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,care_plan_version_id,sequence)
);
create index if not exists care_step_patient_sequence on care_step(tenant_id,patient_ref,sequence);

create table if not exists document_step_link (
  tenant_id uuid not null references tenant(id),
  document_id uuid not null references document(id),
  care_step_id uuid not null references care_step(id),
  linked_by text not null,
  linked_at timestamptz not null default now(),
  primary key (tenant_id,document_id,care_step_id)
);

do $$
declare table_name text;
begin
  foreach table_name in array array['care_step','document_step_link']
  loop
    execute format('alter table %I enable row level security', table_name);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=table_name and policyname='tenant_isolation') then
      execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', table_name);
    end if;
  end loop;
end $$;
