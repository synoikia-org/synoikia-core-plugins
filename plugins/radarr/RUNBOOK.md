# Radarr runbook

The plugin is tested against a fake Radarr. This checklist confirms it against a real instance before a release. It takes about 15 minutes.

**Before you start:** a Radarr v6 test instance with one movie, one download client with a password, one indexer and one notification (a webhook to a test endpoint you control). Copy the API key from Settings → General → Security.

1. **Connect.** New endpoint → **Radarr**, base URL and key. **Test connection** reports the version (e.g. `6.4.4.10685`). A wrong key fails the test.
2. **Sync.** About 227 operations appear, grouped by tag (`Movie`, `Queue`, `Command`, …). The instance shows the spec ref (`v<version>`). `GET /api/v3/filesystem`, `GET` and `POST /api/v3/manualimport` and `GET /api/v3/log/file` are absent. With the spec source set to an unreachable URL, the sync fails and the old catalog stays.
3. **Reads.** With `Movie`, `MovieLookup`, `QualityProfile` and `RootFolder` at Read, ask for a movie lookup and the root folders: no prompt.
4. **Add a movie.** With `Movie` at Ask, add a movie from the lookup: a prompt shows `POST /api/v3/movie`; approve, and it appears in Radarr.
5. **Command.** With `Command` at Ask, start `MoviesSearch` for that movie: an ordinary prompt; `GET /api/v3/command/{id}` reports `completed`. Ask for `RenameFiles`: the prompt is locked and asks to type `RenameFiles`.
6. **Locks.** Delete the movie from step 4 with `deleteFiles: true`: an ordinary prompt that names the movie and its folder, with no literal to type. Ask to delete it again with `DELETE /api/v3/movie/editor` and `deleteFiles: true`: the prompt is locked and asks to type `1 movie`; a wrong value is refused. Add a notification with implementation `CustomScript`: the prompt is locked and shows `runs <path>`. Check `PUT /api/v3/config/host/{id}`, `PUT /api/v3/config/mediamanagement/{id}` and `POST /api/v3/system/restart` show locked on the Access page (don't run them).
7. **Secrets.** Read `GET /api/v3/downloadclient` and `GET /api/v3/notification`: the password shows as `********`, every URL with a path only as its origin, and `GET /api/v3/config/host` shows `apiKey` as `[REDACTED]`. Test the stored download client with its own body (`GET …/downloadclient/{id}`): an ordinary prompt. Test it again with another host: the prompt is locked and shows that host. Save it (`PUT /api/v3/downloadclient/{id}`) with another host and the password left as `********`: the prompt is locked and names the client by its stored name. Add a Torrent Blackhole client: the prompt is locked and shows `writes to <folder>`.
8. **Write-back guard.** Ask to save the host settings with the `[REDACTED]` value read in step 7: the call fails with `INVALID_PARAMS` before any approval.
9. **Audit.** The audit log lists each call; no password, API key or webhook token appears.
