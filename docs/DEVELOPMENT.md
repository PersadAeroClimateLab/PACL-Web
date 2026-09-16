# Development

## Stack

Jekyll, built by GitHub Pages' own pipeline on push — no Actions workflow, no
CI. That pipeline runs **Jekyll 3**, not 4, and only builds plugins on its
allowlist. This repo pins `gem "github-pages", group: :jekyll_plugins` in the
`Gemfile` so a local build uses the same Jekyll version and plugin set as
production, and only enables two plugins in `_config.yml`:
`jekyll-seo-tag` and `jekyll-sitemap`. Both are on GitHub's allowlist.
A plugin that isn't gets silently ignored by GitHub's build, so local and
production output would quietly diverge — flag it instead of adding one.

## Repo layout

`_data/*.yml` and the page Markdown files are the only things that should
need editing for a routine content change — see README.md, written for the
PI, for how. Everything else here is how that content gets rendered:

- `_layouts/` — `default` (head/nav/footer), `page` (default + `<main>`
  wrapper), `home` (default + hero)
- `_includes/` — nav, footer, head, the hero canvas, and per-item partials
  (`person.html`, `news-item.html`)
- `assets/css/site.css` — tokens + layout, one file
- `assets/js/hero.js` — the hero animation (see below)
- `assets/js/vendor/` — third-party JS, vendored rather than loaded from a
  CDN so the site has no runtime dependency on another host staying up

## Local development

```sh
docker compose up
# http://localhost:4000
```

One service, `jekyll serve --force_polling` against the repo bind-mounted
into the container. Ruby, Bundler, and the gems live in the image — there's
no host Ruby install to keep in sync, and no `vendor/bundle` folder in the
project directory. Changing a dependency means editing the `Gemfile` and
rebuilding: `docker compose build`.

Without Docker, `bundle install && bundle exec jekyll serve --livereload`
works too, but you get whatever gem versions your host resolves rather than
the pinned, reproducible set — treat it as an escape hatch, not a parallel
supported path.

**Deployment doesn't depend on either.** GitHub Pages builds the site itself
from the repo on push. Neither dev path is a build step for production, so a
broken container can never break the live site, and there's nothing to build
before pushing.

## Screenshots

`tools/shot.py` drives a headless Chromium over the DevTools Protocol rather
than `chromium --screenshot`, because the latter captures before the
compositor has drawn — a canvas comes back black. It also prints the page's
console output alongside the image, so one run gives you both.

```sh
python3 tools/shot.py http://localhost:4000/ -o shot.png -s 1440x900 \
  --wait 'window.heroReady === true'
python3 tools/shot.py http://localhost:4000/ -o mobile.png -s 375x812
```

It's a dev tool — needs Python 3 and Chromium on the host, and nothing in
the build depends on it. Use it to check the hero and both breakpoints
before calling a change done.

## Hero animation

The hero (`assets/js/hero.js`) renders the aerosol flow field via WebGL:
particles advected by 2D simplex noise (implemented inline — no library),
drawn as additive point sprites for the glow and density a flat Canvas 2D
`fill`/`arc` loop can't cheaply give. [twgl.js](https://github.com/greggman/twgl.js)
is vendored at `assets/js/vendor/twgl.min.js` purely to avoid hand-rolling
WebGL's program/buffer boilerplate — it attaches `window.twgl` and is loaded
as a classic `<script>` before the `hero.js` module, since the module needs
it synchronously on first run.

The loop doesn't start — and `window.heroReady` is set immediately instead,
so the static hero is what you get — when any of these are true:
`prefers-reduced-motion: reduce`, viewport at or below 40rem wide, or a
`hover: none` pointer (touch). It also pauses via `IntersectionObserver` when
the hero scrolls out of view, and on `visibilitychange`. To see the
static-only path without switching devices, throttle a browser's motion
preference in DevTools, or just shrink the viewport under 40rem.

The static hero (dark background, real H1/lede/card markup) is complete on
its own with JS disabled entirely — the canvas is a layer on top, never a
requirement.

## Content flow

`_data/nav.yml` → `_includes/nav.html`, active state from `page.url`. Add a
page by adding one entry here — no template changes needed.

`_data/news.yml` → `_includes/news-item.html`, used by both the home page
(newest 10) and `news.md` (all of them), sorted newest-first at the template
level. The `text` field runs through Jekyll's Markdown filter, so an editor
can write `*italics*` and `[links](url)` without HTML.

`_data/people.yml` → `_includes/person.html`, looped from `people.md`. A
`pi: true` entry renders separately, above the grid; everyone else is looped
normally. A missing `photo` renders a placeholder block, not a broken image.
