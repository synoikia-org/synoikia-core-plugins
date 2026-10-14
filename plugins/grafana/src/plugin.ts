import {
  buildOpenApiCatalog,
  compileRules,
  definePlugin,
  ErrorCodes,
  HttpJsonClient,
  isPlainObject,
  joinApiPath,
  parsePluginSettings,
  PluginError,
  requireString,
  restBinding,
  restLookup,
  SpecError,
} from '@synoikia/plugin-sdk';
import type { CompiledRules, InitParams, PluginHandlers } from '@synoikia/plugin-sdk';
import raw from '../plugin.yaml';
import { authHeaders } from './auth.js';
import { lockedKeys, requireLockedKeys } from './locks.js';
import { dataSourceTargets, withTargets } from './targets.js';
import { grafanaVersion } from './version.js';

/** The Grafana plugin: catalog from the HTTP API spec Grafana 12+ serves at /public/openapi3.json, keyed by
 * the spec's paths under `/api`; the sandbox calls `grafana.request({ method, path, query, body })`. */

const SERVICE = 'Grafana';

export const settings = parsePluginSettings(raw, {
  parse(value) {
    const p = isPlainObject(value) ? value : {};
    const text = (v: unknown, name: string) => {
      if (typeof v !== 'string' || !v) throw new Error(`plugin.yaml plugin.${name} must be a string`);
      return v;
    };
    const positive = (name: string) => {
      const v = p[name];
      if (typeof v !== 'number' || v < 1) throw new Error(`plugin.yaml plugin.${name} must be a positive number`);
      return v;
    };
    if (!Array.isArray(p.versionSources) || !p.versionSources.length)
      throw new Error('plugin.yaml plugin.versionSources must be a non-empty list');
    return {
      apiPath: text(p.apiPath, 'apiPath'),
      specPath: text(p.specPath, 'specPath'),
      versionSources: p.versionSources.map((s: unknown) => {
        const o = isPlainObject(s) ? s : {};
        return { path: text(o.path, 'versionSources.path'), field: text(o.field, 'versionSources.field') };
      }),
      minMajor: positive('minMajor'),
      minOperations: positive('minOperations'),
    };
  },
});

/** plugin.yaml's rules, without upstream lookups. */
export const policy = compileRules(settings);

const LOCKED_KEYS = lockedKeys(settings.rules);

export function buildCatalog(spec: string | Record<string, unknown>, rules: CompiledRules<unknown> = policy) {
  const catalog = buildOpenApiCatalog(spec, { service: SERVICE, rules, minOperations: settings.plugin.minOperations });
  requireLockedKeys(catalog.operations, LOCKED_KEYS, SERVICE);
  return catalog;
}

/** The API under `/api`, and the base URL itself for the spec (a static file outside `/api`). */
interface Clients {
  api: HttpJsonClient;
  root: HttpJsonClient;
}

function client(init: InitParams, suffix: string) {
  return new HttpJsonClient({
    baseUrl: joinApiPath(requireString(init.config, 'baseUrl'), suffix),
    service: SERVICE,
    verifyTls: init.config.verifyTls !== false,
    headers: authHeaders(init),
    timeoutMs: settings.defaults.timeouts.request,
  });
}

export function createGrafanaPlugin(): PluginHandlers {
  return definePlugin<Clients>({
    connect: (init) => ({ api: client(init, settings.plugin.apiPath), root: client(init, '') }),

    version: (kit) => grafanaVersion(kit.client().api, settings.plugin.versionSources, settings.plugin.minMajor),
    // /api/health is public; the current organization proves the token works.
    probe: async (kit) => void (await kit.client().api.request('GET', '/org')),

    handlers(kit) {
      const api = () => kit.client().api;
      const rules = compileRules(settings, { lookup: restLookup(api) });
      const catalog = kit.lazy(async () => {
        const spec = await kit.client().root.request('GET', settings.plugin.specPath);
        if (typeof spec !== 'string' && !isPlainObject(spec))
          throw new PluginError(ErrorCodes.UpstreamError, `${SERVICE} served no OpenAPI spec`);
        try {
          return buildCatalog(spec, rules);
        } catch (err) {
          if (err instanceof SpecError) throw new PluginError(ErrorCodes.UpstreamError, err.message);
          throw err;
        }
      });
      const binding = restBinding({
        namespace: 'grafana',
        service: SERVICE,
        rules,
        catalog: catalog.get,
        client: api,
        stripPrefix: settings.plugin.apiPath,
        // Room for a data source's url or a contact point's settings ahead of the cut.
        maxSummaryBody: 1000,
      });
      return {
        async syncCatalog() {
          const upstreamVersion = await kit.version();
          return { upstreamVersion, operations: (await catalog.reload()).operations };
        },
        resolveOperation: binding.resolveOperation,
        resolveTargets: ({ key, params }) => dataSourceTargets(api(), key, params, settings.defaults.timeouts.lookup),
        async summarize(params) {
          const summary = await binding.summarize(params);
          return { ...summary, text: withTargets(summary.text, params.targets) };
        },
        invoke: (params) => binding.invoke(params),
      };
    },
  });
}
