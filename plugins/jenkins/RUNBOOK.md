# Jenkins runbook

The plugin is tested against a fake Jenkins. This checklist confirms it against a real one before a release. It takes about 15 minutes.

**Before you start:** a Jenkins 2.x test instance (the `jenkins/jenkins:lts` image is fine) with a folder `infra` holding a Pipeline job `deploy app` that has a string parameter `BRANCH` and a password parameter `DEPLOY_KEY`, prints a few hundred lines, and publishes a JUnit report; and a freestyle job `hello` without parameters. Create a user `synoikia` with Overall/Read, Job/Read, Build, Cancel, Delete and Configure, and an API token for it. To check the context path, run Jenkins with `--prefix=/jenkins`.

1. **Connect.** New endpoint → **Jenkins**, the base URL (with `/jenkins` if used), `synoikia` and the token. **Test connection** reports the Jenkins version. A wrong token fails the test.
2. **Sync.** 17 operations appear in the groups `jobs`, `builds`, `queue`, `nodes` and `system`; the seven locked ones show as locked.
3. **Reads.** With `jobs` and `builds` at Read: `jobs.list`, then with `path.folder: 'infra'`; `jobs.get` on `infra/deploy app` shows the parameter definitions with `DEPLOY_KEY`'s default as `[REDACTED]`. A `query.tree` of `jobs[fullName]` changes the reply.
4. **Run a build.** With `builds` at Ask: `builds.trigger` on `infra/deploy app` with `query: { BRANCH: 'main' }`. The prompt leads with `infra/deploy app` and shows `BRANCH="main"`. Poll `queue.get` with the returned `queueId` until `executable.number`, then `builds.get` on that number: `DEPLOY_KEY`'s value is `[REDACTED]`. `builds.trigger` with `DEPLOY_KEY` set is refused, and the audit log does not hold the value.
5. **Logs.** `builds.log` on the build: the tail, with `more: true` while it runs. With `start: 0` and `bytes: 1000`, then `start` = the returned `end`, the log continues without a gap. `lines: 5` gives the last five lines. `builds.testReport` shows the counts.
6. **Stop.** Start a long build and `builds.stop` it: it ends `ABORTED`.
7. **Locks.** `jobs.disable` on `infra/deploy app` asks to type `infra/deploy app`; a wrong value is refused. `jobs.enable` back. `builds.delete` asks for `infra/deploy app#<number>`. `system.quietDown` with a `reason` asks for the host name and the banner shows in Jenkins; `system.cancelQuietDown` clears it. Check that `system.safeRestart` and `jobs.delete` are locked (don't run them on a shared instance).
8. **Paths.** `jobs.get` with `job: '../script'` or `a//b` is refused without a request reaching Jenkins (its access log).
9. **Audit.** The audit log lists each call; the API token and `DEPLOY_KEY` values appear nowhere.
