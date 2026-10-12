import { resolve } from 'node:path';
import type { Result } from '../../../../packages/shared/src/types';
import { cloudSaveEnabled } from './database';
import { persistMatch } from './account-store';
import { MatchQueue } from './match-queue';

const queue = cloudSaveEnabled
  ? new MatchQueue(resolve(process.env.MATCH_OUTBOX_DIR || '.runtime/match-outbox'), persistMatch, {
      report: (matchId, attempts, error) =>
        console.error('Match persistence pending', {
          matchId,
          attempts,
          code: (error as { code?: string }).code ?? 'persistenceError',
        }),
    })
  : null;

export async function startMatchPersistence() {
  await queue?.start();
}
export async function stopMatchPersistence() {
  await queue?.stop();
}
export function submitMatch(result: Result, participants: readonly string[]) {
  queue?.submit(result, participants);
}
