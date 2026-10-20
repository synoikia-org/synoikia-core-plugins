---
name: add-plugin
description: Scaffold a new Synoikia plugin under plugins/<id> with `pnpm new`, then fill in its plugin.yaml rules, discovery and tests, laid out like the existing plugins. Use when asked to add, create or start a plugin for a new upstream service.
---

# Add a plugin

Run the change as the `change-workflow` skill and `docs/workflow.md` say. Write the code as the `plugin-development` skill says. Background: Synoikia's plugin authoring guide (`https://github.com/via-justa/synoikia-core/blob/main/docs/plugin-authoring.md`). `plugins/seerr` is the OpenAPI example, `plugins/truenas` an introspection catalog over JSON-RPC, and `plugins/homeassistant` a WebSocket upstream with a registry, targets and declared commands.

## 1. Settle the basics

- **`<id>`**: lowercase, the directory name and manifest `id`; the sandbox namespace defaults to it in camelCase.
- **Archetype**: `openapi-rest` (the upstream serves an OpenAPI spec), `static-rest` (REST without a spec; operations declared in `plugin.yaml`), `websocket-rpc` (JSON-RPC over WebSocket), or `blank` (introspection endpoints, anything else).
- **Auth**: `bearer`, `api-key` (with its header), `basic` or `none`.
- **Destructive operations**: which ones are `locked`, and the literal an approver types for each.
- **Secrets**: which connection fields are credentials, and which fields the upstream returns hold secrets.

If a design exists, put it in `docs/designs/<id>.md` and add it to the table in `docs/README.md`.

## 2. Scaffold

```sh
pnpm new --id <id> --name "<Name>" --archetype <archetype> --auth <auth> --yes
```

This writes `plugins/<id>/` and runs `pnpm install`. The plugin holds `manifest.json`, `plugin.yaml`, `src/`, `test/compliance.yaml`, a fake upstream, a README and a RUNBOOK. For the `openapi-rest`, `static-rest` and `websocket-rpc` archetypes, the plugin passes the compliance suite as generated.

## 3. Describe the upstream

- `manifest.json`: connection fields and help, `sensitiveKeys` (add every secret field the upstream returns), `network.hosts` (every host the plugin calls).
- `plugin.yaml`: `rules` for locks, splits, classification overrides, `sensitiveParams`, `sensitiveResult`, `confirm` literals, summary notes and guidance; `exclude`/`include` for plumbing the model has no business calling; `operations` for declared operations; `plugin:` for upstream-specific lists. A rule's `classification` never unlocks, and anything unclassified is a write.
- `src/plugin.ts`: only what needs logic, such as a `splitWhen` predicate, a custom confirm source, or discovery.

## 4. Tests

- Extend the fake upstream (`startFakeHttp` from `@synoikia/core/testing` for HTTP) to answer what the plugin calls. Include the responses that hold secrets.
- Fill in `test/compliance.yaml`: reads, writes, rejects, the secrets, and a `locks` case for each locked operation and split twin.
- Write plugin-specific behavior in `features/<id>.feature` with the suite's steps, on calls named in `calls`.
- Put tests of pure logic in `test/unit/`.

```sh
pnpm --filter ./plugins/<id> test
pnpm typecheck && pnpm lint && pnpm format:check
```

The plugin run must end with "<Name> 0.1.0 is fit for production." and no failed test.

Add the plugin to the root `README.md`. Leave the version at `0.1.0`. Merging to `main` releases it, so say in the PR that it will publish. Run the `security-reviewer` subagent on the diff before you open the PR.
