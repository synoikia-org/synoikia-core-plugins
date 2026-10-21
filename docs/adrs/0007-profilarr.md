---
status: accepted
date: 2026-10-19
---

# Profilarr

## Context and Problem Statement

Profilarr v2 links configuration databases, which are git repositories of quality profiles and custom formats, and syncs them into Radarr and Sonarr. A sync overwrites quality profiles and custom formats in those apps. A linked database with auto-pull pushes changes without a human. Which operations need a typed confirmation?

## Decision Drivers

- A sync or an auto-pull changes Radarr and Sonarr, outside Profilarr.
- A linked database takes a GitHub token that the model supplies.
- The API key is one key for the whole instance, with full access.

## Considered Options

- Lock database links, syncs, settings changes and deletes, and backup retention.
- Treat a sync as a regular write.

## Decision Outcome

Chosen option: "Lock database links, syncs, settings changes and deletes, and backup retention". Each of them changes the arr apps, or deletes data, without a later human step.

**Catalog source.** Each instance serves its spec at `<baseUrl>/api/v1/openapi.json`.

- The plugin fetches it at each sync with the connection's key. `network.hosts` is only the instance.
- The version comes from `GET /api/v1/status`, which also proves the key.
- A spec with fewer than 15 operations, or one that misses a locked key, is refused.

**Classification.** GET reads, every other verb writes, and anything unsettled is a write. `GET /jobs/{id}` only returns the job record, so it is a read. Excluded: the spec route, `GET /backups/{filename}` (a gzip download) and `POST /backups/upload` (multipart).

**Locks.** Literals come from the stored object or the path. A `DELETE *` rule locks each delete that a newer spec adds.

| Operation                    | Why                                                                                                                                         | Literal                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `POST /databases/{id}/sync`  | With auto-pull on, a pull starts the arr syncs set to run on pull, which overwrite quality profiles and custom formats in Radarr and Sonarr | database name               |
| `PATCH /databases/{id}`      | Turns on auto-pull and the sync interval, which runs the same push on a schedule. Replaces the GitHub token                                 | database name               |
| `POST /databases`            | Links any repository with a model-supplied token, `auto_pull` and an interval as short as a minute                                          | instance name (`Profilarr`) |
| `DELETE /databases/{id}`     | Unlinks the database and its local data                                                                                                     | database name               |
| `DELETE /backups/{filename}` | Irreversible                                                                                                                                | the file name               |
| `PATCH /backups/settings`    | A shorter retention deletes older backups at the next cleanup, and can turn backups off                                                     | instance name (`Profilarr`) |

**Targets.** Non-GET calls on `/databases/{id}…` name the stored database as `<name> (<repository_url>)`. A failed lookup gives no target, and the summary still shows the path id.

**Secrets.**

- `sensitiveKeys`: `apiKey`, `api_key`, `personal_access_token`, `token`, `password`, `secret`.
- `sensitiveParams`: `/body/personal_access_token` on database link and update.
- `sensitiveResult`: `personal_access_token` (deep) on database operations, and `api_key` (deep) on `GET /arr`. Profilarr strips both, and this keeps them masked if a version stops doing so.

### Consequences

- Good, because no push into Radarr or Sonarr starts without a typed confirmation.
- Bad, because the v1 API has no routes for profile edits, restore or the instance's own auth. They stay in Profilarr's UI.

The feature file in `features/profilarr/` and `plugins/profilarr/test/compliance.yaml` specify the behavior.
