## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Prize gacha (`/gacha`)

Grist is the source of truth for prizes; the code holds no prize list or media paths (`src/data/prizes.ts` only has types and tier rates). Don't add prizes there, and never commit the Grist doc id (the repo is public).

- The page is staff-only: it asks for the NOC staff password (`NET_ADMIN_TOKEN`, same as `/noc` → Staff; `/gacha/?admin=<password>` also works and is remembered).
- With the password it loads the reward list from the media server, `https://82-26-104-114.sslip.io:8445/gacha-api/prizes?token=…`, which checks the password and proxies the Grist Prize table. The doc id and the password live only on that server (`~/shtx-media/grist.doc`, `~/shtx-net/admin.token`, rendered into nginx by `~/shtx-media/run.sh`).
- Media is read straight from the same server (`/gacha/<id>/…`, `/gacha/shared/…`). Nothing is pulled into the repo.
- Draws, stock and the pull log are kept in the browser (localStorage) for now; they are not written back to Grist.

Add or change a prize's media (no git changes expected):

1. Upload a folder `<id>/` to `~/shtx-media/www/gacha/` on the media server (organizers have SSH access). Image only: `image.jpg`. Full reveal: also `reveal.mp4` (15 s for T1, 8 s for T2), `show.mp4` (10 s loop), `music.mp3` (25 s / 18 s, drop at the hand-off), `meta.json` (`{"flash": <ms of the reveal's own white flash>}`).
2. In the Grist Prize row set `Image link` = `…/gacha/<id>/image.jpg` and, for a reveal, `Video link` = `…/gacha/<id>/reveal.mp4`. Name (`Item`), tier (`Final Prize Tier`) and stock (`Reward amount`) come from the same row; `Rejected` rows are skipped.
3. Reload `/gacha`. `git status` should stay clean; if it doesn't, the change belongs in Grist or on the media server instead.
