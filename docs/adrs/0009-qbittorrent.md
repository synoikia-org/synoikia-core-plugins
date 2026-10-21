---
status: accepted
date: 2026-10-19
---

# qBittorrent

## Context and Problem Statement

qBittorrent 5.x has a WebUI API v2 and no spec. It can delete downloaded data, run search plugins as Python code, run autorun programs, and fetch any URL that a call names. Tracker, feed and search URLs carry passkeys and API keys. Qt reads some URLs differently from Node, so an approval could show one host while qBittorrent fetches another. Which operations does the plugin expose, what needs a typed confirmation, and how does it keep URLs true and hidden?

## Decision Drivers

- `torrents/add` treats a source that is not a URL as a path on the host, and may delete that file.
- Search plugins and autorun programs run code on the host.
- qBittorrent keeps params case-sensitive and keeps the last of a repeated name.
- A category name with `..` resolves out of the save root on 5.0 and 5.1.
- An approval must name each host that qBittorrent or libtorrent will contact.

## Considered Options

- A fixed set of declared operations, checked against the qBittorrent source. Lock data deletion, preferences, shutdown and search code. Refuse ambiguous URLs, and mask each URL in results.
- The whole WebUI API as the wiki documents it.

## Decision Outcome

Chosen option: "A fixed set of declared operations, checked against the source". The wiki is out of date for 5.0, so the plugin follows the source of 5.0.0, 5.1.0 and 5.2.4. Nothing else is reachable.

**Operations.** Keys are `<group>.<method>`, after `/api/v2/<group>/<method>`. Each read is a GET and each write a POST, and the plugin refuses to load otherwise.

| Group      | Reads                                                                                      | Writes                                                                                                                                                    | Locked                                                                       |
| ---------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `app`      | `version`, `webapiVersion`, `buildInfo`, `preferences`, `defaultSavePath`                  |                                                                                                                                                           | `setPreferences`, `shutdown`                                                 |
| `transfer` | `info`, `speedLimitsMode`                                                                  | `setDownloadLimit`, `setUploadLimit`, `toggleSpeedLimitsMode`                                                                                             |                                                                              |
| `torrents` | `info`, `properties`, `trackers`, `webseeds`, `files`, `pieceStates`, `categories`, `tags` | `stop`, `start`, `recheck`, `reannounce`, category, tag, limit, priority and rename writes, `delete`, `add`, `setLocation`, `setSavePath`, tracker writes | `delete#with-files`                                                          |
| `sync`     | `maindata`                                                                                 |                                                                                                                                                           |                                                                              |
| `log`      | `main`, `peers`                                                                            |                                                                                                                                                           |                                                                              |
| `rss`      | `items`, `rules`                                                                           | `addFeed`, `setFeedURL`, `removeItem`, `setRule`, `removeRule`                                                                                            |                                                                              |
| `search`   | `plugins`, `status`, `results`                                                             | `stop`, `delete`                                                                                                                                          | `start`, `installPlugin`, `uninstallPlugin`, `enablePlugin`, `updatePlugins` |

| Not declared                                                                                                                                            | Why                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `auth/*`, `app/cookies`, `setCookies`, `app/rotateAPIKey`, `deleteAPIKey`                                                                               | The plugin's own sign-in, and secrets                                        |
| `app/getDirectoryContent`                                                                                                                               | Browses the host's file system                                               |
| `torrents/setSSLParameters`, `SSLParameters`                                                                                                            | A private key                                                                |
| `app/sendTestEmail`, `torrents/export`, metadata, `torrentcreator/*`, `clientdata/*`, `search/downloadTorrent`, `addPeers`, `banPeers`, web seed writes | Binary, outbound or out of scope                                             |
| GET forms of POST actions                                                                                                                               | qBittorrent accepts a GET for some actions, such as `search/downloadTorrent` |

- `torrents.add` takes `http(s)` URLs and magnet links only. File paths and `file://` are refused. The `ssl_*` and `downloader` fields are not declared.
- `search.installPlugin` takes `https` URLs only, because qBittorrent also installs from a local path.

**Auth.** `POST /api/v2/auth/login` with the connection's username and password. The plugin sends the session cookie on each call.

- Only a 403 with the bare text `Forbidden` means the session expired. Then the plugin signs in again once and repeats the call, which never reached the action.
- Any other 401 or 403 is final, and a write is never repeated. The password and the cookie never reach an error.
- The plugin sends no `Origin` or `Referer`, so qBittorrent's CSRF check sees a same-site request. The WebUI's server domains must list the base URL's host.
- WebUI API before 2.11 (qBittorrent 5.0) is refused.

**Params.**

