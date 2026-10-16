import { isPlainObject, stringOr } from '@synoikia/plugin-sdk';
import { categories } from './stored.js';
import type { Lookups } from './stored.js';
import { quote } from './text.js';

/** Where qBittorrent saves a torrent, as `SessionImpl::categorySavePath` and `buildLoadTorrentParams` decide it, so
 * an approval names the directory data lands in or moves to even when no call param names it. */

export interface PathSettings {
  /** The default save path (`save_path`). */
  defaultPath: string;
  /** Stored category save paths by name; empty for an implicit path. */
  categories: Map<string, string>;
  /** New torrents use automatic management unless told otherwise (`auto_tmm_enabled`). */
  autoTmmDefault: boolean;
  /** Manual-mode torrents still start from the category's path (`use_category_paths_in_manual_mode`). */
  categoryPathsInManual: boolean;
}

/** The settings the paths depend on, read from qBittorrent; undefined when a read fails. */
export async function pathSettings(l: Lookups): Promise<PathSettings | undefined> {
  const [prefs, cats] = await Promise.all([
    l.client.request('GET', '/app/preferences', { timeoutMs: l.timeoutMs }).catch(() => undefined),
    categories(l),
  ]);
  const defaultPath = isPlainObject(prefs) ? stringOr(prefs.save_path) : undefined;
  if (!isPlainObject(prefs) || !defaultPath || !cats) return undefined;
  return {
    defaultPath,
    categories: new Map([...cats].map(([name, c]) => [name, c.savePath])),
    autoTmmDefault: prefs.auto_tmm_enabled === true,
    categoryPathsInManual: prefs.use_category_paths_in_manual_mode === true,
  };
}

const isAbsolute = (p: string) => p.startsWith('/') || p.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(p);
const join = (base: string, rel: string) => `${base.replace(/[\\/]+$/, '')}/${rel}`;

/** A category's save path: its own (relative to the default save path), else implicit, `<parent's path>/<last
 * segment>` (`a/b` under `a`'s path; a top-level one under the default save path). No category: the default. */
export function categoryPath(s: PathSettings, name: string): string {
  if (!name) return s.defaultPath;
  const own = s.categories.get(name) ?? '';
  if (own) return isAbsolute(own) ? own : join(s.defaultPath, own);
  const sep = name.lastIndexOf('/');
  // `Utils::Fs::toValidPath`: runs of `:?"*<>|` become one space.
  const segment = name.slice(sep + 1).replace(/[:?"*<>|]+/g, ' ');
  return join(categoryPath(s, sep < 0 ? '' : name.slice(0, sep)), segment);
}

/** Where `torrents/add` saves, destination text for the approval. With automatic management (asked for, or the
 * default when no path is given) qBittorrent ignores `savepath` and uses the category's path. */
export function addDestination(s: PathSettings | undefined, p: Record<string, unknown>): string {
  if (!s) return 'a save path qBittorrent did not report';
  const category = typeof p.category === 'string' ? p.category : '';
  const savepath = typeof p.savepath === 'string' ? p.savepath.trim() : '';
  const downloadPath = typeof p.downloadPath === 'string' ? p.downloadPath.trim() : '';
  const auto = typeof p.autoTMM === 'boolean' ? p.autoTMM : !savepath && !downloadPath && s.autoTmmDefault;
  if (auto) {
    const ignored = savepath ? `; savepath ${quote(savepath)} is ignored` : '';
    return `${quote(categoryPath(s, category))} (automatic management${category ? `, category ${quote(category)}` : ''}${ignored})`;
  }
  const useCategory = (typeof p.autoTMM === 'boolean' ? p.autoTMM : s.autoTmmDefault) || s.categoryPathsInManual;
  const base = useCategory ? categoryPath(s, category) : s.defaultPath;
  if (!savepath)
    return `${quote(base)} (${useCategory && category ? "the category's save path" : 'the default save path'})`;
  return quote(isAbsolute(savepath) ? savepath : join(base, savepath));
}
