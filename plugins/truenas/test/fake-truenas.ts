import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import type WebSocket from 'ws';

/** A fake TrueNAS: JSON-RPC over WebSocket, API-key login, a slice of `core.get_methods`, datasets, jobs. */

export const FAKE_API_KEY = '1-fake-truenas-api-key-abcdef';

/** Secrets the fake's answers hold: they must never reach the agent, an approval or the audit log. */
export const SECRETS = {
  smbPassword: 'share-secret-123',
  upsPassword: 'ups-secret-456',
  snmpCommunity: 'snmp-secret-789',
  sshHostKey: 'ssh-secret-key',
  keytab: 'keytab-secret-b64',
  unixHash: '$6$alice-unix-hash',
  smbHash: 'ALICE-NT-HASH',
  cloudKey: 'b2-application-key-secret',
  newApiKey: '4-fresh-api-key-secret',
  token: 'fresh-session-token-secret',
  oneTimePassword: 'one-time-password-secret',
  datasetKey: 'a1b2c3d4e5f6-dataset-key-secret',
} as const;

interface MethodInfo {
  description?: string;
  accepts?: unknown[];
  job?: boolean;
  roles?: string[];
}

type Handler = (params: unknown[]) => unknown;

class RpcFailure extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const methodError = (errname: string, reason: string, extra?: unknown) =>
  new RpcFailure(-32001, 'Method call error', { error: 1, errname, reason, ...(extra ? { extra } : {}) });

const obj = (title: string, properties: Record<string, unknown> = {}) => ({ type: 'object', title, properties });

