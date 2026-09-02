# 08 — Demo Runbook

> This document is **executable**. `e2e/full/demo-script.spec.ts` walks exactly these steps, so if a
> change breaks the demo, CI says so on the PR that broke it — not at 09:00 on submission day.

---

## 1. The narrative

Five minutes. One story, told in the order a judge can follow.

| Minute | Beat | The point being made |
|---|---|---|
| 0:00-0:45 | **The setup** | MTN's own CEO said the goal is moving from access to participation. Here is the participation layer. |
| 0:45-1:45 | **Earn** — Nomsa takes a gig, escrow funds, proof, payout | Escrow creates trust between strangers. 5M unemployed youth get same-day liquidity. |
| 1:45-2:45 | **Spend** — the taxi fare and the automatic split | R90bn of cash, digitised, split four ways at the moment of collection. |
| 2:45-3:30 | **Share** — the stokvel run | R50bn and 11 million people. This is the retention engine. |
| 3:30-4:15 | **The African conditions** — airplane mode, then the feature phone | We built for where this actually has to work. |
| 4:15-5:00 | **The architecture** — the live console and the ledger | This is a payments system, not a prototype. |

**The opening line** (memorise it, do not read it):

> *"Yesterday MTN's fintech CEO said they want to move customers from access to active
> participation. We spent the last month building exactly that. In the next five minutes, money is
> going to be earned, shared, and spent — in front of you, on the MoMo sandbox, in real time."*

---

## 2. Setup — the day before

- [ ] `npm run demo:reset` — seeded world restored, verified
- [ ] Both phones charged, on the venue wifi, screen mirroring tested **in the actual room**
- [ ] Telegram bot responding on both phones
- [ ] `MOMO_MODE=sandbox` confirmed, and a live `requesttopay` verified within the last hour
- [ ] The emulator switch tested: flip to `emulator`, confirm the demo still runs, flip back
- [ ] Backup video recorded and **on the laptop's local disk**, not in the cloud
- [ ] Deck exported to PDF locally
- [ ] Laptop hotspot ready as a network fallback
- [ ] Browser tabs pre-opened: app, console, MoMo sandbox portal, deck
- [ ] Notifications silenced. Do Not Disturb on everything.
- [ ] Full run-through completed three times, timed, under 5:00

---

## 3. The script

### Minute 0:00-0:45 — The setup
Slide 1: the Dioum quote and the three numbers — 11M stokvel members, R90bn taxi cash, 47.4% youth
unemployment. Do not linger. The demo is the argument.

### Minute 0:45-1:45 — Earn
1. On **phone A** (Nomsa, worker), open Telegram. `/earn`. A job is listed: *Wash kombi — R60.*
2. Tap **Accept**.
3. On **phone B** (rank admin), a request-to-pay arrives. Approve it.
4. **Point at the console.** `COLLECTION → PENDING → SUCCESSFUL`, then the journal appears with its
   balanced postings.
5. Phone A message updates **in place**: *"R60 is secured in escrow. You can start."*
6. Upload a photo of the washed kombi.
7. Phone B: **Approve**. The disbursement fires.
8. Phone A: *"R60 paid to your MoMo wallet."* Wallet balance updates live.

> Say this while it runs: *"The client's money left their wallet before the work started, and the
> worker could see it was secured. That is why a stranger is willing to start work. This is not a
> payment — it is a guarantee."*

### Minute 1:45-2:45 — Spend
1. On **phone A**, still Nomsa: she now has R60. Open the fare QR scanner.
2. Scan the QR taped to the laptop screen (vehicle dashboard).
3. Confirm R12.50.
4. **Switch to the console and stay there.** One collection lands, and immediately splits into four
   postings: owner R7.50, driver R3.12, fuel pool R1.25, insurance R0.63.
5. Show the split rule screen — the bps, publicly visible.

> *"The owner did not have to trust the driver to hand over cash, because the cash never existed.
> And notice the sixty-third cent — the remainder is distributed deterministically, so the ledger
> balances to zero on every single fare. We test that with five thousand generated cases."*

That sentence is aimed squarely at the engineers on the panel.

### Minute 2:45-3:30 — Share
1. Open the stokvel screen. MaDlamini's grocery stokvel, 12 members, R300/week.
2. Trigger the run — `workflow_dispatch` on the scheduler, or the admin button.
3. Twelve collections fire. The pool fills on screen. The rotating payout lands with member #4.
4. Every member's Telegram lights up.

