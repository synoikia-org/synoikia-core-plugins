# qBittorrent plugin: design

qBittorrent (https://www.qbittorrent.org/) is a BitTorrent client with a WebUI. This plugin exposes its WebUI API v2 through Synoikia's `search` and `execute` tools. Where this note and Synoikia's design disagree, Synoikia's design applies.

## Sources

Checked against the qBittorrent source, not only the wiki:

| Release | Commit | WebUI API |
| --- | --- | --- |
| 5.0.0 | `cce295faeb27ebf9d57498ac5e35490c845b9d4f` | 2.11.2 |
| 5.1.0 | `da87be2b12893dfb769df8124afeb064f099dc71` | 2.11.4 |
| 5.2.4 | `a1e4649cb8ae581925acc161dbab5cbc6584c542` | 2.15.1 |

Files: `src/webui/webapplication.{h,cpp}` (dispatch, allowed methods, session cookie, CSRF and Host header checks), `src/webui/api/*controller.cpp` (each action's params), `src/base/http/requestparser.cpp` (query and form parsing), `src/base/addtorrentmanager.cpp` (what `torrents/add` reads). The wiki page `WebUI-API-(qBittorrent-5.0)` (wiki commit `b2b306e63d507a8dfe5403bd364c89b5e7df6c31`) still documents `torrents/pause` and `resume`; the 5.0 source has only `stop` and `start`, so the plugin follows the source.

## Catalog source

qBittorrent has no OpenAPI spec, served or published. The plugin is a `static-rest` plugin: `plugin.yaml` declares a fixed set of operations, keyed `<group>.<method>` after `/api/v2/<group>/<method>`. Nothing else is reachable.

The sandbox calls `qbittorrent.call(key, params)`. Params are one flat object, named as qBittorrent names them. qBittorrent reads a GET's params from the query only and a POST's from the body only (`WebApplication::processRequest`), so reads send them as the query and writes as the body: `application/x-www-form-urlencoded` (`http.body: form`), and `multipart/form-data` text fields for `torrents/add` (`http.body: multipart`, no file parts). Object params (`app.setPreferences` `json`, `rss.setRule` `ruleDef`) are sent as JSON text in their field, as qBittorrent expects.

Every read is a GET and every write a POST; the plugin refuses to load otherwise. qBittorrent accepts a GET for any action not in its POST-only list (`m_allowedMethod`), such as `rss/setFeedRefreshInterval` and `search/downloadTorrent`; those are not declared.

## Operations

| Group | Reads | Writes | Locked |
| --- | --- | --- | --- |
| `app` | `version`, `webapiVersion`, `buildInfo`, `preferences`, `defaultSavePath` | | `setPreferences`, `shutdown` |
| `transfer` | `info`, `speedLimitsMode` | `setDownloadLimit`, `setUploadLimit`, `toggleSpeedLimitsMode` | |
| `torrents` | `info`, `properties`, `trackers`, `webseeds`, `files`, `pieceStates`, `categories`, `tags` | `stop`, `start`, `recheck`, `reannounce`, `setCategory`, `addTags`, `removeTags`, `setDownloadLimit`, `setUploadLimit`, `setShareLimits`, `topPrio`, `bottomPrio`, `filePrio`, `rename`, `renameFile`, `renameFolder`, `createCategory`, `createTags` | `delete`, `add`, `setLocation`, `setSavePath`, `editCategory`, `removeCategories`, `deleteTags`, `addTrackers`, `editTracker`, `removeTrackers` |
| `sync` | `maindata` (`rid`) | | |
| `log` | `main`, `peers` | | |
| `rss` | `items`, `rules` | | `addFeed`, `setFeedURL`, `removeItem`, `setRule`, `removeRule` |
| `search` | `plugins`, `status`, `results` | `stop`, `delete` | `start`, `installPlugin`, `uninstallPlugin`, `enablePlugin`, `updatePlugins` |

Not declared: `auth/*` (the plugin's own sign-in only), `app/cookies` and `setCookies` (secrets), `app/rotateAPIKey` and `deleteAPIKey`, `app/getDirectoryContent` (browses the host's file system), `app/sendTestEmail`, `torrents/export` (binary), `torrents/setSSLParameters` and `SSLParameters` (a private key), `torrents/fetchMetadata`, `parseMetadata` and `saveMetadata`, `torrentcreator/*`, `clientdata/*`, `search/downloadTorrent`, `torrents/addPeers`, `transfer/banPeers`, web seed writes, and `pause`/`resume` (gone in 5.0).

`torrents.add` takes `http(s)` URLs and magnet links only. `AddTorrentManager::addTorrent` treats any other source as a path on the qBittorrent host (and may delete that file after adding it), so file paths and `file://` are refused. The `ssl_*` and `downloader` fields (a private key; a search plugin that fetches the URL) are not declared. `search.installPlugin` takes `https` URLs only: qBittorrent also installs from a local path.

## Auth

`POST /api/v2/auth/login` with the connection's `username` and `password` as a form. It answers 204 (5.2) or 200 `Ok.` (5.0, 5.1) and sets the session cookie; wrong credentials get 401 (5.2) or 200 `Fails.`; a banned address gets 403. The cookie is `QBT_SID_<WebUI port>` from 5.2 and `SID` (or the configured `WebAPISessionCookieName`) before. The plugin takes `SID` or `QBT_SID_<n>` from `Set-Cookie`, else the only cookie set, and sends it on every call. A call without a valid session gets 403; the plugin signs in again once (`HttpJsonClient` `before`/`onAuthFailure`, single-flight). The password and cookie never reach an error. 5.2's API key (`Authorization: Bearer`) is not used.

CSRF: `isCrossSiteRequest` treats a request with neither `Origin` nor `Referer` as same-site, so the plugin sends neither. Host header validation compares the `Host` header (the base URL's host) with the WebUI's *Server domains*; the connection help says to add it.

The version check reads `app/webapiVersion` and `app/version` and refuses WebUI API before 2.11 (qBittorrent 5.0).

## Params

qBittorrent keeps params in a case-sensitive `QHash` (`requestparser.cpp`): a repeated name keeps the last value, and a name in another case is a different param that the action never reads. The plugin:

- refuses names the operation does not declare, so `DeleteFiles` beside `deleteFiles` (which qBittorrent would ignore while a plugin check read it) never reaches a split decision;
- refuses names that differ only by case, and arrays or objects except for the declared object params, so no value is sent twice;
- checks each value's declared type (`deleteFiles` must be a JSON boolean, not `"true"`).

Torrent hashes are 40 hex characters, normalized to lower case. `hashes` (and `setSavePath`'s `id`) take several joined with `|`, or `all`. qBittorrent compares `all` exactly (`applyToTorrents`), so `ALL` is refused, not sent as a hash that matches nothing. `topPrio` and `bottomPrio` do not take `all` (`toTorrentIDs`). Operations on one torrent take `hash`; `addTrackers` and `removeTrackers` would also apply a `|` list or `all` (and `removeTrackers` `*`) to every torrent, so they take exactly one hash. Paths in `renameFile` and `renameFolder` must be relative, without `.` or `..` segments.

## Locks

| Operation | Why | Literal |
| --- | --- | --- |
| `torrents.delete`, `torrents.delete#with-files` | Removes torrents; the twin (`deleteFiles: true`) deletes their data | stored name, `<n> torrents`, or `all <n> torrents` |
| `<op>#all` (stop, start, recheck, reannounce, setCategory, addTags, removeTags, setDownloadLimit, setUploadLimit, setShareLimits) | `hashes=all` acts on every torrent, also ones added during the approval wait | `all <n> torrents` |
| `torrents.setShareLimits#remove` | `Remove` or `RemoveWithContent` deletes torrents (and data) once a limit is reached | stored name or `<n> torrents` |
| `torrents.setLocation`, `torrents.setSavePath` | Moves data on disk to a path the model chose | stored name or `<n> torrents` |
| `torrents.editCategory` | Its torrents in automatic management move to the new path | stored category name |
| `torrents.createCategory#paths` | A new category with a save path the model chose; `setCategory` then moves data there | base URL host name |
| `torrents.removeCategories`, `torrents.deleteTags` | Removes them from every torrent | stored names |
| `torrents.addTrackers`, `editTracker`, `removeTrackers` | Changes where a torrent announces (and its passkey) | stored torrent name |
| `torrents.add` | Fetches URLs and writes files | base URL host name |
| `app.setPreferences` | WebUI credentials and access, network binding, autorun programs and the Python path (code execution) | base URL host name |
| `app.shutdown` | Stops the client | base URL host name |
| `rss.addFeed`, `setFeedURL`, `removeItem` | Fetches URLs; removes feeds | host name; stored feed or folder path |
| `rss.setRule`, `rss.removeRule` | A rule downloads matching articles with no further approval | stored rule name; host name for a new rule |
| `search.start` | Runs the search plugins' Python code | host name |
| `search.installPlugin`, `updatePlugins` | Installs code that later searches run | host name |
| `search.uninstallPlugin`, `enablePlugin` | Changes which code runs | stored plugin names |

Literals come from the targets, which the plugin reads back from qBittorrent (`torrents/info`, `categories`, `tags`, `rss/items`, `rss/rules`, `search/plugins`, `torrents/trackers`); never from the call. When a named torrent, category, tag, feed, rule, plugin or tracker does not exist, there is no literal and core refuses the call. qBittorrent has no instance name, so instance-wide locks confirm on the base URL's host name.

`src/policy.ts` lists the locks that must exist. The plugin refuses to load when one is missing or not locked, or when a rule names an operation `plugin.yaml` does not declare.

`torrents.setCategory`, `createCategory` without paths and the other writes are plain writes: an admin decides at the group level. `setCategory`'s summary names the category's save path, since torrents in automatic management move there.

## URLs in results

Tracker URLs often carry a passkey (`?passkey=`, or a path segment), and RSS feed, web seed and search result URLs can carry API keys. The plugin masks every URL in a result, in strings, in free text (log messages, comments) and in object keys (`sync/maindata` `trackers`):

- `scheme://host[:port]/<masked:token>`, where the token is the first 12 hex characters of an HMAC-SHA256 of the URL under a per-process random key. A URL with no path, query or credentials is kept.
- A magnet link keeps `xt` and `dn` and masks the rest (`tr`, `ws`, …) into one token.

`torrents.add`, `addTrackers`, `editTracker`, `removeTrackers`, `rss.addFeed`, `setFeedURL`, `setRule` (`affectedFeeds`) and `search.installPlugin` take a masked URL back. Trackers and feeds resolve against the stored ones; other URLs against the masks the plugin handed out (the last 20,000). An unknown token is refused. The real URL goes only to qBittorrent.

URL params are `sensitiveParams`, so core keeps them out of approvals and the audit log; the approval shows each URL's origin from the targets. `app.preferences` masks the API key, passwords, autorun programs and the extra tracker lists (`sensitiveResult`), and core masks the password keys by name too. In `app.setPreferences`, password and tracker values are `sensitiveParams`; the autorun program is shown, as the approver must see what will run. qBittorrent error text is URL-masked too.

## Targets

| Kind | For |
| --- | --- |
| `torrent` (id: hash, name: stored name), `all-torrents` (id: `all:<n>:<hash of the set>`) | torrent writes |
| `category`, `tag`, `rss-item`, `rss-rule`, `search-plugin` | their writes |
| `tracker` (id: masked URL, name: origin), `new-tracker`, `source`, `feed-url` | URLs the write uses |
| `instance` (the host name) | instance-wide writes |
| `missing-<kind>` | a name qBittorrent does not have |

Targets hold no status: core resolves them again after the approval wait and refuses the call when they changed, so `all` refuses when a torrent was added or removed meanwhile. Reads have no targets.

## Summaries

Destination first: `qBittorrent torrents.setLocation to "/archive" for 2 torrents: "A", "B": moves their data; turns off automatic management`, `qBittorrent torrents.add into "/downloads/linux" (the category's save path) on qBittorrent at qbt.lan: 1 source(s): magnet "Fedora 42"`. Names, paths, tags and other strings are escaped (control, bidi and zero-width characters as `\uXXXX`), truncated and quoted. Lists show at most 10 names. `app.setPreferences` lists each changed preference with notes from `plugin.yaml` (`runs a program`, `changes WebUI access`, `changes network binding`, `reads or writes files`, `fetches URLs or sends data out`).
