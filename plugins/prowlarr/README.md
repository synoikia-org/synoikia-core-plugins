# Prowlarr

Exposes a Prowlarr instance's v1 REST API (118 operations: indexers, search, history, stats, applications, app profiles, indexer proxies, download clients, notifications, commands, settings and system) through Synoikia's `search` and `execute` tools. Prowlarr release builds don't serve their spec, so the catalog comes from `src/Prowlarr.Api.V1/openapi.json` in Prowlarr's repository at the tag of the installed version (`develop` if there is none). Design: [`docs/designs/prowlarr.md`](../../docs/designs/prowlarr.md).

The sandbox calls `prowlarr.request({ method, path, query, body })` with the full `/api/v1` path:

```js
return await prowlarr.request({
  path: '/api/v1/search',
  query: { query: 'dune', type: 'search', indexerIds: [1, 2] },
});
```

Every call goes through Synoikia's permission gate, approvals, redaction and audit log; this plugin only describes Prowlarr's API.

## Connection

A base URL, the API key from Settings → General → Security (sent as `X-Api-Key`), and optionally a mirror for the spec.

## Files

| File              | What                                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `manifest.json`   | Binding, connection form, targets, `sensitiveKeys` and network hosts                                            |
| `plugin.yaml`     | Excluded routes, locks, split twins, confirmation literals, sensitive params and results, quick commands        |
| `instructions.md` | Agent instructions (API shape, commands, common workflows); core adds it to the MCP server instructions         |
| `src/spec.ts`     | Servarr spec loader: 4-part version → release tag, fallback branch, mirror                                      |
| `src/catalog.ts`  | Settings, split predicates, custom confirmation sources, catalog build                                          |
| `src/fields.ts`   | Provider `fields[]` and release guids: secret masking in results, destinations, refusing masked values          |
| `src/targets.ts`  | Provider connections a call acts on (with the hosts they send to) and the providers a bulk call changes         |
| `src/request.ts`  | Case-insensitive keys: refuses case duplicates, renames the keys the rules read                                 |
| `src/stored.ts`   | Split checks that read upstream: a changed destination (`#stored`), a program (`#script`), a folder (`#folder`) |
| `src/describe.ts` | Generated descriptions for operations the spec leaves undocumented                                              |
| `src/locks.ts`    | Refuses a spec that lacks a locked operation                                                                    |
| `test/`           | A fake Prowlarr serving the pinned v2.6.5.5623 spec, unit, golden and e2e tests                                 |

## Locked operations

Bulk edits and deletes (indexers, applications, download clients); application tests to every app (`applications/testall`); provider, application and notification saves, tests and actions that send the stored credentials to another destination or change their proxy tags (`#stored`); the UI password reset; notifications that run a program (`#script`); download clients that write files to a host folder, such as the blackhole clients (`#folder`); development (logging) settings; commands that sync applications, clear data or change the application; host settings; shutdown and restart; backup restore. Single-item creates, edits and deletes are regular writes. Reasons and literals are in the design note and `plugin.yaml`.
