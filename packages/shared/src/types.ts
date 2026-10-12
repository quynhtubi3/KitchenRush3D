export type Point = { x: number; z: number };
export type ItemKind =
  | (string & {})
  | 'meat'
  | 'cookedMeat'
  | 'burnt'
  | 'lettuce'
  | 'choppedLettuce'
  | 'bun'
  | 'plate'
  | 'burger'
  | 'dirtyPlate';
export type Item = {
  id: string;
  kind: ItemKind;
  parts: ItemKind[];
  assemblyRecipe?: string;
  assemblyChefs?: string[];
};
export type StationKind =
  | 'dispenser'
  | 'board'
  | 'stove'
  | 'counter'
  | 'assembly'
  | 'rack'
  | 'sink'
  | 'trash'
  | 'seat';
export type StationDefinition = Point & { id: string; kind: StationKind; ingredient?: ItemKind };
export type Station = StationDefinition & {
  process?: { output: string; seconds: number; taps: number };
  item: Item | null;
  progress: number;
  phase: 'idle' | 'processing' | 'ready' | 'burnt';
  elapsed: number;
  stock: Item[];
};
export type Customer = {
  type?: 'regular' | 'vip' | 'impatient' | 'complex' | 'combo';
  id: string;
  seat: string | null;
  state: 'Arriving' | 'Queueing' | 'Seated' | 'WaitingForFood' | 'Eating' | 'Leaving';
  patience: number;
  maxPatience: number;
  timer: number;
  recipe: string;
};
export type Chef = Point & {
  preferredRecipe?: string;
  id: string;
  item: Item | null;
  path: Point[];
  target: string | null;
  connected: boolean;
  action: string;
};
export type Result = {
  levelId?: string;
  teamSize?: number;
  won: boolean;
  stars: number;
  score: number;
  served: number;
  missed: number;
  bestCombo: number;
  averageService: number;
  duration: number;
  matchId: string;
};
export type Snapshot = {
  countdown?: number;
  levelId?: string;
  phase: 'lobby' | 'playing' | 'paused' | 'finished';
  session?: SessionState;
  remaining: number;
  elapsed: number;
  score: number;
  served: number;
  missed: number;
  combo: number;
  bestCombo: number;
  chefs: Record<string, Chef>;
  stations: Station[];
  customers: Customer[];
  result: Result | null;
  event: { seq: number; key: string };
};
export type Intent =
  | { type: 'move'; x: number; z: number }
  | { type: 'interact'; station: string }
  | { type: 'selectRecipe'; recipe: string }
  | { type: 'finish' | 'pause' };

export const QUICK_CHAT = ['needPlates', 'onGrill', 'servePlease', 'thanks'] as const;
export const EMOTES = ['wave', 'cheer', 'heart'] as const;
export type SocialIntent =
  | { type: 'quickChat'; value: (typeof QUICK_CHAT)[number] }
  | { type: 'emote'; value: (typeof EMOTES)[number] }
  | { type: 'ping'; value: string };
export type TeamIntent =
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'continue'; levelId: string }
  | { type: 'selectLevel'; levelId: string }
  | { type: 'voteFinish'; agree: boolean }
  | SocialIntent;
export type Member = { id: string; slot: number; ready: boolean; connected: boolean };
export type Signal = SocialIntent & { id: number; from: string; expires: number };
export type SessionState = {
  code: string;
  visibility: 'private' | 'public';
  host: string;
  capacity: number;
  levelId: string;
  members: Member[];
  startedSize: number;
  teamStreak: number;
  votes: string[];
  targetScore: number;
  targetOrders: number;
  signals: Signal[];
};
