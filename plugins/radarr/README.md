# Radarr

Exposes a Radarr instance's v3 REST API through Synoikia's `search` and `execute` tools. Its 227 operations cover movies, lookups, queue, history, calendar, wanted, commands, profiles and custom formats. They also cover download clients, indexers, import lists, notifications, settings and system. Radarr release builds don't serve their spec. So the catalog comes from `src/Radarr.Api.V3/openapi.json` in Radarr's repository, at the tag of the installed version, else `develop`. Security decisions: [`docs/adrs/0002-servarr-apps.md`](../../docs/adrs/0002-servarr-apps.md).

The sandbox calls `radarr.request({ method, path, query, body })` with the full `/api/v3` path:

```js
const { id } = await radarr.request({
  method: 'POST',
  path: '/api/v3/command',
  body: { name: 'MoviesSearch', movieIds: [1] },
});
return await radarr.request({ path: `/api/v3/command/${id}` });
```

Every call goes through Synoikia's permission gate, approvals, redaction and audit log; this plugin only describes Radarr's API.

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
| `src/fields.ts`   | Provider `fields[]`: secret masking in results, destinations, refusing masked values in writes                  |
| `src/targets.ts`  | Movies and provider connections a call acts on, shown to the approver                                           |
| `src/request.ts`  | Case-insensitive keys: refuses case duplicates, renames the keys the rules read                                 |
| `src/stored.ts`   | Split checks that read upstream: a changed destination (`#stored`), a program (`#script`), a folder (`#folder`) |
| `src/describe.ts` | Generated descriptions for operations the spec leaves undocumented                                              |
| `src/locks.ts`    | Refuses a spec that lacks a locked operation                                                                    |
| `test/`           | A fake Radarr serving the pinned v6.4.4.10685 spec, unit, golden and e2e tests                                  |

## Locked operations

Bulk edits and deletes (the movie editor, every `…/bulk` and `…/editor` delete); moving movie files; commands that rename, move or delete files or change the application; notifications that run a program (`#script`); download clients that write files to a host folder, such as the blackhole clients (`#folder`); provider and notification saves, tests and actions that send the stored credentials to another destination (`#stored`); host and media management settings (import script); the UI password reset; shutdown and restart; backup restore. Single-item creates, edits and deletes, `deleteFiles` included, are regular writes. Root folders are among them, and a new one lists the host folders under it. Reasons and literals are in the design note and `plugin.yaml`.