> *"Eight hundred thousand stokvels. Eleven million members. Fifty billion rand a year, moving in
> cash, in a book, in somebody's handbag. This is one recurring obligation a week that a person
> cannot skip — because their aunt is in the group. That is the retention engine MoMo has been
> missing."*

### Minute 3:30-4:15 — African conditions
1. **Turn on airplane mode on phone A, visibly.** Hold it up.
2. Scan a fare QR. It captures. *"Queued — will settle when you have signal."*
3. Turn wifi back on. It settles. The console shows it arriving.
4. Switch to the USSD simulator. Dial `*120*8862#`. Accept a job on a feature phone. Same backend,
   same ledger.

> *"Taxi ranks have bad signal and not everyone has R2,000 for a smartphone. Same ledger, three
> different doors."*

### Minute 4:15-5:00 — Architecture
One slide. The container diagram from `docs/01`. Then:

> *"Three MoMo APIs, orchestrated over a double-entry ledger. Every cent traceable to a balanced
> journal. Idempotent by construction — our primary key is MTN's reference id, so a retry can never
> double-pay. Two independent paths to resolution: the callback, and a reconciler that is the
> authority. Five hundred concurrent fares in our load test, and the ledger still balances to zero.*
>
> *Zaka moved money that already existed. Vula creates income for people who have none, and gives
> it somewhere to go — sixteen times a week."*

Stop talking. Take questions.

---

## 4. Failure playbook

Rehearse these. The recovery matters more than the failure.

| If this fails | Do this | Say this |
|---|---|---|
| MoMo sandbox is down | Flip `MOMO_MODE=emulator` in Vercel (~20s) | *"The sandbox is having a moment — switching to our recorded-response emulator, which is exactly why we built it. Same code path."* |
| Venue wifi dies | Laptop hotspot | Keep talking. Do not narrate the recovery. |
| Telegram is slow | Continue on the web app; the console still shows the money | *"Telegram is catching up — the ledger already has it."* |
| Supabase paused | `supabase projects resume` (pre-authenticated in a terminal tab) | Cover with the architecture slide until it is back |
| A payment stays PENDING | Trigger the reconciler manually | *"That is the reconciler doing its job — the callback did not arrive, so we poll. Correctness does not depend on MTN calling us back."* |
| Everything is broken | Play the backup video | *"Let me show you the recording, and I will happily walk through the code afterwards."* |

**Honesty rule:** if we run on the emulator, we say so. Out loud. It reads as engineering maturity.
Claiming an emulator is the live sandbox in front of MTN's own engineers is both dishonest and the
fastest way to lose.

---

## 5. Anticipated questions

| Question | Answer |
|---|---|
| *"Why EUR?"* | The MoMo sandbox is EUR-only. We store and display ZAR and relabel at the API boundary, 1:1 with no FX rate, so reconciliation stays exact. In production the label becomes ZAR and nothing else changes. |
| *"How does this make MTN money?"* | Transaction volume — around sixteen touches per user per week against a typical wallet's one to four per month. Plus a small platform fee on gigs, and the alternative credit data that makes lending possible. |
| *"What about regulation?"* | We deliberately did not build KYC/FICA. The architecture shows where it sits — at profile creation and at the MoMo boundary. Escrow held in a licensed institution is a partnership question, not a technical one, and we would rather be honest about that than fake it. |
| *"Taxi associations are hard to work with."* | Which is why the rank admin has real control: they set the split rule, they fund the maintenance pool, they approve the gigs. We digitise their authority instead of bypassing it. |
| *"Why Telegram and not WhatsApp?"* | WhatsApp Business needs Meta approval we could not complete in the build window. The channel layer is abstracted — WhatsApp is a renderer, not a rewrite. We can show you the intent layer. |
| *"Did you really build this in a month?"* | The commit history is public. Here it is. |

That last one is why the repo is public and why the history is linear and conventionally
committed. It is evidence.

---

## 6. What to have open

| Screen | Content |
|---|---|
| Laptop main | The app, plus the live console side by side |
| Laptop second tab | MoMo sandbox portal, showing real transactions arriving |
| Phone A (mirrored) | Telegram, Nomsa's account |
| Phone B | Telegram, the client/rank admin account |
| Backup | Deck PDF, demo video, both local |
