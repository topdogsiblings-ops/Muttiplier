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
| **Library** | Hooks, CTAs, **Formats & VOs**, Angles |
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
- Custom slots (e.g. `{{benefit}}`, `{{price}}`, `{{offer}}`) are filled from the product's `slot_values`.
- The script editor lists the available slots, and highlights recognised vs unrecognised slots as you type.
- Unfilled slots are flagged in previews and block "Mark as planned".
- On a draft shoot, a **Fill in slots** section in the planner lists every unfilled slot with the codes that use it (hooks and CTAs first). Custom slots are typed in there and saved to the product's `slot_values`, so its later shoots have them too; `{{dog}}` asks for the dog phrase of each channel on the shoot that has none (admins, saved to the channel). A line can still be overridden instead.

### Rules

- **Universal hooks** (`is_universal = true`) work for any brand: they may only use `{{dog}}`. Enforced in the editor and by a database check. On a shoot they get `U` codes and are filed like any other hook, by code (§10d).
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
- `default_submission_rate numeric default 0.15`
- `minutes_per_hook numeric default 4.5`
- `minutes_per_cta_sync numeric default 3`
- `minutes_per_vo numeric default 9`
- `minutes_per_cta_vo numeric default 3`
- `productive_hours_per_day numeric default 6`
- `words_per_second numeric default 2.5` — speech pace for estimating VO length
- `general_broll jsonb default '[]'` — suggested general product shots: `[{ "description": "...", "product_visible": true }]`
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
- `slot_values jsonb` — e.g. `{"benefit": "calmer walks", "offer": "20% off"}`
- `claims_allowed text`, `claims_forbidden text`, `notes text`

### Library

**formats** — the structure of a video
- `code text unique` (e.g. `F01`), `name text`, `description text`
- `beats text[] default '{problem,product,result}'`
- `beat_descriptions jsonb` — beat → what that beat is for (shown as `?` help in the planner)
- `beat_broll jsonb` — beat → suggested b-roll shots, `[{ "description", "product_visible" }]`; edited on the format, offered in the planner
- `target_seconds int`
- `cta_modes text[]` — legacy, no longer used: any CTA can follow any VO

**body_templates** — VO scripts, each belonging to a format
- `format_id`, `title text`, `angle_id`
- `beats jsonb` — ordered array: `[{ "beat": "problem", "script": "..." }, ...]`; beat names must match the format's `beats`
- `est_seconds int` — **computed** from the word count ÷ `settings.words_per_second`, not typed in
- `tags text[]`, `notes text`
- `person_id` — optional: the person on the cast who wrote it. Only they perform it on a shoot; null = anyone can.

**body_template_products** — `body_template_id`, `product_id`, pk on both. The products a VO is written for; none = universal (offered for every product).

**hook_templates**
- `script text`, `angle_id`, `is_universal boolean default false`, `est_seconds int`, `tags text[]`, `notes text`
- `filming_notes text` — how to film it (shown on the checklist)
- `caption text` — suggested on-screen caption (may use slots)

**cta_templates**
- `script text`, `mode text check (mode in ('sync','vo'))`, `est_seconds int`, `tags text[]`, `notes text`

**template_usage** (view) — `kind`, `template_id`, `shoot_count`, for "used in N shoots".

### Planner

**shoots**
- `code text unique` — auto-assigned sequential `S001`, `S002`, …
- `product_id`, `shoot_date date`, `location_notes text`, `notes text`
- `status text check (status in ('draft','planned','shooting','filmed','edited','ingested','rendering','done'))` — this app sets `draft` → `planned` → `shooting` → `filmed` (and back, §9); later stages are reserved for the worker
- `started_at`, `started_by`, `ended_at`, `ended_by` — stamped by trigger on status changes only
- `broll_variations int default 3` — b-roll arrangements per VO used in recipe estimates
- `submission_rate numeric` — defaults from settings
- `runway_target int default 60` — target submissions per channel per month, for runway
- `kit text check (kit in ('audition','scale','custom'))` — a tag for the shoot only; it changes nothing
- `hook_allocation text default 'shared'` — legacy; hooks are always shared across channels

**shoot_people** — `shoot_id`, `person_id`, pk on both
**shoot_channels** — `shoot_id`, `channel_id`, pk on both. Default: the product's brand's `brand_channels`.
**shoot_formats** — `shoot_id`, `format_id`, pk on both. Formats added to the plan (VOs and b-roll follow them).

