# Persad Aero-Climate Lab website

Source for [ggpersad.com](https://ggpersad.com). All the day-to-day content
lives in plain text and YAML files in this repo, and GitHub rebuilds the
live site automatically within a minute or two of any change being saved —
there's nothing to install and nothing to run. Everything below can be done
from a browser, using GitHub's own editor.

## Editing a page

1. On GitHub, open the file for the page you want (see the list below).
2. Click the pencil icon (top right of the file) to edit.
3. Make your change. Text between three dashes (`---`) at the top of the
   file is metadata (the page title, etc.) — leave that alone and edit the
   text below it.
4. Scroll down, add a short note describing the change, and click
   **Commit changes**.

| Page | File |
| --- | --- |
| Home | `index.md` |
| Research | `research.md` |
| Teaching | `teaching.md` |
| Resources | `resources.md` |
| Openings | `openings.md` |
| Contact | `contact.md` |

## Adding a news item

News lives in one file, `_data/news.yml`, as a list — newest item first.
Open it, click the pencil icon, and add a new block at the very top,
matching this shape exactly (the indentation matters):

```yaml
- date: 2026-09-16
  text: "Short description of the news. *Italics* and [links](https://example.org) both work."
  link: https://example.org/paper   # optional — delete this line if there's no link
  link_text: Read it                # optional — only needed if you added a link
```

The date always goes as `YYYY-MM-DD` — the site formats it for display
automatically. The home page shows the ten newest items; `_data/news.yml`
drives both that and the full `News` page.

## Adding or editing a lab member

People live in `_data/people.yml`, split into `current` and `past` lists.
Open it, click the pencil icon, and add a new block in the right list,
matching this shape:

```yaml
- name: Jane Doe
  role: Ph.D. Student
  photo: jane-doe.jpg           # optional — omit if there's no photo yet
  details:
    - Degree expected Spring 2027
    - B.S. in Atmospheric Science, UT Austin, 2023
```

A past member additionally takes `now:` (what they're doing today) and
`project:` (what they worked on here). To add a photo, upload the image
file to `assets/img/people/` first (drag and drop into that folder on
GitHub works fine), then reference its filename in `photo:`.

## Deployment

The domain is already wired up — the `CNAME` file at the root of this repo
holds `ggpersad.com`, and GitHub Pages reads it automatically. If the DNS
ever needs to be re-pointed (new registrar, etc.), the records GitHub Pages
needs are:

- An `ALIAS`/`ANAME` record (or four `A` records, if your DNS provider
  doesn't support `ALIAS`) for the apex domain (`ggpersad.com`) pointing at
  GitHub's IPs — see
  [GitHub's custom domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
  for the current addresses.
- A `CNAME` record for `www.ggpersad.com` pointing at the GitHub Pages
  default domain for this repo.

No build step, no server to maintain — GitHub rebuilds and redeploys on
every push to the default branch.

## What's still missing

This is a working prototype. The structure is done; some of the words
aren't real yet:

- Home page H1 and lede paragraphs are placeholders pending the approved
  copy.
- People roster (`_data/people.yml`) is empty — needs the real current/past
  member list.
- News items are sample placeholders — needs real lab news.
- Research page has a real intro but placeholder section bodies.
- Teaching, Resources, and Openings pages have no content yet.
- Contact page still has `REPLACE_WITH_EMAIL` and
  `REPLACE_WITH_DEPT_ADDRESS` tokens in place of real values.
