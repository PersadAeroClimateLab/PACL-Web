# Build Spec — Persad Aero-Climate Lab Website

Prototype brief for a coding agent. Read this together with
`PROJECT_SUMMARY.md` (project history and approved copy), the existing
`*.html` files (current markup, real content), and `README.md` (deployment
notes). Where this spec and those files disagree, this spec wins.

---

## 1. What you are building

A static site for the Persad Aero-Climate Lab at UT Austin, replacing a Wix
site at `ggpersad.com`. Jekyll source lives in one GitHub repository and is
built by GitHub Pages' own Jekyll pipeline. No CI, no bundler, no framework.

Deliver a working prototype, not a finished site. Several pages have no real
content yet; build the structure and styling so content can be dropped in
later without touching markup.

### Definition of done for the prototype

- `bundle exec jekyll serve` renders all seven pages with working nav.
- Home page has the aerosol hero (§5) and the news panel, both driven by data
  files, not hardcoded markup.
- People page renders from `_data/people.yml`, matching the content currently
  hardcoded in `people.html`.
- News renders from `_data/news.yml` plus a `news.html` archive page.
- Every page is legible and correctly laid out at 375px and 1440px.
- The site builds clean with the `github-pages` gem (no unsupported plugins).
- `docs/DEVELOPMENT.md` and an updated `README.md` exist (§9).
- You have screenshotted the home page at both widths with `tools/shot.py`
  and looked at the result before declaring done.

---

## 2. Hard constraints

1. **Source lives only in the GitHub repo.** No external CMS, no build
   artifacts committed, no third-party services at runtime except Google
   Fonts (already in use).
2. **Content must be editable from the GitHub web editor** by someone with no
   git or web experience. That means Markdown and YAML, never HTML, for
   anything that changes often: news, people, openings, publications, course
   listings, contact details.
3. **Style and behavior are code.** CSS and JS live in `assets/` and are
   maintained by an agent or developer, not edited casually. It is fine for
   those files to be harder to edit than the content files.
4. **Docker is the development environment.** Ruby, Bundler and the pinned
   `github-pages` gem set live in an image, not on the host, so the build is
   the same on every machine and in the agent sandbox. Keep it small: one
   `compose.yml`, one short `Dockerfile`, no Makefile, no multi-stage
   pipeline, no nginx preview stage, no build-extraction step. Docker never
   gates deployment — GitHub Pages builds server-side from the repo, so a
   broken container cannot break the live site and nobody needs to build
   before pushing.
5. **Responsive, mobile and desktop.** No separate mobile site, no viewport
   hacks. One stylesheet, fluid down to 320px.
6. **No JS framework and no bundler.** Vanilla JS in small files, loaded
   directly as ES modules. At most one graphics library, for the hero only,
   and only if §5's decision gate calls for it. Vendor it into
   `assets/js/vendor/` — a CDN `<script>` is a third-party runtime dependency
   and a future 404, both of which constraint 1 rules out.

---

## 3. Stack

- **Jekyll via the `github-pages` gem.** GitHub Pages builds Jekyll natively
  on push with no Action or workflow file. Pin `gem "github-pages", group:
  :jekyll_plugins` in the `Gemfile` so local builds match the server.
- **Jekyll 3.x.** The native pipeline runs Jekyll 3, not 4. Do not use Jekyll
  4 syntax or features.
- **Allowlisted plugins only:** `jekyll-seo-tag`, `jekyll-sitemap`. Nothing
  else. A non-allowlisted plugin is silently ignored by GitHub's build and
  will make local and production output diverge. If you find yourself wanting
  one, stop and flag it rather than adding a GitHub Actions build — that
  tradeoff is the PI's call, not yours.
- **Commit `Gemfile.lock`.** GitHub's build ignores it, but it is what the
  container installs from, so it is the thing that makes two machines agree.
- `.gitignore`: `_site/`, `.jekyll-cache/`, `.jekyll-metadata`, `vendor/`.

---

## 4. Repository layout

```
_config.yml
Gemfile / Gemfile.lock
CNAME                     ggpersad.com
_data/
  news.yml                dated one-line items, newest first
  people.yml              current + past members
  nav.yml                 nav labels and paths, single source of truth
_layouts/
  default.html            head, nav, footer
  page.html               default + <main class="page"> wrapper
  home.html               default + hero
_includes/
  nav.html  footer.html  head.html
  hero-canvas.html        the <canvas> + <noscript>/static fallback
  person.html  news-item.html
_pages/ (or root .md files)
  research.md teaching.md resources.md openings.md contact.md
  people.md news.md
index.md
assets/
  css/site.css
  js/hero.js
  img/
docs/
  DEVELOPMENT.md
tools/
  shot.py                 provided, drop in as-is
README.md
```

