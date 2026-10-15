# topdogugc Planner — Project Spec

Internal web app for the topdogugc UGC agency. It holds the script **Library** (hooks, CTAs, bodies, formats) and the **Planner** that turns library items into a shoot day: shot lists per person, a recipe/submission calculator, and exports that feed the later processing pipeline.

This spec covers the Library and Planner only. Ingest, rendering and submissions are later projects. The schema is designed so they plug in without migrations of existing tables.

---

## 1. Context

- topdogugc is a UGC agency producing ads for brands on Trybe.
- Three creator channels sit under the agency, one per dog combo:
  - `topdognix` (Nix, Doberman)
  - `topdogwhiskey` (Whiskey, Vizsla)
  - `topdogsiblings` (both)
- Several on-camera people (currently 3; must support adding more).
- Every finished video = **Hook → Body → CTA**, all from the same person:
  - **Hook:** on-camera, sync audio.
  - **Body:** a voiceover (VO) recorded separately, with b-roll laid underneath. The VO script is broken into **beats** (problem / product / result) and b-roll is matched per beat.
  - **CTA:** either on-camera with sync audio, or VO over b-roll.
- Software later assembles every valid combination ("recipe") and renders only a selected share for submission. The Planner's job is to plan what gets filmed and estimate what that yields.

### Pipeline (for orientation; only stages 1–2 are in scope)

1. **Library** — reusable, brand-agnostic templates. *(this project)*
2. **Planner** — build a shoot for one product; export shot lists, `shootsheet.json` and folder skeleton. *(this project)*
3. Ingest + conformance + captions — local worker. *(later)*
4. Recipe generation, selection, rendering — local worker. *(later)*
5. Submission queue + form-filling Chrome extension. *(later)*

---

## 2. Stack

- **Frontend/app:** Nuxt (latest stable) + Nuxt UI + Tailwind, deployed on **Vercel**.
- **Database + auth:** **Supabase** (Postgres, Auth, Row Level Security).
- **Auth:** Google OAuth via Supabase Auth, restricted to an email allowlist.
- **Server routes:** Nuxt server (Nitro) API routes for anything needing secrets (AI drafting, exports).
- **AI drafting (phase 6):** Anthropic API called from a server route. Model name in an env var.
- Mobile-friendly throughout. The shot sheet view is used on phones on set.

