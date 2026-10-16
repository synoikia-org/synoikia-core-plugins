# TrueNAS

TrueNAS 25.04+ JSON-RPC 2.0 middleware API. Operation keys are method names, `<namespace>.<verb>`, as in `pool.dataset.query`. Call `truenas.call(method, params)` with params positional, as an array (one object may be passed bare). Pools, users and API keys have integer ids; a dataset's id is its name (`tank/media`); an app's id is its name; paths are under `/mnt/<pool>/`.

Query methods take `[filters, options]`: filters like `[["name", "=", "tank"]]`, options `{ limit, offset, order_by, select }`. `get_instance` takes one id. Job methods (`pool.scrub.run`, `app.upgrade`) are awaited; one that outlives the script keeps running, so check it with `core.get_jobs`.

Workflows:

- Storage: `pool.query` → `pool.dataset.query` (filter on `pool`) → `pool.dataset.create` (`name: "<pool>/<path>"`).
- Share a folder: `pool.dataset.create` → `sharing.smb.create` (`path`, `name`) → `sharing.smb.query`.
- Apps: `app.query` → `app.upgrade` (app name); `app.available_space`.
- Health: `system.info`, `system.version`, `disk.query`, `pool.scrub.run`.
- Permissions: `filesystem.listdir` → `filesystem.setacl` or `filesystem.chown` on a path inside a dataset.

Locked: reboot, shutdown, config reset, pool export, disk wipe, dataset delete and key changes, user delete and passwords, app delete, every `api_key.*` method, and ACL or owner changes at a pool root, outside `/mnt` or with `.`/`..` segments (`filesystem.setacl#pool-root`). Session methods and other `core.*` methods are not available.
