-- topdogugc Planner: Library + Planner schema (spec §6), RLS (spec §3) and seed data.
-- Reserved for later projects, keep these names free: clips, recipes, jobs, submissions, template_stats.

-- ---------------------------------------------------------------------------
-- Private helpers (schema is not exposed through the Data API)
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  role text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  default_submission_rate numeric not null default 0.15 check (default_submission_rate between 0 and 1),
  minutes_per_hook numeric not null default 4.5 check (minutes_per_hook >= 0),
  minutes_per_cta_sync numeric not null default 3 check (minutes_per_cta_sync >= 0),
  minutes_per_vo numeric not null default 9 check (minutes_per_vo >= 0),
  minutes_per_cta_vo numeric not null default 3 check (minutes_per_cta_vo >= 0),
  productive_hours_per_day numeric not null default 6 check (productive_hours_per_day > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  dogs text[] not null default '{}',
  dog_phrase text not null default '',
  folder_slug text not null check (folder_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.angles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Brands
-- ---------------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'prospect' check (status in ('prospect', 'auditioning', 'active', 'paused')),
  trybe_url text,
  pay_model text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.brand_channels (
  brand_id uuid not null references public.brands (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete restrict,
  primary key (brand_id, channel_id)
);
create index brand_channels_channel_id_idx on public.brand_channels (channel_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete restrict,
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  slot_values jsonb not null default '{}' check (jsonb_typeof(slot_values) = 'object'),
  claims_allowed text,
  claims_forbidden text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (brand_id, slug)
);

-- ---------------------------------------------------------------------------
-- Library
-- ---------------------------------------------------------------------------
create table public.formats (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  cta_modes text[] not null default '{sync,vo}' check (cta_modes <@ array['sync', 'vo']),
  beats text[] not null default '{problem,product,result}' check (cardinality(beats) > 0),
  target_seconds int,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table public.body_templates (
  id uuid primary key default gen_random_uuid(),
  format_id uuid not null references public.formats (id) on delete restrict,
  title text not null,
  angle_id uuid references public.angles (id) on delete restrict,
  -- [{ "beat": "problem", "script": "..." }, ...] in the format's beat order
  beats jsonb not null default '[]' check (jsonb_typeof(beats) = 'array'),
  est_seconds int,
  tags text[] not null default '{}',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index body_templates_format_id_idx on public.body_templates (format_id);
create index body_templates_angle_id_idx on public.body_templates (angle_id);

create table public.hook_templates (
  id uuid primary key default gen_random_uuid(),
  script text not null,
  angle_id uuid references public.angles (id) on delete restrict,
  is_universal boolean not null default false,
  est_seconds int,
  tags text[] not null default '{}',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  -- Universal hooks may only use {{dog}} (spec §5). Mirrors validateUniversalHook() in shared/utils/slots.ts.
  constraint hook_templates_universal_slots check (
    not is_universal or script !~* '\{\{\s*(?!dog\s*\}\})[a-z0-9_]+\s*\}\}'
  )
);
create index hook_templates_angle_id_idx on public.hook_templates (angle_id);

create table public.cta_templates (
  id uuid primary key default gen_random_uuid(),
  script text not null,
  mode text not null check (mode in ('sync', 'vo')),
  est_seconds int,
  tags text[] not null default '{}',
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

-- ---------------------------------------------------------------------------
-- Planner
-- ---------------------------------------------------------------------------
create sequence public.shoot_code_seq;

-- S001, S002, ... (keeps counting past S999)
create function private.next_shoot_code() returns text
language sql volatile set search_path = '' as $$
  select 'S' || lpad(n::text, greatest(3, length(n::text)), '0')
  from (select nextval('public.shoot_code_seq') as n) s;
$$;

create table public.shoots (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_shoot_code(),
  product_id uuid not null references public.products (id) on delete restrict,
  shoot_date date,
  location_notes text,
  -- draft -> planned -> filmed are set by this app; later stages are reserved for the worker
  status text not null default 'draft' check (status in ('draft', 'planned', 'filmed', 'edited', 'ingested', 'rendering', 'done')),
  hook_allocation text not null default 'split' check (hook_allocation in ('split', 'shared')),
  broll_variations int not null default 3 check (broll_variations >= 1),
  submission_rate numeric not null default 0.15 check (submission_rate between 0 and 1),
  kit text not null default 'custom' check (kit in ('audition', 'scale', 'custom')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index shoots_product_id_idx on public.shoots (product_id);

create table public.shoot_people (
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete restrict,
  primary key (shoot_id, person_id)
);
create index shoot_people_person_id_idx on public.shoot_people (person_id);

create table public.shoot_channels (
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete restrict,
  primary key (shoot_id, channel_id)
);
create index shoot_channels_channel_id_idx on public.shoot_channels (channel_id);

create table public.shoot_items (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  person_id uuid not null,
  kind text not null check (kind in ('hook', 'body', 'cta')),
  hook_template_id uuid references public.hook_templates (id) on delete restrict,
  body_template_id uuid references public.body_templates (id) on delete restrict,
  cta_template_id uuid references public.cta_templates (id) on delete restrict,
  code text not null,
  -- set for hooks in split mode; null = all channels (shared mode, bodies, CTAs)
  channel_id uuid references public.channels (id) on delete restrict,
  -- JSON string for hooks/CTAs, JSON array of { beat, script } for bodies.
  -- Holds the template text while the shoot is a draft, and the slot-filled text once planned.
  script_snapshot jsonb not null,
  script_override jsonb,
  cta_mode text check (cta_mode in ('sync', 'vo')),
  location text,
  status text not null default 'planned' check (status in ('planned', 'filmed', 'skipped')),
  take_notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  -- removing a person from a draft shoot removes their items
  foreign key (shoot_id, person_id) references public.shoot_people (shoot_id, person_id) on delete cascade,
  -- deferrable so renumber_shoot_items() can swap codes in one statement
  constraint shoot_items_code_key unique (shoot_id, code) deferrable initially immediate,
  constraint shoot_items_one_template check (
    (kind = 'hook' and hook_template_id is not null and body_template_id is null and cta_template_id is null)
    or (kind = 'body' and body_template_id is not null and hook_template_id is null and cta_template_id is null)
    or (kind = 'cta' and cta_template_id is not null and hook_template_id is null and body_template_id is null)
  ),
  constraint shoot_items_cta_mode check ((kind = 'cta') = (cta_mode is not null)),
  constraint shoot_items_channel_hooks_only check (channel_id is null or kind = 'hook'),
  constraint shoot_items_snapshot_type check (
    jsonb_typeof(script_snapshot) = case when kind = 'body' then 'array' else 'string' end
  ),
  constraint shoot_items_override_type check (
    script_override is null
    or jsonb_typeof(script_override) = case when kind = 'body' then 'array' else 'string' end
  )
);
create index shoot_items_person_idx on public.shoot_items (shoot_id, person_id);
create index shoot_items_hook_template_id_idx on public.shoot_items (hook_template_id) where hook_template_id is not null;
create index shoot_items_body_template_id_idx on public.shoot_items (body_template_id) where body_template_id is not null;
create index shoot_items_cta_template_id_idx on public.shoot_items (cta_template_id) where cta_template_id is not null;
create index shoot_items_channel_id_idx on public.shoot_items (channel_id) where channel_id is not null;

create table public.broll_shots (
  id uuid primary key default gen_random_uuid(),
  shoot_id uuid not null references public.shoots (id) on delete cascade,
  -- null = product-only shots shared by all channels
  channel_id uuid references public.channels (id) on delete restrict,
  beat text not null,
  description text not null default '',
  product_visible boolean not null default false,
  min_clips int not null default 1 check (min_clips >= 0),
  status text not null default 'planned' check (status in ('planned', 'filmed', 'skipped')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index broll_shots_shoot_id_idx on public.broll_shots (shoot_id);
create index broll_shots_channel_id_idx on public.broll_shots (channel_id) where channel_id is not null;

-- "Used in N shoots" per library template
create view public.template_usage with (security_invoker = true) as
select
  kind,
  coalesce(hook_template_id, body_template_id, cta_template_id) as template_id,
  count(distinct shoot_id)::int as shoot_count
from public.shoot_items
group by 1, 2;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'allowed_users', 'settings', 'people', 'channels', 'angles', 'brands', 'products', 'formats',
    'body_templates', 'hook_templates', 'cta_templates', 'shoots', 'shoot_items', 'broll_shots'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t
    );
  end loop;
end $$;

-- Codes (and what they identify) are frozen once a shoot leaves draft.
create function private.guard_shoot_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.code, new.kind, new.person_id, new.shoot_id) is distinct from (old.code, old.kind, old.person_id, old.shoot_id)
    or new.hook_template_id is distinct from old.hook_template_id
    or new.body_template_id is distinct from old.body_template_id
    or new.cta_template_id is distinct from old.cta_template_id
  then
    if (select s.status from public.shoots s where s.id = old.shoot_id) <> 'draft' then
      raise exception 'Shoot is no longer a draft: item codes are frozen';
    end if;
  end if;
  return new;
end $$;

create trigger guard_shoot_item before update on public.shoot_items
for each row execute function private.guard_shoot_item();

-- Re-number every item in a draft shoot: H/V/C/U, sequential within the shoot.
create function public.renumber_shoot_items(p_shoot_id uuid) returns void
language sql security invoker set search_path = '' as $$
  with prefixed as (
    select i.id, p.name as person_name, i.sort_order, i.created_at,
      case
        when i.kind = 'hook' and h.is_universal then 'U'
        when i.kind = 'hook' then 'H'
        when i.kind = 'body' then 'V'
        else 'C'
      end as prefix
    from public.shoot_items i
    join public.people p on p.id = i.person_id
    left join public.hook_templates h on h.id = i.hook_template_id
    where i.shoot_id = p_shoot_id
  ),
  ranked as (
    select id, prefix,
      row_number() over (partition by prefix order by person_name, sort_order, created_at, id) as n
    from prefixed
  )
  update public.shoot_items i
  set code = r.prefix || lpad(r.n::text, greatest(2, length(r.n::text)), '0')
  from ranked r
  where r.id = i.id and i.code is distinct from r.prefix || lpad(r.n::text, greatest(2, length(r.n::text)), '0');
$$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------
-- The allowlist is keyed on the Google-verified email in the JWT. app_metadata is
-- server-controlled, so requiring the google provider stops an email/password
-- sign-up from claiming an allowlisted address.
create function private.is_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_users u
    where u.email = lower(auth.jwt() ->> 'email')
      and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
  );
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_users u
    where u.email = lower(auth.jwt() ->> 'email')
      and u.role = 'admin'
      and coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
  );
$$;

create function private.shoot_is_draft(p_shoot_id uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.shoots s where s.id = p_shoot_id and s.status = 'draft');
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;
revoke all on function public.renumber_shoot_items(uuid) from public, anon;
grant execute on function public.renumber_shoot_items(uuid) to authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on sequence public.shoot_code_seq to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
revoke insert, update on public.template_usage from authenticated;
-- No hard deletes on library, brand or shoot records (archive instead). Only the
-- allowlist, join rows and draft-shoot contents can be removed.
grant delete on
  public.allowed_users, public.brand_channels, public.shoot_people, public.shoot_channels,
  public.shoot_items, public.broll_shots
to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'allowed_users', 'settings', 'people', 'channels', 'angles', 'brands', 'brand_channels', 'products',
    'formats', 'body_templates', 'hook_templates', 'cta_templates', 'shoots', 'shoot_people',
    'shoot_channels', 'shoot_items', 'broll_shots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "allowlisted users can read" on public.%I for select to authenticated using ((select private.is_allowed()))', t
    );
  end loop;

  -- admin-managed tables
  foreach t in array array['allowed_users', 'settings', 'people', 'channels'] loop
    execute format(
      'create policy "admins can insert" on public.%I for insert to authenticated with check ((select private.is_admin()))', t
    );
    execute format(
      'create policy "admins can update" on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t
    );
  end loop;

  -- library, brands and shoots: any allowlisted user
  foreach t in array array[
    'angles', 'brands', 'brand_channels', 'products', 'formats', 'body_templates', 'hook_templates',
    'cta_templates', 'shoots', 'shoot_people', 'shoot_channels', 'broll_shots'
  ] loop
    execute format(
      'create policy "allowlisted users can insert" on public.%I for insert to authenticated with check ((select private.is_allowed()))', t
    );
  end loop;
  foreach t in array array[
    'angles', 'brands', 'products', 'formats', 'body_templates', 'hook_templates', 'cta_templates',
    'shoots', 'shoot_items', 'broll_shots'
  ] loop
    execute format(
      'create policy "allowlisted users can update" on public.%I for update to authenticated using ((select private.is_allowed())) with check ((select private.is_allowed()))', t
    );
  end loop;
end $$;

create policy "admins can delete" on public.allowed_users
  for delete to authenticated using ((select private.is_admin()));

create policy "allowlisted users can delete" on public.brand_channels
  for delete to authenticated using ((select private.is_allowed()));

-- shoot contents can only be added or removed while the shoot is a draft
create policy "allowlisted users can insert into draft shoots" on public.shoot_items
  for insert to authenticated
  with check ((select private.is_allowed()) and private.shoot_is_draft(shoot_id));

create policy "allowlisted users can delete from draft shoots" on public.shoot_items
  for delete to authenticated
  using ((select private.is_allowed()) and private.shoot_is_draft(shoot_id));

create policy "allowlisted users can delete from draft shoots" on public.shoot_people
  for delete to authenticated
  using ((select private.is_allowed()) and private.shoot_is_draft(shoot_id));

create policy "allowlisted users can delete from draft shoots" on public.shoot_channels
  for delete to authenticated
  using ((select private.is_allowed()) and private.shoot_is_draft(shoot_id));

create policy "allowlisted users can delete from draft shoots" on public.broll_shots
  for delete to authenticated
  using ((select private.is_allowed()) and private.shoot_is_draft(shoot_id));

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------
insert into public.allowed_users (email, role, display_name) values ('joe@thesmilyfam.com', 'admin', 'Joe');

insert into public.settings default values;

insert into public.channels (name, slug, dogs, dog_phrase, folder_slug) values
  ('topdognix', 'topdognix', '{nix}', 'my Doberman', 'nix'),
  ('topdogwhiskey', 'topdogwhiskey', '{whiskey}', 'my Vizsla', 'whiskey'),
  ('topdogsiblings', 'topdogsiblings', '{nix,whiskey}', 'my two dogs', 'both');

insert into public.angles (name) values
  ('curiosity'), ('problem'), ('testimonial'), ('pov'), ('skeptic'), ('contrarian'), ('demo');
