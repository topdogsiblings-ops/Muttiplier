# Muttiplier — Project Spec

Internal web app for the topdogugc UGC agency. It holds the script **Library** (hooks, CTAs, formats & VOs, angles), the **Brands** pipeline from Trybe, and the **Planner** that turns library items into a shoot day: one shared shot list, a recipe/submission calculator, an on-set checklist, and exports that feed the later processing pipeline.

This spec covers the Library, Brands and Planner. Ingest, rendering and submissions are later projects. The schema is designed so they plug in without migrations of existing tables.

*Last brought up to date: 2026-10-15, to match the app as built.*

---

## 1. Context

- topdogugc is a UGC agency producing ads for brands on Trybe.
- Three creator channels sit under the agency, one per dog combo:
  - `topdognix` (Nix, Doberman)
  - `topdogwhiskey` (Whiskey, Vizsla)
  - `topdogsiblings` (both)
- Several on-camera people (currently 3; must support adding more). Each person films on **their own phone**, at the same time as everyone else.
- Every finished video = **Hook → Body → CTA**:
  - **Hook:** on-camera, sync audio.
  - **Body:** a voiceover (VO) recorded separately, with b-roll laid underneath. The VO follows a **format**, whose script is broken into **beats** (e.g. problem / product / result); b-roll is matched per beat.
  - **CTA:** either on-camera with sync audio, or VO over b-roll.
  - By default all three parts come from the same person. On a channel with **linked people** (§9), parts can mix across those people.
- Software later assembles every valid combination ("recipe") and renders only a selected share for submission. The Planner's job is to plan what gets filmed and estimate what that yields.

### Pipeline (for orientation)

1. **Library** — reusable, brand-agnostic templates. *(this project)*
2. **Planner** — build a shoot for one product, run it on set, export shot lists, `shootsheet.json` and folder skeleton. *(this project)*
3. **Dropbox uploads** — clips land in the right shoot folders. *(built; see §12)*
4. Ingest + conformance + captions — local worker. *(later)*
5. Recipe generation, selection, rendering — local worker. *(later)*
6. Submission queue + form-filling Chrome extension. *(later)*

---

## 2. Stack

- **Frontend/app:** Nuxt 4 (SPA, `ssr: false`) + Nuxt UI v4 + Tailwind, deployed on **Vercel**.
- **Database + auth:** **Supabase** (Postgres, Auth, Row Level Security) via `@nuxtjs/supabase`.
- **Auth:** Google OAuth via Supabase Auth, restricted to an email allowlist.
- **Server routes:** Nuxt server (Nitro) API routes for anything needing secrets (AI drafting, exports). They run as the signed-in user under RLS.
- **AI drafting:** Anthropic API (`@anthropic-ai/sdk`) called from server routes, structured output validated with Zod. Model name in an env var.
- Mobile-friendly throughout. The checklist is used on phones on set.

