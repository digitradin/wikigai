# Wikigai — release v20261111

| | |
|---|---|
| Version | v20261111 |
| Builds on | v20261108 (not deployed yet) — everything in it is included; see `../v20261108/RELEASE.md` for its changes |
| Status | Built and tested locally — **not deployed yet** |
| Production site | **https://wikigai.com** |

## Changes — calmer left menu
1. **Every sign-in starts with only "My path" expanded** — on phone (☰ drawer) and on the web sidebar.
   My learning, My favourites and My profile start collapsed with a **"+"** button; tapping it expands the group and
   the button becomes **"−"** (collapse). The menu headings stay clickable links as before.
2. **What the user opens or closes is remembered until the next sign-in** (moving between pages keeps it as left).
   A new sign-in (new token) resets the menu to "only My path open". Stored in the browser as `wk_side_open`
   `{t: last 24 chars of the token, open: [...]}`; the old setting `wk_side_collapsed` is no longer read.
3. **The current page's group is not forced open any more** (signing in lands on Dashboard, which would otherwise open
   My profile). Instead, a collapsed group that holds the current page gets a soft purple highlight so users still see
   where they are.

Files: `frontend/public/assets/site.js` (menu state + "+"/"−"), `frontend/public/assets/wk.css` (button + highlight).
No backend, database or text changes (the existing "Show or hide {name}" label is reused for screen readers).

## Tests run
- Browser (Chromium), desktop 1280px: after sign-in on Dashboard only My path open, My profile highlighted;
  "+" on My learning opens it and it stays open on the next page; "−" closes it and the group is highlighted while on
  Plans; a new sign-in resets to only My path; an old `wk_side_collapsed` value (My path closed) is ignored.
- Phone 390px: drawer after sign-in shows only My path open; "+" on My favourites expands it. No page errors.
- `node --check` on `site.js`.

## Deploy / rollback
Deploy with `Deploy Wikigai.command` in this folder. Rollback: deploy `v20261108` (or the live `v20261101e`).