**shoot_items** — one row per person per thing to film or record
- `shoot_id`, `person_id`
- `kind text check (kind in ('hook','body','cta'))`
- `hook_template_id` / `body_template_id` / `cta_template_id` (exactly one set, matching `kind`)
- `code text` — shared per template within a shoot: everyone filming the same hook has the same code. Hooks `H01…`, VOs `V01…`, CTAs `C01…`, universal hooks `U01…`. Unique on (`shoot_id`, `person_id`, `code`), deferrable for renumbering.
- `channel_id` — null (hooks are used for every channel); kept for older rows
- `script_snapshot` — `text` for hooks/CTAs, `jsonb` beats for VOs: the template at plan time
- `script_override` — same type, nullable: per-person rewording; takes priority over the snapshot
- `caption text` — hooks only: the template's caption, snapshotted
- `cta_mode text` (copied from template for CTAs), `location text`
- `status text check (status in ('planned','filmed','skipped')) default 'planned'`, `sort_order int`
- `take_notes text` — legacy, no longer shown (every clip is the final take)

Snapshots matter: editing a template later must never change a shoot that's already planned.

**broll_shots** — b-roll shot list; every channel films its own clips of each shot
- `shoot_id`, `format_id` (null = general product shots), `beat text`, `description text`, `product_visible boolean`
- `min_clips int` — clips required **per channel** (a shot with no `channel_id` is filmed for every channel on the shoot); `clips_filmed int` — clips saved on set, across all channels
- `status text check (status in ('planned','filmed','skipped'))` — `filmed` once `clips_filmed ≥ min_clips × channels`
- `channel_id` — null; kept for older channel-specific rows
- `sort_order int`

**shoot_clips** — one row per deliverable with footage on some phone: a shoot item (`item:<id>`) or one required b-roll clip for one channel (`broll:<shot>:<channel>:<n>`)
- `shoot_id`, `target text`, unique on both; `file_name`, `size`, `state` (`saved` | `uploaded`), `path` (in Dropbox, once uploaded); `created_by` = whose phone it's on
- Live over Supabase Realtime, so every phone sees a clip as soon as it's added anywhere. The clip itself stays on the phone that added it until it's uploaded.

### Reserved for later (do not build yet; keep names free)

`clips`, `recipes`, `jobs`, `submissions`, `template_stats`.

---

## 7. Library tab

Tabs: **Hooks, CTAs, Formats & VOs, Angles**.

- List view with search, filters (angle, tags, universal, CTA mode, archived) and sort; paginated.
- Tags input autocompletes from tags already used in the Library.
- Create / edit drawer:
  - Script editor with slot palette and slot highlighting.
  - Live preview: pick a product + channel → rendered script with slots filled; unfilled slots flagged.
  - Hooks: filming notes and suggested caption.
  - Validation rules from §5.
- **Formats & VOs:** one collapsible panel per format (description, beats) listing its VOs, with **Add VO** inside the format. The format editor edits beats, each beat's description and its suggested b-roll shots. The VO editor has one block per beat and shows the estimated length (computed). Each VO can be given a writer from the cast (defaults to the signed-in user's person, so cast members can write their own) and products (none = universal); the list shows both and filters by writer.
- Archive / unarchive (with confirm). No hard delete if referenced by a shoot.
- Usage count per template ("used in 4 shoots").
- Duplicate action.
- **AI drafts** (§11) for hooks (with captions), VOs and CTAs.
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

Single page with a scrollable **calculator panel** (right side on desktop, drawer on mobile) that updates live. Four sections, each collapsible and each with a **Clear** action (confirmed):

