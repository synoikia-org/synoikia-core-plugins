---
status: accepted
date: 2026-10-19
---

# Jenkins

## Context and Problem Statement

Jenkins 2.x has no API spec. Its remote access API reads any object at `<object URL>/api/json` and acts through POSTs to Stapler actions. It also has a script console, credentials, the plugin manager and `config.xml`, which run or reveal anything. Build parameters can be code, and password parameters carry secrets under the key `value`. Which part of Jenkins does the plugin expose, and what needs a typed confirmation?

## Decision Drivers

- The script console, credentials and `config.xml` give full control of Jenkins and its agents.
- A build parameter can be a branch with its own Jenkinsfile, or a string that a pipeline evaluates.
- A job name must reach only the job it names.
- A password parameter's secret is under `value`, which core cannot mask by key name.

## Considered Options

- A small, fixed set of declared operations, with parameterized triggers, deletes and instance actions locked.
- The whole remote access API, as the other plugins expose their specs.

## Decision Outcome

Chosen option: "A small, fixed set of declared operations". The owner approved the set, modeled on the Jenkins tools of `emnify/emnify-mcp-developer`. Nothing else in Jenkins is reachable.

**Operations.** The sandbox calls `jenkins.call(key, { path, query })`. No operation takes a body.

| Key                                             | Request                                                                                                    | Class  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| `jobs.list`, `jobs.get`                         | `GET /api/json`, `GET /job/{folder}/api/json`, `GET /job/{job}/api/json`                                   | read   |
| `builds.get`, `builds.log`, `builds.testReport` | `GET /job/{job}/{number}/api/json`, `…/logText/progressiveText`, `…/testReport/api/json`                   | read   |
| `queue.list`, `queue.get`, `nodes.list`         | `GET /queue/api/json`, `GET /queue/item/{id}/api/json`, `GET /computer/api/json`                           | read   |
| `builds.trigger`                                | `POST /job/{job}/build`, or `/buildWithParameters` for a parameterized job, without parameters in the call | write  |
| `builds.trigger#params`                         | The same with build parameters in `query`                                                                  | locked |
| `builds.stop`                                   | `POST /job/{job}/{number}/stop`                                                                            | write  |
| `builds.delete`                                 | `POST /job/{job}/{number}/doDelete`                                                                        | locked |
| `jobs.delete`                                   | `POST /job/{job}/doDelete`                                                                                 | locked |
| `jobs.disable`, `jobs.enable`                   | `POST /job/{job}/disable`, `/enable`                                                                       | locked |
| `system.safeRestart`                            | `POST /safeRestart`                                                                                        | locked |
| `system.quietDown`, `system.cancelQuietDown`    | `POST /quietDown`, `/cancelQuietDown`                                                                      | locked |

Not declared, so not reachable: the script console, credentials, the plugin manager, `config.xml` and `/manage`. Job create, copy and rename, build replay, `term`, `kill`, and the immediate `restart` and `exit` are not reachable either.

**Reads.** Each read has a default `tree` in `plugin.trees`.

- A call's `tree` may name only leaf fields of the default tree, plus `_class`. So it cannot select fields such as git `BuildData.remoteUrls` or EnvInject `envMap`.
- `depth` is 0, 1 or 2. Reads take only `tree` and `depth`, and refuse other query keys such as `jsonp`.
- The plugin masks credentials in URLs (`scheme://user:token@` becomes `scheme://[REDACTED]@`) in each string, console logs included. It hides `envMap` and `environment` values. This is the second line of defense, because `depth` can reach such fields.

**Paths.** `path.job` is the job's full name, `folder/sub/job`. Each level becomes its own encoded segment.

- A name is refused when it is not a string or is over 1024 characters. It is also refused when it has control characters, or a character that Jenkins forbids in item names.
- A name is also refused when a level is empty, or is `.` or `..` after NFKC normalization.
- So a name reaches only the job it names. A job named like an endpoint, such as `scriptText`, stays under `/job/`.
- Reads take the build permalinks such as `lastBuild`. Writes take a number only, because a permalink can move during an approval.

**Builds and parameters.**

- A trigger with build parameters resolves to the locked twin `builds.trigger#params`. One without parameters stays a plain write, and a parameterized job then builds with its defaults.
- The plugin refuses an `invoke` whose key does not match whether the call has parameters.
- `builds.trigger` reads the job's parameter definitions first, and refuses a parameter that the job does not define.
- It refuses to set a password parameter, before core writes the call to the audit log. A definition without a type counts as a password.

**Locks.** `*.delete` and `system.*` are locked as patterns, so a later delete or instance action is locked until a review.

| Operation                                    | Why                                                              | Literal                    |
| -------------------------------------------- | ---------------------------------------------------------------- | -------------------------- |
| `builds.trigger#params`                      | Runs the job with values that the model chose, which can be code | job full name              |
| `builds.delete`                              | Removes the build, its log and artifacts                         | `<job full name>#<number>` |
| `jobs.delete`                                | Removes the job, or a folder with all its jobs, and each build   | job full name              |
| `jobs.disable`, `jobs.enable`                | Stops or starts scheduled and triggered builds                   | job full name              |
| `system.safeRestart`                         | Restarts the instance for everyone                               | base URL host name         |
| `system.quietDown`, `system.cancelQuietDown` | Stops or resumes new builds on the whole instance                | base URL host name         |

Jenkins has no instance name, so instance-wide locks confirm on the base URL's host name, without the port. Job and build literals come from the stored object. `builds.trigger` without parameters and `builds.stop` are plain writes, decided by the admin at the group level.

**Redirects.** An action's 3xx is success only when its `Location` stays within the base URL and is not a sign-in page. A read's 3xx is a failure. So the Jenkins URL setting must match the connection's base URL.

**Secrets.**

- Auth is the username and an API token as HTTP Basic. With an API token, Jenkins needs no CSRF crumb.
- `sensitiveKeys`: `token`, `password`, `apiToken`, `secret`.
- The plugin masks password parameters in read results: each field but `_class`, `name`, `type` and `description`. It also masks the `value` of a build parameter without `_class`.
- The trigger summary shows parameter values, except password parameters and ones that the job does not define.
- Console logs come back as Jenkins writes them. Jenkins masks bound credentials and password parameters. Other secrets that a build prints reach the result.

### Consequences

- Good, because the script console, credentials and configuration are not reachable at all.
- Good, because a build with model-chosen values always needs a typed confirmation.
- Bad, because job create, copy and rename stay in the Jenkins UI.
- Bad, because a secret that a build prints in its log reaches the agent, unless Jenkins masks it.

The feature file in `features/jenkins/` and `plugins/jenkins/test/compliance.yaml` specify the behavior.
