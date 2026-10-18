# Radarr plugin: design

Radarr (https://github.com/Radarr/Radarr) manages a movie library: it searches indexers, sends releases to download clients, and imports, renames and moves the files. This plugin exposes its v3 REST API through Synoikia's `search` and `execute` tools. Where this note and Synoikia's design disagree, Synoikia's design applies. Sonarr, Lidarr and Prowlarr share the Servarr code base and follow this design.

## Catalog source

Release builds don't serve the spec: `Startup.cs` mounts Swagger only `if (BuildInfo.IsDebug)`. The repository commits it per release at `src/Radarr.Api.V3/openapi.json`, and every build is tagged with its 4-part version (`v6.4.4.10685`).

1. `GET /api/v3/system/status` (`version`) gives the instance's version. It needs the API key, so it also proves the key.
2. `src/spec.ts` maps a 4-part version to `v<version>` and fetches `<specBaseUrl>/<tag>/src/Radarr.Api.V3/openapi.json`. A 404 (an untagged nightly) or a version that isn't 4-part falls back to `develop`. The ref used is reported as the catalog's `sourceRef`.
3. `specBaseUrl` defaults to `https://raw.githubusercontent.com/Radarr/Radarr`; a mirror with the same `<ref>/<file>` layout works offline. No credentials go there. Both hosts are in `network.hosts`.

Operation keys are the spec's own paths, `/api/v3` included (`GET /api/v3/movie/{id}`). A spec with fewer than 150 operations, or one missing any key `plugin.yaml` locks by name, is refused. Tests pin the spec of tag `v6.4.4.10685` (`test/fixtures/radarr-openapi.json`): paths, parameters and request bodies as tagged; response bodies reduced to their descriptions and unreferenced schemas dropped.

**Reuse for Sonarr, Lidarr, Prowlarr.** Copy `src/spec.ts`, `src/locks.ts`, `src/fields.ts`, `src/request.ts`, `src/auth.ts`, `src/stored.ts` and `src/describe.ts` as they are; change `plugin.spec` (repository and file), the API prefix in `plugin.yaml` keys and `src/targets.ts`, the version path, the quick-command list and `canonicalKeys`.

## Auth

The API key from Settings → General → Security, sent as `X-Api-Key`. It is one instance-wide key with full access.

## Classification

GET reads, every other verb writes, and anything unsettled stays a write. No GET in the pinned spec is flagged by the action heuristic.

Excluded:

| Operation | Why |
| --- | --- |
| `GET /`, `GET /{path}`, `GET /content/{path}`, `* /login`, `GET /logout`, `GET /ping`, `GET /api` | Web UI, sign-in and plumbing |
| `GET /feed/*` | iCal text; `GET /api/v3/calendar` has the same data |
| `GET /api/v3/log/file*` | Log file downloads (text files) |
| `GET /api/v3/mediacover/*` | Images |
| `GET /api/v3/filesystem*`, `GET /api/v3/manualimport` | List any directory, or the media files in any folder, the Radarr process can read. Root folders take a path, so the model doesn't need them |
| `POST /api/v3/manualimport` | Reprocesses files at any path the body names and returns their details |
| `POST /api/v3/system/backup/restore/upload` | Multipart upload |

## Request keys

Servarr binds query parameters (ASP.NET Core) and JSON body keys (System.Text.Json) case-insensitively: `MoveFiles` sets `moveFiles`, `Id` sets `id`. `src/request.ts` runs on every call, before the split checks:

- A query, a body, an item of a body list or a provider field with two keys that differ only in case is refused (`INVALID_PARAMS`): which one the upstream takes is not the plugin's to guess. This covers `{ name: 'RssSync', Name: 'RenameMovie' }`.
- The keys in `plugin.canonicalKeys` (and `name`, `value`, `privacy` in provider fields) are renamed to Radarr's spelling, so split checks, `sensitiveParams` pointers, literals and targets read what Radarr binds.
- Provider `fields[]` with the same name twice (any case) are refused. Servarr reads the first exact match, and the approval must show the field it uses.

## Locks

A lock adds a typed confirmation to core's approval. Single-item creates, edits and deletes are regular writes, also with `deleteFiles`. Bulk operations, instance settings, sign-in and anything that runs a program or moves files are locked. Literals come from the stored item, the path or the instance name (`instanceName` from `/system/status`), never from a body field the model writes, except on create where the approver sees the body.

| Operation | Why | Literal |
| --- | --- | --- |
| `DELETE */bulk`, `DELETE */editor` | Bulk deletes, also ones a newer spec adds | `<n> movies` or `<n> items` |
| `PUT`, `DELETE /api/v3/movie/editor` (+ `#delete-files`) | Bulk edits, moves (`rootFolderPath` + `moveFiles`) and deletes; the twin also deletes the files | `<n> movies` |
| `PUT /api/v3/movie/{id}#move-files` | `moveFiles` moves the folder on disk; the plain PUT is a regular write | movie title |
| `PUT /api/v3/config/host/{id}` | Sign-in, bind address, port, URL base, proxy, update script | instance name |
| `PUT /api/v3/config/mediamanagement/{id}` | `useScriptImport` + `scriptImportPath` make Radarr run any program on every import; it also sets chmod, chown and the recycle bin | instance name |
| `POST /api/v3/system/shutdown`, `/restart` | Stops the service | instance name |
| `POST /api/v3/system/backup/restore/{id}` | Replaces the database and settings | backup file name |
| `POST /reset-password*` | Resets the web UI sign-in. Only newer specs have it, so the rule is a pattern and the key is not required | instance name |
| `POST`, `PUT /api/v3/notification…#script` | The notification runs a program: implementation `CustomScript`, or a field whose name has `path`, `script`, `command`, `executable` or `program`, or a field of type `path` or `filePath`. A body without an `implementation` takes the twin. `/testall#script` is taken while any stored notification runs a program, or when the list can't be read | stored name, else body `name`, else instance name |
| `POST /api/v3/{downloadclient,indexer,importlist,notification}/{test,action/{name}}#stored` | With an `id` in the body, Radarr fills in the stored password or API key (`ProviderControllerBase.Test`). The twin is taken when the body changes the destination (see below), or when the stored record can't be read | stored name |
| `POST /api/v3/command#heavy` | Any command not in `plugin.quickCommands`: `RenameFiles`, `RenameMovie`, `MoveMovie`, `ManualImport`, `DownloadedMoviesScan`, `DeleteLogFiles`, `ClearBlocklist`, `CleanUpRecycleBin`, `ResetApiKey`, `ApplicationCheckUpdate`, `ApplicationUpdate`, `Shutdown`, `Restart`, … and future ones. Radarr matches names case-insensitively, and so does the check | the command name (a plain word), else instance name |

**Destination check** (`src/stored.ts`). The stored record comes from `GET <resource>/{id}`. The destination changes when one of these differs, compared case-insensitively, with a missing value, `null` and `""` the same:

- `implementation`;
- the fields `host`, `port`, `urlBase`, `url`, `baseUrl`, `useSsl`, any field whose name has `host` or `url`, and any field of type `url`, matched by name in any case. A field that the stored record has and the body leaves out counts as changed;
- the hosts and URL origins that the targets list for each side.

**Descriptions** (`src/describe.ts`). The spec has no summaries. Each operation without one gets a description from its method, path and tag: `List movies`, `Get a movie by id`, `Delete a movie`, `Test a download client`, `Update movies in bulk`. Every locked, split or twin operation has a description in `plugin.yaml` that says why.

Quick commands, the ordinary `POST /api/v3/command`: searches (`MoviesSearch`, `MissingMoviesSearch`, `CutoffUnmetMoviesSearch`), `RssSync`, `RefreshMovie`, `RescanMovie`, `RefreshCollections`, `RefreshMonitoredDownloads`, `ImportListSync`, `CheckHealth`, `Housekeeping`, `Backup`. They write metadata or a backup and can delete empty folders. None of them takes a caller's folder, installs, updates or restarts. `ApplicationCheckUpdate` is heavy: started through the API it counts as manual, ignores the auto-update setting and queues `ApplicationUpdate`, which installs the update and restarts.

**Targets** (`capabilities.targets`). Non-GET calls name what they act on, placed right after the method and path in the approval text, ahead of the truncated body:

- movie calls: `Title (year) at <folder>`, plus `→ <new folder>` for a PUT; the movie editor lists up to 10 movies and the new root folder;
- provider calls: `<kind> <name> (<implementation>) → <destinations>`, and `, runs <path>` for a notification that names a program: `host:port`, URL origins only (no path, query or credentials), e-mail server and recipients, read by exact field name, first match, as Servarr does; from the body, else the stored provider;
- release push: the title and the origin of the download URL;
- media management: `import script on|off: <path>` when the body sets `useScriptImport` or `scriptImportPath`; a field the body leaves out or sends as null (or an empty path) comes from the stored settings;
- root folders: `root folder <path>` on create; `root folder <stored path> → <new path>` on a PUT.

Model-written strings in targets are escaped (control, bidi and zero-width characters).

## Secrets

- Manifest `sensitiveKeys`: `apiKey`, `password`, `passwordConfirmation`, `proxyPassword`, `sslCertPassword`, `token`, `secret`.
- Provider settings are `fields: [{ name, value, privacy }]`, which key-based redaction can't see. `sensitiveParams: [/body/fields]` hides the whole list in approvals and the audit log of provider calls; the targets show the destination.
- Results: `src/fields.ts` masks every `fields[]` value whose `privacy` is `password` or `apiKey` with Radarr's own `********`, which Radarr reads back as "keep the stored value", so a read-modify-write is safe. A field not marked private but named like a secret (`pass`, `secret`, `token`, `apikey`, `cookie`, `auth`, or ending in `key`), or of type `password`, becomes `[REDACTED]`. Every URL keeps only its origin: webhook, RSS and indexer URLs carry tokens, passkeys and UUIDs in the path or query. In key/value lists and objects inside a value (webhook `headers`), every entry's value is hidden. `userName` fields stay visible: Radarr doesn't treat a masked user name as "keep", so masking it would break a read-modify-write.
- `PUT /api/v3/config/host/{id}`: `sensitiveParams` on the API key and passwords; `sensitiveResult` on the same keys for `/api/v3/config/host*`. `POST /reset-password*`: `sensitiveParams` on `password`, `passwordConfirmation` and `token`.
- Release and history results: `downloadUrl`, `magnetUrl` and `url`, in any key case and inside history `data`, become `[REDACTED]`; link-shaped `guid`, `infoUrl`, `commentUrl` and `nzbInfoUrl` keep only their origin, and magnet-shaped ones only their `xt` info hash. They carry the indexer's API key or the tracker passkey. A release whose guid was cut can't be grabbed by it: the write guard refuses `[REDACTED]`. `release/push` params hide `downloadUrl`, `magnetUrl`, `guid`, `infoUrl` and `commentUrl`.
- Provider targets list a `host` without its userinfo: a URL by its origin, any other form with everything up to `@` dropped.
- A write whose body contains `[REDACTED]` (a masked value copied from a result) is refused with `INVALID_PARAMS`: Radarr would store it as the password, URL or key.