/** The catalog `core.get_methods` returns (a slice of a real 25.04 system). */
export const METHODS: Record<string, MethodInfo> = {
  'pool.query': { description: 'Query pools.', accepts: [{ type: 'array', title: 'filters' }] },
  'pool.get_instance': { description: 'Get one pool.', accepts: [{ type: 'integer', title: 'id' }] },
  'pool.export': { description: 'Export a pool.', accepts: [{ type: 'integer', title: 'id' }], job: true },
  'pool.dataset.query': { description: 'Query datasets.', accepts: [{ type: 'array', title: 'filters' }] },
  'pool.dataset.create': {
    description: 'Create a dataset or zvol.',
    accepts: [obj('pool_dataset_create', { name: { type: 'string' }, quota: { type: 'integer' } })],
    roles: ['DATASET_WRITE'],
  },
  'pool.dataset.delete': {
    description: 'Delete a dataset.',
    accepts: [{ type: 'string', title: 'id' }, obj('options', { recursive: { type: 'boolean' } })],
  },
  'pool.dataset.change_key': {
    description: 'Change a dataset key.',
    accepts: [{ type: 'string', title: 'id' }],
    job: true,
  },
  'pool.dataset.export_key': {
    description: 'Export the encryption key of a dataset.',
    accepts: [{ type: 'string', title: 'id' }],
    job: true,
  },
  'pool.dataset.details': {
    description: 'Dataset details.',
    roles: ['DATASET_READ', 'DATASET_WRITE', 'READONLY_ADMIN'],
  },
  'pool.scrub.run': { description: 'Run a scrub.', accepts: [{ type: 'string', title: 'name' }], job: true },
  'app.query': { description: 'Query apps.', accepts: [{ type: 'array', title: 'filters' }] },
  'app.upgrade': {
    description: 'Upgrade an app.',
    accepts: [{ type: 'string', title: 'app_name' }, obj('options')],
    job: true,
  },
  'app.available_space': { description: 'Space for apps.' },
  'app.delete': {
    description: 'Delete an app.',
    accepts: [{ type: 'string', title: 'app_name' }, obj('options')],
    job: true,
  },
  'api_key.query': { description: 'Query API keys.' },
  'api_key.get_instance': { description: 'Get one API key.', accepts: [{ type: 'integer', title: 'id' }] },
  'api_key.create': {
    description: 'Create an API key.',
    accepts: [obj('api_key_create', { name: { type: 'string' }, username: { type: 'string' } })],
  },
  'api_key.delete': { description: 'Delete an API key.', accepts: [{ type: 'integer', title: 'id' }] },
  'auth.generate_token': { description: 'Generate a token.' },
  'auth.generate_onetime_password': { description: 'Generate a one-time password.' },
  'cloudsync.credentials.query': { description: 'Query cloud credentials.' },
  'cloudsync.credentials.create': {
    description: 'Create cloud credentials.',
    accepts: [obj('cloudsync_credentials_create', { name: { type: 'string' }, provider: { type: 'object' } })],
  },
  'user.setup_local_administrator': {
    description: 'Set up the local administrator.',
    accepts: [
      { type: 'string', title: 'username' },
      { type: 'string', title: 'password' },
    ],
  },
  'disk.query': { description: 'Query disks.' },
  'disk.wipe': {
    description: 'Wipe a disk.',
    accepts: [
      { type: 'string', title: 'dev' },
      { type: 'string', title: 'mode' },
    ],
    job: true,
  },
  'system.info': { description: 'System information.' },
  'system.version': { description: 'TrueNAS version.' },
  'system.reboot': { description: 'Reboot.', job: true },
  'system.shutdown': { description: 'Shut down.', job: true },
  'system.general.config': { description: 'General settings.' },
  'system.general.update': { description: 'Update general settings.', accepts: [obj('system_general_update')] },
  'config.reset': { description: 'Reset configuration.', job: true },
  'user.query': { description: 'Query users.' },
  'user.get_instance': { description: 'Get one user.', accepts: [{ type: 'integer', title: 'id' }] },
  'user.delete': { description: 'Delete a user.', accepts: [{ type: 'integer', title: 'id' }] },
  'user.set_password': {
    description: 'Set a password.',
    accepts: [obj('set_password', { username: { type: 'string' } })],
  },
  'filesystem.setacl': {
    description: 'Set an ACL.',
    accepts: [obj('filesystem_acl', { path: { type: 'string' } })],
    job: true,
  },
  'filesystem.chown': {
    description: 'Change owner.',
    accepts: [obj('filesystem_ownership', { path: { type: 'string' } })],
    job: true,
  },
  'filesystem.listdir': { description: 'List a directory.' },
  'sharing.smb.query': { description: 'Query SMB shares.' },
  'sharing.smb.create': { description: 'Create an SMB share.', accepts: [obj('smb_share_create')] },
  'core.get_jobs': { description: 'Query jobs.' },
  'core.ping': { description: 'Ping.' },
  'core.bulk': { description: 'Call a method once per params set.', job: true },
  'core.download': { description: 'Run a method and serve its output for download.' },
  'core.debug': { description: 'Attach a remote debugger.' },
  'service.restart': { description: 'Restart a service.', accepts: [{ type: 'string', title: 'service' }], job: true },
  'kerberos.keytab.kerberos_principal_choices': { description: 'Principals.' },
  'kerberos.keytab.query': { description: 'Query keytabs.' },
  'ups.config': { description: 'UPS settings.' },
  'snmp.config': { description: 'SNMP settings.' },
  'ssh.config': { description: 'SSH settings.' },
  'vm.get_console': { description: 'An oddly named method.' },
  // Methods plugin.yaml locks that the tests otherwise never call.
  'audit.config': { description: 'Audit settings.' },
  'docker.delete_backup': {
    description: 'Delete a Docker backup.',
    accepts: [{ type: 'string', title: 'backup_name' }],
  },
  'interface.network_config_to_be_removed': { description: 'Network configuration that will be removed.' },
  'user.has_local_administrator_set_up': { description: 'Whether a local administrator is set up.' },
  'user.renew_2fa_secret': {
    description: 'Renew the 2FA secret of a user.',
    accepts: [{ type: 'string', title: 'username' }],
  },
};

export interface FakeTrueNas {
  url: string;
  datasets: Map<string, { id: string; name: string; quota?: number }>;
  calls: { method: string; params: unknown[] }[];
  /** Methods that answer EACCES, as for a key without the needed role. */
  denied: Set<string>;
  version: string;
  /** Close every open connection (the client must reconnect). */
  drop(): void;
  /** Restores the seeded datasets and jobs. */
  reset(): void;
  close(): Promise<void>;
}