- The plugin refuses a name that the operation does not declare. So `DeleteFiles` beside `deleteFiles` never reaches a split decision.
- It refuses names that differ only in case, and arrays or objects except the declared object params. No value is sent twice.
- It checks each value's declared type. `deleteFiles` must be a JSON boolean.
- Torrent hashes are 40 hex characters, in lower case. `all` must be exact, so `ALL` is refused.
- `addTrackers` and `removeTrackers` take exactly one hash, because qBittorrent applies a list or `all` to each torrent.
- Paths in `renameFile` and `renameFolder` must be relative, without `.`, `..`, empty segments or `:`.
- Only the `torrents/add` URLs, the `addTrackers` URLs and the `removeCategories` names take LF. No field takes CR or NUL.

**Locks.** Literals come from the targets, which the plugin reads back from qBittorrent. They never come from the call. qBittorrent has no instance name, so instance-wide locks confirm on the base URL's host name.

| Operation                                | Why                                                                                 | Literal                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| `torrents.delete#with-files`             | `deleteFiles: true` deletes the downloaded data of one torrent, several or `all`    | stored name, `<n> torrents`, or `all <n> torrents` |
| `app.setPreferences`                     | WebUI credentials and access, network binding, autorun programs and the Python path | base URL host name                                 |
| `app.shutdown`                           | Stops the client                                                                    | base URL host name                                 |
| `search.start`                           | Runs the search plugins' Python code                                                | host name                                          |
| `search.installPlugin`, `updatePlugins`  | Installs code that later searches run                                               | host name                                          |
| `search.uninstallPlugin`, `enablePlugin` | Changes which code runs                                                             | stored plugin names                                |

- When a named torrent or plugin does not exist, there is no literal, and core refuses the call.
- `src/policy.ts` lists the locks that must exist. The plugin refuses to load when one is missing or not locked.
- `torrents.setShareLimits` is a regular write, `RemoveWithContent` included, by the owner's decision. The summary spells the action out.
- Torrent, category, tag, tracker and RSS writes are regular writes, also with `hashes=all`.

**Category names.** Wherever a call names a category, the plugin checks the name. It refuses an empty, `.` or `..` segment, a leading `/`, a backslash or a control character. It also refuses a segment that trims to `.` or `..`, or ends in a space or a dot, because Win32 drops those. An empty name still means no category.

**Save paths in summaries.** The plugin works out the directory where qBittorrent will save, as `categorySavePath` and `buildLoadTorrentParams` do. It covers the default save path, category paths, subcategories, automatic management and RSS rule params. The shown path is cleaned as `QDir::cleanPath` cleans it.

**URLs that qBittorrent fetches.** Qt's QUrl and Node's URL parser read some URLs differently. `https://github.com\@evil.example/x.py` is `github.com` to Node and `evil.example` to QUrl.

- Each URL that qBittorrent will fetch or announce to is refused when it has a backslash, whitespace, a control character or userinfo. It is also refused when Node's host differs from the authority as written.
- Magnet links are read as libtorrent reads them: names without regard to case, with a `.<digits>` suffix stripped. A value that is not valid percent-encoded UTF-8 refuses the call.
- `tr` must be an http(s) or udp URL, and `ws`, `xs` and `as` http(s) URLs.
- `x.pe` peers and `dht` nodes are shown as targets, not refused.
- Each tracker and source URL is a target by its origin, so the approval lists each host that libtorrent will contact.

**URLs in results.** Tracker, feed, web seed and search URLs can carry a passkey or API key.

- The plugin masks each URL in a result, in free text and in object keys, as `scheme://host[:port]/<masked:token>`. The token is an HMAC of the URL under a random key for each process. A URL with no path, query or credentials is kept.
- A magnet link keeps `xt` and `dn` and masks the rest into one token.
- Writes take a masked URL back. Trackers and feeds resolve against the stored ones, and other URLs against the last 20,000 masks. An unknown token is refused, and the real URL goes only to qBittorrent.
- URL params are `sensitiveParams`, and the approval shows each URL's origin from the targets. qBittorrent error text is masked too.
- `app.preferences` masks the API key, passwords, autorun programs and extra tracker lists. `rss.rules` masks `ssl_private_key`, `ssl_certificate` and `ssl_dh_params` at any depth.
- In `app.setPreferences`, passwords and trackers are `sensitiveParams`. The autorun program is shown, because the approver must see what will run.

**Targets.** Torrent writes name each stored torrent, or `all:<n>:<hash of the set>`. A torrent added or removed during the approval then changes the target, and core refuses the call. Categories, tags, RSS items and rules, search plugins and URLs are targets of their writes. A name that qBittorrent does not have is a `missing-<kind>` target.

### Consequences

- Good, because no data deletion or code run starts without a typed confirmation.
- Good, because an approval cannot show one host while qBittorrent fetches another.
- Good, because no passkey or feed token reaches the agent, and a masked URL still works in a later write.
- Bad, because file uploads, cookies, SSL parameters and the torrent creator stay in the WebUI.

The feature file in `features/qbittorrent/` and `plugins/qbittorrent/test/compliance.yaml` specify the behavior.