1. **Setup:** product, date, location, people (add/remove; any active person), channels (default from the brand), b-roll variations per VO, submission rate, runway target, kit tag.
2. **Formats:** add or remove formats on the plan. Removing a format (confirmed) also removes its VOs and its b-roll.
3. **Structure:** one shared shot list that **everyone films together**, one by one:
   - **Hooks** — used for every channel (no per-channel split).
   - **Formats & VOs** — one collapsible panel per planned format, with an "Add F01 VOs" picker limited to that format. The picker only offers VOs that are universal or for the shoot's product, and written by anyone or by someone on the shoot. A VO with a writer goes on the shot list for that person only.
   - **CTAs.**
   - Every item shows its rendered script (slots filled; `{{dog}}` per §5). One **Edit** menu per line: **For everyone** rewrites the shoot's own copy of a line (every person's snapshot) for this shoot only; the library isn't touched and per-person overrides stay on top. **Permanently** (hooks and CTAs) edits the Library template for later shoots and updates this shoot's copy to match (a planned shoot's copy with slots filled); other shoots keep their own copy, and universal hooks still only allow `{{dog}}`. **Per person** opens each person's own version. Or edit a person's line inline to create a per-person override, or use AI to reword it per person. Captions on hooks are snapshotted.
4. **B-roll:** one collapsible panel per planned format (name, description, clip count), a section per beat with its `?` description, plus **General product shots** (suggestions from Settings). Suggested shots can be added one at a time, per beat ("Add this beat's") or for the whole format ("Add all suggestions"), or written by hand; **Generate b-roll** asks the AI for shots for every section based on the brand, product, formats and beat descriptions. Each shot has `product_visible` and `min_clips`.

- **Codes:** assigned automatically when items are added (H/V/C/U, sequential within the shoot, shared per template). **Re-number** closes gaps while in draft.
- **Status:**
  - Draft → **Planned** (confirm dialog; blocked by unfilled slots; freezes codes and snapshots, enables the checklist and exports).
  - Planned → **Back to draft** to keep editing.
  - Shooting or filmed → **Revert** (confirmed) to planned, as if the shoot never started (`public.revert_shoot`, then the app removes the `shoot_clips` rows): every tick and skip cleared, b-roll counts back to zero, the clip records and the upload request removed, the start / end stamps cleared and `shoots.reverted_at` set. Phones drop clips they saved before `reverted_at`. Anything already uploaded to Dropbox stays. From planned it can then go back to draft.
  - Planned → **Shooting** (Start shoot, or automatically on the first tick) → **Filmed** (End shoot; asks first if shots are still unticked).
  - Filmed → **Resume shoot**, when shots are still unticked. A resumed shoot keeps its original start time.
  - Elapsed time is shown while shooting and once ended.

### Calculator (live)

Definitions, per person *p* and channel *c* in the shoot (skipped items are ignored):

- `H(p)` = *p*'s hooks (every hook is used on every channel)
- `B(p)`, `C(p)` = *p*'s VOs and CTAs. Any CTA can follow any VO.
- `V` = `broll_variations`
- `L(c)` = people on the shoot linked to channel *c* (§6 `person_channels`)

```
if L(c) is empty (same-person rule):
  recipes(p,c) = H(p) × B(p) × C(p) × V
if L(c) is not empty (mixed):
  recipes(p,c) = H(p) × [Σ over q in L(c) of B(q)] × [Σ over q in L(c) of C(q)] × V   for p in L(c), else 0
  (credited to p, whose hook opens the recipe)
recipes(c)   = Σ over p of recipes(p,c)
recipes      = Σ over c of recipes(c)
submissions  = round(recipes × submission_rate)          (also shown per channel)
concepts(p,c)= H(p) × number of VOs available to p on c   (distinct hook×VO pairs)
```

Time estimates (from settings). Everyone films on their own phone at the same time, so the shoot is as long as the busiest person:

```
on_camera_min(p) = hooks(p) × minutes_per_hook + sync_ctas(p) × minutes_per_cta_sync
vo_min(p)        = vos(p) × minutes_per_vo + vo_ctas(p) × minutes_per_cta_vo
shoot_days       = max over p of on_camera_min(p) / 60 / productive_hours_per_day   (rounded up to 0.5)
```

Panel shows:

- **Per channel:** donut chart of estimated submissions with a legend table (share, recipes, runway).
- **Per person:** stacked bars of on-camera vs VO time, plus clips, recipes and concepts.
- **Totals:** clips, recipes, estimated submissions, on-camera hours, VO hours, shoot days, b-roll clips.
- **Runway:** months of supply per channel at the shoot's `runway_target`.
- **Warnings:** someone (or a mixed channel) has VOs but no CTAs; unfilled slots.

Chart colours use a fixed, colour-blind-checked categorical palette (`--chart-1…8`, separate light/dark values); every chart also shows its values as text.

Test case (3 people, 3 channels, no linked people, each person with 30 hooks, 10 VOs, 5 CTAs, V = 3): recipes per channel = 3 × (30 × 10 × 5 × 3) = 13,500; total = 40,500; submissions at 15% = 6,075.

---

## 10. Checklist and exports (available once a shoot is Planned)

### a) Checklist (on set)

Route: `/shoots/[code]/sheet?person=[slug]&show=[hook|cta|body|broll]`. Both filters are optional and combine (e.g. one person's CTAs); the URL can be shared. A signed-in user linked to a person opens on their own shots.

- Mobile-first, large tap targets. Updates save immediately.
- Header: shoot, product, brand, date, elapsed time, progress for what's showing, Start / End / Resume.
- Sections: **Hooks** (used for every channel), **CTAs**, **VOs** (recorded off set), then **B-roll** by beat.
- Each item: code, rendered script (VOs by beat), angle, location, and filming notes ("How to film").
- **Every deliverable gets its clip from the checklist** with **Add clip**, which picks a video (hooks, sync CTAs, b-roll) or audio file (VOs, VO CTAs) from the phone, for its folder (§10d). Clips are filmed and recorded in the phone's own apps; the app doesn't film or record itself, because iOS compresses video its camera hands straight to a web page (to 480×360). **Only a saved clip ticks it off**; nothing can be ticked by hand. Removing the clip unticks it. Skip / unskip stays manual.
  - **Everyone view:** the item once, with a status chip per person (tap to skip/unskip) each with its own Add clip button; added clips show below with the person's name. Per-person rewordings are listed under the item.
  - **Person view:** a status tick with Skip underneath; Add clip in the item's top row (next to the code and badges); the attached clip below the script.
- **B-roll:** a row per channel, each with one Add clip button per required clip (`min_clips`) and its clips shown below once saved; each channel's clips go to that channel's b-roll folder. The shot is filmed once every channel's clips are in. Filtered to a person, only the channels they're linked to show (shots with none are hidden). Skip covers the whole shot.
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

### c) `shootsheet.json`

The contract with the future worker. Download from the shoot page. Skipped items and shots are left out.

```json
{
  "schema_version": 1,
  "shoot": {
    "code": "S014",
    "date": "2026-10-20",
    "brand": { "name": "PawCo", "slug": "pawco" },
    "product": { "name": "Calming Chews", "slug": "calming-chews", "slot_values": {} },
    "hook_allocation": "shared",
    "broll_variations": 3,
    "submission_rate": 0.15
  },
  "people": [{ "slug": "joe", "name": "Joe", "channels": ["topdognix"] }],
  "channels": [{ "slug": "topdognix", "folder_slug": "nix", "dogs": ["nix"] }],
  "formats": [{ "code": "F02", "cta_modes": ["sync", "vo"], "beats": ["problem", "product", "result"] }],
  "items": [
    {
      "code": "H01", "kind": "hook", "person": "joe", "channel": null,
      "template_id": "uuid", "angle": "curiosity", "universal": false,
      "script": "Nobody told me Calming Chews could do this…",
      "caption": "…",
      "file": "pawco/calming-chews/shoots/S014_2026-10-20/edited/hooks/joe/H01",
      "raw_file": "pawco/calming-chews/shoots/S014_2026-10-20/raw/hooks/joe/H01"
    },
    {
      "code": "V01", "kind": "body", "person": "joe", "channel": null,
      "template_id": "uuid", "format": "F02", "angle": "problem",
      "beats": [
        { "beat": "problem", "script": "…" },
        { "beat": "product", "script": "…" },
        { "beat": "result", "script": "…" }
      ],
      "file": "pawco/calming-chews/shoots/S014_2026-10-20/edited/vo/joe/V01",
      "raw_file": "pawco/calming-chews/shoots/S014_2026-10-20/raw/vo/joe/V01"
    },
    {
      "code": "C01", "kind": "cta", "person": "joe", "channel": null,
      "template_id": "uuid", "cta_mode": "sync", "script": "…",
      "file": "pawco/calming-chews/shoots/S014_2026-10-20/edited/ctas/joe/C01",
      "raw_file": "pawco/calming-chews/shoots/S014_2026-10-20/raw/ctas/joe/C01"
    }
  ],
  "broll": [
    {
      "channel": "topdognix", "general": false, "beat": "problem", "description": "anxious pacing",
      "product_visible": false, "min_clips": 3,
      "folder": "pawco/calming-chews/shoots/S014_2026-10-20/edited/b-roll/nix/problem",
      "raw_folder": "pawco/calming-chews/shoots/S014_2026-10-20/raw/b-roll/nix/problem"
    }
  ]
}
```

Items: `file` is the edited clip (what the worker reads) and `raw_file` where Muttiplier uploads it, both without extension (the extension can differ between them). B-roll: `folder` / `raw_folder`, holding loose clips under their own names; `broll` has one entry per shot per channel (a shared shot is listed for every channel), `general` marks general product shots. `people[].channels` lists the channels a person is linked to; recipes on those channels can mix their linked people's parts. `formats[].cta_modes` is legacy and can be ignored.

### d) Folder skeleton (zip)

Download a zip of empty folders (each with a `.keep` file) plus `shootsheet.json`, to unzip into the Dropbox `UGC/` root folder. §12 replaces this with direct Dropbox folder creation.

Everything from a shoot lives in its shoot folder. `raw/` and `edited/` have exactly the same tree: Muttiplier only uploads to `raw/`; editors edit each clip and put it in the same place under `edited/`.

```
UGC/
  [brand]/[product]/
    shoots/[S###_YYYY-MM-DD]/
      shootsheet.json
      raw/
        hooks/[person]/H##.mov             one file per hook, named by code (universal hooks too, as U##)
        vo/[person]/V##.m4a                with its captions alongside, e.g. V##.srt
        ctas/[person]/C##.mov
        b-roll/[channel]/[beat]/           each channel's own b-roll, loose under the clips' own names;
                                           beats filed by name across formats
        b-roll/[channel]/general/          general product shots
      edited/                              same tree as raw/
      renders/                             everything rendered from this shoot
```

- **Hooks, VOs and CTAs are files named by code**, keeping their own extension. Re-adding one replaces the file. Editors save the edited clip under the same name in `edited/` (the extension can differ).
- **Captions** sit next to their clip under the same name (e.g. `V01.srt` beside `V01.m4a`), in `raw/` and `edited/` alike; there's no separate captions folder.
- **B-roll** is per shoot and loose: any clip in a beat folder can go under any VO with that beat, so clips keep their own names and a clash gets a number rather than overwriting. Beats are filed by name, so the same beat in two formats (e.g. `product`) shares a folder; general product shots go in `general/`. `shared` stands in for the channel only when a shoot has no channels.

All slugs lowercase kebab-case; generate once and never change after a shoot is planned.

---

## 11. AI drafting

Server routes calling the Anthropic API (`ANTHROPIC_MODEL`, default `claude-opus-5-5`). Every generation produces **drafts** a person approves before saving; nothing writes to the Library automatically. Refusals and invalid output are reported, not saved.

- **Hook drafts:** given an angle and optional tags, generate N brand-agnostic hooks in slot syntax, each with a suggested caption. Universal hook drafts that use any slot other than `{{dog}}` are dropped.
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
- Later, maybe: create a shoot's whole tree (raw and edited) in Dropbox when it's planned, instead of the skeleton zip.

---

## 13. Build phases and acceptance criteria

**Phase 0 — Foundation** ✔
- Nuxt + Nuxt UI app, Supabase connected, Google sign-in, allowlist enforced, admin seeded, RLS on all tables.
- ✅ A non-allowlisted Google account cannot see any data.

**Phase 1 — Reference data** ✔
- Settings: people (linked users, channels), channels, allowlist, defaults. Brands: brands with Trybe deal, CSV import, filters, products with slot values, brand → channel assignment.
- ✅ Can create a brand, a product with custom slots, and assign channels.

**Phase 2 — Library** ✔
- CRUD for formats & VOs, hooks, CTAs, angles; slot highlighting; live preview; universal validation; archive; usage counts; duplicate; seeded starter library.
- ✅ A universal hook containing `{{brand}}` cannot be saved. Preview flags unfilled slots.

**Phase 3 — Shoot planner** ✔
- Setup / Formats / Structure / B-roll, shared shot list, auto codes, inline overrides, b-roll from format suggestions, status flow including back to draft, start/end/resume.
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
  - `slots.ts` — slot rendering, universal-hook rule, VO length estimate
  - `shootsheet.ts` — shot list grouping, folders, CSV, `shootsheet.json`, skeleton
  - `brandImport.ts` — Scrybe CSV parsing and import planning
- No hard deletes on library or shoot data; archive instead. (Removing items from a draft shoot is allowed.)

## 15. Out of scope (later projects)

- Local worker (Windows now, VPS later): ingest, auto-tagging, conformance checks, caption alignment, recipe generation, selection, rendering.
- Submission queue and form-filling Chrome extension (linked to Dropbox).
- Performance tracking per template / angle once brand data is known.
- Interactive checklist ideas beyond ticking (parked).