export async function startFakeTrueNas(opts: { jobDelayMs?: number } = {}): Promise<FakeTrueNas> {
  const datasets = new Map<string, { id: string; name: string; quota?: number }>();
  const seed = () => {
    datasets.clear();
    datasets.set('tank', { id: 'tank', name: 'tank' });
    datasets.set('tank/media', { id: 'tank/media', name: 'tank/media' });
  };
  seed();
  const jobs = new Map<
    number,
    { id: number; method: string; arguments?: unknown[]; state: string; result?: unknown; error?: string | null }
  >();
  let nextJob = 1;
  // A finished key export, so every core.get_jobs read has a dataset key to mask.
  const seedJobs = () => {
    jobs.clear();
    jobs.set(900, {
      id: 900,
      method: 'pool.dataset.export_key',
      arguments: ['tank/media'],
      state: 'SUCCESS',
      result: SECRETS.datasetKey,
    });
  };
  seedJobs();
  const calls: { method: string; params: unknown[] }[] = [];
  const denied = new Set<string>();
  const state = { version: 'TrueNAS-25.04.2' };

  const job = (method: string, run: () => unknown): number => {
    const id = nextJob++;
    const entry: { id: number; method: string; state: string; result?: unknown; error?: string | null } = {
      id,
      method,
      state: 'RUNNING',
    };
    jobs.set(id, entry);
    setTimeout(() => {
      try {
        entry.result = run();
        entry.state = 'SUCCESS';
      } catch (err) {
        entry.state = 'FAILED';
        entry.error = err instanceof Error ? err.message : String(err);
      }
    }, opts.jobDelayMs ?? 30);
    return id;
  };

  const handlers: Record<string, Handler> = {
    'core.get_methods': () => METHODS,
    'core.ping': () => 'pong',
    'system.version': () => state.version,
    'system.info': () => ({ hostname: 'nas01', version: state.version }),
    'pool.query': () => [{ id: 1, name: 'tank', status: 'ONLINE' }],
    'pool.get_instance': ([id]) => {
      if (id !== 1) throw methodError('ENOENT', `Pool ${String(id)} does not exist`);
      return { id: 1, name: 'tank' };
    },
    'pool.export': () => job('pool.export', () => null),
    'pool.dataset.query': () => [...datasets.values()],
    'pool.dataset.create': ([data]) => {
      const { name, quota } = (data ?? {}) as { name?: unknown; quota?: number };
      if (typeof name !== 'string' || !name.includes('/'))
        throw methodError('EINVAL', 'Invalid dataset name', [['pool_dataset_create.name', 'Invalid name', 22]]);
      if (datasets.has(name)) throw methodError('EEXIST', `${name} already exists`);
      const row = { id: name, name, ...(quota !== undefined ? { quota } : {}) };
      datasets.set(name, row);
      return row;
    },
    'pool.dataset.delete': ([id]) => {
      if (!datasets.delete(String(id))) throw methodError('ENOENT', `${String(id)} does not exist`);
      return true;
    },
    'app.query': () => [
      { name: 'plex', state: 'RUNNING' },
      { name: 'sonarr', state: 'RUNNING' },
    ],
    'app.upgrade': ([name]) => job('app.upgrade', () => ({ name, upgraded: true })),
    'pool.scrub.run': ([name]) =>
      job('pool.scrub.run', () => {
        if (name !== 'tank') throw new Error(`[ENOENT] Pool ${String(name)} not found`);
        return null;
      }),
    'disk.query': () => [{ name: 'sda', serial: 'S1' }],
    'user.query': () => [
      { id: 1, username: 'root' },
      { id: 70, username: 'alice', unixhash: SECRETS.unixHash, smbhash: SECRETS.smbHash },
    ],
    'user.get_instance': ([id]) => ({ id, username: id === 70 ? 'alice' : 'root' }),
    'api_key.get_instance': ([id]) => ({ id, name: 'backup-bot' }),
    'api_key.create': ([opts]) => ({ id: 4, name: (opts as { name?: string })?.name, key: SECRETS.newApiKey }),
    'auth.generate_token': () => SECRETS.token,
    'auth.generate_onetime_password': () => SECRETS.oneTimePassword,
    'cloudsync.credentials.query': () => [
      { id: 1, name: 'b2', provider: { type: 'B2', account: 'acct-1', key: SECRETS.cloudKey } },
    ],
    'cloudsync.credentials.create': ([opts]) => ({ id: 2, ...(opts as object) }),
    'user.setup_local_administrator': ([username]) => ({ username, configured: true }),
    'pool.dataset.export_key': () => job('pool.dataset.export_key', () => SECRETS.datasetKey),
    'sharing.smb.query': () => [
      { id: 1, name: 'media', path: '/mnt/tank/media', auxsmbconf: '', password: SECRETS.smbPassword },
    ],
    // Secret-bearing reads (review of PR #8): each field name must come back redacted.
    'ups.config': () => ({ id: 1, monuser: 'upsmon', monpwd: SECRETS.upsPassword }),
    'snmp.config': () => ({ id: 1, community: SECRETS.snmpCommunity, v3: false }),
    'ssh.config': () => ({
      id: 1,
      tcpport: 22,
      host_ed25519_key: SECRETS.sshHostKey,
      host_ed25519_key_pub: 'ssh-ed25519 AAAA',
    }),
    'kerberos.keytab.query': () => [{ id: 1, name: 'AD_MACHINE_ACCOUNT', file: SECRETS.keytab }],
    'core.get_jobs': ([filters, options]) => {
      const [field, , value] = ((filters as unknown[][] | undefined) ?? [])[0] ?? [];
      const found =
        field === 'method'
          ? [...jobs.values()].filter((j) => j.method === value)
          : field === 'id'
            ? [jobs.get(Number(value))].filter((j) => j !== undefined)
            : [...jobs.values()];
      // TrueNAS query options: `select` (with `[field, alias]` pairs), `count` and `get`.
      const opts = (options ?? {}) as { select?: (string | [string, string])[]; count?: boolean; get?: boolean };
      if (opts.count) return found.length;
      const rows = found.map((j) => {
        if (!opts.select) return j;
        const row: Record<string, unknown> = {};
        for (const s of opts.select) {
          const [from, to] = Array.isArray(s) ? s : [s, s];
          row[to] = (j as Record<string, unknown>)[from];
        }
        return row;
      });
      return opts.get ? (rows[0] ?? null) : rows;
    },
  };

  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1', path: '/api/current' });
  const sockets = new Set<WebSocket>();
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    let authenticated = false;
    ws.on('message', (raw) => {
      const req = JSON.parse(raw.toString()) as { id: number; method: string; params?: unknown[] };
      const params = req.params ?? [];
      const reply = (body: Record<string, unknown>) => ws.send(JSON.stringify({ jsonrpc: '2.0', id: req.id, ...body }));
      calls.push({ method: req.method, params: req.method === 'auth.login_with_api_key' ? ['<redacted>'] : params });
      try {
        if (req.method === 'auth.login_with_api_key') {
          authenticated = params[0] === FAKE_API_KEY;
          return reply({ result: authenticated });
        }
        if (!authenticated) throw methodError('ENOTAUTHENTICATED', 'Not authenticated');
        if (denied.has(req.method)) throw methodError('EACCES', 'Not authorized');
        const handler = handlers[req.method];
        if (handler) return reply({ result: handler(params) });
        if (METHODS[req.method]) return reply({ result: null });
        throw new RpcFailure(-32601, 'Method does not exist');
      } catch (err) {
        if (err instanceof RpcFailure)
          return reply({ error: { code: err.code, message: err.message, data: err.data } });
        return reply({ error: { code: -32603, message: String(err) } });
      }
    });
  });
  await new Promise<void>((resolve) => wss.once('listening', () => resolve()));
  const { port } = wss.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    datasets,
    calls,
    denied,
    get version() {
      return state.version;
    },
    set version(v: string) {
      state.version = v;
    },
    drop: () => {
      for (const s of sockets) s.terminate();
    },
    reset: () => {
      seed();
      seedJobs();
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.terminate();
        wss.close(() => resolve());
      }),
  };
}
