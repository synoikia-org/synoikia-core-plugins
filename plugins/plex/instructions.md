# Plex

Plex Media Server HTTP API at the server's own address. Operation keys are `<VERB> <path>` as in `GET /library/sections/{sectionId}/all`. Every response is wrapped in `MediaContainer` (`Metadata`, `Directory`, `Hub` or `Setting` lists). Items are identified by `ratingKey`; library sections by `key` from `GET /library/sections/all`. Almost every argument goes in `query`, not `body`. Page lists with `X-Plex-Container-Start` and `X-Plex-Container-Size` in `query`; the result's `totalSize` gives the total.

Workflows:

- Recently added: `GET /library/sections/all` → `GET /library/sections/{sectionId}/recentlyAdded`.
- Search: `GET /hubs/search` (`query`, optional `limit`, `sectionId`), then `GET /library/metadata/{ids}`.
- Playing now: `GET /status/sessions` (user, player and item per session).
- Mark watched or unwatched: `PUT /:/scrobble` or `PUT /:/unscrobble` with `key` = ratingKey and `identifier` = `com.plexapp.plugins.library`.
- Scan a library: `POST /library/sections/{sectionId}/refresh`.

Leave `async*` flags out of `GET /library/metadata/{ids}`: they start background work and are locked.

Locked: deleting a library or several items, emptying trash, optimize, clean bundles, server settings, updates, all butler tasks, adding or changing libraries, DVR and tuner admin, and anything that makes Plex fetch a URL. Not available: plex.tv account, sharing and friends, streaming and transcoding, downloads, images, log upload, tokens, filesystem browsing.
