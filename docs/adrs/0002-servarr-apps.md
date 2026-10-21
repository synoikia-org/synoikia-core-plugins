---
status: accepted
date: 2026-10-19
---

# Servarr apps: Radarr, Sonarr, Lidarr and Prowlarr

## Context and Problem Statement

Radarr, Sonarr, Lidarr and Prowlarr share the Servarr code base. Each has one API key with full access. They can delete files, move folders, run programs on import and send stored credentials to a new host. Release builds serve no API spec. Which operations need a human with a typed confirmation, and how do these plugins keep provider credentials and indexer passkeys hidden?

## Decision Drivers

- Single-item creates, edits and deletes are daily work, and must not ask for a literal.
- A bulk change, an instance setting, a program run or a file move must need a typed confirmation.
- Servarr binds JSON keys and query parameters without regard to case.
- Provider settings are `fields: [{ name, value, privacy }]` lists, which key-based redaction cannot see.
- Release, history and search results carry indexer API keys and tracker passkeys in URLs.

## Considered Options

- One shared set of rules for the four apps, with locked twins for the risky variants of a call.
- Lock every write.
- Separate rules for each app.

## Decision Outcome

Chosen option: "One shared set of rules, with locked twins". Radarr is the reference. `src/spec.ts`, `src/locks.ts`, `src/fields.ts`, `src/request.ts`, `src/auth.ts`, `src/stored.ts` and `src/describe.ts` are the same in the four plugins. Prowlarr adds rules to `src/fields.ts`.

**Catalog source.** `Startup.cs` serves Swagger only in debug builds. The repository commits the spec for each release, and each build is tagged with its 4-part version.

1. `GET <api>/system/status` gives the instance's version. It needs the API key, so it also proves the key.
2. `src/spec.ts` fetches `<specBaseUrl>/v<version>/<spec file>`. A 404, or a version that is not 4-part, falls back to the app's fallback ref. The catalog's `sourceRef` names the ref used.
3. `specBaseUrl` defaults to the app's GitHub raw URL. No credentials go there. A mirror with the same layout works offline. Both hosts are in `network.hosts`.

| App      | API prefix | Spec file                          | Fallback ref | Smallest spec |
| -------- | ---------- | ---------------------------------- | ------------ | ------------- |
| Radarr   | `/api/v3`  | `src/Radarr.Api.V3/openapi.json`   | `develop`    | 150           |
| Sonarr   | `/api/v3`  | `src/Sonarr.Api.V3/openapi.json`   | `main` (v4)  | as Radarr     |
| Lidarr   | `/api/v1`  | `src/Lidarr.Api.V1/openapi.json`   | `develop`    | as Radarr     |
| Prowlarr | `/api/v1`  | `src/Prowlarr.Api.V1/openapi.json` | `develop`    | 90            |

Operation keys are the spec's own paths with the prefix, such as `GET /api/v3/movie/{id}`. A spec that misses a key that `plugin.yaml` locks by name is refused. Sonarr's `develop` is v5, so Sonarr falls back to `main`.

**Classification.** GET reads, every other verb writes, and anything unsettled is a write.

