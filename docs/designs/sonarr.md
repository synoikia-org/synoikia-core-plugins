# Sonarr plugin: design

Sonarr (https://github.com/Sonarr/Sonarr) manages a TV library: series, seasons and episodes. It searches indexers, sends releases to download clients, and imports, renames and moves the files. This plugin exposes the REST API of Sonarr v4 (`/api/v3`) through Synoikia's `search` and `execute` tools. Where this note and Synoikia's design disagree, Synoikia's design applies.

Sonarr is a Servarr app. The plugin follows the [Radarr design](radarr.md): the spec loader, request-key rules, provider-field masking, classification, targets and secrets are the same. `src/spec.ts`, `src/locks.ts`, `src/fields.ts`, `src/request.ts` and `src/auth.ts` are copies of Radarr's files. This note lists only what is different.

## Catalog source

| Item | Value |
| --- | --- |
| Spec file | `src/Sonarr.Api.V3/openapi.json` at tag `v<4-part version>` (`v4.0.20.3014`) |
| Fallback ref | `main`, the v4 release branch. `develop` is v5 (it also has `src/Sonarr.Api.V5`), so it is not used |
| Default `specBaseUrl` | `https://raw.githubusercontent.com/Sonarr/Sonarr` |
| Pinned fixture | `v4.0.20.3014`, trimmed like Radarr's (230 operations after exclusions and twins) |

The Sonarr repository also holds Radarr's v5 and v6 tags. These tags have no Sonarr spec file, so a version that matches one gets a 404 and falls back to `main`.

Only the v3 API is in scope. Sonarr v4 has no language profiles in its UI, but the v3 spec still has `/api/v3/languageprofile`. Its delete is a regular write like every other single-item delete.

## Exclusions

The same as Radarr: web UI and sign-in, the iCal feed, log file downloads, media covers, `GET /api/v3/filesystem*`, `GET /api/v3/manualimport` and the backup upload. Sonarr also excludes `POST /api/v3/manualimport`: it reprocesses files at any path the body names and returns their details.

## Locks specific to Sonarr

| Operation | Why | Literal |
| --- | --- | --- |
| `PUT /api/v3/series/{id}#move-files` | `moveFiles` moves the series folder on disk (`MoveSeriesCommand`); the plain PUT is a regular write | series title |
| `PUT`, `DELETE /api/v3/series/editor` (+ `#delete-files`) | Bulk edits, moves (`rootFolderPath` + `moveFiles`) and deletes | `<n> series` |
| `POST /api/v3/seasonpass` | Changes monitoring of many series and seasons at once | `<n> series` |
| `DELETE /api/v3/episodefile/bulk` | Deletes many files from disk | `<n> items` |
| `PUT /api/v3/config/mediamanagement/{id}` | `useScriptImport` + `scriptImportPath` make Sonarr run any program on every import; it also sets chmod, chown and the recycle bin. The target shows the import script (from the body, else the stored one) when the body sets either field | instance name |
| `POST /api/v3/command#heavy` | Any command not in `plugin.quickCommands`: `RenameFiles`, `RenameSeries`, `MoveSeries`, `BulkMoveSeries`, `ManualImport`, `DownloadedEpisodesScan`, `ProcessMonitoredDownloads`, `DeleteLogFiles`, `ClearBlocklist`, `CleanUpRecycleBin`, `ResetApiKey`, `ResetQualityDefinitions`, `ApplicationUpdateCheck`, `ApplicationUpdate`, `Shutdown`, `Restart`, … and future ones | the command name |

Quick commands: `SeriesSearch`, `SeasonSearch`, `EpisodeSearch`, `MissingEpisodeSearch`, `CutoffUnmetEpisodeSearch`, `RssSync`, `RefreshSeries`, `RescanSeries`, `RefreshMonitoredDownloads`, `ImportListSync`, `CheckHealth`, `Housekeeping`, `Backup`. They write metadata or a backup and can delete empty folders. None of them takes a caller's folder, installs, updates or restarts. `ApplicationUpdateCheck` is heavy: started through the API it counts as manual, ignores the auto-update setting and queues `ApplicationUpdate`, which installs the update and restarts. Sonarr finds the command by class name without `Command`, case-insensitively (`CommandController.StartCommand`).

All other locks (bulk deletes, host config, shutdown, restart, backup restore, `POST /reset-password*`, `#script` notifications, `#stored` tests and actions) are as in Radarr. Single-item creates, edits and deletes, `deleteFiles` included, are regular writes. `POST /reset-password*` is in Sonarr's `develop` spec only.

## Request keys

`plugin.canonicalKeys` adds `seriesIds`, `series`, `episodeFileIds`, `addImportListExclusion`, `useScriptImport` and `scriptImportPath` to Radarr's list, and drops the movie keys. Items of the season pass `series` list are not renamed. The targets read their `id` in any case; an item with two spellings shows as unknown, and the literal counts all items.

## Targets

- Series calls: `Title (year) at <folder>`, plus `→ <new folder>` for a PUT. The editor and the season pass list up to 10 series, then `<n> more series`.
- Episode file deletes: `Title (year): <file path>`, up to 10 for the bulk delete.
- Media management: `import script on|off: <path>` when the body sets the import script. A field the body leaves out or sends as null (or an empty path) comes from the stored settings.
- New root folder: `root folder <path>`.
- Provider calls and release push: as in Radarr.
