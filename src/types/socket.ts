// WebSocket event types — shared between client and server.
// Server emits these; client receives them via Zustand dispatch.

export interface EconomyUpdatePayload {
  gold:   number;
  food:   number;
  steel:  number;
  energy: number;
  morale: number;
}

export interface BattleResolvedPayload {
  battleId: string;
  reportId: string;
  winner:   "ATTACKER" | "DEFENDER" | "DRAW";
  isAttacker: boolean;
}

export interface IncomingAttackPayload {
  attackerName: string | null; // null = masked until closer ETA
  eta:          number;        // Unix ms
  weaponType:   string;
}

export interface ResearchCompletedPayload {
  techNodeId:   string;
  techNodeName: string;
  bonusType:    string | null;
  bonusValue:   number | null;
}

export interface WorldEventPayload {
  eventId:     string;
  type:        string;
  description: string;
  endsAt:      number | null; // Unix ms
}

export interface SpyDetectedPayload {
  operationType: string;
  captured:      boolean;
  possiblyFalseAlarm: boolean;
}

export type ServerToClientEvents = {
  "economy:update":      (data: EconomyUpdatePayload) => void;
  "battle:resolved":     (data: BattleResolvedPayload) => void;
  "alert:incoming":      (data: IncomingAttackPayload) => void;
  "research:completed":  (data: ResearchCompletedPayload) => void;
  "worldevent:started":  (data: WorldEventPayload) => void;
  "worldevent:ended":    (data: Pick<WorldEventPayload, "eventId">) => void;
  "espionage:spy_detected": (data: SpyDetectedPayload) => void;
};

export type ClientToServerEvents = {
  "client:rehydrate": (data: { since: number }) => void;
};
