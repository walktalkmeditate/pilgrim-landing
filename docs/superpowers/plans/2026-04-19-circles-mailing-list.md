# Circles Mailing List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mailing list for Pilgrim Circles where subscribing is "email `circles@plgr.im`" and the day-before reminder is sent manually by Frank from the `listmonk/` repo.

**Architecture:** Three repos touched. `plgrim/` Worker gains an `email()` handler on the `plgr.im` zone — it classifies inbound mail, calls the public Listmonk API to subscribe/unsubscribe, replies to the sender via `message.reply()` (welcome + unsub-ack), and forwards real messages to Frank via a `send_email` binding. `listmonk/` repo gains `scripts/circles-send.ts` — a manual CLI that reads a walk YAML, renders a plaintext template, and creates a Listmonk campaign scoped to `attribs.city`. `pilgrim-landing/circles.html` gains one section with a `mailto:` link.

**Tech Stack:** TypeScript + Cloudflare Workers (`plgrim/`), TypeScript + tsx + Node (`listmonk/`), static HTML/CSS (`pilgrim-landing/`). New deps: `postal-mime` (plgrim MIME parsing), `vitest` (plgrim tests), `js-yaml` (listmonk walk-file parsing if not already present).

**Spec reference:** `docs/superpowers/specs/2026-04-19-circles-mailing-list-design.md`

**Repo map:**
- `/Users/rubberduck/GitHub/momentmaker/plgrim/` — Worker
- `/Users/rubberduck/GitHub/momentmaker/listmonk/` — send script
- `/Users/rubberduck/GitHub/momentmaker/pilgrim-landing/` — site

Each task below begins with a `cd` line naming the repo. Commit from within that repo.

**Verification method:** Unit tests via `vitest` in `plgrim/` and `listmonk/`. Pure functions (`classify`, `stripQuotedReply`, YAML validator, template renderer) get the most coverage. Integration paths (email handler, CLI) are verified by manual smoke tests after deploy. Final end-to-end in Task 13. The public `/circles` page is updated LAST (Task 14), only after the full pipeline has been verified — no visitor should see the `circles@plgr.im` address on the live site until mail sent to it actually works.

---

## Task 1: Listmonk server-side setup (list + attribute)

**Files:** none — configuration in Listmonk admin UI (or via API if preferred).

- [ ] **Step 1: Log into Listmonk admin**

