import {
  buildOpenApiCatalog,
  compileRules,
  isPlainObject,
  parsePluginSettings,
  SpecError,
  stringOr,
} from '@synoikia/plugin-sdk';
import type {
  CompiledRules,
  ConfirmContext,
  OpenApiCatalog,
  OperationDescriptor,
  RestCall,
  RestParams,
  RuleHooks,
} from '@synoikia/plugin-sdk';
import raw from '../plugin.yaml';
import { requiredKeys, requireLockedKeys } from './locks.js';
import { parseSpecSource, pmsOnly } from './spec.js';

/** Plex's catalog: the SDK's OpenAPI catalog over the PMS operations of the pinned community spec, with
 * plugin.yaml's rules on top; keys are the spec's paths (`PUT /:/scrobble`). */

export const SERVICE = 'Plex';

export const settings = parsePluginSettings(raw, {
  parse(value) {
    const p = isPlainObject(value) ? value : {};
    const text = (key: string) => {
      const v = p[key];
      if (typeof v !== 'string' || !v) throw new Error(`plugin.yaml plugin.${key} must be a string`);
      return v;
    };
    if (typeof p.minOperations !== 'number' || p.minOperations < 1)
      throw new Error('plugin.yaml plugin.minOperations must be a positive number');
    const keys = (key: string) => {
      const v = p[key];
      if (!Array.isArray(v) || !v.every((c) => typeof c === 'string' && /^\w+$/.test(c)))
        throw new Error(`plugin.yaml plugin.${key} must be a list of keys`);
      return v as string[];
    };
    return {
      spec: parseSpecSource(p.spec),
      versionPath: text('versionPath'),
      versionField: text('versionField'),
      minOperations: p.minOperations,
      canonicalKeys: keys('canonicalKeys'),
      refreshFlags: keys('refreshFlags'),
    };
  },
});

/** Set and not plainly false: a flag the upstream reads as true (`true`, `"true"`, `1`) takes the locked twin. */
const flagOn = (v: unknown) => v !== undefined && v !== null && v !== false && v !== 'false' && v !== 0 && v !== '0';

/** When a call takes its locked twin (plugin.yaml `split`). */
export const splitWhen: Record<string, (call: RestCall) => boolean> = {
  refresh: (call) => settings.plugin.refreshFlags.some((flag) => flagOn(call.params.query?.[flag])),
  // `{ids}` is a comma-separated list: anything but exactly one id takes the bulk twin.
  many: (call) => (stringOr(call.params.path?.ids) ?? '').split(',').filter((id) => id.trim()).length !== 1,
};

/** `GET /playQueues/{playQueueId}` with `own` takes the play queue over: it takes the unlocked `#own` twin. */
export const PLAY_QUEUE = 'GET /playQueues/{playQueueId}';
export const PLAY_QUEUE_OWN = `${PLAY_QUEUE}#own`;

/** `own` set and not plainly off; a value that is not a scalar takes the twin too. */
export function takesQueue(params: RestParams): boolean {
  const own = params.query?.own;
  if (own !== null && typeof own === 'object') return true;
  return flagOn(own);
}

/** The `#own` twin: a reviewed write, with approval but no typed confirmation (owner decision); the SDK locks every
 * split twin, so it is added here rather than with `split`. */
function playQueueTwin(base: OperationDescriptor, rules: CompiledRules<unknown>): OperationDescriptor {
  const { locked: _l, typedConfirmation: _t, ...draft } = base;
  return {
    ...rules.decorate({ ...draft, key: PLAY_QUEUE_OWN }),
    classification: 'write',
    classificationReason: 'reviewed:get-changes-state',
    locked: false,
    typedConfirmation: false,
    needsReview: false,
  };
}

export type Get = (path: string) => Promise<unknown>;

const section = (value: unknown, key: string) => (isPlainObject(value) && isPlainObject(value[key]) ? value[key] : {});

/** The `Metadata` rows of a MediaContainer response. */
export function metadataRows(response: unknown): Record<string, unknown>[] {
  const rows = section(response, 'MediaContainer').Metadata;
  return Array.isArray(rows) ? rows.filter(isPlainObject) : [];
}

/** Named confirmation sources plugin.yaml uses. */
export function customSources(): NonNullable<RuleHooks['custom']> {
  return {
    // The first path id: the literal for a locked operation plugin.yaml gives none.
    'path-id': ({ params }: ConfirmContext) => Object.values(section(params, 'path')).map(stringOr).find(Boolean),
    // `{ids}` takes a comma-separated list: more than one item confirms on the count.
    'item-count': ({ params }: ConfirmContext) => {
      const ids = stringOr(section(params, 'path').ids)?.split(',');
      return ids && ids.length > 1 ? `${ids.length} items` : undefined;
    },
  };
}

/** plugin.yaml's rules, without upstream lookups. */
export const policy = compileRules(settings, { custom: customSources() });

const REQUIRED_KEYS = requiredKeys(settings.rules);

// The SDK skips paths with characters outside [A-Za-z0-9_-./{}], and Plex keeps actions under a `:` segment
// (`/:/scrobble`, `/:/prefs`): those paths are built under a placeholder segment and restored after.
const COLON = '-colon-';
const restore = (text: string) =>
  text
    .split('/')
    .map((s) => (s === COLON ? ':' : s))
    .join('/');

function withPlaceholders(doc: Record<string, unknown>): Record<string, unknown> {
  const paths: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(isPlainObject(doc.paths) ? doc.paths : {})) {
    const segments = path.split('/');
    if (segments.includes(COLON)) throw new SpecError(`The ${SERVICE} API spec has a path with a ${COLON} segment`);
    const key = segments.map((s) => (s === ':' ? COLON : s)).join('/');
    Object.defineProperty(paths, key, { value: item, enumerable: true, writable: true, configurable: true });
  }
  return { ...doc, paths };
}

export function buildCatalog(
  spec: string | Record<string, unknown>,
  rules: CompiledRules<unknown> = policy,
): OpenApiCatalog {
  const view: CompiledRules<unknown> = {
    ...rules,
    excluded: (key) => rules.excluded(restore(key)),
    describe: (draft) => rules.describe({ ...draft, key: restore(draft.key) }),
  };
  const catalog = buildOpenApiCatalog(withPlaceholders(pmsOnly(spec, SERVICE)), {
    service: SERVICE,
    rules: view,
    minOperations: settings.plugin.minOperations,
  });
  for (const ops of catalog.byVerb.values())
    for (const op of ops) {
      op.key = restore(op.key);
      op.template = restore(op.template);
      op.segments = op.segments.map((s) => (s === COLON ? ':' : s));
    }
  // The play queue GET is required too: a renamed one would read with `own`, which takes the queue over.
  requireLockedKeys(catalog.operations, [...REQUIRED_KEYS, PLAY_QUEUE], SERVICE);
  catalog.operations.push(
    playQueueTwin(
      catalog.operations.find((o) => o.key === PLAY_QUEUE)!,
      rules,
    ),
  );
  catalog.operations.sort((a, b) => a.key.localeCompare(b.key));
  return catalog;
}