Only `_data/*.yml` and the page Markdown files should ever need editing for a
content change. If a routine content update requires touching `_layouts/` or
`_includes/`, the content model is wrong — fix the model.

---

## 5. Design direction

The reference image is a NASA aerosol transport simulation: a dark globe with
aerosol species color-coded as luminous flows — green sulfate and organics,
violet Saharan dust, red-orange black carbon from wildfires, white sea salt
and cloud, with small white annotation labels pinned to features.

### Tokens

Keep the existing palette as the body of the site and extend it with a dark
hero and a species scale:

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#0B1D33` | nav, headings |
| `--void` | `#05070C` | hero background |
| `--paper` | `#FAFAF7` | page background |
| `--link` | `#4A6FA5` | links |
| `--quiet` | `#6B7280` | secondary text |
| `--teal` | `#2E6B6B` | active nav, dates |
| `--sulfate` | green | species accent |
| `--dust` | violet | species accent |
| `--carbon` | orange-red | species accent |
| `--salt` | pale silver | species accent |

Pick the four species hues yourself from the reference image, sampled and then
desaturated enough to sit against `--paper` without vibrating. They are a
content taxonomy, not decoration: use them as small tags for categories of
content (publications / datasets / field work / outreach, or whatever the
content actually divides into once it exists). Do not apply them to a category
until there is real content in that category. Four colors with nothing to
classify is just decoration.

Type stays Source Serif 4 (headings) + Inter (body/nav), already loaded.

### Layout

Keep the layout the current HTML already establishes — it has been reviewed
and approved. The aerosol theme lives in the hero and in small accents, not in
a redesign of the content pages. Specifically:

- Home: dark hero with the approved H1 and two lede paragraphs, the four
  research-question cards, and the Lab News panel beside them, then a
  transition into the light body.
- Interior pages: light, generous whitespace, hairline dividers, no card
  shadows.

### Motion

One orchestrated motion moment, in the hero, and nothing else. No entrance
animations on scroll, no hover transitions on every card — those read as
filler and this is a research lab site, not a product page.

The hero animation approximates aerosol transport with a 2D `<canvas>` flow
field: particles advected by simplex/Perlin noise, tinted from the species
palette, drifting slowly and looping without a visible seam. Vanilla JS,
target well under 250 lines in `assets/js/hero.js`, no library.

Requirements:

- The static hero (background color or gradient, or a still image) must be
  correct and complete on its own. The canvas layers on top.
- Do not start the loop if `prefers-reduced-motion: reduce`, or below the
  mobile breakpoint, or on `hover: none` pointers. Mobile GPUs will not thank
  you and the animation is not load-bearing.
- Pause via `IntersectionObserver` when the hero scrolls out of view, and on
  `visibilitychange`.
- Cap particle count and `devicePixelRatio`; do not allocate per frame.
- Set `window.heroReady = true` once the first real frame has drawn, so
  `tools/shot.py --wait 'window.heroReady === true'` can capture it.

#### Decision gate: 2D canvas, WebGL, or Three.js

Build the Canvas 2D version first. It is the cheapest thing that can actually
be looked at, and it may well be enough. Then judge it on screen — not in the
abstract — and escalate only if it reads as generic.

If it does, the escalation depends on what the hero becomes:

| Option | When it is right | Cost |
| --- | --- | --- |
| **Canvas 2D** | Flat drifting flow field. Default. | Zero dependencies. Softer, less luminous than the reference. |
| **`twgl.js` / `regl` + one fragment shader** | Flat field, but you want the glow and density of the reference image. | ~10KB vendored. The GLSL stays the visible part instead of drowning in setup. |
| **Raw WebGL** | Essentially never here. | ~100 lines of program-link and buffer boilerplate before one pixel draws, which fights §10 directly. |
| **Three.js** | Only if the hero becomes a slowly rotating globe. | ~150KB gzipped vendored, plus real conceptual surface area for the next maintainer. |

Three.js earns its weight for a globe — sphere geometry, camera, texture,
rotation loop — and not otherwise. A flat field rendered through Three.js is
the worst of both: a scene graph, camera and material system to draw two
triangles. If the 2D version disappoints, prefer moving to a globe over
reaching for Three.js to render the same flat idea.

