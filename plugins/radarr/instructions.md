# Radarr

Radarr v3 REST API. Operation keys are `<VERB> <path>` with the full `/api/v3` prefix, as in `GET /api/v3/movie/{id}`. Ids are integers; a movie also has a TMDb `tmdbId`. Paged lists (`/api/v3/history`, `/api/v3/queue`, `/api/v3/wanted/missing`, `/api/v3/blocklist`) take `page` and `pageSize` and return `{ records, totalRecords }`.

Long work is a command: `POST /api/v3/command` with `{ name, ... }` returns its `id`; poll `GET /api/v3/command/{id}` until `status` is `completed` or `failed`.

Workflows:

- Add a movie: `GET /api/v3/movie/lookup` (`term`) → `GET /api/v3/qualityprofile` + `GET /api/v3/rootfolder` → `POST /api/v3/movie` with `tmdbId`, `qualityProfileId`, `rootFolderPath`, `monitored` and `addOptions.searchForMovie`.
- Downloads: `GET /api/v3/queue` (`includeMovie`), then `GET /api/v3/history`.
- Search missing: `GET /api/v3/wanted/missing` → `POST /api/v3/command` `MoviesSearch` or `MissingMoviesSearch`.
- Upcoming: `GET /api/v3/calendar` (`start`, `end`).
- Health: `GET /api/v3/health`, `GET /api/v3/diskspace`.

Download links are masked and link guids cut; a release with a masked guid can't be grabbed by `POST /api/v3/release`.

Locked: bulk edits and deletes, moving files, file-changing commands, scripts, blackhole folders, credentials sent to a new host, host and media settings, password reset, restart, backup restore. No filesystem browsing, manual imports or logs, though a new root folder lists the host folders under it.