| Excluded operation                                                                                | Why                                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /`, `GET /{path}`, `GET /content/{path}`, `* /login`, `GET /logout`, `GET /ping`, `GET /api` | Web UI, sign-in and plumbing                                                         |
| `GET /feed/*`                                                                                     | iCal text. The calendar operation has the same data                                  |
| `GET <api>/log/file*`, `GET <api>/mediacover/*`                                                   | Log file downloads and images                                                        |
| `GET <api>/filesystem*`, `GET <api>/manualimport`                                                 | List any directory, or the media files in any folder, that the process can read      |
| `POST <api>/manualimport` (Sonarr, Lidarr)                                                        | Reprocesses files at any path that the body names, and returns their details or tags |
| `POST <api>/system/backup/restore/upload`                                                         | Multipart upload                                                                     |
| Prowlarr: `GET /api/v1/indexer/{id}/newznab`, `GET /{id}/api`                                     | The XML feed for the apps. `GET /api/v1/search` returns the same results as JSON     |
| Prowlarr: `GET /api/v1/indexer/{id}/download`, `GET /{id}/download`                               | Fetches a release file from the indexer with its credentials                         |

A root folder create or change is a regular write, by the owner's decision. Its unmapped subfolders list the host folders under it.

**Request keys.** `src/request.ts` runs on every call, before the split checks.

- A query, a body, an item of a body list or a provider field with two keys that differ only in case is refused (`INVALID_PARAMS`). Which one the upstream takes is not the plugin's to guess.
- The keys in `plugin.canonicalKeys`, and `name`, `value` and `privacy` in provider fields, are renamed to the app's spelling. Split checks, `sensitiveParams` pointers, literals and targets then read what the app binds.
- Provider `fields[]` with the same name twice, in any case, are refused. Servarr reads the first exact match, and the approval must show that field.

**Locks shared by the four apps.** Literals come from the stored item, the path or the instance name (`instanceName` from `system/status`).

| Operation                                                              | Why                                                                                                                                                                                                                                                                                                                         | Literal                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `DELETE */bulk`, `DELETE */editor`                                     | Bulk deletes, also ones a newer spec adds                                                                                                                                                                                                                                                                                   | `<n> <items>`                                     |
| `PUT <api>/config/host/{id}`                                           | Sign-in, bind address, port, URL base, proxy, update script                                                                                                                                                                                                                                                                 | instance name                                     |
| `PUT <api>/config/mediamanagement/{id}` (not Prowlarr)                 | `useScriptImport` and `scriptImportPath` run any program on each import. It also sets chmod, chown and the recycle bin                                                                                                                                                                                                      | instance name                                     |
| `POST <api>/system/shutdown`, `/restart`                               | Stops the service                                                                                                                                                                                                                                                                                                           | instance name                                     |
| `POST <api>/system/backup/restore/{id}`                                | Replaces the database and settings                                                                                                                                                                                                                                                                                          | backup file name                                  |
| `POST /reset-password*`                                                | Resets the web UI sign-in. Only newer specs have it, so the rule is a pattern                                                                                                                                                                                                                                               | instance name                                     |
| `… notification …#script`                                              | The notification runs a program: `CustomScript`, or a field named like `path`, `script`, `command`, `executable` or `program`, or of type `path` or `filePath`. A body without an `implementation` takes the twin. `/testall#script` is taken while any stored notification runs a program, or when the list cannot be read | stored name, else body `name`, else instance name |
| `… /{test,action/{name}}#stored`, `PUT …/{id}#stored` on each provider | The app fills in the stored password or API key for a test or action with an `id`, and tests a provider on save. The twin is taken when the body changes the destination, or when the stored record cannot be read. A PUT refuses a body `id` that differs from the path id                                                 | stored name                                       |
| `downloadclient …#folder`                                              | The client writes files to a host folder: `TorrentBlackhole`, `UsenetBlackhole`, `Pneumatic`, or a field named like `folder` or `path`, or of type `path` or `filePath`. A body without an `implementation` takes the twin                                                                                                  | stored name, else body `name`, else instance name |
| `POST <api>/command#heavy`                                             | Any command not in `plugin.quickCommands`, and future ones. The apps match names without regard to case, and so does the check                                                                                                                                                                                              | the command name, else instance name              |

**Destination check** (`src/stored.ts`). The stored record comes from `GET <resource>/{id}`. The destination changes when one of these differs, without regard to case, with a missing value, `null` and `""` the same:

- `implementation`
- the fields `host`, `port`, `urlBase`, `url`, `baseUrl` and `useSsl`, any field named like `host` or `url`, and any field of type `url`. A stored field that the body leaves out counts as changed.
- the hosts and URL origins that the targets list for each side
- the top-level body keys in `plugin.destinationKeys`. Prowlarr lists `tags`, which pick the indexer proxy.

**Quick commands.** These write metadata or a backup and can delete empty folders. None takes a caller's folder, installs, updates or restarts. `Application(Check)Update` is heavy: started through the API it counts as manual, and installs an update and restarts.

| App      | Quick commands                                                                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Radarr   | `MoviesSearch`, `MissingMoviesSearch`, `CutoffUnmetMoviesSearch`, `RssSync`, `RefreshMovie`, `RescanMovie`, `RefreshCollections`, `RefreshMonitoredDownloads`, `ImportListSync`, `CheckHealth`, `Housekeeping`, `Backup`                |
| Sonarr   | `SeriesSearch`, `SeasonSearch`, `EpisodeSearch`, `MissingEpisodeSearch`, `CutoffUnmetEpisodeSearch`, `RssSync`, `RefreshSeries`, `RescanSeries`, `RefreshMonitoredDownloads`, `ImportListSync`, `CheckHealth`, `Housekeeping`, `Backup` |
| Lidarr   | `AlbumSearch`, `ArtistSearch`, `MissingAlbumSearch`, `CutoffUnmetAlbumSearch`, `RefreshMonitoredDownloads`, `RssSync`, `ImportListSync`, `CheckHealth`, `Housekeeping`, `Backup`                                                        |
| Prowlarr | `Backup`, `CheckHealth`, `Housekeeping`, `IndexerDefinitionUpdate`                                                                                                                                                                      |

**Locks of each app.**

