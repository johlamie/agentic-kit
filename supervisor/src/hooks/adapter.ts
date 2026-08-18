import type { NormalizedEvent } from "../types.js";
import { normalizeHookEvent } from "./normalize.js";

export interface EventAdapter {
  readonly producer: string;
  normalize(payload: unknown): NormalizedEvent;
}

export class ClaudeHookAdapter implements EventAdapter {
  public readonly producer = "claude";
  public normalize(payload: unknown): NormalizedEvent { return normalizeHookEvent(payload); }
}
