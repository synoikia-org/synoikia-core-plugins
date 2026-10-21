# Plex

Exposes a Plex Media Server's HTTP API through Synoikia's `search` and `execute` tools. Its 303 operations cover libraries, items, search, hubs, sessions and history, playlists, play queues, collections and scrobbling. They also cover preferences, butler, updater, Live TV and DVR. PMS doesn't serve a spec. So the catalog comes from the community spec [`LukeHagar/plex-api-spec`](https://github.com/LukeHagar/plex-api-spec) at a commit pinned in `plugin.yaml`. It is cut to the operations that the server itself answers. plex.tv account and sharing APIs are out of scope. Security decisions: [`docs/adrs/0010-plex.md`](../../docs/adrs/0010-plex.md).

The sandbox calls `plex.request({ method, path, query, body })`; arguments go in `query`:

```js
const libs = await plex.request({ path: '/library/sections/all' });
const key = libs.MediaContainer.Directory[0].key;
return await plex.request({
  path: `/library/sections/${key}/recentlyAdded`,
  query: { 'X-Plex-Container-Size': 10 },
});
```

Every call goes through Synoikia's permission gate, approvals, redaction and audit log; this plugin only describes Plex's API.

## Connection

The server's own address (usually port 32400), an `X-Plex-Token`, and optionally a mirror for the spec.

## Files

| File              | What                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `manifest.json`   | Binding, connection form, targets, `sensitiveKeys` and network hosts                                      |
| `plugin.yaml`     | Excluded routes, locks, the `#refresh` twin, reviewed GETs, confirmation literals, the pinned spec commit |
| `instructions.md` | Agent instructions (API shape, paging, common workflows); core adds it to the MCP server instructions     |
| `src/spec.ts`     | Spec loader at the pinned commit; drops plex.tv and cloud operations                                      |
| `src/catalog.ts`  | Settings, split predicate, custom confirmation sources, catalog build with `:` paths                      |
| `src/request.ts`  | Query keys: refuses case duplicates, a token and masked values; renames the keys the rules read           |
| `src/mask.ts`     | Tokens in result URLs and secret server settings                                                          |
| `src/targets.ts`  | Sections, items, playlists, sessions, settings and URL origins a call acts on, shown to the approver      |
| `src/locks.ts`    | Refuses a spec that lacks a locked operation                                                              |
| `test/`           | A fake PMS serving the pinned spec, unit, golden and e2e tests                                            |

## Locked operations

Deleting a whole library; deleting several items at once (`ids` with more than one id); emptying trash and optimizing libraries; cleaning bundles; adding or changing libraries and bulk edits; anything that makes Plex fetch a URL or connect to a device; library, DVR and tuner settings, and DVR and tuner deletes; server settings; updates; starting every butler task; reads with refresh or file-check flags. Other single-item writes and deletes are regular writes, and so is taking a play queue over (`own`), which asks for an approval rather than a typed literal. Reasons and literals are in the design note and `plugin.yaml`.
