---
status: accepted
date: 2026-10-19
---

# Grafana, Grafana Cloud and Adaptive Telemetry

## Context and Problem Statement

Three plugins reach Grafana. `grafana` uses the HTTP API of one Grafana 12+ instance. `grafanacloud` uses the grafana.com Cloud API: stacks, access policies, tokens and org members. `grafana-adaptive` uses the Adaptive Metrics, Logs and Traces APIs of a stack. All three upstreams are Go services that bind JSON keys without regard to case. Which operations need a typed confirmation, and how do the plugins keep an approval true to what the upstream does?

## Decision Drivers

- Grafana can proxy any request to a data source with its stored credentials.
- Permissions, roles, tokens and access policies are privileges. A change to them must need a human with a literal.
- A Go service binds `"Datasource"` as `"datasource"`, so an approval can show one value while the upstream uses another.
- Adaptive Telemetry rules decide which data is kept. Data that is not kept is lost.
- Contact point URLs, invite links and tokens are secrets in results.

## Considered Options

- Lock privileges, sharing, outbound and destructive writes, refuse ambiguous keys, and put destination fields first in each approval.
- Lock every write.
- Rely on the service account role or the access policy alone.

## Decision Outcome

Chosen option: "Lock privileges, sharing, outbound and destructive writes, and refuse ambiguous keys". The token's own role or policy bounds each call. The locks add a human where a call grants, shares, sends or destroys.

**Catalog sources.**

| Plugin             | Source                                                                                                                                                                     | Guard                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `grafana`          | `<baseUrl>/public/openapi3.json`, served by each Grafana, fetched at each sync. `network.hosts` is only the instance                                                       | fewer than 250 operations, or a missing locked key, is refused      |
| `grafanacloud`     | `https://grafana.com/api/openapi.json`, else the copy in `grafana/grafana-com-public-clients` on GitHub, without credentials. The connection's `specUrl` replaces the list | fewer than 45 operations, or a missing locked key, skips the source |
| `grafana-adaptive` | No spec exists. `plugin.yaml` declares each operation, confirmed in grafana.com's docs and in Grafana's own clients (`gcx`, the Terraform provider)                        | nothing else is reachable                                           |

`grafana` refuses Grafana below 12 in the connection test and the sync. `grafanacloud` overrides of `apiUrl` and `specUrl` must be `https`, or `http` on a loopback host. Its spec download can follow a redirect to another host. No credentials go with it, and the size and locked-key checks still apply.

**`grafana` classification.** GET reads, every other verb writes, and anything unsettled is a write.

- `POST /ds/query` stays a write. A SQL data source runs the query's `rawSql` as its stored user, so a query can change data. Its targets are the data sources it names, at most 20. An id or name that cannot be read is refused.
- The three `/access-control/*/search` POSTs are reads by review.
- `GET /licensing/refresh-stats`, `GET /user/helpflags/clear` and `GET /snapshots-delete/{deleteKey}` write. The last one deletes a snapshot and is locked.

| `grafana` excluded operations                                                                                                   | Why                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `* /datasources/proxy/*`, `* /datasources/{id}/resources/*`, `* /datasources/uid/{uid}/resources/*`, `* /plugins/*/resources/*` | Forward any request to a data source or plugin with its stored credentials                                   |
| `* /saml/*`, `GET /logout/saml`, `GET /user/email/update`                                                                       | Sign-in, single logout and the email-change confirmation link                                                |
| `* /public/dashboards/*`                                                                                                        | Anonymous public-dashboard viewer endpoints                                                                  |
| `GET /reports/render/*`, `GET /reports/images/*`                                                                                | PDF, CSV and image downloads                                                                                 |
| `GET /v1/provisioning/contact-points/export`                                                                                    | With `decrypt=true` it returns contact point credentials as YAML or HCL text, which key masking cannot reach |

**`grafana` locks.** Literals come from the stored object or the path. Creates confirm on the organization name (`GET /org`). A failed lookup falls back to the path id. A `DELETE *` rule locks each delete, also one that a newer spec adds.

| Area                   | Operations                                                                                                                                  | Literal                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Server admin           | `/admin/users` create, delete, disable, enable, logout, password, permissions, revoke session. `PUT /users/{user_id}`, `PUT /user/password` | user login, else org                                 |
| Server config          | `GET /admin/settings`, `/admin/provisioning/*/reload`, SSO settings `PUT` and `PATCH`, `POST /licensing/token`                              | org                                                  |
| Orgs                   | `POST /orgs`, `DELETE /orgs/{org_id}`, org user add and role change, `POST /org/invites`                                                    | org name or user login                               |
| Teams                  | delete, members add, set, update and remove, external group sync                                                                            | team name                                            |
| Roles (RBAC)           | custom roles, assignments, team and user role grants, resource permissions, `/groupsync/groups/{group_id}`                                  | role, team, user, resource or group                  |
| Service accounts       | create, update, delete, token create and delete                                                                                             | account name                                         |
| Data sources           | create, update, delete, LBAC rules                                                                                                          | data source name                                     |
| Sharing                | folder and dashboard permissions, folder move, public dashboards, `POST /snapshots` (`external: true` uploads to the snapshot server)       | folder or dashboard title                            |
| Alerting               | contact points, the notification policy tree, alert rules and groups, Prometheus rule imports, mute timings                                 | contact point, rule, group, namespace or timing name |
| Unattended or outbound | recording rules and their writer, reports and their e-mails, cloud migration session, upload and token                                      | report name or org                                   |
| Bulk                   | `POST /annotations/mass-delete`                                                                                                             | org                                                  |

