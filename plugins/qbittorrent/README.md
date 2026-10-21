# qBittorrent

qBittorrent 5.x for Synoikia: torrents, categories, tags, transfer limits, logs, RSS and search. qBittorrent serves no API spec. So `plugin.yaml` declares a fixed set of WebUI API v2 operations. Security decisions: [`docs/adrs/0009-qbittorrent.md`](../../docs/adrs/0009-qbittorrent.md).

The sandbox calls `qbittorrent.call(key, params)` with flat params, named as qBittorrent names them (`torrents.setCategory`, `{ hashes, category }`). A read sends them as the query, a write as a form (`torrents.add` as multipart). Every call goes through Synoikia's permission gate, approvals, redaction and audit log; this plugin only describes qBittorrent's API.

## Files

| File              | What                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `manifest.json`   | Binding, connection form, `sensitiveKeys` and network hosts                                      |
| `plugin.yaml`     | The declared operations, locks, split twins, confirmation sources, sensitive params and results  |
| `instructions.md` | How to call the API, for the model                                                               |
| `src/plugin.ts`   | Handlers: param checks, split twins, request bodies, invoke                                      |
| `src/session.ts`  | Sign-in with the WebUI username and password; the session cookie (`SID` or `QBT_SID_<port>`)     |
| `src/params.ts`   | Declared names only, types, case-duplicates, torrent hashes and `all`                            |
| `src/mask.ts`     | URLs in results masked to their origin plus a token; writes take the token back                  |
| `src/stored.ts`   | Reads of the stored torrents, categories, tags, RSS items and rules, search plugins and trackers |
| `src/targets.ts`  | Targets of each write and the confirmation literals taken from them                              |
| `src/summary.ts`  | Approval texts, destination first                                                                |
| `src/policy.ts`   | Locks that must exist; the plugin refuses to load without them                                   |
| `test/`           | A fake qBittorrent, unit, golden and e2e tests on Synoikia's harness                             |

## Connection

See the manifest's `connection.help`: the WebUI base URL, username and password. qBittorrent 5.0 or later (WebUI API 2.11).

## Locked operations

| Operation                                                                                            | Confirm                                                   |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `torrents.delete#with-files` (`deleteFiles: true`, for one torrent, several or `all`)                | the torrent's name, `<n> torrents`, or `all <n> torrents` |
| `search.uninstallPlugin`, `search.enablePlugin`                                                      | the plugin names                                          |
| `app.setPreferences`, `app.shutdown`, `search.start`, `search.installPlugin`, `search.updatePlugins` | the base URL's host name                                  |

Other torrent, category, tag, tracker and RSS writes are regular writes, with the same destination-first summaries.

Sign-in, cookies, the API key, `torrents/export`, the directory browser, torrent creation and uploads from disk are not declared at all.
