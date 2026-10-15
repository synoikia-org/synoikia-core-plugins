# Grafana Adaptive Telemetry

Grafana Adaptive Telemetry for Synoikia.

The sandbox calls `grafanaAdaptive.call(…)`. Every call goes through Synoikia's permission gate, approvals, redaction and audit log; this plugin only describes Grafana Adaptive Telemetry's API.

## Files

| File            | What                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `manifest.json` | Binding, connection form, `sensitiveKeys` and network hosts                              |
| `plugin.yaml`   | Locked operations, split twins, sensitive params and results, confirmation literals      |
| `src/plugin.ts` | Discovery and anything that needs logic                                                  |
| `src/auth.ts`   | How requests authenticate                                                                |
| `test/`         | A fake Grafana Adaptive Telemetry, unit tests, and e2e tests on Synoikia's harness                         |

## Connection

See the manifest's `connection.help`. Use a dedicated Grafana Adaptive Telemetry user with only the access Synoikia should have.

## Locked operations

List the operations `plugin.yaml` locks, and why, here.