**`grafanacloud` locks.** Each write is locked with a typed confirmation. `DELETE *`, `PUT *` and `PATCH *` lock one that a newer spec adds. Creates confirm on the body field that the summary shows first.

| Area                   | Operations                                                                      | Literal                                |
| ---------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Stacks                 | create (billed), update (can turn off delete protection), delete (irreversible) | body `slug` or `name`, else stack slug |
| Stack plugins          | install and update (third-party code runs in the stack), uninstall              | stack slug                             |
| Stack service accounts | create with any role, token create and delete, delete                           | stack slug or account name             |
| Org members            | add, role change, remove                                                        | org slug or member username            |
| Org settings           | `POST /orgs/{slugOrId}/settings`: MFA, token expiry, invite domains             | org slug                               |
| Access policies        | create, update (scopes and realms are privileges), delete                       | policy name                            |
| Tokens                 | create (takes its policy's privileges), update (an expiry extends them), delete | policy name or token name              |

**`grafana-adaptive` locks.** Each write that changes which telemetry is kept is locked, matched by verb: `*.create`, `*.update`, `*.delete`, `*.replace`, `*.apply` and `*.updateConfig`. A later write with one of these verbs is locked until a review. Only `traces.recommendations.dismiss` is a plain write, because it changes no policy.

- Rules, recommendation settings and trace policies decide what is aggregated, dropped or sampled away. `auto_apply` changes rules without a review.
- A deleted exemption or rule lets recommendations drop data again, or raises cost.
- A trace recommendation applies policy changes in bulk. Its target id holds a hash of its actions, so a recommendation that changes during the approval changes the target, and core refuses the call.
- Instance-wide writes confirm on the service's instance ID. Other writes confirm on the stored metric, stream selector or name, or on the instance ID when it cannot be read.

**Key spelling.** Go's `encoding/json` binds keys without regard to case, the last match wins, and it folds `ſ` to `s` and the Kelvin sign to `k`.

- `grafana` checks each object on the pointers that the plugin or core reads, and anything under `queries`.
- `grafanacloud` and `grafana-adaptive` check the query and the body at any depth.
- Two keys that are equal under case folding, or a key that is not printable ASCII, are refused with `INVALID_PARAMS`.
- A lone key in another case is renamed to the spelling that the rules read.

**Approval context.**

- `grafana` puts the destination fields first, ahead of the body cut at 1000 characters: `url`, `settings.addresses`, `recipients`, `emails`, `external` and `receiver`.
- `grafana` targets name a stored data source as `<name> (<type>, <url>)`. A contact point names only the host of `settings.url`, because Slack, Discord, Teams and webhook URLs carry a token in the path.
- `grafanacloud` puts the fields that grant or move something first: realms, scopes, policy, expiry, slug, region, plan, plugins, role and org settings. Its targets name the stored stack, policy or token.
- `grafana-adaptive` summaries name the destination, then what is dropped, then the request. A rules replacement is compared with the rules in force, and each dropped or removed rule is named with its match type.
- Model-written values are quoted and escaped: control, bidi and zero-width characters.

**`grafana-adaptive` requests.** URLs must be `https`, or `http` on a loopback address, and only their origin is used. Each request uses HTTP Basic with the service's instance ID and the access policy token. Path ids match `[A-Za-z0-9][A-Za-z0-9_.:-]*`, so `.`, `..` and `/` are refused. Rules writes need `ifMatch`, and other calls refuse it.

**Secrets.**

| Plugin             | `sensitiveKeys`                                                                                  | `sensitiveParams` and `sensitiveResult`                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grafana`          | `token`, `key`, `apiKey`, `api_key`, `password`, `basicAuthPassword`, `secret`, `secureJsonData` | Params: data source `secureJsonData`, `basicAuthPassword` and `password`, contact point `settings.url` and `settings.password`, user passwords, SSO `clientSecret` and `privateKey`, the migration `authToken`, the license `token`. Results: data source credentials (deep), contact point `url` (deep), invite `code` and `url`, and `key`, `token`, `deleteKey` and `deleteUrl` of new tokens and snapshots |
| `grafanacloud`     | `token`, `key`, `password`, `machineLearningLogsToken`, `client_secret`, `private_key`           | Results: `token` of a new token, `key` of a new stack service account token, and `machineLearningLogsToken` and `config` of each stack record                                                                                                                                                                                                                                                                  |
| `grafana-adaptive` | the access policy token                                                                          | Responses carry no secrets                                                                                                                                                                                                                                                                                                                                                                                     |

A snapshot's view `url` stays visible, because sharing it is the point.

### Consequences

- Good, because a grant, a share, an outbound send or a deletion always needs a typed confirmation.
- Good, because an approval cannot show one key while the upstream binds another.
- Bad, because `grafana` leaves out the app platform APIs, alert state and the SLO app for now. They have no pinned spec.
- Bad, because each `grafanacloud` write asks for a literal, also small ones.

The feature files in `features/grafana/`, `features/grafanacloud/` and `features/grafana-adaptive/`, and each plugin's `test/compliance.yaml`, specify the behavior.
