import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Result } from '../../../../packages/shared/src/types';

type Job = { version: 1; result: Result; participants: string[] };
type Pending = { job: Job; saved: boolean; attempts: number; due: number };

/** One server process owns this directory. Files outlive Colyseus rooms and
 * process restarts; SQL finalization must be idempotent across redelivery. */
export class MatchQueue {
  private pending = new Map<string, Pending>();
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = true;
  constructor(
    private directory: string,
    private persist: (result: Result, participants: string[]) => Promise<void>,
    private options: {
      baseDelay?: number;
      maxDelay?: number;
      report?: (matchId: string, attempts: number, error: unknown) => void;
    } = {},
  ) {}
  get size() {
    return this.pending.size;
  }
  private filename(id: string) {
    return join(this.directory, `${createHash('sha256').update(id).digest('hex')}.json`);
  }
  async start() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json')) continue;
      try {
        const job = JSON.parse(await readFile(join(this.directory, name), 'utf8')) as Job;
        if (
          job.version !== 1 ||
          !job.result ||
          typeof job.result.matchId !== 'string' ||
          !Array.isArray(job.participants) ||
          !job.participants.length ||
          !job.participants.every((id) => typeof id === 'string') ||
          join(this.directory, name) !== this.filename(job.result.matchId)
        )
          throw new Error('invalidMatchJournal');
        this.pending.set(job.result.matchId, { job, saved: true, attempts: 0, due: 0 });
      } catch (error) {
        // Retain malformed records for operator inspection; never silently delete.
        this.options.report?.(name, 0, error);
      }
    }
    this.stopped = false;
    this.schedule();
  }
  submit(result: Result, participants: readonly string[]) {
    if (this.stopped) throw new Error('matchQueueNotStarted');
    if (!participants.length || this.pending.has(result.matchId)) return;
    const job: Job = {
      version: 1,
      result: structuredClone(result),
      participants: [...new Set(participants)],
    };
    this.pending.set(result.matchId, { job, saved: false, attempts: 0, due: 0 });
    this.schedule();
  }
  private schedule() {
    if (this.stopped || this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.pending.size) return;
    const due = Math.min(...Array.from(this.pending.values(), (entry) => entry.due));
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.running = this.flush().finally(() => {
          this.running = undefined;
          this.schedule();
        });
      },
      Math.max(0, due - Date.now()),
    );
    this.timer.unref();
  }
  private async save(job: Job) {
    const filename = this.filename(job.result.matchId);
    const temporary = `${filename}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify(job));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, filename);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  private async flush() {
    for (const [id, entry] of this.pending) {
      if (this.stopped || entry.due > Date.now()) continue;
      try {
        if (!entry.saved) {
          await this.save(entry.job);
          entry.saved = true;
        }
        await this.persist(entry.job.result, entry.job.participants);
        await unlink(this.filename(id));
        this.pending.delete(id);
      } catch (error) {
        entry.attempts++;
        entry.due =
          Date.now() +
          Math.min(
            this.options.maxDelay ?? 60000,
            (this.options.baseDelay ?? 1000) * 2 ** Math.min(entry.attempts - 1, 16),
          );
        this.options.report?.(id, entry.attempts, error);
      }
    }
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
    // On orderly shutdown also journal submissions whose worker has not run.
    for (const entry of this.pending.values()) {
      if (!entry.saved) {
        await this.save(entry.job);
        entry.saved = true;
      }
    }
  }
}
