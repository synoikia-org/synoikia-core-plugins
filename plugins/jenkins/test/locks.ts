import { DEPLOY, HELLO } from './fake-jenkins.js';

/** One call per locked key, and the literal an approver must type for it against the fake Jenkins. */
export interface LockCase {
  key: string;
  params: { path?: Record<string, unknown>; query?: Record<string, unknown> };
  confirm: string;
  /** Text the approval must show first: what the call acts on. */
  shows: string;
}

export const LOCK_CASES: LockCase[] = [
  {
    key: 'builds.delete',
    params: { path: { job: DEPLOY, number: 41 } },
    confirm: `${DEPLOY}#41`,
    shows: `on ${DEPLOY} #41: POST /job/infra/job/deploy%20app/41/doDelete`,
  },
  {
    key: 'jobs.delete',
    params: { path: { job: HELLO } },
    confirm: HELLO,
    shows: `on ${HELLO}: POST /job/hello/doDelete`,
  },
  {
    key: 'jobs.disable',
    params: { path: { job: DEPLOY } },
    confirm: DEPLOY,
    shows: `on ${DEPLOY}: POST /job/infra/job/deploy%20app/disable`,
  },
  {
    key: 'jobs.enable',
    params: { path: { job: DEPLOY } },
    confirm: DEPLOY,
    shows: `on ${DEPLOY}: POST /job/infra/job/deploy%20app/enable`,
  },
  { key: 'system.safeRestart', params: {}, confirm: '127.0.0.1', shows: 'on 127.0.0.1: POST /safeRestart' },
  {
    key: 'system.quietDown',
    params: { query: { reason: 'upgrade‮ tonight' } },
    confirm: '127.0.0.1',
    shows: 'on 127.0.0.1: POST /quietDown (reason "upgrade\\u202e tonight")',
  },
  { key: 'system.cancelQuietDown', params: {}, confirm: '127.0.0.1', shows: 'on 127.0.0.1: POST /cancelQuietDown' },
];
