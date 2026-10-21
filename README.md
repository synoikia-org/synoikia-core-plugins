# synoikia-core-plugins

The plugins for [Synoikia](https://github.com/synoikia-org/synoikia-core), the self-hosted MCP control plane, published as a **signed plugin repository**. Synoikia comes with this repository pre-configured and its key pinned, so its plugins can be installed from the Plugins page.

## Plugin repository

|                       |                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Index                 | `https://github.com/synoikia-org/synoikia-core-plugins/releases/download/index/index.json`                                     |
| Public key (minisign) | `RWSDbQe7ylyyieEU0Yh/bxR53m+N/0VrVMru5WCzv1/Yvt5td92t/21e` (key id `89B25CCABB076D83`, also in [`minisign.pub`](minisign.pub)) |

If you removed it, add it back on Synoikia's Plugins → Repositories page as a **signed** repository with that URL, and confirm the public key above. Every install is checked against it: the tarball's sha256 and its minisign signature.

Each plugin version is a GitHub release, `<id>-v<version>`, holding `<id>-<version>.tgz` (`manifest.json`, `package.json`, `instructions.md` and the `dist/` bundle) and its `.minisig`. `index.json` on the `index` release lists every released version. Released versions are never changed or removed.

## Plugins

| Plugin             | Upstream                                                                                                               | Catalog from                                                      | Decisions                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| `truenas`          | [TrueNAS](https://www.truenas.com/)                                                                                    | the instance's JSON-RPC introspection                             | [ADR-0012](docs/adrs/0012-truenas.md)             |
| `seerr`            | [Seerr](https://github.com/seerr-team/seerr)                                                                           | `seerr-api.yml` for the instance's release                        | [ADR-0011](docs/adrs/0011-seerr.md)               |
| `homeassistant`    | [Home Assistant](https://www.home-assistant.io/)                                                                       | the WebSocket API's services and registries                       | [ADR-0013](docs/adrs/0013-home-assistant.md)      |
| `mealie`           | [Mealie](https://github.com/mealie-recipes/mealie)                                                                     | the OpenAPI spec the instance serves                              | [ADR-0005](docs/adrs/0005-mealie.md)              |
| `profilarr`        | [Profilarr](https://github.com/Dictionarry-Hub/profilarr) v2                                                           | the OpenAPI spec the instance serves                              | [ADR-0007](docs/adrs/0007-profilarr.md)           |
| `npm`              | [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager)                                        | the OpenAPI spec the instance serves                              | [ADR-0006](docs/adrs/0006-nginx-proxy-manager.md) |
| `grafana`          | [Grafana](https://github.com/grafana/grafana) 12+, self-hosted or a Cloud stack                                        | the OpenAPI spec the instance serves                              | [ADR-0003](docs/adrs/0003-grafana-plugins.md)     |
| `backstage`        | [Backstage](https://backstage.io/)                                                                                     | the OpenAPI specs its backend plugins serve                       | [ADR-0004](docs/adrs/0004-backstage.md)           |
| `radarr`           | [Radarr](https://github.com/Radarr/Radarr)                                                                             | `openapi.json` for the instance's release                         | [ADR-0002](docs/adrs/0002-servarr-apps.md)        |
| `prowlarr`         | [Prowlarr](https://github.com/Prowlarr/Prowlarr)                                                                       | `openapi.json` for the instance's release                         | [ADR-0002](docs/adrs/0002-servarr-apps.md)        |
| `grafanacloud`     | [Grafana Cloud](https://grafana.com/docs/grafana-cloud/developer-resources/api-reference/cloud-api/) (grafana.com API) | the spec grafana.com publishes, with a GitHub fallback            | [ADR-0003](docs/adrs/0003-grafana-plugins.md)     |
| `jenkins`          | [Jenkins](https://www.jenkins.io/) 2.x                                                                                 | operations declared in `plugin.yaml` (no spec)                    | [ADR-0008](docs/adrs/0008-jenkins.md)             |
| `lidarr`           | [Lidarr](https://github.com/Lidarr/Lidarr)                                                                             | `openapi.json` for the instance's release                         | [ADR-0002](docs/adrs/0002-servarr-apps.md)        |
| `sonarr`           | [Sonarr](https://github.com/Sonarr/Sonarr)                                                                             | `openapi.json` for the instance's release                         | [ADR-0002](docs/adrs/0002-servarr-apps.md)        |
| `grafana-adaptive` | [Grafana Cloud Adaptive Telemetry](https://grafana.com/docs/grafana-cloud/adaptive-telemetry/) (Metrics, Logs, Traces) | operations declared in `plugin.yaml` (no spec)                    | [ADR-0003](docs/adrs/0003-grafana-plugins.md)     |
| `plex`             | [Plex Media Server](https://www.plex.tv/)                                                                              | the community spec (`LukeHagar/plex-api-spec`) at a pinned commit | [ADR-0010](docs/adrs/0010-plex.md)                |
| `qbittorrent`      | [qBittorrent](https://www.qbittorrent.org/) 5.x                                                                        | operations declared in `plugin.yaml` (no spec)                    | [ADR-0009](docs/adrs/0009-qbittorrent.md)         |

## Layout

| Path                 | What                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `plugins/<id>`       | One package per plugin: `manifest.json`, `plugin.yaml`, `instructions.md`, `src/`, `test/`, bundled to `dist/index.js` |
| `docs/adrs/`         | The security decisions of each plugin family                                                                           |
| `features/<id>/`     | The plugin-specific feature files                                                                                      |
| `tsconfig.base.json` | Shared compiler options. Each plugin's `tsconfig.json` extends it                                                      |
| `vitest.shared.ts`   | Shared Vitest config. Each plugin's `vitest.config.ts` re-exports it                                                   |

Plugins build against Synoikia's published npm packages, the same way a community plugin would:

- `@synoikia/plugin-sdk`: the manifest schema, RPC contract and `runPlugin()` runtime. The bundle includes it.
- `@synoikia/create-plugin` (dev only): `synoikia-plugin new`, `build`, `check` and the `repo` release steps.
- `@synoikia/core` (dev only): `@synoikia/core/testing/compliance` is core's compliance suite. It boots the real core on the built bundle as a permission-confined child, as in production. Then it drives the plugin against its own fake upstream.

## Development

Requires Node ≥ 22.12 and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm test        # each plugin: check, build, unit tests, compliance suite and its features
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build       # every plugin bundle
```

Work on one plugin with `pnpm --filter ./plugins/<id> test`. The run must end with "<Name> <version> is fit for production." and no failed test.

[NoVibe](https://github.com/novibe-org/novibe) runs every change: spec first, then the design, then the code, one slice for each pull request. Install its git hooks once per clone with `pnpm hooks:install`. The `Workflow` CI job runs the same guards on each pull request.

## Adding a plugin

```sh
pnpm new          # asks for an id, a name, an archetype (openapi-rest, static-rest, websocket-rpc, blank) and auth
```

`pnpm new` (`synoikia-plugin new`, also non-interactive with `--id --name --archetype --auth --yes`) writes `plugins/<id>/`. It holds a manifest that follows the secret rules, a `plugin.yaml`, `src/`, `test/compliance.yaml` and a fake upstream. For the OpenAPI, REST and WebSocket kinds, the new plugin passes the compliance suite as generated. Then:

- Describe the upstream's operations in `plugin.yaml`: locks, split twins, classification overrides, `sensitiveParams`, `sensitiveResult`, confirmation literals (reference: [Synoikia's plugin authoring guide](https://github.com/synoikia-org/synoikia-core/blob/main/docs/plugin-authoring.md)).
- Keep code in `src/` for what needs logic: discovery, a split predicate, a custom confirmation source.
- Extend the fake upstream and `test/compliance.yaml`. Add a lock case for each locked operation.
- Write plugin-specific behavior in `features/<id>/<id>.feature` at the root of the repository, and pure logic tests in `test/unit/`. The plugin's `vitest.config.ts` gives the path: `complianceConfig({ pluginDir, features: ['../../features/<id>/*.feature'] })`.

Each plugin's `test` script runs `synoikia-plugin check` (manifest, `plugin.yaml`, versions) and `synoikia-plugin build` (the self-contained bundle, `plugin.yaml` validated and inlined). Then it runs the unit tests, core's compliance suite and the plugin's features. Under the permission model the child can read nothing outside its own package directory, so everything it needs is in `dist/index.js`. A release ships only `manifest.json`, `package.json` and `dist/`.

`test/compliance.yaml` is the profile that core's compliance suite certifies the plugin against. It names the reads, writes, rejects, a lock case for each locked operation, the secrets and the connection test. A change there is a security change. Review its diff like a `plugin.yaml` diff. The format is in [Synoikia's plugin authoring guide](https://github.com/synoikia-org/synoikia-core/blob/main/docs/plugin-authoring.md) › The compliance suite.

## Updating Synoikia

The SDK and harness versions are pinned by each plugin's `package.json` range and the lockfile. To take a newer release, bump the ranges and run `pnpm install`. A plugin change that needs a core change waits for the Synoikia release that carries it.

## Releasing

To release a plugin, bump `version` in both its `manifest.json` and `package.json` (they must match) and merge to `main`. The Release workflow (`.github/workflows/release.yml`) then:

1. runs every plugin's tests;
2. packs each plugin whose version isn't in the published index yet, as a deterministic flat tarball (`synoikia-plugin repo pack`);
3. signs each tarball with the `MINISIGN_SECRET_KEY` secret and checks it against `minisign.pub`;
4. merges the new versions into the index (`repo index`);
5. installs each new version with Synoikia's own repository service (`verifyPluginRepository` from `@synoikia/core/testing`), with `minisign.pub` pinned, then starts it as a permission-confined child, as Synoikia runs it, and requires it to answer (`repo verify`);
6. only then creates the `<id>-v<version>` releases and replaces `index.json` on the `index` release (`repo publish`). An existing tag is reused only if its tarball is byte-identical.

A version that is already released is skipped, so re-running the workflow is safe. To ship a fix, bump the version again. A plugin can require a minimum Synoikia version with `"synoikia": { "minCoreVersion": "0.3.0" }` in its `package.json`; otherwise its manifest's `sdk` range decides which Synoikia versions can install it.

**The signing key.** `MINISIGN_SECRET_KEY` holds the password-less minisign secret key file (both lines). Changing the key makes every Synoikia install mark this repository `key_changed` and block installs until its admin confirms the new key. So a new key is for a compromised key only: publish the new `minisign.pub` here, and bump Synoikia's pinned key in `packages/core/src/plugins/default-repo.ts`.

## CI

`.github/workflows/ci.yml` runs lint, format check, typecheck and every plugin's tests. It needs no secrets.

`.github/workflows/workflow.yml` (the `Workflow` job) runs NoVibe's guards on each pull request: branch, comments, feature files, ADRs and commit phases. It also runs Synoikia's prose check from core, and gitleaks. `.github/workflows/security-audit.yml` checks that the description has a `Security audit:` line.
