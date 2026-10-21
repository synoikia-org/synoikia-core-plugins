---
status: accepted
date: 2026-10-19
---

# Plugins describe, core decides

## Context and Problem Statement

Each plugin in this repository connects one upstream to Synoikia. Core makes every security decision (core ADR-0001, ADR-0011). Core can only enforce what the plugin tells it: the catalog, the classification, the locks, the summaries and the secret fields. Which rules do all plugins of this repository follow, so that what they tell core is correct?

## Decision Drivers

- A wrong classification or a missing lock exposes the upstream, and core cannot detect it.
- A catalog comes from data that the plugin does not control: a served spec, a published spec, or a list in `plugin.yaml`.
- A secret that the upstream returns must never reach the agent, the audit log or an approval.
- An admin must see every host that a plugin connects to before the admin enables it.

## Considered Options

- Policy as data in `plugin.yaml`, a catalog source chosen by a fixed preference, and checks that fail closed.
- Policy in each plugin's code.

## Decision Outcome

Chosen option: "Policy as data in `plugin.yaml`, with checks that fail closed". A review of one file shows every lock, split and secret rule of a plugin. The SDK applies the rules the same way for each plugin.

**Catalog source.** A plugin takes its catalog from the first source that applies:

1. A spec that the running instance serves. It always matches the installed version.
2. A spec that the upstream project publishes, fetched for the instance's version from a host in `network.hosts`.
3. Operations declared in `plugin.yaml`, when the upstream has no spec.

**Rules for every plugin.**

- The classification fails closed (core ADR-0012). An operation that no rule and no heuristic covers is a write.
- A spec that is too small, or that misses an operation that `plugin.yaml` locks by name, is refused. An empty or truncated spec then never replaces a real catalog.
- Every connection field that holds a credential is `writeOnly`, uses the `secret` widget, and is in `sensitiveKeys`. `synoikia-plugin check` enforces it.
- Every secret that the upstream returns is in `sensitiveKeys`, `sensitiveParams` or `sensitiveResult`, or the plugin masks it. The compliance suite checks the secret values of the profile.
- `network.hosts` lists every host that the plugin connects to, also a spec mirror. Core does not enforce it (core ADR-0014), so it must be accurate.
- Model arguments never change the host, the scheme or the port, and never set an auth header. Path parameters are encoded.
- A write whose body holds `[REDACTED]`, copied from a masked result, is refused with `INVALID_PARAMS`. The upstream would store it as a password, a URL or a key.
- A confirmation literal comes from the stored item, the path or the instance name. It comes from a body field that the model writes only on a create, where the approver sees the body.
- Approval summaries and targets name exactly what the call affects, never a secret. Model strings in targets are escaped: control, bidi and zero-width characters.
- `instructions.md` tells the agent how the API works. It never covers auth, secrets or approvals, which core handles.
- `test/compliance.yaml` is policy too. A change to it is a security change.

### Consequences

- Good, because each plugin's locks and secret rules are in one file that a review can read.
- Good, because a broken spec fails the sync instead of opening operations.
- Bad, because a plugin that fetches a published spec depends on that host. An admin who blocks it must set a mirror.

The ADR of each plugin family records its own locks, splits and secret rules. The compliance profile of each plugin (`plugins/<id>/test/compliance.yaml`) and its feature file (`features/<id>/`) specify the behavior.
