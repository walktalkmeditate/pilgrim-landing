# Circles Mailing List — Design

**Status:** approved, ready for implementation plan
**Date:** 2026-04-19

## Problem

`/circles` currently shows a single "next walk" block. Someone who finds the page and isn't ready to attend that specific walk has no way to keep the door open short of bookmarking the page and remembering to re-check. A lightweight mailing list — one email the day before each walk — gives them a quiet way to stay in the loop without building a full account/notification system.

## Goals

- Let someone subscribe by sending email to `circles@plgr.im`. No form, no account.
- Let them unsubscribe by replying "stop" (or using the list's built-in unsubscribe link).
- Send one email the day before each walk, with walk-specific details and a short note from Frank.
- Reuse the existing `listmonk/` repo's campaign-send pattern for the day-before email.
- Keep the `pilgrim-landing` site static HTML — no form endpoint, no JS additions.

## Non-goals

- Multi-city support on day one. Data model leaves room for it (`city` attribute), but UX is Austin-only.
- Morning-of / day-after / weekly-digest emails. Day-before only.
- Automated sending of the day-before email. Frank runs a command; the human voice is the point.
- Double opt-in. Sender initiating the email is itself the verification.
- Any HTML email formatting. Plaintext only.

## Architecture

```
┌────────────────────────────┐
│  /circles                  │
│  mailto:circles@plgr.im    │
└────────────┬───────────────┘
             │
             ▼
┌────────────────────────────┐
│  Cloudflare Email Routing  │
│  plgr.im zone              │
│  circles@ → plgrim Worker  │
└────────────┬───────────────┘
             │  email() event
             ▼
┌──────────────────────────────────────┐
│  plgrim Worker (existing)            │
│  new: src/email.ts + src/circles/*   │
│  - classify inbound                  │
│  - call Listmonk API                 │
│  - forward real messages to Frank    │
│    via send_email binding            │
└────┬───────────────────────┬─────────┘
     │                       │
     ▼                       ▼
┌──────────────┐      ┌─────────────────┐
│  Listmonk    │      │  Frank's Gmail  │
│  (public)    │      │                 │
└──────┬───────┘      └─────────────────┘
       │
       │ list: pilgrim-circles
       │ subscriber.attribs: { city: "austin" }
       │
       │ campaign (manual, from listmonk/ repo): day-before reminder
       ▼
 Subscriber inbox
       ▲
       │
┌──────────────────────────────────┐
│  listmonk/ repo                  │
│  scripts/circles-send.ts         │
│  content/pilgrim-circles/        │
│    walks/YYYY-MM-DD.yaml         │
│    day-before.template.md        │
└──────────────────────────────────┘
```

**Welcome email is sent by the Worker itself**, not by Listmonk. The Worker uses Cloudflare's `message.reply(EmailMessage)` API to reply to the sender of the subscribe email. Benefits:

- No Listmonk transactional template to configure.
- Immediate (no polled drip, no extra API call).
- Conceptually correct: the welcome *is* a reply to the user's subscribe email.
- The `plgr.im` domain is already verified in Email Routing (required for the `From` address); the sender's address does not need to be verified because `message.reply()` is scoped to the current event's sender.

Constraints of this approach (per CF docs):
- `message.reply()` can only be called **once per received message**. We use it for welcome (subscribe path) and for the unsub ack (unsubscribe path). Mutually exclusive per event — fine.
- `From` must be a verified domain (`plgr.im` — already set up).
- Threading via `In-Reply-To` and `References` headers makes the welcome appear as a reply in the user's mail client.

## Components

### 1. `plgrim/` Worker changes (the email handler)

**New files:**
- `plgrim/src/email.ts` — exports the `email()` handler.
- `plgrim/src/circles/listmonk.ts` — thin Listmonk API client (`isSubscribed`, `subscribe`, `unsubscribe`).
- `plgrim/src/circles/classify.ts` — pure function: `{from, subject, body, isSubscribed} → action`.
- `plgrim/src/circles/reply.ts` — builds + sends welcome and unsub-ack replies via `message.reply()`. Copy lives here as string constants (draft below; Frank can iterate).
- `plgrim/src/circles/forward.ts` — forwards a `ForwardableEmailMessage` to Frank via the Worker's `send_email` binding.
- `plgrim/src/circles/strip-quoted.ts` — strips quoted reply text (`On <date> <X> wrote:`, `-- ` sig delimiter) before keyword scanning.

Draft welcome copy (plain text):
```
Subject: You're on the list.

Thanks for writing.

I'll write the day before each walk — where to meet, what the weather
looks like, one note. That's it.

Reply "stop" any time, or use the unsubscribe link at the bottom of
any email.

— Frank
```

Draft unsub-ack copy:
```
Subject: Off the list.

Done. Walk well.

— Frank
```

**`plgrim/src/index.ts` change:** add `email` export that delegates to `email.ts`. No changes to existing `fetch()` handler.

**`plgrim/wrangler.toml` additions:**
- `[[send_email]]` binding named `SEND_EMAIL`, scoped to a single verified destination (Frank's inbox). Used only for the forward-to-Frank path. Exact binding shape (plain `EmailSendBinding` vs. `destination_address`-restricted vs. `allowed_destination_addresses` list) per Cloudflare's current wrangler schema — resolve in implementation plan.
- `[vars]`: `FRANK_FORWARD_ADDRESS`, `LISTMONK_CIRCLES_LIST_ID`.
- Secrets (via `wrangler secret put`): `LISTMONK_URL`, `LISTMONK_API_KEY`.

Frank's address must be added as a verified destination in the Email Routing dashboard once, before deploy.

**Dependency:** add `postal-mime` to `plgrim/package.json` for MIME parsing.

**Compatibility date:** current `2025-01-01` is fine; email Workers features are stable well before that.

### 2. Cloudflare Email Routing config

On the `plgr.im` zone:
- Create route: `circles@plgr.im` → "Send to a Worker" → `plgrim`.
- No catch-all change needed. Other addresses on `plgr.im` behave as before.

This is a dashboard (or `wrangler`) config step, not code. Documented in the implementation plan.

### 3. Worker dispatch logic

`classify(input) → action` returns one of:
- `{ kind: 'subscribe' }` — sender not on list.
- `{ kind: 'unsubscribe' }` — sender on list AND clean body matches unsub regex.
- `{ kind: 'forward' }` — sender on list AND no unsub match.
- `{ kind: 'ignore' }` — sender not on list AND body matches unsub regex (they were never subscribed; don't reply).

Action side-effects:

| action | Listmonk API call | CF Worker email action |
|---|---|---|
| `subscribe` | `subscribe(from, { city: "austin" })` | `message.reply(welcomeEmail)` |
| `unsubscribe` | `unsubscribe(from)` | `message.reply(unsubAckEmail)` |
| `forward` | — | `SEND_EMAIL.send(forwardedMessage)` to Frank |
| `ignore` | — | — |

`message.reply()` is used at most once per event, so `subscribe` and `unsubscribe` never coexist with `forward` in a single handler run — the switch enforces this.

Unsub regex (applied to cleaned body + subject, case-insensitive):
```
\b(unsub(scribe)?|stop|remove me|take me off)\b
```

Quoted-reply stripping runs before regex evaluation. Strip everything from the first match of:
- A line matching `^On .* wrote:$`
- A line equal to `-- ` (standard signature delimiter)
- A line starting with `>` (and all subsequent lines)

Whichever comes first. Good enough in practice; not perfect. Acceptable failure mode: an over-eager strip removes content the user wrote, and the Worker falls through to the default (treat as `forward`), which means Frank sees it. Failing open to a human is the right bias.

### 4. Listmonk configuration

**One list:** `pilgrim-circles`, double opt-in disabled (Worker sets list status so subscribe is confirmed without a Listmonk confirmation email — exact field name per Listmonk API reference, verify in implementation plan).

**Subscriber attributes:** `city` (string, defaults to `"austin"` at subscribe time).

**No drip sequence, no transactional template.** The welcome email is sent by the Worker via `message.reply()` (see Section 1). The unsubscribe ack is also sent by the Worker the same way. Listmonk is only used for the campaign send path.

**One campaign template** (`content/pilgrim-circles/day-before.template.md`, lives in the `listmonk/` repo) — plaintext with `{{date_pretty}}`, `{{time}}`, `{{meeting_place}}`, `{{map_url}}`, `{{loop}}`, `{{frank_note}}` placeholders, plus Listmonk's standard `{{unsubscribe_url}}` footer. Rendered by `circles-send.ts` at send time.

Draft day-before template:
```
Subject: Tomorrow's walk.

Tomorrow, {{date_pretty}} at {{time}}.

{{meeting_place}}

{{map_url}}

We'll walk {{loop}}.

{{ if frank_note }}{{ frank_note }}

{{ end }}— Frank

--
unsubscribe: {{unsubscribe_url}}
or reply "stop"
```

Frank can edit the template file freely; the placeholders are the only load-bearing parts.

Built-in Listmonk unsubscribe link stays in the footer of campaign emails (required for Gmail/Yahoo bulk-sender compliance). Copy is quiet plain-text, not a button.

### 5. `listmonk/scripts/circles-send.ts`

Node/tsx script matching the shape of existing `newsletter.ts` and `drip.ts`. Reuses `scripts/lib/listmonk-api.ts` and `scripts/lib/frontmatter.ts`.

**Flow:**
1. Scan `content/pilgrim-circles/walks/*.yaml`, pick the earliest file with `date >= today`.
2. If a sibling `<walk>.sent` sentinel exists, print its timestamp and prompt "re-send anyway? [y/N]". Default No.
3. Load template, render with walk fields + computed `date_pretty` (e.g. "Saturday, May 3").
4. Print full rendered email (subject + body) to terminal.
5. Prompt "Send now? [y/N]". Default No.
6. On `y`: create a Listmonk campaign via API, target `list: pilgrim-circles` filtered by `subscriber.attribs.city = <walk.city>`, `content_type: markdown`, `send_at: now`. Then write the `.sent` sentinel with timestamp + campaign ID.
7. On `N`: exit 0, no state change.

**Walk YAML schema:**
```yaml
date: YYYY-MM-DD           # required, must be parseable
time: string               # required, e.g., "8:00 AM"
city: string               # required, used for list filtering
meeting_place: string      # required
map_url: string            # required, https://
loop: string               # required, free-text description
frank_note: string         # optional, multi-line allowed
```

Validation failure → print specific missing/invalid field → exit non-zero.

### 6. `pilgrim-landing/circles.html` change

Add one `<section class="mailing-list">` block between the existing `<section class="expect">` and `<p class="app-line">`:

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

`css/circles.css` — follow the file's existing conventions:

- Add `section.mailing-list` to the margin-top rule alongside `section.next-walk, section.expect` so spacing matches other sections.
- Style `.mailing-list-unsub` like the other quiet-meta lines already in the file (`.walk-ics`, `.walk-map`, `.app-line`): Lato 300, 13px, `letter-spacing: 0.04em`, `color: var(--ink-fog)`, top margin `1em`. No `opacity` — use the `--ink-fog` token the rest of the file uses.

The `?subject=add me` is a courtesy hint; the Worker does not require it.

Heading choice note: `<h2>Before each walk</h2>` matches the existing `<h2>Next walk</h2>` / `<h2>What to expect</h2>` pattern (short noun phrases in italic Cormorant per the stylesheet). "Day-before reminder" was the earlier draft — dropped because "reminder" reads as tool-speak and breaks the pattern.

## Data flow — end-to-end scenarios

### Scenario A — someone new subscribes
1. User clicks `mailto:` on `/circles`, sends whatever they want to `circles@plgr.im`.
2. CF Email Routing delivers the message to plgrim Worker.
3. Worker parses, calls `listmonk.isSubscribed(from)` → false.
4. Worker calls `listmonk.subscribe(from, { city: 'austin' })` with double-opt-in disabled.
5. Worker calls `message.reply()` with the welcome email (From: `circles@plgr.im`, threaded via `In-Reply-To`).
6. User sees welcome as a reply to their subscribe email, within seconds. No action from Frank, no Listmonk template involved.

### Scenario B — existing subscriber replies "stop"
1. User replies to a day-before campaign email with "unsubscribe me please".
2. Email Routing → plgrim Worker.
3. Worker parses, strips quoted text, runs regex on cleaned body → match.
4. `listmonk.isSubscribed(from)` → true. Classification: `unsubscribe`.
5. Worker calls `listmonk.unsubscribe(from)`.
6. Worker calls `message.reply()` with a one-line ack ("Done. Walk well. — Frank").

### Scenario C — existing subscriber writes a real message
1. User replies "hey, is the 5/3 walk happening even if it rains?"
2. Worker classifies: `forward`.
3. Worker calls `forwardToFrank(message)`, which re-sends the original via `SEND_EMAIL` binding to `FRANK_FORWARD_ADDRESS`, prefixing subject with `[circles]`.
4. Frank replies by hand from his own account.

### Scenario D — Frank sends the day-before email
1. Friday 6pm CT, Frank runs `npm run circles:send` in `listmonk/`.
2. Script finds `walks/2026-05-03.yaml`, renders the template, shows preview.
3. Frank hits `y`.
4. Script creates a Listmonk campaign, filtered `attribs.city = 'austin'`, schedules for immediate send.
5. Script writes `walks/2026-05-03.sent` with timestamp + campaign ID.
6. Subscribers receive the email.

### Scenario E — Frank forgets to send
1. Friday passes. No email goes out.
2. Saturday morning: the walk happens (or doesn't, independent of the mailing list). Subscribers who already had the date show up; those who relied on a reminder don't.
3. This is acceptable. The mailing list is a courtesy channel, not load-bearing.

## Error handling

- **Worker can't reach Listmonk:** log the error. On subscribe path, *do not* send the welcome reply (user hasn't actually been subscribed — replying would be a lie). Message is dropped silently; sender sees no response. Acceptable because they can try again or contact Frank directly. Alternative considered: forward to Frank as fallback — rejected because it turns every subscribe into Frank-work during outages. On unsubscribe path, same logic: don't ack what didn't happen.
- **MIME parse error:** `classify()` can't run. Default action: `forward`. Frank sees the message, handles it.
- **Listmonk returns 4xx for subscribe:** usually means duplicate (already subscribed with a different case, etc.). Worker treats this as a no-op (not an error). Log it.
- **Walk YAML validation fails in send script:** script exits non-zero with a specific message. No campaign created. Frank fixes the file and re-runs.
- **`.sent` sentinel present + Frank hits `y` on "re-send anyway":** second campaign is created. Listmonk will send to everyone again. Not ideal but recoverable (and intentional — there are edge cases where you'd want this, e.g., initial send had a typo).

## Testing strategy

- **Worker (`plgrim/`):** unit tests for `classify()` (pure function, easy) and `stripQuotedReply()`. Integration test stubs the Listmonk client and asserts the right action fires per input. Use `vitest` if already in plgrim, otherwise match whatever plgrim uses.
- **Listmonk client (`circles/listmonk.ts`):** mock fetch, test the three methods.
- **`circles-send.ts`:** unit test the template renderer and YAML validator. Integration test against a local Listmonk dev instance if one exists; otherwise a mock HTTP server. Manual test in staging before first real send.
- **End-to-end:** manual. Send a test email from a gmail account, confirm welcome arrives. Reply "stop", confirm removed. Send a real-message reply, confirm it lands in Frank's inbox. Run `circles-send` dry-style (send to a list with just Frank on it) before the first real walk.

## Open questions

None at spec-approval time. Implementation-plan phase will need to resolve:
- Exact Listmonk API endpoint paths and payload shapes (reference: Listmonk API docs).
- Whether plgrim currently has a test framework; if not, which one to add.
- Frank's exact forward address (secret to set, not a design question).

## YAGNI explicitly rejected for v1

- Multi-city subscribe intent parsing (e.g., `subscribe nyc`).
- Welcome email including the next walk date (stateless Worker, no cross-repo data coupling).
- Listmonk transactional template for welcome or unsub-ack (Worker's `message.reply()` covers both).
- Listmonk drip sequence (polled script adds latency to welcome; not needed for a single email).
- Webhook from Listmonk back to Worker for deeper event handling.
- Storing any subscribe/unsub state in plgrim's D1 — Listmonk is the source of truth.
- Segmentation beyond the `city` attribute.
- HTML emails.
- Automated day-before sending (cron).
