import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyInstance } from "fastify";
import { PATHS } from "@repo/contract";

export function eventRoutes(app: FastifyInstance) {
  app.get(PATHS.events, async (request, reply) => {
    // Writing to the raw response skips the headers Fastify has collected,
    // so the cross-origin ones are carried over by hand.
    const collected = reply.getHeaders() as OutgoingHttpHeaders;
    reply.hijack();
    reply.raw.writeHead(200, {
      ...collected,
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    reply.raw.write(": connected\n\n");
    const lastId = header(request.headers["last-event-id"]);
    for (const event of app.lab.events.replayAfter(lastId)) {
      writeEvent(reply.raw, event.id, event);
    }
    const unsubscribe = app.lab.events.subscribe((event) => {
      writeEvent(reply.raw, event.id, event);
    });
    const heartbeat = setInterval(() => {
      reply.raw.write(":\n\n");
    }, 15_000);
    const onAbort = () => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    };
    request.raw.on("close", onAbort);
    app.lab.stop.signal.addEventListener("abort", onAbort, { once: true });
  });
}

function writeEvent(stream: NodeJS.WritableStream, id: string, data: unknown) {
  stream.write(`id: ${id}\ndata: ${JSON.stringify(data)}\n\n`);
}

function header(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
