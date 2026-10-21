---
status: accepted
date: 2026-09-29
---

# TrueNAS

## Context and Problem Statement

TrueNAS 25.04+ has a JSON-RPC 2.0 API over WebSocket with about 700 methods in about 110 namespaces. `core.get_methods` lists them from the running system, with their declared roles. Some methods wipe disks, export pools, delete datasets or change encryption keys. Several methods take or return secrets under names that key masking cannot see, such as dataset keys and keytab files. Which methods need a typed confirmation, and how does the plugin classify the rest when a name is unclear?

## Decision Drivers

- `core.get_methods` is the source of truth for each version, so no spec file must be kept current.
- A destructive method must never run without a human who types what it destroys.
- An ACL or owner change at a pool's root changes access to everything under it.
- `core.*` middleware can dispatch other methods around the locks.
- Job records embed the results and arguments of other methods.

## Considered Options

- Live introspection, a fixed lock list, a split for pool-root ACL changes, and a classification that fails closed: lock, then roles, then naming, else write.
- A static spec from `api.truenas.com`.
- Naming conventions alone.

## Decision Outcome

Chosen option: "Live introspection, a fixed lock list and a classification that fails closed". A new TrueNAS version needs no code change. Its new methods arrive classified, and an unclear one is a write.

**Catalog source.** The plugin calls `core.get_methods` on the connected system at each sync. `network.hosts` is only the instance.

**Excluded.** Session plumbing (`auth.login`, `auth.login_ex`, `auth.login_with_api_key`, `auth.login_with_token`, `auth.logout`) and `core.*`. Some `core.*` methods dispatch other methods around the locks. Only `core.get_jobs`, `core.get_methods`, `core.ping` and `core.job_abort` are included.

**Classification** (`src/catalog.ts`).

1. A lock wins. A locked method is a write with typed confirmation.
2. Declared roles can only make a method stricter, or settle an unclear name. A method without a read role is a write. A read role (`READONLY_ADMIN` or any `*_READ`) reads, unless the name says write.
3. The name decides. `query`, `get_instance`, `config`, `status`, `choices` and `info` as the last part, or `list`, `listdir`, `get` and `search` as the verb, read.
4. `create`, `update` and `delete` as the last part, or a write verb, write. The write verbs include `run`, `start`, `stop`, `install`, `upgrade`, `reboot`, `wipe`, `export`, `remove`, `replace`, `set`, `lock`, `unlock`, `import`, `sync`, `scrub`, `dismiss` and `restore`.
5. Anything else is a write.

**Locks.** Each locked method without its own literal confirms on the system's hostname (`system.info`).

| Methods                                                                                          | Why                                                         | Literal                                                                                                           |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `system.reboot`, `system.shutdown`, `config.reset`                                               | Stops the system, or resets its configuration               | hostname                                                                                                          |
| `pool.export`                                                                                    | Takes a pool offline                                        | the pool's name                                                                                                   |
| `disk.wipe`                                                                                      | Erases a disk                                               | the disk                                                                                                          |
| `pool.dataset.delete`, `pool.dataset.change_key`, `pool.dataset.export_key`                      | Deletes a dataset, or changes or exports its encryption key | the dataset                                                                                                       |
| `app.delete`, `docker.delete_backup`                                                             | Removes an app or a backup                                  | its name                                                                                                          |
| `user.delete`, `user.set_password`                                                               | Removes a user, or changes a password                       | the username                                                                                                      |
| `user.renew_2fa_secret`, `user.setup_local_administrator`, `user.has_local_administrator_set_up` | Second factor and the local administrator                   | the user, else hostname                                                                                           |
| `auth.generate_token`, `auth.generate_onetime_password`                                          | Mints a credential                                          | hostname                                                                                                          |
| `audit.config`, `interface.network_config_to_be_removed`                                         | Audit settings, and network changes waiting to apply        | hostname                                                                                                          |
| `api_key.*`, also methods that a future TrueNAS adds there                                       | API keys                                                    | for `api_key.create`, the username the key acts as, else hostname. For an update or delete, the stored key's name |

- A literal that comes from a lookup uses a plain id only. Without one, the approver types the hostname.
- What an API key can do comes from the user it acts as, not from its name, which the model chose. So `api_key.create` confirms on the username.

**Pool-root split.** `filesystem.setacl` and `filesystem.chown` take the locked twin `#pool-root` when the path is a pool's root (`/mnt/<pool>`) or is outside `/mnt`. They also take it when the path has `.` or `..` segments, or is not a string. Deeper down, they are regular writes. The literal is the path, else the hostname.

**Secrets.**

| Where                    | How                             | What                                                                                                                                                                                                      |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sensitiveKeys`          | by key name                     | `apiKey`, `api_key`, `password`, `passphrase`, `bindpw`, private keys, SNMP and SSH host keys, `encryption_key`, service and routing keys, DH-CHAP keys, `unixhash`, `smbhash` and `keyhash`              |
| `sensitiveParams`        | params with no telling key name | the local administrator password, pool and dataset encryption keys, dataset unlock keys (the first 32 datasets), keytab files, cloud credential `provider.key`, and the `key` of a cloud credential check |
| `sensitiveResult: whole` | the whole result                | `auth.generate_token`, `auth.generate_onetime_password`, `pool.dataset.export_key`, `user.provisioning_uri`                                                                                               |
| `sensitiveResult` keys   | by field                        | `key` (deep) in `cloudsync.*` and `cloud_backup.*`. `file` in `kerberos.keytab.*`. `key` in `api_key.*`, `pool.dataset.*` and `pool.create`                                                               |

- The first rule that matches wins, so whole-result rules come before the namespaces that hold them.
- Job records embed other methods' results and arguments. The plugin masks each record by the rules of its own method (`rules.maskEmbeddedResult`).
- The plugin also masks `key` in summaries and job records.

### Consequences

- Good, because a new TrueNAS version is classified without a code change, and an unclear method is a write.
- Good, because each destructive method needs the approver to type what it destroys.
- Good, because an ACL change deep in a dataset stays a regular write, and only the pool root needs a literal.
- Bad, because `core.*` methods other than the four included ones are not reachable.

The feature file in `features/truenas/` and `plugins/truenas/test/compliance.yaml` specify the behavior.
