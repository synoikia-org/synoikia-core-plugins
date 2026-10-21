---
status: accepted
date: 2026-10-19
---

# Mealie

## Context and Problem Statement

Mealie is a recipe manager with meal plans and shopping lists. Its API token acts with its user's rights, and an admin token reaches users, groups, households and backups. Webhooks and AI providers send data to a URL. Which operations need a typed confirmation, and how does the plugin keep tokens and service URLs hidden?

## Decision Drivers

- Recipe and list work is daily, and single-item deletes must not ask for a literal.
- Admin deletes remove accounts, whole tenants or backups.
- A webhook or an AI provider decides where household data and the stored key go.
- Privacy flags can make recipes public without sign-in.

## Considered Options

- Lock admin work, credentials, outbound destinations, privacy and bulk deletes. Keep single-item deletes as regular writes.
- Lock every delete.

## Decision Outcome

Chosen option: "Lock admin work, credentials, outbound destinations, privacy and bulk deletes". By the owner's decision, admin deletes stay locked, and other single-item deletes are regular writes.

**Catalog source.** Mealie is a FastAPI app, so each instance serves its spec at `<baseUrl>/openapi.json`.

- The plugin fetches it at each sync with the connection's token. `network.hosts` is only the instance.
- The version comes from `GET /api/app/about`. That route is public, so the connection test also calls `GET /api/users/self` to prove the token.
- A spec with fewer than 150 operations, or one that misses a key that `plugin.yaml` locks (`src/locked-keys.ts`), is refused.

**Classification.** GET reads, every other verb writes, and anything unsettled is a write. `GET /api/app/about/startup-info` was reviewed and is a read.

Excluded: sign-in, OIDC, token refresh and logout, sign-up and forgot-password. Also excluded: media and file downloads, download tokens, shared views by token, admin debug, multipart uploads and streaming routes.

**Locks.** Literals never come from a body field that the model writes about the target. Core redacts params with secret names, such as `token_id`, before the plugin summarizes them, so no literal is read from one.

| Operations                                                                                                        | Why                                                              | Literal                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| Admin users: create, update, delete, unlock, password-reset token                                                 | Account and admin rights. A reset token takes over an account    | username, email, or the group name   |
| Admin groups and households: create, update, delete. Admin AI providers                                           | A delete drops the recipes, plans and members                    | group or household name              |
| `POST /api/admin/backups/{file_name}/restore`, `DELETE …/{file_name}`                                             | A restore replaces each group, user and recipe                   | the backup file name                 |
| `POST /api/admin/maintenance/clean/*`                                                                             | Deletes files on the whole instance                              | group name                           |
| `POST /api/admin/email`                                                                                           | Sends mail from the instance to any address                      | the address                          |
| `POST /api/recipes/bulk-actions/delete`, `DELETE …/export/purge`, `DELETE /api/households/shopping/items` (`ids`) | Bulk and irreversible                                            | group name                           |
| `DELETE */bulk*`, `* */bulk-actions/delete*`                                                                      | A bulk delete that a newer spec adds                             | group name                           |
| `DELETE /api/admin/*`                                                                                             | Each admin-area delete, also one that a newer spec adds          | as above, else the group name        |
| `POST /api/users/api-tokens`, `DELETE /api/users/api-tokens/{token_id}`                                           | Mints or revokes a credential, maybe this connection's           | token name, or the connection's user |
| `PUT /api/users/password`, `POST /api/users/reset-password`                                                       | Credential change                                                | username, or email                   |
| `PUT /api/users/{item_id}`, `PUT /api/households/permissions`                                                     | User details and permissions                                     | the stored username                  |
| Group AI providers: create, update, delete                                                                        | `baseUrl` and headers decide where the stored key and recipes go | group name                           |
| `POST /api/households/webhooks`, `PUT …/webhooks/{item_id}`                                                       | A webhook posts household data to its `url`                      | group name                           |
| `PUT /api/groups/preferences`, `PUT /api/households/preferences`                                                  | Privacy flags make recipes public without sign-in                | group name                           |
| `POST /api/households/invitations`, `…/invitations/email`                                                         | Gives someone a way to join                                      | group name, or the invitee's email   |

**Secrets.**

- `sensitiveKeys`: `token`, `password`, `apiKey`, `api_key`, `access_token`, `secret`, `dbUrl` (a Postgres URL with its password) and `appriseUrl` (notifier URLs carry service credentials).
- `sensitiveResult`: `token` on token creation, password-reset tokens and invitations. `dbUrl` on admin about. `url` (deep) on webhooks and the records that embed them. `requestHeaders` and `requestParams` (deep) on AI providers.
- `sensitiveParams`: passwords and reset tokens, the invitation token, AI provider `apiKey`, headers and params, and notifier `appriseUrl`.
- A webhook `url` and an AI provider `baseUrl` stay visible in approvals, so the approver sees the destination. Webhook URLs are masked in results.

### Consequences

- Good, because a new credential, a new destination or a public flag always needs a typed confirmation.
- Good, because daily recipe and list work runs without a literal.
- Bad, because a non-admin token gets 401 or 403 from admin routes, which core reports as `UPSTREAM_DENIED`.

The feature file in `features/mealie/` and `plugins/mealie/test/compliance.yaml` specify the behavior.
