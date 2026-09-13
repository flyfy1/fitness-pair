// Adapted from flyfy1/integ-games c2a3374; see apps/integ-ar/README.md.
/** Shared, intentionally small boundary between the arcade shell and games. */
/** Internal game-module grouping retained for backwards-compatible game metadata. */
export type GameModuleCategory = 'puzzle' | 'arcade' | 'action' | 'cards-logic';

/** Visitor-facing, mechanic-led arcade taxonomy. */
export type GameCategory = 'puzzle-strategy' | 'match-build' | 'quick-reflex' | 'action-adventure';

export type GameMeta = {
  slug: string;
  title: string;
  category: GameModuleCategory;
  description: string;
  instructions: string;
  accent: string;
  mechanic: string;
};

export type GameCatalogEntry = GameMeta & {
  primaryCategory: GameCategory;
  traits: readonly [string, string];
  recommendations: readonly [string, string, string, string];
};

export type GameStorage = {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
};

export type GameSound = {
  play(kind: 'tap' | 'move' | 'merge' | 'collect' | 'clear' | 'jump' | 'shoot' | 'hit' | 'upgrade' | 'success' | 'fail'): void;
  setMuted(muted: boolean): void;
  stop(): void;
  readonly muted: boolean;
};

export type GameServices = {
  storage: GameStorage;
  sound: GameSound;
  random: () => number;
  reportScore(score: number): void;
  reportComplete(progress?: number): void;
  isReducedMotion: boolean;
};

export type GameController = {
  input(command: {horizontal: number; aim: {x: number; y: number} | null; primary: boolean}): void;
  getState(): {phase: string; score: number; [key: string]: unknown};
  pause(): void;
  resume(): void;
  restart(): void;
  destroy(): void;
};

export type GameModule = {
  meta: GameMeta;
  mount(host: HTMLElement, services: GameServices): GameController;
};

export type GameModuleLoader = () => Promise<{ default: GameModule }>;
