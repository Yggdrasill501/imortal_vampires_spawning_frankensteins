import type { LabEvent } from "@repo/contract";

type WithoutId<T> = T extends unknown ? Omit<T, "id" | "at"> : never;
type EventBody = WithoutId<LabEvent> & { at?: string };

export class EventBus {
  private readonly events: LabEvent[] = [];
  private readonly listeners = new Set<(event: LabEvent) => void>();
  private nextId: number;

  constructor(startId = Date.now()) {
    this.nextId = startId;
  }

  emit(body: EventBody): LabEvent {
    const event = {
      ...body,
      id: String(this.nextId),
      at: body.at ?? new Date().toISOString(),
    } as LabEvent;
    this.nextId += 1;
    this.events.push(event);
    if (this.events.length > 1000) this.events.shift();
    for (const listener of this.listeners) listener(event);
    return event;
  }

  replayAfter(lastId: string | undefined): LabEvent[] {
    if (!lastId) return [];
    const index = this.events.findIndex((event) => event.id === lastId);
    if (index === -1) return [];
    return this.events.slice(index + 1);
  }

  subscribe(listener: (event: LabEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