### Environment variables

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server routes only
ANTHROPIC_API_KEY=              # phase 6
ANTHROPIC_MODEL=                # phase 6
```

---

## 3. Users and access

- Sign in with Google. After sign-in, check the email against `allowed_users`. Not on the list → signed out with a "no access" message.
- Two roles:
  - **admin** — everything, plus managing people, channels, allowlist and settings.
  - **member** — full read/write on the Library and Planner.
- Enforce with RLS: every table readable/writable only by allowlisted authenticated users; admin-only tables (`allowed_users`, `settings`) writable by admins only.
- Seed admin: `joe@thesmilyfam.com`.

---

## 4. App structure

Top-level navigation:

| Tab | Purpose |
|---|---|
| **Library** | Hooks, CTAs, Bodies, Formats, Angles |
| **Planner** | Shoots list → shoot builder → calculator → exports |
| **Brands** | Brands, products (with slot values), brand → channel assignment |
| **Settings** (admin) | People, channels, allowlist, time-per-item defaults |

---

## 5. Templating

### Slot syntax

Scripts use double-brace slots: `{{brand}}`, `{{product}}`, `{{dog}}`, plus any custom slot.

- `{{brand}}` and `{{product}}` are built in and filled from the product.
- `{{dog}}` is filled per channel from the channel's dog phrase (e.g. "my Doberman", "my Vizsla", "my two dogs").
- Custom slots (e.g. `{{benefit}}`, `{{price}}`, `{{offer}}`) are filled from the product's `slot_values`.
- Unfilled slots must be visibly flagged in previews and block export until filled or overridden.

### Rules

- **Universal hooks** (`is_universal = true`) must not contain `{{brand}}`, `{{product}}` or custom product slots. Validate on save. `{{dog}}` is allowed.
- VOs (bodies) should be written dog-neutral by default ("my dog", "my pup") so all channels can share them. Not enforced; show a soft warning if a body uses `{{dog}}`.
- Editor UI: highlight slots, show a live preview against a chosen product + channel.

---

## 6. Data model

All tables get `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`, and `created_by uuid` (auth user) unless noted. Library tables get `archived boolean default false` (archive instead of delete, so past shoots keep their references).

### Reference data

**allowed_users**
- `email text unique`, `role text check (role in ('admin','member'))`, `display_name text`

**settings** (single row)
- `default_submission_rate numeric default 0.15`
- `minutes_per_hook numeric default 4.5`
- `minutes_per_cta_sync numeric default 3`
- `minutes_per_vo numeric default 9`
- `minutes_per_cta_vo numeric default 3`
- `productive_hours_per_day numeric default 6`

**people** — on-camera talent
- `name text`, `slug text unique` (lowercase, used in folder names, e.g. `joe`), `active boolean`

**channels**
- `name text` (e.g. `topdognix`), `slug text unique`, `dogs text[]` (e.g. `{nix}`, `{whiskey}`, `{nix,whiskey}`), `dog_phrase text` (fills `{{dog}}`), `folder_slug text` (e.g. `nix`, `whiskey`, `both`), `active boolean`

**angles** — hook/body angle taxonomy (editable)
- `name text unique` (seed: curiosity, problem, testimonial, pov, skeptic, contrarian, demo), `description text`

### Brands

**brands**
- `name text`, `slug text unique`, `status text check (status in ('prospect','auditioning','active','paused'))`, `trybe_url text`, `pay_model text` (free text for now: flat / commission / performance / mixed), `notes text`

**brand_channels** — which channels a brand's deal is funnelled to
- `brand_id`, `channel_id`, primary key (`brand_id`, `channel_id`)

**products**
- `brand_id`, `name text`, `slug text`, unique (`brand_id`, `slug`)
- `slot_values jsonb` — e.g. `{"benefit": "calmer walks", "offer": "20% off"}`
- `claims_allowed text`, `claims_forbidden text`, `notes text`

### Library

**formats** — the structure of a video
- `code text unique` (e.g. `F01`), `name text`, `description text`
- `cta_modes text[]` — which CTA modes this format accepts: subset of `{sync, vo}`
- `beats text[] default '{problem,product,result}'`
- `target_seconds int`

**body_templates** — VO scripts, each belonging to a format
- `format_id`, `title text`, `angle_id`
- `beats jsonb` — ordered array: `[{ "beat": "problem", "script": "..." }, { "beat": "product", "script": "..." }, { "beat": "result", "script": "..." }]`; beat names must match the format's `beats`
- `est_seconds int`, `tags text[]`, `notes text`

**hook_templates**
- `script text`, `angle_id`, `is_universal boolean default false`, `est_seconds int`, `tags text[]`, `notes text`

**cta_templates**
- `script text`, `mode text check (mode in ('sync','vo'))`, `est_seconds int`, `tags text[]`, `notes text`

### Planner

**shoots**
- `code text unique` — auto-assigned sequential `S001`, `S002`, …
- `product_id`, `shoot_date date`, `location_notes text`
- `status text check (status in ('draft','planned','filmed','edited','ingested','rendering','done'))` — only `draft` → `planned` → `filmed` are set by this app; later stages are reserved for the worker
- `hook_allocation text check (hook_allocation in ('split','shared')) default 'split'`
- `broll_variations int default 3` — b-roll arrangements per VO used in recipe estimates
- `submission_rate numeric` — defaults from settings
- `kit text check (kit in ('audition','scale','custom'))` — label only
- `notes text`

**shoot_people** — `shoot_id`, `person_id`, pk on both
**shoot_channels** — `shoot_id`, `channel_id`, pk on both. Default: the product's brand's `brand_channels`.

**shoot_items** — one row per thing to film or record
- `shoot_id`, `person_id`
- `kind text check (kind in ('hook','body','cta'))`
- `hook_template_id` / `body_template_id` / `cta_template_id` (exactly one set, matching `kind`)
- `code text` — auto-assigned, unique per shoot: hooks `H01…`, bodies `V01…`, CTAs `C01…`, universal hooks `U01…`
- `channel_id` — set for hooks in split mode; null means "all channels" (shared mode, bodies, CTAs)
- `script_snapshot` — `text` for hooks/CTAs, `jsonb` beats for bodies: the template with slots filled at plan time
- `script_override` — same type, nullable: per-person edits / renditions; takes priority over snapshot
- `cta_mode text` (copied from template for CTAs)
- `location text`
- `status text check (status in ('planned','filmed','skipped')) default 'planned'`
- `take_notes text`, `sort_order int`

Snapshots matter: editing a template later must never change a shoot that's already planned.

**broll_shots** — b-roll shot list
- `shoot_id`, `channel_id` (null = product-only shots shared by all channels)
- `beat text`, `description text`, `product_visible boolean`, `min_clips int`
- `status text check (status in ('planned','filmed','skipped'))`, `sort_order int`

### Reserved for later (do not build yet; keep names free)

`clips`, `recipes`, `jobs`, `submissions`, `template_stats`.

---

## 7. Library tab

For each of Hooks, CTAs, Bodies, Formats, Angles:

- List view with search, filters (angle, tags, universal, CTA mode, format, archived) and sort.
- Create / edit drawer:
  - Script editor with slot highlighting.
  - Live preview: pick a product + channel → rendered script with slots filled; unfilled slots flagged.
  - Bodies: one editor block per beat from the chosen format.
  - Validation rules from §5.
- Archive / unarchive. No hard delete if referenced by a shoot.
- Usage count per template ("used in 4 shoots") from `shoot_items`.
- Duplicate action (copy a template as a starting point).

---

## 8. Brands tab

- Brands list with status chips and assigned channels.
- Brand detail: edit fields, assign channels (`brand_channels`), list products.
- Product detail: name, slot values editor (key/value rows), allowed/forbidden claims, notes, list of shoots for this product.

---

## 9. Planner tab

### Shoots list

Table of shoots: code, brand, product, date, status, people, channels, estimated recipes, estimated submissions. Filter by brand, product, status. "New shoot" button.

### Shoot builder

Single page with a sticky **calculator panel** (right side on desktop, bottom sheet on mobile) that updates live.

1. **Setup:** product, date, people (add/remove; any active person), channels (defaults from brand), hook allocation (split/shared), b-roll variations per VO, submission rate, kit label.
2. **Per person, add items from the Library:** multi-select hooks, bodies and CTAs (searchable picker with angle/tag filters). Option to "apply to all people" to add the same templates for everyone.
3. **Hook allocation:**
   - *Split:* each person's hooks are distributed across the shoot's channels round-robin (drag to reassign). Universal hooks are allocated the same way.
   - *Shared:* hooks apply to all channels.
4. **Scripts:** every item shows its rendered script (slots filled, `{{dog}}` filled per the hook's channel). Edit inline to create a per-person override. Unfilled slots block "Mark as planned".
5. **B-roll shot list:** per channel and per beat, plus a "product-only (all channels)" group. Quick-add presets per beat; `product_visible` toggle; `min_clips`.
6. **Codes:** assigned automatically when items are added (H/V/C/U, sequential within the shoot). Re-number button before the shoot is marked planned; codes frozen after.
7. **Status:** Draft → Planned (locks codes, enables exports) → Filmed (set manually or when all items are filmed/skipped).

### Calculator (live)

Definitions, per person *p* and channel *c* in the shoot:

- `H(p,c)` = hooks for *p* on channel *c* (split mode: hooks assigned to *c*; shared mode: all of *p*'s hooks)
- For each of *p*'s bodies *b*: `CTA(p,b)` = *p*'s CTAs whose mode is in `b.format.cta_modes`
- `V` = `broll_variations`

```
recipes(p,c) = Σ over p's bodies b of [ H(p,c) × CTA(p,b) × V ]
recipes(c)   = Σ over p of recipes(p,c)
recipes      = Σ over c of recipes(c)
submissions  = round(recipes × submission_rate)          (also shown per channel)
concepts(p,c)= H(p,c) × number of p's bodies             (genuinely distinct hook×VO pairs)
```

Time estimates (from settings):

```
on_camera_min(p) = hooks(p) × minutes_per_hook + sync_ctas(p) × minutes_per_cta_sync
vo_min(p)        = bodies(p) × minutes_per_vo + vo_ctas(p) × minutes_per_cta_vo
shoot_days       = Σ on_camera_min / 60 / productive_hours_per_day   (rounded up to 0.5)
```

Panel shows:

- **Per person:** clips to film (hooks / VOs / CTAs), on-camera time, VO time, recipes, concepts.
- **Per channel:** recipes, concepts, estimated submissions, b-roll clips required (Σ `min_clips`).
- **Totals:** clips, recipes, estimated submissions, on-camera hours, VO hours, shoot days.
- **Runway:** input "target submissions per channel per month" → months of supply per channel.
- Warnings: a body with zero compatible CTAs for a person; channels with zero hooks in split mode; unfilled slots.

Example to use as a test case (split mode, 3 people, 3 channels, each person with 30 hooks, 10 bodies, 5 CTAs all compatible, V = 3): recipes per channel = 3 × (10 × 10 × 5 × 3) = 4,500; total = 13,500; submissions at 15% = 2,025. Same inputs in shared mode: 40,500 recipes, 6,075 submissions.

---

## 10. Exports (available once a shoot is Planned)

### a) Shot sheet view (on set)

Route: `/shoots/[code]/sheet?person=[slug]` (and an "all people" view).

- Mobile-first, large tap targets, works on a phone.
- Grouped: Hooks (by channel), CTAs, then VOs (separate section, recorded off-set), then B-roll (by channel → beat).
- Each line: code, rendered script, angle, location, channel, and a checkbox that sets `status` to filmed / skipped, with optional take notes. Updates save immediately.
- Print stylesheet for paper copies.

### b) CSV

One row per shoot item and b-roll shot: `shoot, person, kind, code, channel, angle, cta_mode, location, script, status, folder_path`. For bodies, beats joined as `[problem] … [product] … [result] …`.

### c) `shootsheet.json`

The contract with the future worker. Download from the shoot page.

```json
{
  "schema_version": 1,
  "shoot": {
    "code": "S014",
    "date": "2026-10-20",
    "brand": { "name": "PawCo", "slug": "pawco" },
    "product": { "name": "Calming Chews", "slug": "calming-chews", "slot_values": {} },
    "hook_allocation": "split",
    "broll_variations": 3,
    "submission_rate": 0.15
  },
  "people": [{ "slug": "joe", "name": "Joe" }],
  "channels": [{ "slug": "topdognix", "folder_slug": "nix", "dogs": ["nix"] }],
  "formats": [{ "code": "F02", "cta_modes": ["sync", "vo"], "beats": ["problem", "product", "result"] }],
  "items": [
    {
      "code": "H01", "kind": "hook", "person": "joe", "channel": "topdognix",
      "template_id": "uuid", "angle": "curiosity", "universal": false,
      "script": "Nobody told me Calming Chews could do this…",
      "folder": "pawco/calming-chews/shoots/S014_2026-10-20/edited/hooks/joe/H01"
    },
    {
      "code": "V01", "kind": "body", "person": "joe", "channel": null,
      "template_id": "uuid", "format": "F02", "angle": "problem",
      "beats": [
        { "beat": "problem", "script": "…" },
        { "beat": "product", "script": "…" },
        { "beat": "result", "script": "…" }
      ],
      "folder": "pawco/calming-chews/shoots/S014_2026-10-20/edited/vo/joe/V01"
    },
    {
      "code": "C01", "kind": "cta", "person": "joe", "channel": null,
      "template_id": "uuid", "cta_mode": "sync", "script": "…",
      "folder": "pawco/calming-chews/shoots/S014_2026-10-20/edited/ctas/joe/C01"
    }
  ],
  "broll": [
    {
      "channel": "topdognix", "beat": "problem", "description": "anxious pacing",
      "product_visible": false, "min_clips": 3,
      "folder": "pawco/calming-chews/b-roll/nix/problem"
    }
  ]
}
```

### d) Folder skeleton (zip)

Download a zip of empty folders (each with a `.keep` file) plus `shootsheet.json`, to unzip into the Dropbox `topdogugc/` root. A later phase can replace this with Dropbox API folder creation.

```
topdogugc/
  universal/
    hooks/[person]/U##/
  [brand]/[product]/
    b-roll/
      shared/product/                       product-only shots, all channels
      [nix|whiskey|both]/problem|product|result/
    shoots/[S###_YYYY-MM-DD]/
      shootsheet.json
      raw/
      edited/
        hooks/[person]/H##/                 one folder per hook; filenames don't matter
        vo/[person]/V##/
        ctas/[person]/C##/
      captions/
    renders/
```

Universal hook folder naming: `universal/hooks/[person]/U[template short id]/` so universal clips are identified by template across products, not by shoot.

All slugs lowercase kebab-case; generate once and never change after a shoot is planned.

---

## 11. Phase 6 — AI drafting (optional, after core works)

Server route calling the Anthropic API. Every generation produces **drafts** a person approves before saving; nothing writes to the Library automatically.

- **Hook drafts:** given an angle and optional tags, generate N brand-agnostic hook templates using slot syntax.
- **Body drafts:** given a format and angle, generate a beat-structured VO script.
- **Per-person renditions:** in the shoot builder, generate reworded variants of a body or hook for each person (saved as `script_override`), so cast members don't say identical lines.
- Respect the product's `claims_forbidden` when generating with a product selected.

---

## 12. Build phases and acceptance criteria

**Phase 0 — Foundation**
- Nuxt + Nuxt UI app on Vercel, Supabase connected, Google sign-in, allowlist enforced, admin seeded, RLS on all tables.
- ✅ A non-allowlisted Google account cannot see any data.

**Phase 1 — Reference data**
- Settings tab: people, channels (with dogs, dog phrase, folder slug), allowlist, time defaults.
- Brands tab: brands, products with slot values, brand → channel assignment.
- Seed: 3 channels (topdognix / nix, topdogwhiskey / whiskey, topdogsiblings / both); angles list.
- ✅ Can create a brand, a product with custom slots, and assign channels.

**Phase 2 — Library**
- CRUD for formats, bodies (beat editor), hooks, CTAs, angles; slot highlighting; live preview; universal validation; archive; usage counts; duplicate.
- ✅ A universal hook containing `{{brand}}` cannot be saved. Preview flags unfilled slots.

**Phase 3 — Shoot builder**
- Create shoot, add people/channels, add items per person from the Library, split/shared allocation with round-robin + manual reassign, auto codes, inline script overrides, b-roll shot list, status Draft → Planned.
- ✅ Editing a template after a shoot is planned does not change that shoot's scripts.

**Phase 4 — Calculator**
- Live panel per §9, including CTA-mode compatibility, time estimates, runway and warnings.
- ✅ The §9 example inputs produce 13,500 recipes / 2,025 submissions (split) and 40,500 / 6,075 (shared).

**Phase 5 — Exports**
- Shot sheet view (mobile, live checkboxes, print), CSV, `shootsheet.json`, folder skeleton zip.
- ✅ Unzipping the skeleton gives exactly the folder paths listed in `shootsheet.json`.

**Phase 6 — AI drafting** per §11.

---

## 13. Conventions

- TypeScript throughout; generate Supabase types and use them.
- Database changes as SQL migrations in the repo (`supabase/migrations`).
- Keep calculator math in a pure, unit-tested module (`utils/calculator.ts`) shared by the UI and exports.
- Keep slot rendering in a pure, unit-tested module (`utils/slots.ts`).
- No hard deletes on library or shoot data; archive instead.

## 14. Out of scope (later projects)

- Local worker (Windows now, VPS later): ingest, auto-tagging, conformance checks, caption alignment, recipe generation, selection, rendering.
- Submission queue and form-filling Chrome extension (linked to Dropbox).
- Performance tracking per template / angle once brand data is known.
