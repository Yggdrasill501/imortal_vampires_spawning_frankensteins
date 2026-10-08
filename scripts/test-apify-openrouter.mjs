// Checks whether Apify's OpenRouter proxy Actor lets us call LLMs paid with Apify credits.
//
//   node --env-file=.env scripts/test-apify-openrouter.mjs [model]
//
// Needs APIFY_TOKEN in .env (Apify Console -> Settings -> API & Integrations).
//
// The proxy only accepts callers running inside the Apify platform. Run from a laptop, the
// chat check fails and every attempt still bills Actor starts, so the script stops there.
import { crc32, deflateSync } from "node:zlib";

const TOKEN = process.env.APIFY_TOKEN;
const BASE_URL =
  process.env.APIFY_OPENROUTER_URL ?? "https://openrouter.apify.actor/api/v1";
const MODEL = process.argv[2] ?? "openai/gpt-4o-mini";

if (!TOKEN) {
  console.error(
    "APIFY_TOKEN is not set. Add it to .env and run with --env-file=.env",
  );
  process.exit(1);
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`,
  );
};

async function request(url, init = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return { status: 0, ok: false, text: String(err) };
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body, keep the raw text for the error message
  }
  return { status: res.status, ok: res.ok, json, text: text.slice(0, 400) };
}

const chat = (body) =>
  request(`${BASE_URL}/chat/completions`, {
    method: "POST",
    body: JSON.stringify({ model: MODEL, max_tokens: 100, ...body }),
  });

async function monthlyUsageUsd() {
  const res = await request("https://api.apify.com/v2/users/me/limits");
  return {
    used: res.json?.data?.current?.monthlyUsageUsd,
    max: res.json?.data?.limits?.maxMonthlyUsageUsd,
  };
}

// Solid-colour PNG, so the vision check does not depend on any file or network image.
function solidPng(size, [r, g, b]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.alloc(size * 3, Buffer.from([r, g, b])),
  ]);
  const pixels = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

console.log(`Endpoint: ${BASE_URL}\nModel:    ${MODEL}\n`);

// 1. Is the token valid at all?
const me = await request("https://api.apify.com/v2/users/me");
record(
  "Apify token is valid",
  me.ok,
  me.ok
    ? `user=${me.json.data.username} plan=${me.json.data.plan?.id ?? "?"}`
    : `HTTP ${me.status} ${me.text}`,
);
if (!me.ok) process.exit(1);

const before = await monthlyUsageUsd();
console.log(`      monthly usage before: $${before.used} of $${before.max}\n`);

// 2. Plain completion through the proxy.
const basic = await chat({
  messages: [{ role: "user", content: "Reply with exactly the word: pong" }],
});
const basicText = basic.json?.choices?.[0]?.message?.content;
record(
  "Chat completion",
  basic.ok && Boolean(basicText),
  basic.ok
    ? `reply=${JSON.stringify(basicText)} usage=${JSON.stringify(basic.json?.usage)}`
    : `HTTP ${basic.status} ${basic.text}`,
);

if (!basic.ok) {
  console.log(
    "\nStopping: the proxy did not answer, further calls would only bill Actor starts.",
  );
  process.exit(1);
}

// 3. Tool calling, which the browser agent depends on.
const tools = await chat({
  messages: [
    { role: "user", content: "Open https://example.com in the browser." },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "navigate",
        description: "Navigate the browser to a URL",
        parameters: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
      },
    },
  ],
  tool_choice: "auto",
});
const call = tools.json?.choices?.[0]?.message?.tool_calls?.[0]?.function;
record(
  "Tool calling",
  tools.ok && call?.name === "navigate",
  tools.ok
    ? `tool_call=${JSON.stringify(call ?? null)}`
    : `HTTP ${tools.status} ${tools.text}`,
);

// 4. Image input, for screenshot-driven agents.
const vision = await chat({
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "What single colour fills this image? One word.",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:image/png;base64,${solidPng(64, [255, 0, 0])}`,
          },
        },
      ],
    },
  ],
});
const visionText = vision.json?.choices?.[0]?.message?.content;
record(
  "Image input",
  vision.ok && /red/i.test(visionText ?? ""),
  vision.ok
    ? `reply=${JSON.stringify(visionText)}`
    : `HTTP ${vision.status} ${vision.text}`,
);

// 5. Streaming, which most agent SDKs use by default.
const streamRes = await fetch(`${BASE_URL}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 30,
    stream: true,
    messages: [{ role: "user", content: "Count from 1 to 5." }],
  }),
  signal: AbortSignal.timeout(90_000),
});
const streamBody = await streamRes.text();
const chunks = streamBody
  .split("\n")
  .filter((line) => line.startsWith("data: {")).length;
record(
  "Streaming",
  streamRes.ok && chunks > 1,
  streamRes.ok
    ? `${chunks} SSE chunks`
    : `HTTP ${streamRes.status} ${streamBody.slice(0, 400)}`,
);

// 6. Did the calls land on the Apify bill? Usage reporting can lag by a few minutes.
await new Promise((resolve) => setTimeout(resolve, 15_000));
const after = await monthlyUsageUsd();
const delta = after.used - before.used;
console.log(
  `\n      monthly usage after:  $${after.used} (delta $${delta.toFixed(6)})` +
    (delta > 0
      ? "\n      -> charged to Apify credits."
      : "\n      -> no change yet; re-check Console -> Billing -> Usage in a few minutes."),
);

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length ? 1 : 0);
