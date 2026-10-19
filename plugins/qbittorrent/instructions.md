# qBittorrent

Call `qbittorrent.call(key, params)`. Keys are `<group>.<method>` of the WebUI API v2. Params are one flat object, named as qBittorrent names them:
`qbittorrent.call('torrents.info', { filter: 'downloading', limit: 20 })`. Unknown names are refused.

- Torrents are named by `hash` (from `torrents.info`); several take `hashes` joined with `|`, or `'all'`.
- Tags join with `,`; categories in `torrents.removeCategories` and URLs in `torrents.add` one per line.
- Limits are bytes per second, 0 or -1 unlimited. Share limits: -2 global, -1 none; times in minutes.
- RSS paths join folders with a backslash: `Folder\Feed`. `app.setPreferences` takes `{ json: { name: value } }`.

URLs in results (trackers, web seeds, feeds, search results) show as their origin plus a mask token; pass one back
as is and the plugin resolves it.

Workflows:

- Overview: `transfer.info`, then `torrents.info` with `filter`; for polling, `sync.maindata` with the last `rid`.
- Organize: `torrents.categories`, then `torrents.setCategory` or `torrents.addTags`.
- Search and add: `search.start` (returns `id`), poll `search.status` until `Stopped`, read `search.results`,
  then `torrents.add` with the chosen `fileUrl`.
- Pause and resume: `torrents.stop`, `torrents.start`.

Locked (typed confirmation): deleting torrents with `deleteFiles: true`, preferences, shutdown and search
(start, plugin install, uninstall, enable, update). No sign-in, API key, torrent file export or uploads from disk.