Open the Listmonk instance (URL is whatever the existing `listmonk/` repo's `.env` `LISTMONK_URL` points to). Confirm you can see existing lists from other projects.

- [ ] **Step 2: Create the list**

In Lists → New list, fill in:
- **Name:** `Pilgrim Circles`
- **Type:** Public
- **Opt-in:** Single (NOT double — we don't want Listmonk sending its own confirmation)
- **Tags:** `pilgrim-circles`
- **Description:** `Day-before walk reminder.`

Save. Record the new list's numeric ID — it appears in the URL after saving (e.g., `/lists/7`). Store this as `LISTMONK_CIRCLES_LIST_ID` for later tasks.

- [ ] **Step 3: Confirm the `attribs` field supports arbitrary keys**

Listmonk's `attribs` is a free-form JSON blob per subscriber. No schema declaration is required. Verify by going to Subscribers → New subscriber → expand "Attributes" — the field accepts any JSON. No action needed; just confirm.

- [ ] **Step 4: Create an API user if one does not exist**

Admin → Settings → Users. Verify an API user exists (the existing `listmonk/` repo uses `LISTMONK_USER` / `LISTMONK_PASS`). If its permissions don't include managing the new list, grant them on the list via Lists → Pilgrim Circles → Permissions.

- [ ] **Step 5: Write the list ID down**

Paste the list ID into a scratch note. It feeds `LISTMONK_CIRCLES_LIST_ID` (plgrim Worker env var) and `list_id` in `sequence.yaml`-equivalent config later.

Expected outcome: a `Pilgrim Circles` list visible in Listmonk admin with a known numeric ID and API access confirmed.

---

## Task 1b: Verify `plgr.im` as a sending identity in AWS SES

**Files:** none — AWS + Cloudflare DNS configuration.

**Why:** Listmonk's SMTP backend is already AWS SES (used for other projects). For Listmonk to send campaigns *from* `circles@plgr.im`, the `plgr.im` domain must be a verified identity in SES (DKIM-signed, SPF-aligned). Without this, campaign sends will fail DMARC alignment and land in spam — or SES will reject them outright.

This does NOT affect the Worker's `message.reply()` welcome/unsub-ack path — those go out via Cloudflare Email Workers on CF's own infrastructure, using CF's DKIM key. SES is only for the campaign path.

- [ ] **Step 1: Create the SES domain identity**

In the AWS SES console (in the same region Listmonk is configured to use — check `listmonk/.env` or Listmonk admin → Settings → SMTP to confirm the region):

1. Go to Verified identities → Create identity.
2. Choose "Domain".
3. Domain: `plgr.im`.
4. Leave "Use a custom MAIL FROM domain" unchecked for now (can add later; not required for the feature to work).
5. Easy DKIM: enabled, RSA_2048_BIT. Let SES generate the keys.
6. Create identity.

SES will show three DKIM CNAME records that need to be published in DNS.

- [ ] **Step 2: Add the DKIM CNAMEs to Cloudflare DNS**

Cloudflare dashboard → `plgr.im` zone → DNS → Records. For each of the three CNAMEs SES gave you:

- **Type:** CNAME
- **Name:** `<token>._domainkey` (paste exactly what SES shows — do not append `.plgr.im`, Cloudflare handles that)
- **Target:** `<token>.dkim.amazonses.com` (the full target SES provides)
- **Proxy status:** DNS only (grey cloud, NOT orange) — DKIM CNAMEs must not be proxied.
- **TTL:** Auto.

Save each. Back in SES, the identity should move from "pending" to "verified" within a few minutes (sometimes faster).

- [ ] **Step 3: Update the SPF record to include SES**

Still in Cloudflare DNS, find the existing `TXT` record at `plgr.im` starting with `v=spf1`. It likely already contains `include:_spf.mx.cloudflare.net` for Email Routing. Add `include:amazonses.com` alongside it, keeping the terminator (`~all` or `-all`) at the end.

Example — if current is:
```
v=spf1 include:_spf.mx.cloudflare.net ~all
```
Change to:
```
v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all
```

Save. SPF changes propagate within minutes.

- [ ] **Step 4: Confirm SES is not in sandbox mode**

AWS SES console → Account dashboard. If the banner says "Your account is in the sandbox", you can only send to verified recipient addresses — which means your own gmail test address would need to be added as a verified identity too. For real list sending, request production access via the "Request production access" button; approval typically takes a few hours.

If Listmonk is already sending campaigns for other projects from this AWS account, the account is already out of sandbox. Skip this step in that case.

- [ ] **Step 5: Verify Listmonk's configured sender can use `plgr.im`**

In Listmonk admin → Settings → SMTP: confirm the SMTP settings point to the SES endpoint (e.g., `email-smtp.us-east-1.amazonaws.com`) and the credentials are set. No changes should be needed — Listmonk sends via SES based on whatever `From` address the campaign specifies, and SES will accept `circles@plgr.im` once the domain is verified.

- [ ] **Step 6: Send a test from Listmonk admin**

In Listmonk admin, create a tiny test campaign:
- Name: `SES verification test`
- Subject: `test`
- From email: `circles@plgr.im`
- List: any list with just your own verified email on it
- Body: anything

Send. Verify the email arrives. Open the raw headers — look for:
- `Authentication-Results: ... dkim=pass ... spf=pass`
- `DKIM-Signature: ... d=plgr.im ...`

If both pass, SES setup is complete. Delete the test campaign.

- [ ] **Step 7: No commit — all configuration is in AWS/CF dashboards**

Document the SES region and identity name in a note for the team (or in a follow-up commit to a deployment README if your team tracks infra this way).

---

## Task 2: Add `vitest` test harness to `plgrim/`

**Files:**
- Modify: `/Users/rubberduck/GitHub/momentmaker/plgrim/package.json`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/vitest.config.ts`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/__tests__/sanity.test.ts`

- [ ] **Step 1: Install vitest + workers pool**

```bash
cd /Users/rubberduck/GitHub/momentmaker/plgrim
npm install --save-dev vitest @cloudflare/vitest-pool-workers
```

Expected: `package-lock.json` updates, `node_modules/vitest` appears.

- [ ] **Step 2: Add `test` scripts to `package.json`**

Open `package.json` and change the `"scripts"` block to:

```json
"scripts": {
  "dev": "wrangler dev",
  "deploy": "wrangler deploy",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

- [ ] **Step 4: Create a sanity test**

Create `src/__tests__/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test
```

Expected: `1 passed`. If it errors on wrangler config, ensure `wrangler.toml` is valid (no syntax errors).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/__tests__/sanity.test.ts
git commit -m "chore(plgrim): add vitest test harness"
```

---

## Task 3: Worker module — `strip-quoted.ts` (TDD)

**Files:**
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/strip-quoted.ts`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/__tests__/strip-quoted.test.ts`

Purpose: given a plaintext email body, remove the quoted reply portion (`On <date> <X> wrote:`, `-- ` sig delimiter, `> `-prefixed lines) so unsub-keyword matching only scans the user's new text.

- [ ] **Step 1: Write failing tests first**

Create `src/circles/__tests__/strip-quoted.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stripQuoted } from '../strip-quoted';

describe('stripQuoted', () => {
  it('returns the input unchanged when there is no quoted section', () => {
    const body = 'Just a short note.\n\nThanks,\nAlice';
    expect(stripQuoted(body)).toBe(body);
  });

  it('strips everything from "On <date> <X> wrote:" onward', () => {
    const body = [
      'unsubscribe please',
      '',
      'On Mon, Apr 19, 2026 at 6:12 PM Frank <circles@plgr.im> wrote:',
      '> Tomorrow, Saturday, May 3 at 8:00 AM.',
      '> Whole Foods.',
    ].join('\n');
    expect(stripQuoted(body).trim()).toBe('unsubscribe please');
  });

  it('strips everything from the "-- " signature delimiter onward', () => {
    const body = [
      'take me off',
      '',
      '-- ',
      'Sent from my iPhone',
    ].join('\n');
    expect(stripQuoted(body).trim()).toBe('take me off');
  });

  it('strips from the first "> "-prefixed line onward', () => {
    const body = [
      'stop',
      '> previous content',
      '> more previous',
    ].join('\n');
    expect(stripQuoted(body).trim()).toBe('stop');
  });

  it('picks whichever marker comes first', () => {
    const body = [
      'hi',
      'On Tue Apr 20, 2026 at 9:00 AM Person <x@y.com> wrote:',
      '-- ',
      '> old',
    ].join('\n');
    expect(stripQuoted(body).trim()).toBe('hi');
  });

  it('handles empty input', () => {
    expect(stripQuoted('')).toBe('');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

Expected: fails with `Cannot find module '../strip-quoted'`.

- [ ] **Step 3: Implement `strip-quoted.ts`**

Create `src/circles/strip-quoted.ts`:

```ts
const ON_WROTE = /^On .*\bwrote:\s*$/;
const SIG_DELIM = /^-- \s*$/;
const QUOTED_LINE = /^>/;

export function stripQuoted(body: string): string {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (ON_WROTE.test(line) || SIG_DELIM.test(line) || QUOTED_LINE.test(line)) {
      return lines.slice(0, i).join('\n');
    }
  }
  return body;
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

Expected: all six `stripQuoted` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/circles/strip-quoted.ts src/circles/__tests__/strip-quoted.test.ts
git commit -m "feat(plgrim): strip quoted reply text before unsub-keyword scan"
```

---

## Task 4: Worker module — `classify.ts` (TDD)

**Files:**
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/classify.ts`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/__tests__/classify.test.ts`

Purpose: pure dispatch function. Given sender/subject/body/isSubscribed, return one of `subscribe | unsubscribe | forward | ignore`.

- [ ] **Step 1: Write failing tests**

Create `src/circles/__tests__/classify.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { classify } from '../classify';

describe('classify', () => {
  it('classifies unknown sender as subscribe', () => {
    const r = classify({ from: 'a@b.com', subject: 'hi', body: 'hi', isSubscribed: false });
    expect(r.kind).toBe('subscribe');
  });

  it('classifies known sender with "unsubscribe" keyword as unsubscribe', () => {
    const r = classify({ from: 'a@b.com', subject: '', body: 'please unsubscribe me', isSubscribed: true });
    expect(r.kind).toBe('unsubscribe');
  });

  it('matches "stop" as unsub keyword', () => {
    const r = classify({ from: 'a@b.com', subject: 'stop', body: '', isSubscribed: true });
    expect(r.kind).toBe('unsubscribe');
  });

  it('matches "remove me" as unsub keyword', () => {
    const r = classify({ from: 'a@b.com', subject: '', body: 'remove me from this', isSubscribed: true });
    expect(r.kind).toBe('unsubscribe');
  });

  it('matches "take me off" as unsub keyword', () => {
    const r = classify({ from: 'a@b.com', subject: '', body: 'take me off please', isSubscribed: true });
    expect(r.kind).toBe('unsubscribe');
  });

  it('is case-insensitive', () => {
    const r = classify({ from: 'a@b.com', subject: 'STOP', body: '', isSubscribed: true });
    expect(r.kind).toBe('unsubscribe');
  });

  it('classifies known sender without unsub keyword as forward', () => {
    const r = classify({ from: 'a@b.com', subject: 'rain?', body: 'is tomorrow still on if it rains?', isSubscribed: true });
    expect(r.kind).toBe('forward');
  });

  it('classifies unknown sender with unsub keyword as ignore', () => {
    const r = classify({ from: 'a@b.com', subject: '', body: 'unsubscribe', isSubscribed: false });
    expect(r.kind).toBe('ignore');
  });

  it('does not match "stop" inside other words', () => {
    const r = classify({ from: 'a@b.com', subject: 'stopwatch', body: 'stopover', isSubscribed: true });
    expect(r.kind).toBe('forward');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

Expected: fails with `Cannot find module '../classify'`.

- [ ] **Step 3: Implement `classify.ts`**

Create `src/circles/classify.ts`:

```ts
export type Action =
  | { kind: 'subscribe' }
  | { kind: 'unsubscribe' }
  | { kind: 'forward' }
  | { kind: 'ignore' };

export interface ClassifyInput {
  from: string;
  subject: string;
  body: string;
  isSubscribed: boolean;
}

const UNSUB_REGEX = /\b(unsub(scribe)?|stop|remove me|take me off)\b/i;

export function classify(input: ClassifyInput): Action {
  const hasUnsubKeyword = UNSUB_REGEX.test(input.subject) || UNSUB_REGEX.test(input.body);

  if (input.isSubscribed) {
    return hasUnsubKeyword ? { kind: 'unsubscribe' } : { kind: 'forward' };
  }
  return hasUnsubKeyword ? { kind: 'ignore' } : { kind: 'subscribe' };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

Expected: all nine `classify` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/circles/classify.ts src/circles/__tests__/classify.test.ts
git commit -m "feat(plgrim): classify inbound circles email into action"
```

---

## Task 5: Worker module — `listmonk.ts` API client (TDD)

**Files:**
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/listmonk.ts`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/__tests__/listmonk.test.ts`

Purpose: thin fetch-based client exposing `isSubscribed`, `subscribe`, `unsubscribe`. Uses basic auth.

- [ ] **Step 1: Write failing tests**

Create `src/circles/__tests__/listmonk.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createListmonkClient } from '../listmonk';

const fakeEnv = {
  LISTMONK_URL: 'https://lm.example.com',
  LISTMONK_API_KEY: 'user:pass',
  LISTMONK_CIRCLES_LIST_ID: '7',
};

describe('listmonk client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('isSubscribed returns true when Listmonk returns a matching subscriber', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { results: [{ id: 1, email: 'a@b.com' }], total: 1 } }),
      { status: 200 },
    )));
    const client = createListmonkClient(fakeEnv);
    expect(await client.isSubscribed('a@b.com')).toBe(true);
  });

  it('isSubscribed returns false when Listmonk returns empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { results: [], total: 0 } }),
      { status: 200 },
    )));
    const client = createListmonkClient(fakeEnv);
    expect(await client.isSubscribed('a@b.com')).toBe(false);
  });

  it('subscribe POSTs to /api/subscribers with status=enabled and preconfirm', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"data":{"id":42}}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createListmonkClient(fakeEnv);
    await client.subscribe('a@b.com', { city: 'austin' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://lm.example.com/api/subscribers');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      email: 'a@b.com',
      status: 'enabled',
      lists: [7],
      attribs: { city: 'austin' },
      preconfirm_subscriptions: true,
    });
  });

  it('subscribe treats 409 (already-subscribed) as a no-op success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"message":"already exists"}', { status: 409 })));
    const client = createListmonkClient(fakeEnv);
    await expect(client.subscribe('a@b.com', { city: 'austin' })).resolves.not.toThrow();
  });

  it('subscribe throws on 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })));
    const client = createListmonkClient(fakeEnv);
    await expect(client.subscribe('a@b.com', { city: 'austin' })).rejects.toThrow(/500/);
  });

  it('unsubscribe PUTs to /api/subscribers/lists with action=unsubscribe', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ data: { results: [{ id: 99, email: 'a@b.com' }], total: 1 } }),
      { status: 200 },
    ));
    fetchMock.mockResolvedValueOnce(new Response('{"data":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createListmonkClient(fakeEnv);
    await client.unsubscribe('a@b.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://lm.example.com/api/subscribers/lists');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      ids: [99],
      action: 'unsubscribe',
      target_list_ids: [7],
    });
  });

  it('unsubscribe is a no-op when subscriber not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { results: [], total: 0 } }),
      { status: 200 },
    )));
    const client = createListmonkClient(fakeEnv);
    await expect(client.unsubscribe('a@b.com')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

Expected: fails with `Cannot find module '../listmonk'`.

- [ ] **Step 3: Implement `listmonk.ts`**

Create `src/circles/listmonk.ts`:

```ts
export interface ListmonkEnv {
  LISTMONK_URL: string;
  LISTMONK_API_KEY: string;
  LISTMONK_CIRCLES_LIST_ID: string;
}

interface Subscriber {
  id: number;
  email: string;
}

interface QueryResponse {
  data: { results: Subscriber[]; total: number };
}

export function createListmonkClient(env: ListmonkEnv) {
  const listId = Number(env.LISTMONK_CIRCLES_LIST_ID);
  const auth = 'Basic ' + btoa(env.LISTMONK_API_KEY);

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(env.LISTMONK_URL + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async function findByEmail(email: string): Promise<Subscriber | null> {
    const q = encodeURIComponent(`subscribers.email = '${email.replace(/'/g, "''")}'`);
    const res = await request('GET', `/api/subscribers?query=${q}&per_page=1`);
    if (!res.ok) {
      throw new Error(`listmonk GET /api/subscribers: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as QueryResponse;
    return body.data.results[0] ?? null;
  }

  return {
    async isSubscribed(email: string): Promise<boolean> {
      const sub = await findByEmail(email);
      return sub !== null;
    },

    async subscribe(email: string, attribs: Record<string, unknown>): Promise<void> {
      const res = await request('POST', '/api/subscribers', {
        email,
        status: 'enabled',
        lists: [listId],
        attribs,
        preconfirm_subscriptions: true,
      });
      if (res.status === 409) return; // already exists — treat as no-op
      if (!res.ok) {
        throw new Error(`listmonk POST /api/subscribers: ${res.status} ${await res.text()}`);
      }
    },

    async unsubscribe(email: string): Promise<void> {
      const sub = await findByEmail(email);
      if (!sub) return;
      const res = await request('PUT', '/api/subscribers/lists', {
        ids: [sub.id],
        action: 'unsubscribe',
        target_list_ids: [listId],
      });
      if (!res.ok) {
        throw new Error(`listmonk PUT /api/subscribers/lists: ${res.status} ${await res.text()}`);
      }
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

Expected: all seven `listmonk client` tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/circles/listmonk.ts src/circles/__tests__/listmonk.test.ts
git commit -m "feat(plgrim): Listmonk API client for circles list"
```

---

## Task 6: Worker module — `reply.ts` + `forward.ts`

**Files:**
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/reply.ts`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/forward.ts`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/circles/copy.ts` — welcome + unsub-ack copy as string constants

These modules use Workers runtime APIs (`message.reply()`, `SEND_EMAIL.send()`) and `mimetext` for building RFC822 messages. We install `mimetext` alongside `postal-mime` since CF's docs recommend it for constructing outgoing emails in Workers.

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/rubberduck/GitHub/momentmaker/plgrim
npm install postal-mime mimetext
```

Expected: both appear under `"dependencies"` in `package.json`.

- [ ] **Step 2: Create `src/circles/copy.ts`**

```ts
export const WELCOME_SUBJECT = "You're on the list.";
export const WELCOME_BODY = [
  'Thanks for writing.',
  '',
  "I'll write the day before each walk — where to meet, what the weather",
  "looks like, one note. That's it.",
  '',
  'Reply "stop" any time, or use the unsubscribe link at the bottom of',
  'any email.',
  '',
  '— Frank',
  '',
].join('\n');

export const UNSUB_SUBJECT = 'Off the list.';
export const UNSUB_BODY = [
  'Done. Walk well.',
  '',
  '— Frank',
  '',
].join('\n');
```

- [ ] **Step 3: Create `src/circles/reply.ts`**

```ts
import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';
import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import { WELCOME_SUBJECT, WELCOME_BODY, UNSUB_SUBJECT, UNSUB_BODY } from './copy';

const FROM_ADDRESS = 'circles@plgr.im';
const FROM_NAME = 'Pilgrim Circles';

function buildReply(
  incoming: ForwardableEmailMessage,
  subject: string,
  body: string,
): EmailMessage {
  const msg = createMimeMessage();
  msg.setSender({ name: FROM_NAME, addr: FROM_ADDRESS });
  msg.setRecipient(incoming.from);
  msg.setSubject(subject);
  msg.addMessage({ contentType: 'text/plain', data: body });

  const inReplyTo = incoming.headers.get('Message-ID');
  if (inReplyTo) {
    msg.setHeader('In-Reply-To', inReplyTo);
    msg.setHeader('References', inReplyTo);
  }

  return new EmailMessage(FROM_ADDRESS, incoming.from, msg.asRaw());
}

export async function replyWelcome(incoming: ForwardableEmailMessage): Promise<void> {
  await incoming.reply(buildReply(incoming, WELCOME_SUBJECT, WELCOME_BODY));
}

export async function replyUnsubAck(incoming: ForwardableEmailMessage): Promise<void> {
  await incoming.reply(buildReply(incoming, UNSUB_SUBJECT, UNSUB_BODY));
}
```

- [ ] **Step 4: Create `src/circles/forward.ts`**

```ts
import { createMimeMessage } from 'mimetext';
import { EmailMessage } from 'cloudflare:email';
import type { ForwardableEmailMessage } from '@cloudflare/workers-types';

export interface ForwardEnv {
  SEND_EMAIL: { send(message: EmailMessage): Promise<void> };
  FRANK_FORWARD_ADDRESS: string;
}

export async function forwardToFrank(
  incoming: ForwardableEmailMessage,
  rawBody: string,
  parsedSubject: string,
  env: ForwardEnv,
): Promise<void> {
  const msg = createMimeMessage();
  msg.setSender({ name: 'Pilgrim Circles', addr: 'circles@plgr.im' });
  msg.setRecipient(env.FRANK_FORWARD_ADDRESS);
  msg.setSubject(`[circles] ${parsedSubject || '(no subject)'}`);
  msg.setHeader('Reply-To', incoming.from);
  msg.setHeader('X-Original-From', incoming.from);
  msg.addMessage({ contentType: 'text/plain', data: rawBody });

  const out = new EmailMessage('circles@plgr.im', env.FRANK_FORWARD_ADDRESS, msg.asRaw());
  await env.SEND_EMAIL.send(out);
}
```

(We don't forward the raw MIME — we re-wrap the body as plaintext and keep the original sender's address in `Reply-To` so Frank can hit reply directly. This is simpler than preserving full MIME and avoids edge cases with HTML-only emails.)

- [ ] **Step 5: Run tests to make sure nothing else broke**

```bash
npm test
```

Expected: all prior tests still pass. No new tests added in this task — `reply.ts` and `forward.ts` are thin wrappers whose real behavior is exercised in end-to-end verification (Task 10); unit-testing `message.reply()` and `SEND_EMAIL.send()` stubs adds mock-maintenance without catching real bugs.

- [ ] **Step 6: Commit**

```bash
git add src/circles/copy.ts src/circles/reply.ts src/circles/forward.ts package.json package-lock.json
git commit -m "feat(plgrim): welcome/unsub-ack replies + forward-to-Frank"
```

---

## Task 7: Worker email handler — `email.ts` + `types.ts` update + `index.ts` wiring

**Files:**
- Modify: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/types.ts` — extend `Env`
- Create: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/email.ts`
- Modify: `/Users/rubberduck/GitHub/momentmaker/plgrim/src/index.ts` — add `email` export

- [ ] **Step 1: Extend `Env` interface in `types.ts`**

Replace the contents of `src/types.ts` with:

```ts
import type { EmailMessage } from 'cloudflare:email';

export interface Env {
  DB: D1Database;
  UMAMI_HOST: string;
  UMAMI_WEBSITE_ID: string;

  // Circles mailing list
  LISTMONK_URL: string;
  LISTMONK_API_KEY: string;
  LISTMONK_CIRCLES_LIST_ID: string;
  FRANK_FORWARD_ADDRESS: string;
  SEND_EMAIL: { send(message: EmailMessage): Promise<void> };
}
```

- [ ] **Step 2: Create `src/email.ts`**

```ts
import PostalMime from 'postal-mime';
import type { ForwardableEmailMessage } from '@cloudflare/workers-types';
import type { Env } from './types';
import { classify } from './circles/classify';
import { stripQuoted } from './circles/strip-quoted';
import { createListmonkClient } from './circles/listmonk';
import { replyWelcome, replyUnsubAck } from './circles/reply';
import { forwardToFrank } from './circles/forward';

const CIRCLES_ADDRESS = 'circles@plgr.im';

export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  if (message.to.toLowerCase() !== CIRCLES_ADDRESS) {
    message.setReject('Unknown recipient');
    return;
  }

  const parsed = await PostalMime.parse(await readFully(message.raw));
  const from = parsed.from?.address?.toLowerCase() ?? '';
  const subject = parsed.subject ?? '';
  const rawBody = parsed.text ?? '';
  const cleanBody = stripQuoted(rawBody);

  if (!from) {
    message.setReject('Missing sender');
    return;
  }

  const listmonk = createListmonkClient(env);

  let isSubscribed: boolean;
  try {
    isSubscribed = await listmonk.isSubscribed(from);
  } catch (err) {
    console.error('listmonk isSubscribed failed', err);
    // Fail silently — don't bounce, don't pretend we subscribed them.
    return;
  }

  const action = classify({ from, subject, body: cleanBody, isSubscribed });

  try {
    switch (action.kind) {
      case 'subscribe':
        await listmonk.subscribe(from, { city: 'austin' });
        await replyWelcome(message);
        return;
      case 'unsubscribe':
        await listmonk.unsubscribe(from);
        await replyUnsubAck(message);
        return;
      case 'forward':
        await forwardToFrank(message, rawBody, subject, env);
        return;
      case 'ignore':
        return;
    }
  } catch (err) {
    console.error(`circles action ${action.kind} failed`, err);
    // Intentionally do not setReject — user shouldn't get a bounce for our issue.
  }
}

async function readFully(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
```

- [ ] **Step 3: Wire `email` export in `index.ts`**

Open `src/index.ts`. Replace the top of the file (imports + `export default`) to add the email handler. The final file structure:

```ts
import type { Env } from "./types";
import { trackRedirect } from "./analytics";
import { handleEmail } from "./email";
import type { ForwardableEmailMessage } from '@cloudflare/workers-types';

const WALK_BASE = "https://walktalkmeditate.com";
const PODCAST_BASE = "https://podcast.pilgrimapp.org";
const DEFAULT_REDIRECT = "https://pilgrimapp.org";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // ... existing fetch handler body, unchanged ...
  },

  async email(
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    return handleEmail(message, env);
  },
} satisfies ExportedHandler<Env>;

// ... existing helpers (resolveSlug, resolveEpisodeWalk, interfaces) unchanged ...
```

Concretely: do NOT replace the file wholesale. Instead:

1. Add the two imports (`handleEmail`, `ForwardableEmailMessage`) near the top.
2. In the object literal under `export default`, after the `fetch` method, add the `email` method shown above.

Keep everything else intact.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: all existing tests still pass. `email.ts` has no unit tests in this task — it's integration-wiring that the end-to-end verification in Task 10 covers.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are any, address them (the most likely issue is `ForwardableEmailMessage` not being found — ensure `@cloudflare/workers-types` is recent enough; upgrade if needed with `npm install --save-dev @cloudflare/workers-types@latest`).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/email.ts src/index.ts
git commit -m "feat(plgrim): email() handler dispatching circles classify/reply/forward"
```

---

## Task 8: `wrangler.toml` config + secrets

**Files:**
- Modify: `/Users/rubberduck/GitHub/momentmaker/plgrim/wrangler.toml`

- [ ] **Step 1: Add send_email binding and env vars**

Open `wrangler.toml`. Append to the file:

```toml
[[send_email]]
name = "SEND_EMAIL"
destination_address = "fr@nkzhu.com"
```

And in the `[vars]` block (create if missing; currently the file has no `[vars]` block, so add one):

```toml
[vars]
LISTMONK_CIRCLES_LIST_ID = "7"
FRANK_FORWARD_ADDRESS = "fr@nkzhu.com"
```

Replace `"7"` with the actual list ID from Task 1.

- [ ] **Step 2: Verify Frank's address in CF Email Routing**

Go to the Cloudflare dashboard → `plgr.im` zone → Email → Email Routing → Destination addresses. Add `fr@nkzhu.com` if it isn't there. CF sends a verification email; open it and click the verification link.

- [ ] **Step 3: Set Listmonk secrets via wrangler**

```bash
cd /Users/rubberduck/GitHub/momentmaker/plgrim
echo "https://listmonk.your-host.tld" | npx wrangler secret put LISTMONK_URL
echo "apiuser:apipass" | npx wrangler secret put LISTMONK_API_KEY
```

Replace the URL and `apiuser:apipass` with real values. The secret is in the form `<user>:<password>` because the client uses basic auth.

Expected: both commands print "✨ Success! Uploaded secret".

- [ ] **Step 4: Verify config**

```bash
npx wrangler deploy --dry-run
```

Expected: no errors; the dry-run prints the bindings it would create, including `SEND_EMAIL`.

- [ ] **Step 5: Commit**

```bash
git add wrangler.toml
git commit -m "chore(plgrim): wrangler config for circles mailing list"
```

Note: secrets are not in the commit (wrangler stores them server-side). Only the `[vars]` block and `[[send_email]]` block are in git.

---

## Task 9: Deploy plgrim + configure CF Email Routing

**Files:** none in-repo; configuration happens in CF dashboard.

- [ ] **Step 1: Deploy the Worker**

```bash
cd /Users/rubberduck/GitHub/momentmaker/plgrim
npm run deploy
```

Expected: wrangler deploys successfully. Note the worker URL.

- [ ] **Step 2: Add Email Routing rule**

Cloudflare dashboard → `plgr.im` zone → Email → Email Routing → Routing rules:
- Click "Create address"
- **Custom address:** `circles`
- **Action:** "Send to a Worker"
- **Destination:** `plgrim` (select from dropdown)
- Save.

- [ ] **Step 3: Verify the route**

Still in the dashboard, the rule should show active with a green dot. Existing rules on `plgr.im` (if any) should be unaffected.

- [ ] **Step 4: Confirm catch-all behavior is unchanged**

If a catch-all rule exists, it now only catches addresses other than `circles@plgr.im`. Verify by reading the rule list from top to bottom — CF evaluates rules in listed order and the more specific `circles` rule should be above any catch-all.

- [ ] **Step 5: No commit — this is dashboard config**

(Document the routing rule in a README or deploy note if your team tracks infra changes; otherwise just note it in commit history as part of Task 10's E2E test commit.)

---

## Task 10: Manual E2E test of the Worker

**Files:** none — operational verification.

- [ ] **Step 1: Subscribe test**

From a personal gmail account (NOT Frank's), send an email to `circles@plgr.im`:
- **Subject:** `add me`
- **Body:** `(anything)`

Wait ~30 seconds. Check inbox for a reply from `circles@plgr.im` with subject `You're on the list.` and the drafted welcome body. Confirm it threads under your original email (shows as a reply, not a new thread).

- [ ] **Step 2: Verify in Listmonk admin**

Log into Listmonk → Subscribers. Find the test email address. Confirm:
- `status: enabled`
- Subscribed to `Pilgrim Circles` list
- `attribs` contains `{ "city": "austin" }`

- [ ] **Step 3: Forward test**

From the SAME test gmail account, send another email to `circles@plgr.im`:
- **Subject:** `is it raining tomorrow?`
- **Body:** `just wondering`

Wait ~30 seconds. Check Frank's inbox (`FRANK_FORWARD_ADDRESS`): should see a message with subject `[circles] is it raining tomorrow?`, `Reply-To` set to the test gmail, body = the original body.

- [ ] **Step 4: Unsubscribe test**

From the test gmail account, send:
- **Subject:** `stop`
- **Body:** `(empty)`

Wait ~30 seconds. Expect a reply with subject `Off the list.` body `Done. Walk well. — Frank`.

- [ ] **Step 5: Verify unsubscribe in Listmonk admin**

Subscriber should still exist but with list subscription status `unsubscribed` on the Pilgrim Circles list.

- [ ] **Step 6: Ignored test**

From a NEW gmail account not on the list, send to `circles@plgr.im`:
- **Subject:** `unsubscribe`
- **Body:** `please take me off`

Wait ~30 seconds. Expect NO reply. Listmonk admin shows NO new subscriber for this email. (This verifies the `ignore` classification.)

- [ ] **Step 7: Check Workers logs for errors**

```bash
npx wrangler tail
```

While tailing, re-send one of the above scenarios. Confirm no unexpected errors logged. Stop with Ctrl-C.

- [ ] **Step 8: If all pass, commit a deploy note**

No code changes expected in this task. If any issues surfaced and required a fix, commit that fix now with a message like `fix(plgrim-circles): <what you fixed>`.

---

## Task 11: `listmonk/` — walk YAML loader + template renderer (TDD)

**Files:**
- Create: `/Users/rubberduck/GitHub/momentmaker/listmonk/scripts/lib/circles.ts` — types, YAML loader, validator, template renderer, date formatter
- Create: `/Users/rubberduck/GitHub/momentmaker/listmonk/scripts/__tests__/circles.test.ts`
- Modify: `/Users/rubberduck/GitHub/momentmaker/listmonk/package.json` — add vitest and yaml dep

- [ ] **Step 1: Install deps**

```bash
cd /Users/rubberduck/GitHub/momentmaker/listmonk
npm install js-yaml
npm install --save-dev vitest @types/js-yaml
```

- [ ] **Step 2: Add test script to `package.json`**

In `"scripts"`, add `"test": "vitest run"`. Keep existing scripts.

- [ ] **Step 3: Write failing tests**

Create `scripts/__tests__/circles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseWalk, renderTemplate, formatDatePretty } from '../lib/circles';

describe('parseWalk', () => {
  it('parses a valid walk YAML', () => {
    const yaml = `
date: 2026-05-03
time: "8:00 AM"
city: austin
meeting_place: "Whole Foods, downtown Austin"
map_url: "https://maps.example/xyz"
loop: "Lady Bird Lake, ~3 miles"
frank_note: "Bluebonnets are up."
`;
    const w = parseWalk(yaml);
    expect(w.date).toBe('2026-05-03');
    expect(w.city).toBe('austin');
    expect(w.frank_note).toBe('Bluebonnets are up.');
  });

  it('accepts missing frank_note (optional)', () => {
    const yaml = `
date: 2026-05-03
time: "8:00 AM"
city: austin
meeting_place: "X"
map_url: "https://x"
loop: "L"
`;
    const w = parseWalk(yaml);
    expect(w.frank_note).toBeUndefined();
  });

  it('throws on missing required field', () => {
    const yaml = `date: 2026-05-03\ntime: "8:00 AM"\ncity: austin`;
    expect(() => parseWalk(yaml)).toThrow(/meeting_place/);
  });

  it('throws on unparseable date', () => {
    const yaml = `date: nope\ntime: X\ncity: austin\nmeeting_place: X\nmap_url: "https://x"\nloop: L`;
    expect(() => parseWalk(yaml)).toThrow(/date/);
  });

  it('throws on non-https map_url', () => {
    const yaml = `date: 2026-05-03\ntime: X\ncity: austin\nmeeting_place: X\nmap_url: "http://x"\nloop: L`;
    expect(() => parseWalk(yaml)).toThrow(/map_url/);
  });
});

describe('formatDatePretty', () => {
  it('formats as weekday, month day', () => {
    expect(formatDatePretty('2026-05-03')).toBe('Saturday, May 3');
  });
});

describe('renderTemplate', () => {
  const baseTemplate = [
    'Subject: Tomorrow\'s walk.',
    '',
    'Tomorrow, {{date_pretty}} at {{time}}.',
    '',
    '{{meeting_place}}',
    '',
    '{{map_url}}',
    '',
    'We\'ll walk {{loop}}.',
    '',
    '{{ if frank_note }}{{ frank_note }}',
    '',
    '{{ end }}— Frank',
  ].join('\n');

  it('substitutes required fields', () => {
    const out = renderTemplate(baseTemplate, {
      date: '2026-05-03',
      time: '8:00 AM',
      city: 'austin',
      meeting_place: 'Whole Foods',
      map_url: 'https://m',
      loop: 'the lake',
    });
    expect(out).toContain('Tomorrow, Saturday, May 3 at 8:00 AM.');
    expect(out).toContain('Whole Foods');
    expect(out).toContain("We'll walk the lake.");
    expect(out).not.toContain('{{');
  });

  it('includes frank_note when present', () => {
    const out = renderTemplate(baseTemplate, {
      date: '2026-05-03',
      time: '8:00 AM',
      city: 'austin',
      meeting_place: 'X',
      map_url: 'https://m',
      loop: 'L',
      frank_note: 'Bluebonnets are up.',
    });
    expect(out).toContain('Bluebonnets are up.');
  });

  it('omits frank_note block when absent', () => {
    const out = renderTemplate(baseTemplate, {
      date: '2026-05-03',
      time: '8:00 AM',
      city: 'austin',
      meeting_place: 'X',
      map_url: 'https://m',
      loop: 'L',
    });
    expect(out).not.toContain('{{');
    // No double blank line where the note would have gone
    expect(out).not.toMatch(/\n\n\n— Frank/);
  });
});
```

- [ ] **Step 4: Run — expect FAIL**

```bash
npm test
```

Expected: fails with `Cannot find module '../lib/circles'`.

- [ ] **Step 5: Implement `scripts/lib/circles.ts`**

```ts
import yaml from 'js-yaml';

export interface Walk {
  date: string;          // YYYY-MM-DD
  time: string;
  city: string;
  meeting_place: string;
  map_url: string;
  loop: string;
  frank_note?: string;
}

export function parseWalk(source: string): Walk {
  const raw = yaml.load(source);
  if (!raw || typeof raw !== 'object') {
    throw new Error('walk YAML did not parse to an object');
  }
  const r = raw as Record<string, unknown>;

  const required = ['date', 'time', 'city', 'meeting_place', 'map_url', 'loop'];
  for (const field of required) {
    if (typeof r[field] !== 'string' || !(r[field] as string).length) {
      throw new Error(`walk YAML missing or empty required field: ${field}`);
    }
  }

  const date = r.date as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new Error(`walk YAML date must be YYYY-MM-DD and parseable: got "${date}"`);
  }

  const mapUrl = r.map_url as string;
  if (!mapUrl.startsWith('https://')) {
    throw new Error(`walk YAML map_url must be https://: got "${mapUrl}"`);
  }

  const walk: Walk = {
    date,
    time: r.time as string,
    city: r.city as string,
    meeting_place: r.meeting_place as string,
    map_url: mapUrl,
    loop: r.loop as string,
  };

  if (typeof r.frank_note === 'string' && r.frank_note.length) {
    walk.frank_note = r.frank_note;
  }

  return walk;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatDatePretty(isoDate: string): string {
  // Parse as UTC-noon to avoid TZ issues around midnight.
  const d = new Date(`${isoDate}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function renderTemplate(template: string, walk: Walk): string {
  const data: Record<string, string> = {
    date: walk.date,
    date_pretty: formatDatePretty(walk.date),
    time: walk.time,
    city: walk.city,
    meeting_place: walk.meeting_place,
    map_url: walk.map_url,
    loop: walk.loop,
    frank_note: walk.frank_note ?? '',
  };

  // Handle {{ if frank_note }}...{{ end }} block.
  const ifBlock = /\{\{\s*if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\s*end\s*\}\}/g;
  let rendered = template.replace(ifBlock, (_, name, inner) => {
    return data[name] ? inner : '';
  });

  // Substitute {{ name }} placeholders.
  rendered = rendered.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => data[name] ?? '');

  return rendered;
}
```

- [ ] **Step 6: Run — expect PASS**

```bash
npm test
```

Expected: all `parseWalk`, `formatDatePretty`, and `renderTemplate` tests pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/circles.ts scripts/__tests__/circles.test.ts package.json package-lock.json
git commit -m "feat(listmonk): walk YAML loader + template renderer"
```

---

## Task 12: `listmonk/` — `circles-send.ts` CLI

**Files:**
- Modify: `/Users/rubberduck/GitHub/momentmaker/listmonk/scripts/lib/listmonk-api.ts` — extend `createCampaign` to accept a `query` filter (Listmonk supports scoping a campaign to a subscriber query)
- Create: `/Users/rubberduck/GitHub/momentmaker/listmonk/scripts/circles-send.ts`
- Create: `/Users/rubberduck/GitHub/momentmaker/listmonk/content/pilgrim-circles/day-before.template.md`
- Create: `/Users/rubberduck/GitHub/momentmaker/listmonk/content/pilgrim-circles/walks/` (empty directory — first walk file comes in Task 13)
- Modify: `/Users/rubberduck/GitHub/momentmaker/listmonk/package.json` — add `circles:send` script

- [ ] **Step 1: Extend `createCampaign` to accept an optional `query`**

Open `scripts/lib/listmonk-api.ts`. In the `createCampaign` method (around line 52), update the options type and forwarded body:

```ts
async createCampaign(opts: {
  name: string;
  subject: string;
  lists: number[];
  from_email: string;
  body: string;
  content_type: string;
  template_id: number;
  query?: string;  // NEW
  send_at?: string;  // NEW — ISO timestamp; omit to send on start
}): Promise<number> {
  const res = await request<ApiResponse<{ id: number }>>('POST', '/api/campaigns', {
    ...opts,
    type: 'regular',
  });
  return res.data.id;
},
```

Also add a `startCampaign` method after it, because Listmonk creates campaigns in `draft` status by default — we need an explicit start call:

```ts
async startCampaign(campaignId: number): Promise<void> {
  await request('PUT', `/api/campaigns/${campaignId}/status`, {
    status: 'running',
  });
},
```

- [ ] **Step 2: Create the day-before template file**

Create `content/pilgrim-circles/day-before.template.md`:

```markdown
Subject: Tomorrow's walk.

Tomorrow, {{date_pretty}} at {{time}}.

{{meeting_place}}

{{map_url}}

We'll walk {{loop}}.

{{ if frank_note }}{{ frank_note }}

{{ end }}— Frank
```

The Listmonk unsubscribe footer is appended by Listmonk automatically on campaign emails — we do not include `{{unsubscribe_url}}` in this file.

- [ ] **Step 3: Create the walks directory with a placeholder**

```bash
cd /Users/rubberduck/GitHub/momentmaker/listmonk
mkdir -p content/pilgrim-circles/walks
touch content/pilgrim-circles/walks/.gitkeep
```

- [ ] **Step 4: Create `scripts/circles-send.ts`**

```ts
#!/usr/bin/env tsx
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadEnv } from './lib/env.ts';
import { getClientFromEnv } from './lib/listmonk-api.ts';
import { parseWalk, renderTemplate, type Walk } from './lib/circles.ts';

loadEnv();

const WALKS_DIR = resolve('content/pilgrim-circles/walks');
const TEMPLATE_PATH = resolve('content/pilgrim-circles/day-before.template.md');
const LIST_ID = Number(process.env.LISTMONK_CIRCLES_LIST_ID);
const FROM = 'circles@plgr.im';

if (!LIST_ID) {
  console.error('LISTMONK_CIRCLES_LIST_ID is not set in .env');
  process.exit(1);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function findNextWalkFile(): { path: string; walk: Walk } | null {
  const files = readdirSync(WALKS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.ya?ml$/.test(f))
    .sort();
  const t = today();
  for (const f of files) {
    const walk = parseWalk(readFileSync(join(WALKS_DIR, f), 'utf-8'));
    if (walk.date >= t) return { path: join(WALKS_DIR, f), walk };
  }
  return null;
}

function sentinelPath(walkPath: string): string {
  return walkPath.replace(/\.ya?ml$/, '.sent');
}

async function prompt(rl: ReturnType<typeof createInterface>, q: string): Promise<boolean> {
  const answer = (await rl.question(q)).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

function splitSubjectBody(rendered: string): { subject: string; body: string } {
  const match = rendered.match(/^Subject:\s*(.+)\n\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Rendered template missing "Subject: ...\\n\\n<body>" preamble`);
  }
  return { subject: match[1].trim(), body: match[2] };
}

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const next = findNextWalkFile();
  if (!next) {
    console.error('No upcoming walk found in content/pilgrim-circles/walks/');
    process.exit(1);
  }

  const sentPath = sentinelPath(next.path);
  if (existsSync(sentPath)) {
    const info = readFileSync(sentPath, 'utf-8').trim();
    console.log(`Walk ${next.walk.date} was already sent:\n  ${info}`);
    const again = await prompt(rl, 'Re-send anyway? [y/N] ');
    if (!again) {
      rl.close();
      return;
    }
  }

  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  const rendered = renderTemplate(template, next.walk);
  const { subject, body } = splitSubjectBody(rendered);

  console.log('────────────────────────────────────────');
  console.log(`Subject: ${subject}`);
  console.log();
  console.log(body);
  console.log('────────────────────────────────────────');
  console.log(`List: ${LIST_ID}   Filter: city = '${next.walk.city}'`);

  const send = await prompt(rl, 'Send now? [y/N] ');
  rl.close();

  if (!send) {
    console.log('Not sent.');
    return;
  }

  const client = getClientFromEnv();
  const campaignId = await client.createCampaign({
    name: `Pilgrim Circles — ${next.walk.date}`,
    subject,
    lists: [LIST_ID],
    from_email: FROM,
    body,
    content_type: 'markdown',
    template_id: 0,
    query: `subscribers.attribs->>'city' = '${next.walk.city.replace(/'/g, "''")}'`,
  });
  await client.startCampaign(campaignId);

  const stamp = new Date().toISOString();
  writeFileSync(sentPath, `sent_at: ${stamp}\ncampaign_id: ${campaignId}\n`);
  console.log(`Sent. Campaign #${campaignId}. Sentinel: ${sentPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 5: Add npm script**

In `package.json`, extend `"scripts"`:

```json
"circles:send": "tsx scripts/circles-send.ts"
```

- [ ] **Step 6: Commit**

```bash
git add scripts/circles-send.ts scripts/lib/listmonk-api.ts content/pilgrim-circles/day-before.template.md content/pilgrim-circles/walks/.gitkeep package.json package-lock.json
git commit -m "feat(listmonk): circles-send CLI for day-before campaign"
```

---

## Task 13: First walk file + smoke test + final E2E

**Files:**
- Create: `/Users/rubberduck/GitHub/momentmaker/listmonk/content/pilgrim-circles/walks/2026-05-03.yaml`

- [ ] **Step 1: Create the 2026-05-03 walk file**

The current `pilgrim-landing/circles.html` shows the next walk as `Saturday, May 3, 2026 — 8:00 AM` at Whole Foods downtown Austin, with map link and Lady Bird Lake loop.

Create `content/pilgrim-circles/walks/2026-05-03.yaml`:

```yaml
date: 2026-05-03
time: "8:00 AM"
city: austin
meeting_place: "Whole Foods, second-floor outdoor patio, downtown Austin"
map_url: "https://maps.app.goo.gl/rMoJSE2wYfeReAUW6"
loop: "Lady Bird Lake, ~3 miles, about 1.5 hours"
frank_note: ""
```

Leave `frank_note` empty for now — Frank can fill it before running the send.

- [ ] **Step 2: Add `LISTMONK_CIRCLES_LIST_ID` to listmonk `.env`**

Open `listmonk/.env` (or create if missing). Add:

```
LISTMONK_CIRCLES_LIST_ID=7
```

(Replace `7` with the actual list ID from Task 1.)

- [ ] **Step 3: Smoke test — render preview only, don't send**

```bash
cd /Users/rubberduck/GitHub/momentmaker/listmonk
npm run circles:send
```

At the `Send now? [y/N]` prompt, type `N`.

Expected terminal output: the full rendered subject + body for May 3, followed by `Not sent.` No state changes. No `.sent` sentinel created.

- [ ] **Step 4: Dry-run with a test list**

Before sending to the real list, prove the Listmonk API integration works. In Listmonk admin, create a temporary list `pilgrim-circles-test`, subscribe ONLY Frank's email (with `attribs: { city: "austin" }`), note its ID.

Temporarily edit `listmonk/.env` to set `LISTMONK_CIRCLES_LIST_ID=<test-list-id>`.

Run:
```bash
npm run circles:send
```
Answer `y` at the prompt. Expected: campaign created in Listmonk, sent within ~1 minute to Frank's inbox. `.sent` sentinel appears next to the walk YAML.

Verify Frank received it and it looks right (subject is "Tomorrow's walk.", body matches, unsubscribe link in footer).

Delete the `.sent` sentinel file after the test:
```bash
rm content/pilgrim-circles/walks/2026-05-03.sent
```

Reset `.env` to the real list ID.

- [ ] **Step 5: Commit the walk file**

```bash
git add content/pilgrim-circles/walks/2026-05-03.yaml
git commit -m "feat(listmonk): first pilgrim-circles walk (2026-05-03)"
```

- [ ] **Step 6: Final end-to-end smoke**

Now that the Worker is deployed (Task 9) and the send script works (Step 4 above), do one last full cycle:

1. From a fresh gmail address, email `circles@plgr.im` (any subject/body). Confirm welcome reply.
2. Verify Listmonk admin shows the new subscriber on the real `Pilgrim Circles` list.
3. Frank runs `npm run circles:send` — confirm the Gmail test address receives the campaign email.
4. Reply to the campaign with `stop`. Confirm unsub-ack reply, and Listmonk shows the subscriber as unsubscribed.

If any step fails, file a task for the fix and address it before declaring done.

- [ ] **Step 7: No code commit unless a fix was needed**

If Step 6 required fixing something in plgrim or listmonk, commit with a message like `fix(circles): <what you fixed>` in the appropriate repo.

---

## Task 14: Update `pilgrim-landing/circles.html` + `css/circles.css` (LAST — after E2E passes)

**Gate:** Do not start this task until Task 13 Step 6 passed cleanly. The `/circles` page is the public-facing entry point to this whole pipeline. If it ships before the pipeline is verified, visitors will email `circles@plgr.im` and get nothing back.

**Files:**
- Modify: `/Users/rubberduck/GitHub/momentmaker/pilgrim-landing/circles.html` — insert new `<section class="mailing-list">` between `<section class="expect">` and `<p class="app-line">`
- Modify: `/Users/rubberduck/GitHub/momentmaker/pilgrim-landing/css/circles.css` — extend `section.next-walk, section.expect` rule and add `.mailing-list-unsub` rule

- [ ] **Step 1: Confirm E2E is clean**

Open the previous task's notes and verify Task 13 Step 6 passed without regressions. If there are any open fixes (uncommitted, or commits that didn't fully resolve an issue), stop and fix those first.

- [ ] **Step 2: Insert the mailing-list section in `circles.html`**

```bash
cd /Users/rubberduck/GitHub/momentmaker/pilgrim-landing
```

Find this line in `circles.html`:
```html
    <p class="app-line">
```

Immediately above it, add:
```html
    <section class="mailing-list">
      <h2>Before each walk</h2>
      <p>
        Email <a href="mailto:circles@plgr.im?subject=add%20me">circles@plgr.im</a>
        and I&rsquo;ll write the day before &mdash; where to meet, what the
        weather looks like, one note. Nothing else.
      </p>
      <p class="mailing-list-unsub">
        Reply &ldquo;stop&rdquo; any time.
      </p>
    </section>

```

(Blank line after `</section>` to separate from `<p class="app-line">`.)

- [ ] **Step 3: Update `css/circles.css` — margin-top rule**

Find this block (around lines 86–89):
```css
section.next-walk,
section.expect {
  margin-top: clamp(64px, 10vh, 120px);
}
```

Replace with:
```css
section.next-walk,
section.expect,
section.mailing-list {
  margin-top: clamp(64px, 10vh, 120px);
}
```

- [ ] **Step 4: Append the `.mailing-list-unsub` rule**

Find the end of the `.walk-ics a` block (around line 147). Below it, before the `/* What-to-expect list */` comment, add:

```css
/* Mailing-list — "stop" line, styled like other quiet-meta lines */

.mailing-list-unsub {
  margin: 1em 0 0;
  font-family: var(--sans);
  font-weight: 300;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--ink-fog);
}
```

- [ ] **Step 5: Verify visually**

Run a local static server:
```bash
python3 -m http.server 8765
```

Open http://localhost:8765/circles.html in a browser. Confirm:
- A new "Before each walk" section appears between "What to expect" and the bottom "Free in the App Store" line.
- Section spacing matches the other sections (big margin-top).
- The `circles@plgr.im` link is a mailto link (hover shows the URL).
- The "Reply 'stop' any time." text is small and muted, matching `.walk-ics` / `.app-line` style.

Stop the server with Ctrl-C when done.

- [ ] **Step 6: One more live round-trip test before commit**

Click the `mailto` link in the live preview, send a test subscribe email from a fresh gmail account (one that isn't already on the list). Confirm welcome reply arrives. Then unsubscribe with `stop` and confirm ack. This verifies the HTML link lands the user at the right address and the pipeline still works.

- [ ] **Step 7: Commit + deploy**

```bash
git add circles.html css/circles.css
git commit -m "feat(circles): add mailing-list section with mailto link"
git push
```

If `pilgrim-landing` has automatic deploy on push (Cloudflare Pages / similar), the change goes live within ~1 minute. Otherwise trigger the deploy manually per whatever process this repo uses.

- [ ] **Step 8: Final verification against production**

Load https://pilgrimapp.org/circles in a browser. Confirm the new section is live and the mailto link works.

Feature is now shipped.

---

## Self-review notes (check before starting execution)

- **Spec coverage:**
  - Spec §1 (plgrim Worker) → Tasks 2–9
  - Spec §2 (CF Email Routing) → Task 9 Step 2
  - Spec §3 (dispatch logic) → Task 4 (`classify`) + Task 3 (`stripQuoted`)
  - Spec §4 (Listmonk config) → Task 1 (list + attribute)
  - Spec §5 (`circles-send.ts`) → Task 12
  - Spec §6 (`circles.html` + CSS) → Task 14 (intentionally last — ship the page only after the pipeline is verified)
  - Campaign deliverability (SES domain auth for `plgr.im`) → Task 1b (prereq for Task 12/13 campaign send)
  - Scenarios A-E → verified in Task 10 and Task 13 Step 6
  - Error handling → covered in `email.ts` (Task 7 Step 2) and `circles-send.ts` (Task 12 Step 4)
- **Placeholder scan:** `fr@nkzhu.com` is the forwarding address wired in Task 8. Listmonk list ID is a placeholder until Task 1 runs. Both documented, both actionable.
- **Type consistency:** `ClassifyInput`, `Action`, `Walk` types defined once and reused. `createListmonkClient` signature consistent between definition (Task 5) and call site (Task 7).
