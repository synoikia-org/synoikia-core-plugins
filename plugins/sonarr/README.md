# Sonarr

Exposes a Sonarr v4 instance's REST API (`/api/v3`, 224 operations: series, episodes, episode files, lookups, queue, history, calendar, wanted, commands, profiles, custom formats, download clients, indexers, import lists, notifications, settings and system) through Synoikia's `search` and `execute` tools. Sonarr release builds don't serve their spec, so the catalog comes from `src/Sonarr.Api.V3/openapi.json` in Sonarr's repository at the tag of the installed version (`main`, the v4 release branch, if there is none). Design: [`docs/designs/sonarr.md`](../../docs/designs/sonarr.md).

The sandbox calls `sonarr.request({ method, path, query, body })` with the full `/api/v3` path:

```js
const { id } = await sonarr.request({
  method: 'POST',
  path: '/api/v3/command',
  body: { name: 'SeriesSearch', seriesId: 1 },
});
return await sonarr.request({ path: `/api/v3/command/${id}` });
```

Every call goes through Synoikia's permission gate, approvals, redaction and audit log; this plugin only describes Sonarr's API.

## Connection

A base URL, the API key from Settings → General → Security (sent as `X-Api-Key`), and optionally a mirror for the spec.

## Files

| File              | What                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `manifest.json`   | Binding, connection form, targets, `sensitiveKeys` and network hosts                                     |
| `plugin.yaml`     | Excluded routes, locks, split twins, confirmation literals, sensitive params and results, quick commands |
| `instructions.md` | Agent instructions (API shape, commands, common workflows); core adds it to the MCP server instructions  |
| `src/spec.ts`     | Servarr spec loader: 4-part version → release tag, fallback branch, mirror (same as Radarr)              |
| `src/catalog.ts`  | Settings, split predicates, custom confirmation sources, catalog build                                   |
| `src/fields.ts`   | Provider `fields[]`: secret masking in results, destinations, refusing masked values (same as Radarr)    |
| `src/targets.ts`  | Series, episode files and provider connections a call acts on, shown to the approver                     |
| `src/request.ts`  | Case-insensitive keys: refuses case duplicates, renames the keys the rules read (same as Radarr)         |
| `src/stored.ts`   | Split checks that read upstream: a changed destination (`#stored`), a notification that runs a program   |
| `src/describe.ts` | Generated descriptions for operations the spec leaves undocumented                                       |
| `src/locks.ts`    | Refuses a spec that lacks a locked operation (same as Radarr)                                            |
| `test/`           | A fake Sonarr serving the pinned v4.0.20.3014 spec, unit, golden and e2e tests                           |

## Locked operations

Bulk edits and deletes (the series editor, season pass, every `…/bulk` and `…/editor` delete); moving series files; commands that rename, move or delete files or change the application; notifications that run a program (`#script`); provider and notification tests and actions that send the stored credentials to another destination (`#stored`); host and media management settings (import script); the UI password reset; shutdown and restart; backup restore. Single-item creates, edits and deletes, `deleteFiles` included, are regular writes. Reasons and literals are in the design note and `plugin.yaml`.