### Environment variables

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server routes only; not required today
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-5-5
```

---

## 3. Users and access

- Sign in with Google. After sign-in, check the email against `allowed_users`. Not on the list → signed out with a "no access" message.
- Two roles:
  - **admin** — everything, plus managing people, channels, allowlist and settings.
  - **member** — full read/write on the Library, Brands and Planner.
- Enforce with RLS: every table readable/writable only by allowlisted authenticated users; admin-only tables (`allowed_users`, `settings`) writable by admins only.
- `profiles` mirrors each auth user's name and email so the app can show who created or changed things.
- Seed admin: `joe@thesmilyfam.com`.

---

## 4. App structure

| Tab | Purpose |
|---|---|
| **Library** | Hooks, CTAs, **VOs**, **Formats**, Angles |
| **Planner** | Shoots list → shoot planner (with calculator) → checklist → exports |
| **Brands** | Brands (Trybe deal data, CSV import, filters), products with slot values, brand → channel assignment |
| **Settings** (admin) | People, channels, allowlist, defaults (time per item, speech pace, general product shots) |

UI conventions: every destructive or state-changing action asks in an in-app confirm dialog (never a browser alert); collapsible sections start collapsed; long lists paginate and show a spinner while loading; each Library tab has a `?` help popover.

---

## 5. Templating

### Slot syntax

Scripts use double-brace slots: `{{brand}}`, `{{product}}`, `{{dog}}`, plus any custom slot.

- `{{brand}}` and `{{product}}` are built in and filled from the product.
- `{{dog}}` is filled per channel from the channel's dog phrase (e.g. "my Doberman", "my Vizsla", "my two dogs"). On items shared by every channel, `{{dog}}` is filled as the channels' phrases joined with " / " (e.g. "my Doberman / my Vizsla / my two dogs"), and only counts as unfilled if a channel on the shoot has no phrase.
- Custom slots (e.g. `{{benefit}}`, `{{price}}`, `{{offer}}`) are any other `{{name}}`. They aren't defined anywhere first: each shoot fills its own (`shoots.slot_values`), so every shoot starts blank.
- The script editor lists the available slots, and highlights recognised vs unrecognised slots as you type.
- Unfilled slots are flagged in previews and block "Mark as planned".
- On a draft shoot, a **Fill in slots** section in the planner lists every unfilled slot with the codes that use it (hooks and CTAs first). Custom slots are typed in there and saved on that shoot only (`shoots.slot_values`); `{{dog}}` asks for the dog phrase of each channel on the shoot that has none (admins, saved to the channel). A line can still be overridden instead.

### Rules

- **Per channel:** every hook, VO and CTA is filmed per person per channel. A script that says `{{dog}}` needs a separate take for each channel (each says that channel's dog); one that doesn't is recorded once and that take fills each of the person's channels. There are no universal hooks: hooks never cross shoots.
- VOs should be written dog-neutral by default ("my dog", "my pup") so all channels can share them. Not enforced; soft warning if a VO uses `{{dog}}`.
- Editor UI: highlight slots, show a live preview against a chosen product + channel.

---

## 6. Data model

All tables get `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`, and `created_by uuid default auth.uid()` (stamped by trigger) unless noted. Library tables get `archived boolean default false` (archive instead of delete, so past shoots keep their references) and an optional `source_url` (must be http/https) for where the idea came from. Lists show "Added by X · date".

### Reference data

**allowed_users**
- `email text unique` (lowercase), `role text check (role in ('admin','member'))`, `display_name text`

**profiles** — one per auth user, synced by trigger
- `id` (= auth user id), `email`, `full_name`, `avatar_url`

**settings** (single row)
- `default_submission_rate numeric default 0.05` — the default batch size for new shoots (share of valid recipes)
- `minutes_per_hook numeric default 4.5`
- `minutes_per_cta_sync numeric default 3`
- `minutes_per_vo numeric default 9`
- `minutes_per_cta_vo numeric default 3`
- `productive_hours_per_day numeric default 6`
- `words_per_second numeric default 2.5` — speech pace for estimating VO length
- `general_broll jsonb default '[]'` — suggested general product shots: `[{ "description": "..." }]`
- Clip check presets (§10a): `clip_aspect_width int default 9`, `clip_aspect_height int default 16`, `clip_min_width int default 1080`, `clip_min_height int default 1920`, `clip_min_fps numeric default 24`, `clip_max_fps numeric default 60`, `vo_min_share numeric default 0.6`, `vo_max_share numeric default 1.75` (VO length as a share of the script's estimated reading time)

**people** — on-camera talent
- `name text`, `slug text unique` (lowercase kebab, used in folder names), `active boolean`
- `allowed_user_id` — optional link to an allowlisted user; that user's checklist opens on their own shots

**person_channels** — `person_id`, `channel_id`, pk on both. People linked to a channel; recipes on that channel can mix their parts (§9).

**channels**
- `name text` (e.g. `topdognix`), `slug text unique`, `dogs text[]`, `dog_phrase text` (fills `{{dog}}`), `folder_slug text` (e.g. `nix`, `whiskey`, `both`), `active boolean`

**angles** — hook/VO angle taxonomy (editable, title case)
- `name text unique`, `description text`. Seed: Curiosity, Problem, Testimonial, POV, Skeptic, Contrarian, Demo, each with a description. Angles are the *persuasion approach*; formats are the *structure* of the video.

### Brands

**brands**
- `name text`, `slug text unique`, `status text check (status in ('prospect','auditioning','active','paused'))`, `notes text`
- Trybe deal: `trybe_url text`, `pay_model text check (pay_model in ('flat','commission','both'))`, `flat_fee numeric`, `commission_pct numeric` (0–100), `currency text default 'GBP'` (ISO code), `trybe_score numeric`
- Import: `trybe_brand_id text`, `trybe_data jsonb` — everything else from the Scrybe export (about text, category, website, earnings, top formats, unrecognised columns under `extra`)
- `videos_required int` — legacy, no longer shown
- New brands are assigned to every active channel by default (trigger).

**brand_channels** — which channels a brand's deal is funnelled to
- `brand_id`, `channel_id`, primary key (`brand_id`, `channel_id`)

**products**
- `brand_id`, `name text`, `slug text`, unique (`brand_id`, `slug`)
- `claims_allowed text`, `claims_forbidden text`, `notes text`

**product_features** — a product's core features, edited with the product on its brand page
- `product_id`, `name text`, `description text`, `sort_order int`
- `slug text` — names the feature's b-roll folder (`b-roll/<beat>/<slug>/`); set from the name when the feature is added and never changed, so renaming a feature keeps its folder. Unique per product.
- Removing one leaves its VOs about the product as a whole (`feature_id` set null), and its b-roll shots become generic

### Library

**formats** — the structure of a video
- `code text unique` (e.g. `F01`), `name text`, `description text`
- `beats text[] default '{problem,product,result}'`
- `beat_descriptions jsonb` — beat → what that beat is for (shown as `?` help in the planner)
- `beat_broll jsonb` — beat → suggested b-roll shots, `[{ "description" }]`; edited on the format, offered in the planner
- `target_seconds int`
- `cta_modes text[]` — legacy, no longer used: any CTA can follow any VO

**body_templates** — VO scripts, each belonging to a format. Not in the Library: VOs are only written in a shoot (§9), for its product.
- `format_id`, `angle_id`
- `product_id` — the product it sells (required)
- `feature_id` — optional: one of that product's features (a trigger checks it), or null for a VO about the product as a whole. VOs have no title; they're shown by feature (or "<product> as a whole") and script. `title` is legacy.
- `shoot_id` — the shoot it was written in (set null if that shoot is deleted). Later shoots of the same product can use it too.
- `person_id` — who wrote it: the signed-in user's person on the cast (an admin can pick anyone on the shoot). They perform it with anyone cast on it (`vo_cast`), and only they or an admin can edit or delete it (or its links): restrictive RLS policies using `private.is_me(person_id)` / `private.is_admin()`.
- `beats jsonb` — ordered array: `[{ "beat": "problem", "script": "..." }, ...]`; beat names must match the format's `beats`
- `est_seconds int` — **computed** from the word count ÷ `settings.words_per_second`, not typed in
- `tags text[]`, `notes text`

**body_template_products** — legacy, no longer used (VOs now belong to a product through their feature).

**hook_templates**
- `script text`, `angle_id`, `est_seconds int`, `tags text[]`, `notes text` (`is_universal` is legacy, always false)
- `product_id` — kept for one product: in the Library under it (filterable), offered only on that product's shoots. Null = a general hook, offered on every shoot.
- `shoot_id` — written in that shoot for that shoot only: hidden from the Library and the picker until saved to the product (which clears it and sets `product_id`). At most one of the two is set.
- `filming_notes text` — how to film it (shown on the checklist)
- `caption text` — suggested on-screen caption (may use slots)

**cta_templates** — like hook_templates: `product_id` (kept for one product) or `shoot_id` (written in that shoot only, until saved to the product); at most one.
- `script text`, `mode text check (mode in ('sync','vo'))`, `est_seconds int`, `tags text[]`, `notes text`

**vo_cast** — `body_template_id`, `person_id`: people cast on a VO with its writer. They record the same script, beat for beat, so they perform it too (their own items on their channels), and on a channel they share their beats can be mixed (§14). Only the writer or an admin changes it.

**vo_hook_links**, **vo_cta_links** — `body_template_id` + `hook_template_id` / `cta_template_id`. A VO linked to hooks (or CTAs) only goes with those; the link is one-way, so they still go with other VOs. No links on a side = any. Links are kept with the VO, so reusing it on a later shoot brings its linked hooks / CTAs too.

Hooks, CTAs and VOs written in a shoot (`shoot_id` set) can be deleted (RLS), when they come off it and no shoot uses them; Library ones can't.

**template_usage** (view) — `kind`, `template_id`, `shoot_count`, for "used in N shoots".

### Planner

**shoots**
- `code text unique` — auto-assigned sequential `S001`, `S002`, …
- `product_id`, `shoot_date date`, `location_notes text`, `notes text`
- `status text check (status in ('draft','planned','shooting','filmed','edited','ingested','rendering','done'))` — this app sets `draft` → `planned` → `shooting` → `filmed` (and back, §9); later stages are reserved for the worker
- `started_at`, `started_by`, `ended_at`, `ended_by` — stamped by trigger on status changes only
- `broll_variations int default 1` (≥ 1) — different b-roll selections per hook + VO + CTA, each its own recipe; also how many clips each channel films of every b-roll shot (the checklist wants that many)
- `vo_variations int default 1` (≥ 0) — mixed versions per VO per channel: beats swapped between the people cast on it (0 = no mixing)
- `submission_rate numeric` — defaults from settings
- `slot_values jsonb default '{}'` — the custom slots filled in for this shoot, e.g. `{"benefit": "calmer walks", "offer": "20% off"}` (the planner's Fill in slots)
- `runway_target int default 60` — target submissions per channel per month, for runway
- `kit text check (kit in ('audition','scale','custom'))` — a tag for the shoot only; it changes nothing
- `hook_allocation text` — legacy, unused: every item is per channel

**shoot_people** — `shoot_id`, `person_id`, pk on both
**shoot_channels** — `shoot_id`, `channel_id`, pk on both. Default: the product's brand's `brand_channels`.
**shoot_formats** — `shoot_id`, `format_id`, pk on both. Formats added to the plan (VOs and b-roll follow them).

**shoot_items** — one row per person per thing to film or record
- `shoot_id`, `person_id`
- `kind text check (kind in ('hook','body','cta'))`
- `hook_template_id` / `body_template_id` / `cta_template_id` (exactly one set, matching `kind`)
- `code text` — shared per template within a shoot: everyone filming the same hook has the same code, on every channel. Hooks `H01…`, VOs `V01…`, CTAs `C01…`. Unique on (`shoot_id`, `person_id`, `channel_id`, `code`).
- `channel_id` — the channel this item is filmed for (every kind of item); a person has one item per code per channel they're linked to
- `channel_id` — null (hooks are used for every channel); kept for older rows
- `script_snapshot` — `text` for hooks/CTAs, `jsonb` beats for VOs: the template at plan time
- `script_override` — same type, nullable: per-person rewording; takes priority over the snapshot
- `caption text` — hooks only: the template's caption, snapshotted
- `cta_mode text` (copied from template for CTAs), `location text`
- `status text check (status in ('planned','filmed','skipped')) default 'planned'`, `sort_order int`
- `take_notes text` — legacy, no longer shown (every clip is the final take)

Snapshots matter: editing a template later must never change a shoot that's already planned.

**broll_shots** — b-roll shot list; every channel films its own clips of each shot
- `shoot_id`, `format_id` (null = general product shots), `beat text`, `description text`
- `feature_id` — the product feature the shot is for (set in the planner while the shoot is a draft): its clips go in `b-roll/<beat>/<feature slug>/` and only under VOs about that feature. Null = generic b-roll for its beat, used under any VO.
- `clips_filmed int` — clips saved on set, across all channels (a shot with no `channel_id` is filmed for every channel on the shoot; each channel films as many clips of it as it likes)
- `status text check (status in ('planned','filmed','skipped'))` — `filmed` once every channel it's filmed for has at least one clip
- `channel_id` — null; kept for older channel-specific rows
- `sort_order int`

**shoot_clips** — one row per deliverable with footage on some phone: a shoot item (`item:<id>`) or one required b-roll clip for one channel (`broll:<shot>:<channel>:<n>`)
- `shoot_id`, `target text`, unique on both; `file_name`, `size`, `state` (`saved` | `uploaded`), `path` (in Dropbox, once uploaded); `created_by` = whose phone it's on
- Live over Supabase Realtime, so every phone sees a clip as soon as it's added anywhere. The clip itself stays on the phone that added it until it's uploaded.

### Reserved for later (do not build yet; keep names free)

`clips`, `recipes`, `jobs`, `submissions`, `template_stats`.

---

## 7. Library tab

Tabs: **Hooks, CTAs, Formats, Angles**. Hooks and CTAs written in a shoot only show once saved to a product; both can be filtered by product. VOs aren't in the Library: they're written in each shoot, for its product (§9).

- List view with search, filters (angle, tags, CTA mode, archived) and sort; paginated.
- Tags input autocompletes from tags already used in the Library.
- Create / edit drawer:
  - Script editor with slot palette and slot highlighting.
  - Live preview: pick a product + channel → rendered script with slots filled; unfilled slots flagged.
  - Hooks: filming notes and suggested caption.
  - Validation rules from §5.
- **Formats:** one row per format (description, beats, target), with how many VOs are built on it. The format editor edits beats, each beat's description and its suggested b-roll shots.
- Archive / unarchive (with confirm). No hard delete if referenced by a shoot.
- Usage count per template ("used in 4 shoots").
- Duplicate action.
- **AI drafts** (§11) for hooks (with captions) and CTAs. VOs are drafted beat by beat in the shoot's VO editor.
- Seeded starter library: 30 hooks, 15 CTAs, 10 VOs, 5 formats, with starter beat descriptions and b-roll suggestions.

---

## 8. Brands tab

- Brands list with status chips, assigned channels and deal summary; paginated.
- **Filters and sort:** Trybe score, pay model, commission %, flat fee, category, channel, text match.
- **Scrybe CSV import:** accepts any version of the Scrybe export (column names matched by alias, unit words ignored, unknown columns kept in `trybe_data.extra`). Every imported brand comes in as a **prospect**; existing brands (by Trybe id or slug) are updated rather than duplicated. A preview shows what will be created/updated and which columns weren't recognised.
- Brand detail: edit fields and Trybe deal, full Trybe "about" text (with link to the full description on Trybe), assign channels, list products.
- Product detail: name, slot values editor (key/value rows), allowed/forbidden claims, notes, list of shoots for this product.

---

## 9. Planner

### Shoots list

Table of shoots: code, brand, product, date, status, people, channels, estimated recipes, estimated submissions. Filter by brand, product, status. "New shoot" button.

### Shoot planner

A **summary panel** sits above the tabs and updates live: recipes, estimated submissions, hooks · VOs · CTAs, people · channels, the date and shoot days, and how many things need checking (opens General), with a **Calculator** button that opens the full calculator. The open tab is in the URL (`?tab=`). Sections with a **Clear** action confirm first.

1. **General:** what's left before planning, the calculator's warnings, slots to fill, batching (once filmed) and **Setup**: product (locked once the shoot has VOs, which belong to it), date, location, people (add/remove; any active person), channels (default from the brand), batch size (% of valid recipes, default 5%), runway target, **B-roll variations** and **VO variations**, kit tag. Everyone must be linked to at least one of the shoot's channels (it blocks planning).
2. **Formats:** add or remove formats on the plan. Removing a format (confirmed) also removes its VOs and its b-roll.
3. **Hooks:** on one shared shot list that **everyone films together**: each person films every hook once per channel they're linked to (the per-person rows show person · channel). Picked from the Library (general hooks and the shoot's product's own), or **Write a hook** right here: it's this shoot's own (badged "Written here", not in the Library). If it works, **Save to [product]** in its Edit menu keeps it in the Library for that product's later shoots. Removing a hook written here deletes it unless another shoot uses it.
4. **VOs:** written here, for the shoot's product, grouped by format (one collapsible panel per format on the plan). **Write a VO** (or **Write F01** on a format) opens the VO editor. Its writer is the signed-in user's person on the cast (someone not linked to the cast, or not on the shoot, can't write one); an admin instead picks anyone on the shoot. Only the writer or an admin can edit it. **Cast with** adds people on the shoot who share a channel with the writer: they record the same script and their beats can be mixed (VO variations). The editor has what it's about (one of the product's features, or the product as a whole), a format and an angle, **Only with hooks** / **Only with CTAs** (links to the shoot's hooks and CTAs: the VO only goes with those; empty = any), one block per beat, the estimated length (computed) and AI drafting of the beats. Saving puts it on the shot list for its writer on each of their channels; its format joins the plan. **The VO** in a VO's Edit menu (writer or admin only) reopens it; its beats update this shoot's copy. A linked VO's row says "Only with H01, H03". **Earlier VOs** offers the product's VOs from its other shoots (written by someone on this shoot), bringing their linked hooks / CTAs onto the shoot. Removing a VO written here deletes it unless another shoot uses it.
5. **CTAs:** like hooks: from the Library (general CTAs and the product's own), or **Write a CTA** here (script and mode), this shoot's own until **Save to [product]**.
6. **B-roll:** one collapsible panel per planned format (name, description, shot count), a section per beat with its `?` description, plus **General product shots** (suggestions from Settings). Each beat's suggested shots are in its **Suggested** dropdown, one at a time or all at once; a whole format's can be added together ("Add all suggestions"), or shots written by hand; **Generate b-roll** asks the AI for shots for every section based on the brand, product, formats and beat descriptions. A shot is just its description (and, optionally, a product feature).

- On the Hooks, VOs and CTAs tabs, every item shows its rendered script (slots filled; `{{dog}}` per §5). One **Edit** menu per line: **For everyone** rewrites the shoot's own copy of a line (every person's snapshot) for this shoot only; the library isn't touched and per-person overrides stay on top. **Permanently** (hooks and CTAs) edits the Library template for later shoots and updates this shoot's copy to match (a planned shoot's copy with slots filled); other shoots keep their own copy, and universal hooks still only allow `{{dog}}`. **Per person** opens each person's own version. Or edit a person's line inline to create a per-person override, or use AI to reword it per person. Captions on hooks are snapshotted.

- **Codes:** assigned automatically when items are added (H/V/C/U, sequential within the shoot, shared per template). **Re-number** closes gaps while in draft.
- **Status:**
  - Draft → **Planned** (confirm dialog; blocked by unfilled slots; freezes codes and snapshots, enables the checklist and exports).
  - Planned → **Back to draft** to keep editing.
  - Shooting or filmed → **Revert** (confirmed) to planned, as if the shoot never started (`public.revert_shoot`, then the app removes the `shoot_clips` rows): every tick and skip cleared, b-roll counts back to zero, the clip records and the upload request removed, the start / end stamps cleared and `shoots.reverted_at` set. Phones drop clips they saved before `reverted_at`. Anything already uploaded to Dropbox stays. From planned it can then go back to draft.
  - Planned → **Shooting** (Start shoot, or automatically on the first tick) → **Filmed** (End shoot; asks first if shots are still unticked).
  - Filmed → **Resume shoot**, when shots are still unticked. A resumed shoot keeps its original start time.
  - Elapsed time is shown while shooting and once ended.

### Calculator (live)

Recipes follow the batching rules (§14): one hook, one VO and one CTA, **all from the same person and the same channel**. A person only films for the shoot's channels they're linked to. Per person *p* and channel *c* (skipped items ignored):

```
recipes(p,c) = H(p,c) × B(p,c) × C(p,c)        (p's hooks, VOs and CTAs filmed for c; any CTA follows any VO)
recipes(c)   = Σ over p of recipes(p,c)
recipes      = Σ over c of recipes(c)
submissions  = round(recipes × batch size)        (also shown per channel)
concepts(p,c)= H(p,c) × B(p,c)                    (distinct hook × VO pairs)
```

Whether b-roll can cover every beat is only known once the edits are in (§14), so the planner's count is the most a shoot can make.

Time estimates (from settings). Everyone films on their own phone at the same time, so the shoot is as long as the busiest person:

```
on_camera_min(p) = hooks(p) × minutes_per_hook + sync_ctas(p) × minutes_per_cta_sync
vo_min(p)        = vos(p) × minutes_per_vo + vo_ctas(p) × minutes_per_cta_vo
(each counted per recording: a script that doesn't name the dog is recorded once for all of p's channels)
shoot_days       = max over p of on_camera_min(p) / 60 / productive_hours_per_day   (rounded up to 0.5)
```

Panel shows:

- **Per channel:** donut chart of estimated submissions with a legend table (share, recipes, runway).
- **Per person:** stacked bars of on-camera vs VO time, plus clips, recipes and concepts.
- **Totals:** clips, recipes, estimated submissions, on-camera hours, VO hours, shoot days, b-roll clips.
- **Runway:** months of supply per channel at the shoot's `runway_target`.
- **Warnings:** someone has VOs but no CTAs on a channel; items not on one of the shoot's channels; unfilled slots.

Chart colours use a fixed, colour-blind-checked categorical palette (`--chart-1…8`, separate light/dark values); every chart also shows its values as text.

Test case: Joe on Nix and Whiskey, Sam on Nix, Alex on Both, each with 10 hooks, 4 VOs and 3 CTAs per channel: Nix 240, Whiskey 120, Both 120, total 480 recipes; a 5% batch is 24.

---

## 10. Checklist and exports (available once a shoot is Planned)

### a) Checklist (on set)

Route: `/shoots/[code]/sheet?person=[slug]&show=[hook|cta|body|broll]`. Both filters are optional and combine (e.g. one person's CTAs); the URL can be shared. A signed-in user linked to a person opens on their own shots.

- Mobile-first, large tap targets. Updates save immediately.
- Header: shoot, product, brand, date, elapsed time, progress for what's showing, Start / End / Resume.
- Sections: **Hooks** (used for every channel), **CTAs**, **VOs** (recorded off set), then **B-roll** by beat.
- Each item: code, rendered script (VOs by beat), angle, location, and filming notes ("How to film").
- **Every deliverable gets its clip from the checklist** with **Add clip**, which picks a video from the phone. Every take is filmed, VOs and VO CTAs included: they're recorded on camera (selfie), so their picture is there for treatments such as greenscreen and picture-in-picture, and their sound plays over b-roll as before. A voiceover's length is checked against its script's reading time (Settings → Defaults). Clips are filmed and recorded in the phone's own apps (iOS compresses video its camera hands straight to a web page). **Takes:** each person films every item once per channel they're on; a line that doesn't say `{{dog}}` is one take for all of their channels (saved once, filling each channel's spot, uploaded once and copied in Dropbox to the other channels' folders), one that does is a take per channel. A VO is recorded **beat by beat**, one file per beat. An item is ticked off once every spot it has (every beat of a VO) has a clip; nothing can be ticked by hand. Removing a clip unticks it. Skip / unskip stays manual.
  - **Everyone view:** each hook / CTA / VO once, with a row per person: their takes as Add clip buttons labelled by channel ("Nix + Whiskey", or a beat for a VO), Skip / Unskip for their whole entry, and their clips below. Per-person rewordings are listed under the item.
  - **Person view:** the same cards, just that person's row.
- **B-roll:** a row per channel, each with an Add clip button (press it as often as you like) and its clips shown below once saved; each channel's clips go to that channel's b-roll folder. The shot is filmed once every channel has at least as many clips as the shoot's **B-roll variations** (each variation picks different clips). Filtered to a person, only the channels they're linked to show (shots with none are hidden). Skip covers the whole shot.
- **Sanity checks** before a clip is saved, with presets in Settings → Defaults → Clip checks:
  - Video: aspect ratio (default 9:16 vertical), resolution (default at least 1080×1920) and frame rate (default 24–60 fps, measured by playing the clip briefly; skipped if the browser can't measure it).
  - VO recordings and VO CTAs: length against the script's estimated reading time at the speech pace (default 60%–175% of it); under a second counts as empty.
  - Anything off shows the problems and asks **Save anyway** or cancel. The clip card shows what was measured (e.g. `1080×1920 · 9:16 · 30 fps` or `0:42 · script ~0:38`) and how many checks failed.
- **Every phone sees every clip.** A clip added on one phone ticks its slot off on every other phone straight away ("Added", with whose phone it's on), so nobody films the same thing twice. Adding one anyway asks first ("Already added on Joe's phone") and takes over the slot. B-roll counts come from which slots have footage on any phone.
- **Clips are saved on the phone first** (IndexedDB, with persistent storage requested), so they survive reloads, closing the app and a flat battery. Nothing uploads automatically. Once the shoot is ended, anyone presses **Upload all phones** in the checklist (`shoots.upload_requested_at` / `upload_requested_by`); every phone with the checklist open, or that opens it later, then uploads its own clips by itself, one at a time with progress (keep the app open). Each clip is deleted from the phone once its upload is confirmed. The checklist lists each phone's progress (e.g. Joe 3/7 uploaded) from `shoot_clips`. Failed uploads stay on the phone and **Try again** retries them.
- **Live on every phone:** `shoots`, `shoot_items`, `broll_shots` and `shoot_clips` are on Supabase Realtime, so ticks, skips, b-roll counts, starting/ending and the upload request show without reloading; coming back to the app reloads the checklist (iOS drops the connection in the background).
- Until Dropbox is connected (§12) uploads run in **test mode**: the upload is simulated and the clip is labelled "test mode, not really sent".
- No notes: every clip is treated as the final take. No print view.
- When everything is ticked off, a toast offers to end the shoot.

### b) CSV

One row per shoot item and b-roll shot (a shared shot gets a row per channel): `shoot, person, kind, code, channel, angle, cta_mode, location, script, status, raw_path`, where `raw_path` is where the clip is uploaded: the file (without extension) for hooks, VOs and CTAs, the folder for b-roll. For VOs, beats joined as `[problem] … [product] … [result] …`.

### c) The plan (in `manifest.json`)

The contract with the future worker. Download from the shoot page. Skipped items and shots are left out.

```json
{
  "schema_version": 1,
  "shoot": {
    "code": "S014",
    "date": "2026-10-20",
    "brand": { "name": "PawCo", "slug": "pawco" },
    "product": { "name": "Calming Chews", "slug": "calming-chews" },
    "broll_variations": 3, "vo_variations": 1,
    "submission_rate": 0.15,
    "slot_values": { "benefit": "calmer walks" }
  },
  "people": [{ "slug": "joe", "name": "Joe", "channels": ["topdognix"] }],
  "channels": [{ "slug": "topdognix", "folder_slug": "nix", "dogs": ["nix"] }],
  "formats": [{ "code": "F02", "cta_modes": ["sync", "vo"], "beats": ["problem", "product", "result"] }],
  "items": [
    {
      "code": "H01", "kind": "hook", "person": "joe", "channel": null,
      "template_id": "uuid", "angle": "curiosity",
      "script": "Nobody told me Calming Chews could do this…",
      "caption": "…",
      "file": "pawco/calming-chews/shoots/S014/edited/hooks/joe/H01",
      "raw_file": "pawco/calming-chews/shoots/S014/raw/hooks/joe/H01"
    },
    {
      "code": "V01", "kind": "body", "person": "joe", "channel": null,
      "template_id": "uuid", "format": "F02", "angle": "problem",
      "beats": [
        { "beat": "problem", "script": "…" },
        { "beat": "product", "script": "…" },
        { "beat": "result", "script": "…" }
      ],
      "file": "pawco/calming-chews/shoots/S014/edited/vo/joe/V01",
      "raw_file": "pawco/calming-chews/shoots/S014/raw/vo/joe/V01"
    },
    {
      "code": "C01", "kind": "cta", "person": "joe", "channel": null,
      "template_id": "uuid", "cta_mode": "sync", "script": "…",
      "file": "pawco/calming-chews/shoots/S014/edited/ctas/joe/C01",
      "raw_file": "pawco/calming-chews/shoots/S014/raw/ctas/joe/C01"
    }
  ],
  "broll": [
    {
      "channel": "topdognix", "general": false, "beat": "problem", "description": "anxious pacing",
      "folder": "pawco/calming-chews/shoots/S014/edited/b-roll/nix/problem",
      "raw_folder": "pawco/calming-chews/shoots/S014/raw/b-roll/nix/problem"
    }
  ]
}
```

Items: `file` is the edited clip (what the worker reads) and `raw_file` where Muttiplier uploads it, both without extension (the extension can differ between them). B-roll: `folder` / `raw_folder`, holding loose clips under their own names; `broll` has one entry per shot per channel (a shared shot is listed for every channel), `general` marks general product shots. `people[].channels` lists the channels a person is linked to; recipes on those channels can mix their linked people's parts. `formats[].cta_modes` is legacy and can be ignored.

### d) Folder skeleton (zip)

Download a zip of empty folders (each with a `.keep` file) plus the plan's `manifest.json`, to unzip into the Dropbox `UGC/` root folder. With Dropbox connected, the same tree is created directly in Dropbox instead (§12).

Everything from a shoot lives in its shoot folder, and everything a shoot produces is split by channel first: clips, recipes and renders. `raw/` and `edited/` have exactly the same tree: Muttiplier only uploads to `raw/`; editors edit each clip and put it in the same place under `edited/`.

```
UGC/
  [brand]/[product]/
    shoots/[S###]/                         named by the shoot code
      manifest.json                        the plan; the full index of every clip once ready for batching
      raw/
        [channel]/                         topdognix/, topdogwhiskey/, topdogsiblings/: split by channel first
          hooks/[person]/H##.mov           one file per hook, named by code, captions alongside (H##.srt)
          vo/[person]/[beat]/V##.mov       a VO filmed beat by beat, a folder per beat as in b-roll:
                                           problem/V01.mov, product/V01.mov…
          ctas/[person]/C##.mov
          b-roll/[beat]/                   the channel's own b-roll, loose under the clips' own names;
                                           beats filed by name across formats. Generic: any VO
          b-roll/[beat]/[feature]/         b-roll for one product feature (its slug): only under
                                           VOs about that feature
          b-roll/general/                  general product shots (a feature folder works here too)
      edited/                              same tree as raw/
      batches/                             B01.json, B01.csv… (recipe references, grouped by channel)
      recipes.json                         every valid recipe, grouped by channel
      renders/
        B01/                               one folder per batch
          [channel]/[recipe id].mp4        each recipe's video, in its channel's folder
          report.json                      the stitcher's run report, entries grouped by channel
```

- **Hooks, VOs and CTAs are files named by code**, keeping their own extension. Re-adding one replaces the file. Editors save the edited clip under the same name in `edited/` (the extension can differ).
- **Captions** sit next to their clip under the same name (e.g. `H01.srt` beside `H01.mov`, `problem/V01.srt` beside `problem/V01.mov`), in `raw/` and `edited/` alike; there's no separate captions folder. Muttiplier writes them when each hook, CTA and VO beat uploads: the script that was read, split into short lines (sentence breaks, at most ~32 characters / 6 words) and timed across the clip's measured length in proportion to each line's length. Editors polish them into `edited/`.
- **B-roll** is per shoot and loose: any clip in a beat folder can go under any VO with that beat, so clips keep their own names and a clash gets a number rather than overwriting. Beats are filed by name, so the same beat in two formats (e.g. `product`) shares a folder; general product shots go in `general/`. `shared` stands in for the channel only when a shoot has no channels.

All slugs lowercase kebab-case; generate once and never change after a shoot is planned.

---

## 11. AI drafting

Server routes calling the Anthropic API (`ANTHROPIC_MODEL`, default `claude-opus-5-5`). Every generation produces **drafts** a person approves before saving; nothing writes to the Library automatically. Refusals and invalid output are reported, not saved.

- **Hook drafts:** given an angle and optional tags, generate N hooks in slot syntax, each with a suggested caption.
- **VO drafts:** given a format (and its beat descriptions) and an angle, generate a beat-structured VO script.
- **CTA drafts:** given a mode (sync/vo), generate CTAs.
- **Per-person rewording:** in the planner, reword a hook, VO or CTA for each person (saved as `script_override`), so cast members don't say identical lines.
- **B-roll generation:** in the planner, suggest shots for every planned format's beats and the general product section, using the brand, product, format and beat descriptions, with the format's own suggestions as examples.
- Respect the product's `claims_forbidden` when generating with a product selected.

---

## 12. Dropbox uploads

Goal: clips go straight from the shoot into the right Dropbox folders (§10d), so nobody sorts footage by hand.

- **One connection for the team**, to a personal Dropbox for now. A Dropbox app (App Console: scoped access, Full Dropbox, `files.metadata.*` and `files.content.*` scopes) with `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` in the env and redirect URIs `<origin>/api/dropbox/callback` (production and `http://localhost:3000`).
- **Settings → Dropbox** (admins): **Connect Dropbox** signs in on Dropbox (`token_access_type=offline`) and comes back connected; **Choose folder** browses the Dropbox to pick the root folder everything goes under (default `/UGC`); **Disconnect** revokes and forgets it.
- **`dropbox_connection`** (singleton): account id / name / email, `root`, and the refresh token **encrypted by the server** (AES-GCM, key derived from `DROPBOX_APP_SECRET`), so reading the row gives nobody Dropbox access. Readable by allowlisted users; written by admins.
- **Server routes** (`/api/dropbox/…`): `connect`, `callback`, `status`, `folders` (admins), `disconnect` (admins), and `token`, which hands a signed-in, allowlisted phone a short-lived access token (about 4 hours). The refresh token never leaves the server.
- **Uploads go from the phone straight to Dropbox** (not through Vercel), into `<root>/<path>` (§10d), in 8 MB pieces through an upload session (one request for small files), each piece retried on dropped connections, rate limits and server errors; an expired token is renewed. Hooks, VOs and CTAs overwrite (re-added clips replace the file); b-roll is added with autorename, never overwriting. Dropbox creates missing folders on upload.
- Uploading is triggered from the checklist once the shoot is ended (**Upload all phones**, §10a). Until Dropbox is connected, uploads run in test mode.
- **The shoot's whole tree is built in Dropbox** (`/api/dropbox/tree`): every clip folder under `raw/` and `edited/`, `renders/`, and the current `shootsheet.json` (overwritten each time so it matches the plan). It runs when a shoot is marked as planned, at the start of every Upload all phones, and from **Export → Create folders in Dropbox**. Folders are created with autorename off, so ones that already exist are left exactly as they are and only missing ones are added; safe to run again and again. Not for drafts, whose codes can still change. The skeleton zip still works without Dropbox.

---

## 12b. Ready for batching and the manifest

Once a shoot is **filmed** and the editors have put every clip in `edited/`, the shoot page shows **Edits in? Get it ready for batching**.

- **Check edits** (runs in the browser, talking to Dropbox directly so a big shoot isn't cut short): lists `raw/` and `edited/` and checks that every filmed take is in both, named by its code (a VO beat by beat, in its beat's folder: `problem/V01`), a video (every take is filmed, VOs included; an audio file in a take's place is a problem); that `edited/` mirrors `raw/` clip for clip (same folders and names; extensions can differ); that no clips are still on phones; and reads every edited clip's **length** from the start of the file (MP4 / MOV from the movie header; anything unreadable is a problem). Any problem blocks the next step.
- **Mark ready for batching** writes the **manifest** and sets the shoot to `edited`, shown as **Ready for batching**. **Refresh manifest** later re-checks and writes a new version; **Not ready** goes back to filmed.
- **The manifest** (`manifest.json` in the shoot folder, and a copy in `shoot_manifests` with a version number) indexes every clip once, so batching and later tools never re-read Dropbox: the plan (shoot, people, channels, formats, items, b-roll shots), and for every take its kind, channel, person, code, beat (VOs), format, CTA mode, angle, the script read, its `edited/` and `raw/` file, its caption file and its length; for every b-roll clip its channel, beat folder (or `general`), the shot it was filmed for (from the checklist's upload records, matched by name) and whether the product is visible (from the shot; a clip in `general/` counts as a product shot). Until then, `manifest.json` holds just the plan (version 0, no clips).

### Recipes and batches

Once a shoot is ready for batching, the shoot page shows **Batches**, working from the latest manifest (no Dropbox reads; it only writes the results).

**A valid recipe** (`shared/utils/recipes.ts`):

- Exactly **Hook → VO → CTA**: one hook (on camera, its own sync audio), one VO (every beat, b-roll underneath; filmed on camera, but only its sound is used unless a treatment shows the speaker; the VO is the spine and sets the body's length) and one CTA (sync, or VO over b-roll). Any CTA follows any VO.
- **One person and one channel throughout**: the person's hook, VO and CTA filmed for that channel (people only film for channels they're linked to). Never across people or channels; never across shoots.
- **Linked VOs**: a VO linked to hooks and/or CTAs (`hooks` / `ctas` on its items in the plan and its clips in the manifest, as codes; null = any) only goes with those. The calculator counts it the same way and warns when none of its links are on the shoot.
- **Mixed VOs**: a VO cast on several people (`vo_cast`) is performed by each of them; on a channel where two or more of them recorded every beat, up to `vo_variations` mixes are made, each taking every beat from one of them but never all from one person (picked in a fixed order). A mixed recipe's hook and CTA come from anyone on that channel; `person` lists everyone in it (`joe+sam`), `mixed` is true, and each beat, the hook and the CTA say whose they are. Solo recipes are made as well.
- **B-roll variations**: each hook + VO + CTA gets up to `broll_variations` b-roll selections, each its own recipe (the first keeps the seed recipes always had; later ones stop when the b-roll can't give a different selection).
- **B-roll per beat**: covered by that channel's clips filed under the beat (beats are filed by name across formats): its generic clips plus any filed for the feature the VO is about (`b-roll/<beat>/<feature>/`; other features' b-roll is never used), added clip by clip in a fixed order until their combined length covers the beat's recording; **general product shots** top a beat up only when its own clips run short. Never looped or slowed: a beat that can't be covered makes the recipe invalid. **No clip repeats** within one video. A **VO CTA** is covered the same way, product shots first.
- Every clip must be in the manifest with a length. The stitcher trims (evenly, proportionally, head and tail; ~1.2 s minimum) and offsets the per-clip captions; hook, VO and CTA clips are never trimmed.
- **Recipe IDs are deterministic**: `S001_topdognix_joe_H01_V02_C01_<hash of the b-roll picks>`, or for a mixed VO `S001_topdognix_mix_joe-H01_V02-joe.sam.joe_sam-C01_<hash>` (whose hook, whose beat in order, whose CTA). The same inputs give the same ID, which is also the render's file name.

**Batches** (Best in Show; a batch is what gets rendered and submitted to the brand):

- **Size** = the shoot's batch size (default 5%) × all valid recipes, at least one.
- **No two recipes in a batch share a hook + VO pair** (a shared hook is fine), so b-roll variations of one recipe go in later batches. A mixed VO is its own VO here, and mixed recipes count as one more "person" when spreading picks.
- **Spread**: each pick is the recipe whose person, then format, then angle has been used least so far, so every person and format appears before any repeats; parts rated good are favoured; CTAs and b-roll only break ties.
- **Never batch a recipe ID twice** (`shoot_shortlists.entry_ids`), and leave out recipes with a part rated bad.
- **Ratings**: once ready for batching, each person's hooks, VOs and CTAs can be marked good or bad ("What worked"; stored on their items for every channel).
- **Files**: `recipes.json` (every valid recipe, with its b-roll per beat and the manifest version, sorted by channel then ID), `batches/B01.json` (the recipe IDs grouped by channel, in pick order within each, with the manifest version; plus `B01.csv` for people, in the same order) and an empty `renders/B01/<channel>/` for each channel in the batch. The stitcher renders each recipe to `renders/B01/<channel>/<recipe id>.mp4` from `edited/` (`<channel>` is the recipe's `channel`) and writes `renders/B01/report.json`.

## 13. Build phases and acceptance criteria

**Phase 0 — Foundation** ✔
- Nuxt + Nuxt UI app, Supabase connected, Google sign-in, allowlist enforced, admin seeded, RLS on all tables.
- ✅ A non-allowlisted Google account cannot see any data.

**Phase 1 — Reference data** ✔
- Settings: people (linked users, channels), channels, allowlist, defaults. Brands: brands with Trybe deal, CSV import, filters, products with slot values, brand → channel assignment.
- ✅ Can create a brand, a product with custom slots, and assign channels.

**Phase 2 — Library** ✔
- CRUD for formats & VOs, hooks, CTAs, angles; slot highlighting; live preview; archive; usage counts; duplicate; seeded starter library.
- ✅ Preview flags unfilled slots.

**Phase 3 — Shoot planner** ✔
- General / Formats / Hooks / VOs / CTAs / B-roll tabs under a summary panel, VOs written in the shoot, shared shot list, auto codes, inline overrides, b-roll from format suggestions, status flow including back to draft, start/end/resume.
- ✅ Editing a template after a shoot is planned does not change that shoot's scripts.

**Phase 4 — Calculator** ✔
- Live panel per §9, including linked-people mixing, time estimates, runway, charts and warnings.
- ✅ The §9 test case produces 40,500 recipes / 6,075 submissions.

**Phase 5 — Checklist and exports** ✔
- Checklist (mobile, live ticks, filters, per-clip b-roll), CSV, `shootsheet.json`, folder skeleton zip.
- ✅ Unzipping the skeleton gives the folder of every clip in `shootsheet.json`, under both `raw/` and `edited/`, plus the shoot's `renders/`.

**Phase 6 — AI drafting** ✔ per §11.

**Phase 7 — Dropbox uploads** per §12, once the open questions are answered.

---

## 14. Conventions

- TypeScript throughout; Supabase types in `shared/types/database.types.ts`.
- Database changes as SQL migrations in the repo (`supabase/migrations`).
- Pure, unit-tested modules in `shared/utils/` (Vitest, `tests/`), shared by the UI and server routes:
  - `calculator.ts` — recipes, submissions, time, runway
  - `slots.ts` — slot rendering, VO length estimate
  - `shootsheet.ts` — shot list grouping, folders, CSV, `shootsheet.json`, skeleton
  - `brandImport.ts` — Scrybe CSV parsing and import planning
- No hard deletes on library or shoot data; archive instead. (Removing items from a draft shoot is allowed.)

## 15. Out of scope (later projects)

- Local worker (Windows now, VPS later): ingest, auto-tagging, conformance checks, caption alignment, recipe generation, selection, rendering.
- Submission queue and form-filling Chrome extension (linked to Dropbox).
- Performance tracking per template / angle once brand data is known.
- Interactive checklist ideas beyond ticking (parked).
