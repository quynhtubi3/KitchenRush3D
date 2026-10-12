import { mkdtemp, mkdir, readdir, readFile, unlink, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MatchQueue } from '../apps/server/src/persistence/match-queue';
import type { Result } from '../packages/shared/src/types';

const result: Result = {
  matchId: 'queue-test',
  levelId: 'little-sun-01',
  teamSize: 2,
  won: true,
  stars: 2,
  score: 420,
  served: 3,
  missed: 0,
  bestCombo: 3,
  averageService: 22,
  duration: 90,
};
const directories: string[] = [];
const queues: MatchQueue[] = [];
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'kr-match-queue-'));
  directories.push(path);
  return path;
}
function queue(path: string, persist: (r: Result, ids: string[]) => Promise<void>) {
  const q = new MatchQueue(path, persist, { baseDelay: 25, maxDelay: 50 });
  queues.push(q);
  return q;
}
afterEach(async () => {
  for (const q of queues.splice(0)) await q.stop();
  for (const path of directories.splice(0)) {
    for (const name of await readdir(path)) await unlink(join(path, name));
    await rmdir(path);
  }
});

it('journals immutable participants, retries with capped backoff and deduplicates pending results', async () => {
  const path = await directory();
  const times: number[] = [];
  const persist = vi.fn(async () => {
    times.push(Date.now());
    if (times.length < 4) throw new Error('databaseOffline');
  });
  const q = queue(path, persist);
  await q.start();
  const mutable = { ...result };
  const players = ['one', 'two', 'one'];
  q.submit(mutable, players);
  q.submit(mutable, ['intruder']);
  mutable.score = 9999;
  players.push('late');
  await expect.poll(() => persist.mock.calls.length).toBe(4);
  await expect.poll(() => q.size).toBe(0);
  expect(persist.mock.calls[0]).toEqual([result, ['one', 'two']]);
  expect(times[1] - times[0]).toBeGreaterThanOrEqual(25);
  expect(times[2] - times[1]).toBeGreaterThanOrEqual(50);
  expect(times[3] - times[2]).toBeGreaterThanOrEqual(50);
  expect(await readdir(path)).toEqual([]);
});

it('recovers a pending result after room/process lifetime ends', async () => {
  const path = await directory();
  const failed = vi.fn(async () => {
    throw new Error('offline');
  });
  const first = queue(path, failed);
  await first.start();
  first.submit(result, ['one']);
  await expect.poll(() => failed.mock.calls.length).toBeGreaterThan(0);
  await first.stop();
  const files = await readdir(path);
  expect(files).toHaveLength(1);
  expect(JSON.parse(await readFile(join(path, files[0]), 'utf8')).result).toEqual(result);
  const persisted = vi.fn(async () => {});
  const restarted = queue(path, persisted);
  await restarted.start();
  await expect.poll(() => restarted.size).toBe(0);
  expect(persisted).toHaveBeenCalledExactlyOnceWith(result, ['one']);
});

it('journals submissions during orderly shutdown and retains malformed files', async () => {
  const path = await directory();
  await writeFile(join(path, 'invalid.json'), '{broken');
  const report = vi.fn();
  const persist = vi.fn(async () => {});
  const q = new MatchQueue(path, persist, { report });
  queues.push(q);
  await q.start();
  q.submit(result, ['one']);
  await q.stop();
  expect(persist).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledTimes(1);
  expect(await readdir(path)).toHaveLength(2);
});

it('does not send an unjournaled result to SQL and retries when the journal becomes writable', async () => {
  const path = await directory();
  const failures = vi.fn();
  const persist = vi.fn(async () => {});
  const q = new MatchQueue(path, persist, { baseDelay: 25, report: failures });
  queues.push(q);
  await q.start();
  await rmdir(path);
  await writeFile(path, 'simulate an unavailable journal directory');
  q.submit(result, ['one']);
  try {
    await expect.poll(() => failures.mock.calls.length).toBeGreaterThan(0);
    expect(persist).not.toHaveBeenCalled();
  } finally {
    await unlink(path);
    await mkdir(path);
  }
  await expect.poll(() => q.size).toBe(0);
  expect(persist).toHaveBeenCalledTimes(1);
});
