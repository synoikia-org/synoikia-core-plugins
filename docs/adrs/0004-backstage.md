---
status: accepted
date: 2026-10-19
---

# Backstage

## Context and Problem Statement

Backstage is a developer portal. Each backend plugin has its own REST API under `/api/<pluginId>`: the catalog, the scaffolder, search, notifications and the events bus. A scaffolder run publishes repositories and opens pull requests. A catalog location makes Backstage ingest an external source. Which operations need a typed confirmation, and how does the plugin keep task secrets hidden?

## Decision Drivers

- A template run for real changes repositories outside Backstage.
- A registered location is ingested and refreshed without a human.
- A dry run still passes the caller's token to the template steps.
- One backend plugin's spec must not describe, or unlock, another plugin's routes.

## Considered Options

- Merge the specs that the backend plugins serve, lock runs, locations, deletions and broadcasts, and treat a dry run as a write.
- Treat a dry run as a read, as first planned.

## Decision Outcome

Chosen option: "Merge the served specs, lock runs, locations, deletions and broadcasts, and treat a dry run as a write". A dry run can return the caller's token in a rendered file, so it needs an approval at `ask`.

**Catalog source.** Each backend plugin built with `@backstage/backend-openapi-utils` serves its spec at `/api/<pluginId>/openapi.json`.

- The connection lists the plugin ids to load. The default is `catalog`, `scaffolder`, `search`, `events` and `notifications`. Each id matches `[a-z0-9-]+`.
- The plugin fetches each spec with the connection's token at each sync. A spec that answers 404 is skipped with a warning. When none loads, the sync and the connection test fail.
- A spec with a path outside its own `/api/<pluginId>` is refused.
- Each loaded plugin must keep each key that `plugin.yaml` locks under its path.
- `network.hosts` is only the backend URL.

**Auth.** A static external-access token, sent as `Authorization: Bearer`. Backstage's `accessRestrictions` and permission framework limit it, and core's gate applies on top.

**Classification.** GET reads, every other verb writes, and anything unsettled is a write.

| Read by review                                                                                      | Why                                                |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `POST /api/catalog/entities/by-refs`, `/entities/by-query`, `/entity-facets`, `/locations/by-query` | Queries with a body                                |
| `POST /api/catalog/validate-entity`                                                                 | Validates an entity without registering it         |
| `POST /api/catalog/analyze-location`                                                                | Previews what a location would add                 |
| `POST /api/scaffolder/v2/autocomplete/{provider}/{resource}`                                        | Lists repositories, branches or groups from an SCM |

- `POST /api/scaffolder/v2/dry-run` is a write. Backstage gives the steps `secrets.backstageToken`, the caller's token, and `fetch:template` can render it into a file that comes back in `directoryContents`.
- Excluded: the spec routes, the legacy notification routes, and the events bus subscription routes. A long-poll `GET …/events` would consume events that are meant for another subscriber.

**Locks.** Literals come from the stored object. A create confirms on the body field that the approver sees in the summary. A `DELETE *` rule locks each delete that a newer spec adds.

| Operation                                                 | Why                                                                             | Literal                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------- |
| `DELETE /api/catalog/entities/by-uid/{uid}`               | Removes the entity                                                              | entity name                 |
| `POST /api/catalog/locations`                             | Registers an external source that the catalog ingests and refreshes             | the body's `target`         |
| `PUT /api/catalog/locations/{id}`                         | Points a location at another source                                             | stored location target      |
| `DELETE /api/catalog/locations/{id}`                      | Unregisters a location and orphans its entities                                 | stored location target      |
| `POST /api/scaffolder/v2/tasks`                           | Runs a template for real: publishes repositories, opens PRs, registers entities | the body's `templateRef`    |
| `POST /api/scaffolder/v2/tasks/{taskId}/cancel`, `/retry` | Stops a run midway, or runs its steps again                                     | the task's template name    |
| `POST /api/notifications/notifications`                   | Sends to other users. `broadcast` reaches everyone                              | instance name (`Backstage`) |
| `POST /api/events/bus/v1/events`                          | Each subscriber of the topic acts on it                                         | instance name (`Backstage`) |

**Targets.** An entity delete names the stored `kind:namespace/name`. A location update or delete names the stored `type:target`. A task cancel or retry names the template and status. A scaffold names the template that `templateRef` resolves to in the catalog.

**Secrets.**

- `sensitiveKeys`: `token`, `secrets`, `authorizationToken`, `backstageToken`, `apiKey`, `api_key`, `password`, `secret`.
- `sensitiveParams`: `/body/secrets` on dry-run, scaffold and retry, `/body/authorizationToken` on refresh, and `/body/token` on autocomplete.
- `sensitiveResult`: `secrets` (deep) on task reads. Backstage strips them, and this keeps them masked if a version stops doing so.

### Consequences

- Good, because a run, a new source or a broadcast always needs a typed confirmation.
- Good, because one backend plugin cannot widen the catalog of another.
- Bad, because a dry run needs an approval at `ask`, which slows template authoring.
- Bad, because techdocs, kubernetes, permission, auth and proxy serve no spec, so they are not in the catalog.

The feature file in `features/backstage/` and `plugins/backstage/test/compliance.yaml` specify the behavior.
