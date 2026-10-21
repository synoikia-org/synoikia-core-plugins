# synoikia-core-plugins

The plugins for [Synoikia](https://github.com/via-justa/synoikia-core), published as a signed plugin repository that every Synoikia install has pre-configured. Repository format, adding a plugin and releasing are covered in `README.md`.

[NoVibe](https://github.com/novibe-org/novibe) runs the workflow: its `novibe` plugin and its git hooks in `.githooks/`. The plugin skills, rules, agent and hooks come from the `synoikia-plugin-dev` plugin of the [Synoikia dev kit](https://github.com/synoikia-org/synoikia-dev-kit). `.claude/settings.json` enables both plugins, and a session start hook says when they are not loaded. This repository needs them. `.claude/guard-paths.json` lists the files that the path guard protects.

## Layout

| Path                            | What                                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugins/<id>/manifest.json`    | Validated by the SDK schema: binding, connection form, `sensitiveKeys`, network hosts                                                         |
| `plugins/<id>/plugin.yaml`      | Policy as data: locks, split twins, classification overrides, `sensitiveParams`/`sensitiveResult`, confirm literals, plugin-specific settings |
| `plugins/<id>/src/`             | `index.ts` calls `runPlugin()`; `plugin.ts` uses `definePlugin` for discovery and the decisions that need logic                               |
| `plugins/<id>/guides/`          | Markdown guides bundled at build time (Home Assistant); their hash versions attestation keys, so Prettier skips them                          |
| `plugins/<id>/test/`            | `compliance.yaml` (the compliance profile), `fake.ts` that starts the fake upstream `fake-<id>.ts`, and unit tests in `unit/`                 |
| `plugins/<id>/features/`        | `<id>.feature`: plugin-specific behavior, written with the compliance suite's steps on the profile's named calls                              |
| `plugins/<id>/RUNBOOK.md`       | Manual checklist against a real instance                                                                                                      |
| `docs/designs/<id>.md`          | The original per-server design. Where it disagrees with core's ADRs, core wins                                                                |
| `.github/workflows/release.yml` | Packs, signs, indexes, verifies and publishes releases with `synoikia-plugin repo` (CI only)                                                  |

## Commands

Node 22.12+ (`.nvmrc` pins 22), pnpm 10.

```sh
pnpm new                                                         # add a plugin
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test   # what CI runs
pnpm --filter ./plugins/<id> test                                # one plugin: check, build, unit tests, compliance suite, features
pnpm check                                                       # manifests, plugin.yaml and versions
pnpm --filter ./plugins/<id> exec vitest run test/unit/catalog.test.ts   # one unit test file
pnpm format                                                      # fix formatting
pnpm hooks:install                                               # once per clone: the git hooks in .githooks
```

## Conventions

Do not add `Co-Authored-By` or `Claude-Session` trailers to commit messages, and no "Generated with Claude Code" line to pull request descriptions.
