---
status: accepted
date: 2026-10-19
---

# Nginx Proxy Manager

## Context and Problem Statement

Nginx Proxy Manager puts a web UI over nginx: proxy hosts, redirections, 404 hosts, streams, certificates and access lists. A host write decides where a domain's traffic goes. A host can carry raw nginx config. Which operations need a typed confirmation, and how does the plugin keep certificate keys and DNS credentials hidden?

## Decision Drivers

- Any host create can point a domain at a host that the attacker chose.
- Raw nginx config in `advanced_config` runs as part of the server block.
- Disabling a host takes a live site down, and an empty access list opens each host behind it.
- Certificates carry private keys and DNS-provider tokens.

## Considered Options

- Lock each host and stream create and update, each delete, user and settings writes, and access-list updates. Show each destination in the approval.
- Split host writes on `advanced_config` only.

## Decision Outcome

Chosen option: "Lock each host and stream create and update, each delete, and user and settings writes". A split on `advanced_config` would leave a plain create that sends a domain anywhere.

**Catalog source.** Each instance serves its compiled spec at `GET /api/schema` without auth.

- The plugin fetches it at each sync. `network.hosts` is only the instance.
- The version comes from the public health check `GET /api/`.
- A spec with fewer than 50 operations, or one that misses a key that `plugin.yaml` locks (`src/locked-keys.ts`), is refused.

**Auth.** The email and password of a dedicated NPM user. The plugin signs in with `POST /api/tokens` and sends the JWT as a bearer token.

- It signs in again five minutes before `expires`, and once on a 401 or 403.
- A user with two-factor auth gets a challenge instead of a token, which the plugin reports as denied. The connection needs a user without 2FA.

**Classification.** GET reads, every other verb writes, and anything unsettled is a write.

Excluded: sign-in and token refresh, the spec, and `POST /users/{userID}/login`, which returns another user's token. The certificate zip download and the multipart certificate upload and validation carry private keys, so they are excluded too.

**Locks.** Literals come from the stored object where one exists. Rules `DELETE *`, `POST /users/*`, `PUT /users/*` and `PUT /settings/*` also lock ones that a newer version adds.

| Operations                                                                   | Why                                                                            | Literal                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Proxy, redirection and stream hosts: create, update                          | They decide where a domain's or port's traffic goes                            | first domain (body on create, stored on update), or the incoming port                          |
| 404 hosts: create, update with `advanced_config` (twin `#advanced`)          | Raw nginx config runs as part of the server block                              | first domain                                                                                   |
| Disable any host or stream. Enable a proxy, redirection or stream host       | Takes a live site down, or exposes one that an admin turned off                | stored first domain, or incoming port                                                          |
| Each `DELETE`, and user and settings writes                                  | Irreversible                                                                   | stored domain, port, certificate `nice_name`, access-list name or user email, else the path id |
| `PUT /nginx/access-lists/{listID}`                                           | An empty list of users or clients opens each host behind it                    | stored name                                                                                    |
| Users: create, update, delete, `…/auth`, `…/permissions`, each 2FA operation | Accounts, admin rights and credentials                                         | stored email, or the body email on create                                                      |
| `PUT /settings/{settingID}`                                                  | The default site can redirect each unknown host anywhere, or serve custom HTML | the setting id                                                                                 |

Renewing a certificate, enabling a 404 host, and creating certificates, access lists and plain 404 hosts are regular writes.

**Approval context.**

- For each host or stream write, the summary adds the destinations from the body: domains, forward hosts and ports, and custom locations. They stay visible when the body is cut at 400 characters.
- Model strings there are escaped JSON text, so they cannot fake summary text.
- A body with `advanced_config`, at the top level or in a custom location, adds `(injects raw nginx config)`.

**Secrets.**

- `sensitiveKeys`: `password`, `secret`, `token`, `challenge_token`, `dns_provider_credentials`, `certificate_key`, `backup_codes` and `otpauth_url`.
- `sensitiveResult` (deep) on each `/nginx/*`, audit-log and report result: `dns_provider_credentials`, `certificate_key` and `password`. NPM already omits or masks them, and this holds if a version stops doing so.
- `sensitiveResult` on 2FA: `secret` and `otpauth_url` on setup, `backup_codes` on enable and regeneration.
- `sensitiveParams`: certificate `meta.dns_provider_credentials` and `meta.certificate_key`, the user `auth.secret` on create, `secret` and `current` on a password change, and the 2FA `code`.
- Domain names, forward hosts and redirect targets stay visible, because the approver must see the destination.

### Consequences

- Good, because no host write can send traffic to a new place without a typed confirmation.
- Good, because raw nginx config is always named in the approval.
- Bad, because each host create asks for a literal, also a harmless one.

The feature file in `features/npm/` and `plugins/npm/test/compliance.yaml` specify the behavior.