| App      | Operation                                                 | Why                                                                                      | Literal                |
| -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| Radarr   | `PUT`, `DELETE /api/v3/movie/editor` (+ `#delete-files`)  | Bulk edits, moves and deletes. The twin also deletes the files                           | `<n> movies`           |
| Radarr   | `PUT /api/v3/movie/{id}#move-files`                       | `moveFiles` moves the folder on disk. The plain PUT is a regular write                   | movie title            |
| Sonarr   | `PUT /api/v3/series/{id}#move-files`                      | `moveFiles` moves the series folder on disk                                              | series title           |
| Sonarr   | `PUT`, `DELETE /api/v3/series/editor` (+ `#delete-files`) | Bulk edits, moves and deletes                                                            | `<n> series`           |
| Sonarr   | `POST /api/v3/seasonpass`                                 | Changes monitoring of many series and seasons at once                                    | `<n> series`           |
| Sonarr   | `DELETE /api/v3/episodefile/bulk`                         | Deletes many files from disk                                                             | `<n> items`            |
| Lidarr   | `PUT /api/v1/artist/{id}#move-files`                      | `moveFiles` moves the artist folder on disk                                              | artist name            |
| Lidarr   | `PUT`, `DELETE /api/v1/artist/editor` (+ `#delete-files`) | Bulk edits, moves and deletes. The twin is taken when `deleteFiles` is not plainly false | `<n> artists`          |
| Lidarr   | `DELETE /api/v1/trackfile/bulk`                           | Deletes many files from disk                                                             | `<n> track files`      |
| Lidarr   | `PUT /api/v1/config/metadataprovider/{id}`                | The metadata server that Lidarr trusts, and whether it rewrites the tags in audio files  | instance name          |
| Prowlarr | `POST /api/v1/applications/testall`                       | Posts a test indexer with Prowlarr's API key to each stored app                          | instance name          |
| Prowlarr | `PUT /api/v1/applications/bulk`                           | Sync level and tags of many apps. `fullSync` removes indexers from the apps              | `<n> applications`     |
| Prowlarr | `PUT`, `DELETE /api/v1/indexer/bulk`                      | App profile, tags, enable and seed settings of many indexers                             | `<n> indexers`         |
| Prowlarr | `PUT /api/v1/config/development/{id}`                     | Turns on logging of indexer responses (session cookies, keys) and SQL to the log files   | instance name          |
| Prowlarr | `DELETE /api/v1/downloadclient/bulk`                      | Bulk delete                                                                              | `<n> download clients` |

Prowlarr's `#stored` twins also cover applications. With an `id`, Prowlarr fills in the stored app API key and posts a test indexer with its own key.

**Prowlarr indexer proxies.** A proxy save stays a regular write, by the owner's decision. Prowlarr sends an indexer's traffic through each proxy that shares one of its tags. So the approval names those indexers, by name and base URL origin, up to 20. When the body has no list of tag ids, or the lookup fails, the target says that the indexers are unknown.

**Targets.** Each non-GET call names what it acts on, before the body in the approval text.

- Library calls name the item and its folder, and the new folder on a move. Editors list up to 10 items.
- Provider calls name `<kind> <name> (<implementation>) → <destinations>`. A stored provider shows its stored name. Destinations are `host:port` and URL origins only, with no path, query or credentials.
- A notification that names a program adds `runs <path>`. A download client that names a folder adds `writes to <folders>`.
- Media management names the import script when the body sets it. A field that the body leaves out comes from the stored settings.
- A Prowlarr grab names each release by its `guid`, its claimed title, the download client and the indexer.

**Secrets.**

- `sensitiveKeys`: `apiKey`, `password`, `passwordConfirmation`, `proxyPassword`, `sslCertPassword`, `token`, `secret`.
- `sensitiveParams: [/body/fields]` hides the whole provider field list in approvals and the audit log. The targets show the destination.
- In results, `src/fields.ts` masks each `fields[]` value with `privacy` of `password` or `apiKey` as `********`. The apps read that back as "keep the stored value", so a read-modify-write is safe.
- A field that is not private but has a secret name, or is of type `password`, becomes `[REDACTED]`. Each URL keeps only its origin, because webhook, RSS and indexer URLs carry tokens.
- In key/value lists and objects inside a value, such as webhook `headers`, each value is hidden. `userName` fields stay visible, because a masked user name does not read back as "keep".
- Host settings: `sensitiveParams` on the API key and the passwords, and `sensitiveResult` on the same keys. `POST /reset-password*` hides `password`, `passwordConfirmation` and `token`.
- Release and history results: `downloadUrl`, `magnetUrl` and `url` become `[REDACTED]` in any key case. Link-shaped `guid`, `infoUrl`, `commentUrl` and `nzbInfoUrl` keep their origin only, and magnet links their `xt` info hash.
- `release/push` params hide `downloadUrl`, `magnetUrl`, `guid`, `infoUrl` and `commentUrl`.
- Prowlarr: Cardigann settings come back unmasked, with names that vary. For a `Cardigann` provider, `src/fields.ts` fails closed: each non-empty string becomes `[REDACTED]`, except `baseUrl` (origin only) and `select` or `checkbox` values.
- Prowlarr: search `downloadUrl` and `magnetUrl` are proxy links with Prowlarr's API key, and a history `data.url` holds an indexer key or passkey. Both are masked in any key case.
- A release whose `guid` was cut cannot be grabbed by it, because the write guard refuses `[REDACTED]`.

### Consequences

- Good, because daily single-item work runs at level `ask` without a literal, and each risky variant needs one.
- Good, because a test or save that sends stored credentials to a new destination always needs a typed confirmation.
- Good, because the four plugins share their security code, so a fix applies to all of them.
- Bad, because a release with a link-shaped `guid` cannot be grabbed through the API. The user grabs it in the app.
- Bad, because a new command is heavy until it is added to `plugin.quickCommands`.

The feature files in `features/radarr/`, `features/lidarr/` and `features/prowlarr/`, and each plugin's `test/compliance.yaml`, specify the behavior.