A globe is a larger change than this prototype needs and it is the PI's call,
not yours. If you think the flat hero is not working, say so and show a
screenshot rather than switching approaches unprompted.

Whichever option ends up in place, the fallback conditions above are
unchanged: static hero correct on its own, no loop under reduced motion or on
mobile, pause when offscreen, `window.heroReady` set after the first frame.

### Quality floor

Responsive to 320px; visible keyboard focus; reduced motion respected; color
contrast passing AA for body text; semantic landmarks (`nav`, `main`,
`footer`); `alt` text on every image; the site fully usable with JS disabled.
Build to this without adding an accessibility section to the page.

---

## 6. Content model

### `_data/news.yml`

```yaml
- date: 2026-07-15
  text: "Kayla White's paper on aerosol-driven precipitation extremes was accepted to *JGR: Atmospheres*."
  link: https://example.org/paper      # optional
  link_text: Read it                   # optional
```

Render the newest ten on the home page and all of them on `news.md`. Format
the date in the template (`Jul 2026`), never in the data — the editor writes
an ISO date and nothing else. Run the `text` field through the Markdown
filter so an editor can use italics and links without writing HTML.

### `_data/people.yml`

Two lists, `current` and `past`, each entry:

```yaml
- name: Cameron Cummins
  role: M.S. Student
  photo: cameron-cummins.jpg    # optional; template handles a missing photo
  details:
    - Degree expected Spring 2025
    - B.S. in Computational Engineering, UT Austin, 2023
  now: Assistant Research Scientist, ...   # past members only
  project: ...                             # past members only
  cv: https://...                          # PI only
```

Port every person currently in `people.html` verbatim. Do not invent, correct,
or reword anyone's details.

The PI's entry renders differently (larger, above the grid) — handle that with
a separate block in the template keyed off a `pi: true` flag, not a special
case buried in a loop.

Headshot images do not exist yet. The template must render a person cleanly
with no photo — a neutral placeholder block, not a broken image icon.

### Pages

`research.md`, `teaching.md`, `resources.md`, `openings.md`, `contact.md` are
Markdown with front matter. Carry over the real text that exists (the Research
intro paragraph and section headings; the Contact structure) and keep the
placeholder markers that exist — `REPLACE_WITH_EMAIL`,
`REPLACE_WITH_DEPT_ADDRESS` — exactly as they are. They are deliberate
signposts for the PI. Do not invent an email address, a building number, a
course listing, or a research description. Where a page has no content, leave
a short plain note saying what is needed.

### Navigation

`_data/nav.yml` drives the nav in `_includes/nav.html`, with the active state
derived from `page.url`. Adding a page must not mean editing seven files.

---

## 7. Content status inventory

| Page | Content state | What you do |
| --- | --- | --- |
| Home | H1 + both ledes final; question cards may get a wording pass; news items are **placeholders** | Port copy verbatim; move news to `_data/news.yml` and mark the sample items clearly as samples |
| People | Real, pulled from the live Wix site | Port verbatim to YAML |
| Research | Intro paragraph real; three section bodies placeholder | Port, keep placeholders |
| Teaching / Resources / Openings | Placeholder only | Structure only |
| Contact | Layout built; email and address are placeholder tokens | Port, keep tokens |
| `news.html` archive | Does not exist | Build it |

Approved home page copy is reproduced in `PROJECT_SUMMARY.md` — take it from
there rather than retyping it.

---

## 8. Local development

### Docker (default)

```sh
docker compose up
# http://localhost:4000
```

One service, running `jekyll serve` against the mounted repo. Requirements:

- **Pin everything.** A `ruby:3.x-slim` base (pick and pin a minor version),
  `bundle install` at image build time, `Gemfile.lock` committed. The point of
  the container is that two machines produce the same build; an unpinned base
  defeats that.
- **Dependencies live in the image, not the host.** No `vendor/bundle` in the
  project directory, no bundle volume that can fall behind the lockfile. A
  dependency change means editing the `Gemfile` and rebuilding the image.
- `user: "${UID:-1000}:${GID:-1000}"` so files the container writes are owned
  correctly on the host.
- `--force_polling` on `jekyll serve` — bind mounts do not reliably deliver
  file events to containers on macOS or WSL2.
