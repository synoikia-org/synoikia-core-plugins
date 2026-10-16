# Seerr

Seerr REST API v1, from the spec of the instance's release. Operation keys are `<VERB> <path>` without the `/api/v1` prefix, as in `GET /request/{requestId}`. Call `seerr.request({ method, path, query, body })` with the concrete path; `method` defaults to `GET`. Movie, TV and person ids are TMDb ids; requests, media, issues and users have Seerr integer ids.

Lists (`GET /request`, `GET /media`, `GET /issue`, `GET /user`) page with `take` and `skip` and return `{ pageInfo, results }`; `GET /request` also takes `filter` (`pending`, `approved`, …) and `sort`. Search and discover page with `page`.

Workflows:

- Request a title: `GET /search` (`query`) → `GET /movie/{movieId}` or `GET /tv/{tvId}` → `POST /request` with `mediaType`, `mediaId` (TMDb id), `seasons` for TV and `is4k`.
- Review requests: `GET /request` (`filter: 'pending'`) → `POST /request/{requestId}/{status}` with `approve` or `decline`.
- Request status: `GET /request/count`, `GET /request/{requestId}`, `POST /request/{requestId}/retry`.
- Issues: `GET /issue` → `GET /issue/{issueId}` → `POST /issue/{issueId}/comment`.
- Discover: `GET /discover/trending`, `GET /discover/movies`, `GET /discover/tv`.

Locked: user deletes and bulk user edits, removing Radarr or Sonarr servers, resetting or regenerating settings, deciding another user's request, full library scans and heavy jobs, and the Plex or Jellyfin library reads that resave the library list on older releases.
