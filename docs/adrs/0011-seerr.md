---
status: accepted
date: 2026-09-29
---

# Seerr

## Context and Problem Statement

Seerr manages media requests for a household, in front of Plex or Jellyfin, Radarr and Sonarr. Its spec `seerr-api.yml` is in the `seerr-team/seerr` repository, and no instance serves it. Some of its GETs act: `GET /settings/discover/reset` resets the discover sliders. Which operations need a typed confirmation, and how does the plugin catch an action that hides behind a GET?

## Decision Drivers

- A user delete, a batch permission change and an API key rotation affect other users or integrations.
- Deciding another user's request acts for that user.
- A full library scan is long-running.
- Seerr models some actions as GETs, and a future release can add more.

## Considered Options

- GET reads and other verbs write. Action words flag a GET for review, and locked twins cover on-behalf decisions and heavy jobs.
- The HTTP verb alone.

## Decision Outcome

Chosen option: "The HTTP verb, with action words that flag a GET, and locked twins". A GET whose summary has an action word stays a write until a rule settles it.

**Catalog source.**

1. `GET /api/v1/status` gives the instance's version.
2. The plugin fetches `seerr-api.yml` from the release tag of that version, else from `develop`. The base URL is the connection's `specBaseUrl`, which defaults to `https://raw.githubusercontent.com/seerr-team/seerr`, so a mirror works offline.
3. A spec over 5 MB, or with fewer than 50 operations, is refused. An empty or truncated spec never replaces a real catalog.
4. Both hosts are in `network.hosts`. No credentials go to the spec host.

**Auth.** The connection signs in as a local Seerr user with a cookie session, or uses an API key with an optional `X-API-User`. Seerr's own permissions bound each call. An API key that `POST /settings/main/regenerate` rotates would break this connection, so a dedicated local user is the default.

**Classification.** GET reads, every other verb writes, and anything unsettled is a write.

- A GET whose summary or description has an action word is a write that needs review. The words are `reset`, `regenerate`, `sync`, `flush`, `run`, `cancel` and `invoke`, with their forms (`plugin.actionWords`).
- `GET /settings/jellyfin/sync` was reviewed. It returns the status of a sync, so it is a read.

**Locks.** The default literal is the instance's title (`applicationTitle` from `GET /settings/public`).

| Operation                                                                                                       | Why                                                                                                                                                                | Literal                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `DELETE /user/{userId}`                                                                                         | Removes a user and their requests                                                                                                                                  | the user's email or display name      |
| `PUT /user`                                                                                                     | Batch permission change                                                                                                                                            | instance title                        |
| `DELETE /settings/radarr/{radarrId}`, `DELETE /settings/sonarr/{sonarrId}`                                      | Removes a server that requests go to                                                                                                                               | the server's name                     |
| `POST /settings/initialize`                                                                                     | Initializes the instance                                                                                                                                           | instance title                        |
| `POST /settings/main/regenerate`                                                                                | Rotates the API key, which breaks each integration that uses it                                                                                                    | instance title                        |
| `DELETE /settings/discover/{sliderId}`, `GET /settings/discover/reset`                                          | Removes a slider, or resets them all. The reset is a GET                                                                                                           | slider name, else instance title      |
| `GET /settings/plex/library`, `GET /settings/jellyfin/library`                                                  | Seerr 3.0 to 3.4.1 saves the enabled-library list on each call, and disables each library not in `enable`. From 3.5.0 they only read, and the lock only over-locks | instance title                        |
| `POST /request/{requestId}/{status}#on-behalf`                                                                  | Approves or declines a request that another Seerr user filed                                                                                                       | the requester's display name or email |
| `POST /settings/plex/sync#start`, `POST /settings/jellyfin/sync#start`, `POST /settings/jobs/{jobId}/run#start` | Starts a full library scan, or a job not in `plugin.cheapJobs`, a future one included                                                                              | the job id, else instance title       |

- Any approver can decide another user's request, as Seerr's own UI allows an account with `MANAGE_REQUESTS`. The lock means that a pre-approval rule never decides it.
- Cheap jobs run as plain writes: the recently added scans, the Plex token refresh and watchlist sync, and the Radarr and Sonarr scans. The download sync and the image cache cleanup are cheap too.

**Secrets.** `sensitiveKeys`: `apiKey`, `connect.sid`, `plexToken`, `jellyfinAuthToken`, `password`, `authPass`, `webhookUrl`, `botAPI`, `authHeader`, `pgpKey`, `pushoverUserKey`, `p256dh` and `auth`. Several Seerr GETs return these, such as `GET /settings/main` and `GET /user/{userId}`, so core masks them in reads too.

### Consequences

- Good, because an action that Seerr models as a GET needs a review before it runs without a human.
- Good, because a decision for another user, a key rotation or a full scan always needs a typed confirmation.
- Bad, because the library reads stay locked on Seerr 3.5.0 and later, where they only read.

The feature file in `features/seerr/` and `plugins/seerr/test/compliance.yaml` specify the behavior.