- Derive the Compose project name from the directory, so two checkouts (the
  agent sandbox and a human's clone, or two parallel sandbox runs) do not
  collide on container names and ports.
- Keep `_site/` and `.jekyll-cache/` out of the bind mount's blast radius via
  `.gitignore`; do not add named volumes to work around it.

No Makefile. `docker compose up` is already the whole interface, and a
Makefile that wraps one command is a file that will drift.

### Host Ruby (fallback)

```sh
bundle install && bundle exec jekyll serve --livereload
```

Works, but the gem versions are whatever the host resolves. Documented as an
escape hatch for someone without Docker, not as a parallel supported path.

### Deployment is independent of both

GitHub Pages builds the site itself on push. Neither path is a build step for
production, and a broken container cannot break the live site. Say this in
`docs/DEVELOPMENT.md` — "do I need to build before pushing?" is the first
question a new contributor will have, and the answer is no.

### Screenshots

`tools/shot.py` is provided — drop it in unchanged. It drives the DevTools
Protocol rather than `chromium --screenshot`, because the latter captures
before the compositor has drawn and a canvas lands in the file as black. It
returns console output alongside the image.

```sh
python3 tools/shot.py http://localhost:4000/ -o shot.png -s 1440x900 \
  --wait 'window.heroReady === true'
python3 tools/shot.py http://localhost:4000/ -o mobile.png -s 375x812
```

Use it to check your own work, especially the hero and the mobile breakpoints.
It needs Python 3 and Chromium on the host, it is a development tool, and
nothing in the build depends on it.

---

## 9. Documentation deliverables

Two audiences, two files. Do not merge them.

**`README.md`** — for the PI. Plain language, no build talk. How to add a news
item, add a person, edit a page, all via the GitHub web editor with a worked
example of each. Keep the existing deployment section (DNS records, `CNAME`
file, custom domain setup) and the remaining-work checklist, updated for the
new layout.

**`docs/DEVELOPMENT.md`** — for a developer or agent. Stack and why Jekyll 3 +
allowlisted plugins; repo layout; `docker compose up` as the dev path, with
the host-Ruby fallback noted briefly; that deployment does not depend on
either; `shot.py` usage and the reason it exists; which hero option is in
place and why, and how to disable the animation; how content flows from
`_data` into templates.

Both stay short. A doc nobody finishes is a doc nobody reads.

---

## 10. Code style

The people maintaining this site are climate scientists, and the next agent to
open it will have a cold context window. Write accordingly.

- **Short files.** If a file is getting long, the structure is wrong.
- **No comments that restate the code.** Comment only a non-obvious *why*:
  a browser quirk, a GitHub Pages constraint, a deliberate tradeoff.
- **No defensive scaffolding.** No config objects with one caller, no
  abstraction layers for a single use, no options nobody asked for, no
  try/catch around code that cannot throw.
- **No dependencies you can avoid.** Every gem and every script tag is a thing
  that can break someone else's `bundle install` two years from now.
- **CSS:** custom properties for the tokens, flat class names, no deep nesting,
  no `!important`. Mobile-first media queries. Watch selector specificity
  around section spacing — that is where competing rules usually collide.
- **Liquid:** keep templates dumb. Logic belongs in the data shape, not in
  nested `{% if %}` blocks.
- **JS:** modern syntax, no transpiling, no polyfills. One file per concern.
- Prefer deleting code over adding a flag to bypass it.

---

## 11. Out of scope

Do not build: a publications database, a search feature, a blog, dark mode, a
contact form, analytics, a cookie banner, a GitHub Actions workflow, or the
globe/telemetry/pointer-control machinery from the reference architecture
document. That document was mined for its Docker and screenshot patterns only;
its 3D visualization code belongs to a different project.

---

## 12. Suggested order

1. Container and Jekyll skeleton — `Dockerfile`, `compose.yml`, `Gemfile`,
   `_config.yml`, layouts, includes, nav from data. Get `docker compose up`
   serving before writing anything else; every later step is checked through
   it. Verify all seven pages build and link correctly with no styling.
2. Port content — people and news into `_data`, pages into Markdown, verbatim.
3. Stylesheet — tokens, type scale, responsive layout. Screenshot at both
   widths and look at it.
4. Hero — static version first, then the Canvas 2D layer, then the fallback
   conditions. Screenshot with `--wait` and judge it before considering any
   escalation from the §5 gate.
5. Species tags — only if the content that exists actually divides into
   categories. If it does not, skip this and say so.
6. Docs — `README.md` and `docs/DEVELOPMENT.md`.

Flag anything ambiguous rather than inventing an answer, especially real-world
facts: names, dates, affiliations, emails, course numbers, publication
details. A placeholder the PI can find is better than a plausible fabrication
she cannot.
