# The field, alive — plan

**Branch:** `feat/field-alive` (off `main` after #28)
**Origin:** follow-ups to `docs/superpowers/specs/2026-10-25-hero-field-design.md`, chosen by the user:
cursor-as-wind, the season's own field, a lantern for someone walking, your path wearing in, meteors on
shower nights. Each stage is one commit. Every pure decision goes in `js/hero-field-core.js` with tests.
Everything stays index-only.

## Stage 1: Your movement is wind
**Goal:** the cursor stops pushing grass aside like a hand and becomes wind. Speed sets strength, travel
sets direction, and a flick's gust carries on past the cursor and fades. A still cursor is still air.
Scrolling (wheel or swipe) sends a gust ahead of you along the path, in the direction you walk.
**Success:** a slow drift stirs only nearby plumes; a flick sends a visible wave. The grass settles when
the cursor stops. Scrolling down sends wind away from you; scrolling up sends it back. Touch scrolling
never blocks.
**Tests:** core: strength rises with screen speed, is capped, and is direction-independent; a puff
travels and decays; a scroll gust's direction follows scroll direction. Wiring: a fast move outweighs a
slow one, a still cursor decays to zero, and a scroll spawns a forward puff.
**Status:** Complete

## Stage 2: The season's own field
**Goal:** beyond colour, the field becomes the season. Autumn is silver plumes (as now). Winter has
pale bowed stalks, few plumes, snow on the ground, and flakes falling on the wind. Spring has young
grass, almost no plumes, and petals drifting on the wind. Summer has lush green and, at night,
fireflies low over the grass.
**Success:** each season is recognisable at a glance in all three themes. Reduced motion shows a still
frame with the particles frozen. The text still holds contrast.
**Revised (user, mid-stage):** a gust "bounced" the particles. Stateless, they sprang back once it
passed. Each particle now keeps a velocity on the CPU (at most 320, so negligible), so a gust blows it
and it stays blown.
**Tests:** core: the season's field shape (plume share, heights, bow) and particle kind and count by
season and hour; fireflies only on summer nights; "begin walking" contrast on every season's path.
Wiring: the particle pass draws only when the season calls for it.
**Status:** Complete

## Stage 3: A lantern for someone walking
**Goal:** when the counter API says people are walking right now (`estimated_active`), as many as three
lanterns move slowly along the far path. If someone walked in the last hour, one lantern does.
Otherwise there are none. They are faint warm lights, readable at night and a small glint by day.
**Success:** the signal comes from the fetch the trail already makes, not a second request. Nothing
appears without the signal, and nothing identifying is shown.
**Tests:** core: lantern count from the stats (0, 1 for recent, capped at 3 for active) and positions on
the path curve. Wiring: the trail's stats reach the field.
**Status:** Complete

## Stage 4: Your path wears in
**Goal:** each day you visit, the path reaches a little farther toward the horizon and its verge is
trodden a little lower. The count is on-device only and counts phones too: the footer cairn's count skips
screens under 640 px.
**Success:** a first visit looks as it does today; around thirty days the path runs clear to the horizon.
One count per local day, and nothing leaves the device.
**Tests:** core: path reach from days (monotonic, capped, first visit unchanged); one count per local
day. Wiring: the count persists and survives storage being unavailable.
**Status:** In Progress

## Stage 5: Meteors on shower nights
**Goal:** on the real peak nights of the year's major showers, while it is night at the visitor's
hour, an occasional meteor crosses the sky from the shower's side. A quiet line under the tagline
names the shower.
**Success:** never on other nights or by day, and rare (tens of seconds apart). With reduced motion,
the line still appears but no meteor does.
**Tests:** core: shower lookup by date (window edges, the year boundary for the Quadrantids, a
non-shower night) and night gating. Wiring: the line is shown only on shower nights.
**Status:** Not Started
