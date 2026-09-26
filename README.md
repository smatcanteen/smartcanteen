# Canteen Cashflow

i need in a website version 
PRODUCT CONCEPT — VERSION 2

From daily cash book to complete canteen financial system

August 2026




 




1. Introduction

SmartCanteen began as a simple idea: replace the paper notebook a canteen operator uses to track daily money. Version 2 grows that idea into a complete, connected financial system — one that follows the operator's money from the day term capital is first put into the shop, through every stock purchase and daily sale, all the way to a clear picture of real profit at the end of term. Nothing in this document is a separate feature bolted on; every part is designed to plug into the same live Cash at Hand figure, so the operator only ever has to look in one place to know exactly where they stand.

2. Core Philosophy

•     Speed over completeness — a fast, slightly simpler entry beats a thorough one nobody has time to finish.

•     One number that's always right — Cash at Hand updates automatically from every stock purchase, expense, and sale, so the operator never re-adds anything by hand.

•     Built for how canteens actually work — bulk buying, per-piece selling, school terms instead of calendar months, credit to students, and a small, fixed set of recurring expenses.

•     Clarity before cleverness — expected profit, stock summaries, and reports all use plain numbers and plain language, not accounting jargon.

3. Term Capital & Stock Management

Every term starts with one number: the capital the operator is working with. From that starting point, the system tracks exactly where the money goes.

3.1 Term Capital

At the start of a term, the operator declares their opening capital — for example, UGX 473,000. This becomes the term's starting Cash at Hand, and every stock purchase, expense, and sale from that point moves against this one figure.

3.2 Stock List

As the operator spends capital on items to sell, each purchase is recorded as a proper stock entry rather than a plain expense:

•     Item name

•     Quantity bought

•     Buying price (what was paid for that quantity)

•     Selling price (what it will retail for, per piece)

New items can be added at any point in the term, not only at the start — each one plugs into the same Cash at Hand deduction and stock summary, whether it's added in week one or week ten.

 

 

3.3 Expected Profit

The moment a stock entry is saved, the system shows expected profit for that purchase — what the operator will make if everything bought sells at the price they've set. This appears per item and as a total for the whole stocking trip, answering the question every operator asks at the point of purchase: was this worth it?

3.4 Summaries

•     Per item — quantity bought, current stock level, buying price, selling price, expected profit per unit

•     Per stocking trip — total spent, total expected revenue, total expected profit for that purchase

•     Overall — value of everything currently on the shelf, at cost and at retail price

4. The Cash Flow Engine

Cash at Hand is never typed in directly after the opening balance — it only ever moves because of an actual recorded transaction:

•     Buying stock → Cash at Hand goes down automatically by the amount spent.

•     Paying an expense (transport, rent, salary, allowances, or anything else) → Cash at Hand goes down automatically.

•     Declaring a sale → Cash at Hand goes up automatically by the amount declared.

This is the single rule the whole system is built around: the operator never does the arithmetic. They just tell the system what happened, in whichever category it belongs to, and the balance takes care of itself.

5. The Entry Experience

Three actions cover everything an operator needs to do in a normal day, presented as three large buttons on the home screen: Stock In, Cash Sale, and Expense.

5.1 Stock In

A fast, repeatable line-item builder: item name (with autocomplete from past stock), quantity and buying price, selling price (pre-filled from last time), a live running total of cost and expected profit, and a one-tap “Add another item” to log a whole restocking trip in one sitting.

5.2 Cash Sale

Simple mode by default — a numeric keypad, type the total, save. An Itemize toggle is available for operators who want per-item sales detail, which is also what allows accurate stock-level tracking for anyone who chooses to use it.

5.3 Expense

Category chips shown before the amount field, with the four most-used categories pinned in a fixed 2×2 grid so they're never more than one tap away: Transport, Salary/Wages, Allowances, and Rent. Allowances includes an optional “For (name)” field, since allowances go to different individuals and the operator will want to know who received what. Rent supports a recurring flag, since it's typically a fixed cost each period. Less-used categories (Foodstuffs, Cooking Gas, Water, Packaging, Utensils/Repairs, Miscellaneous) sit one tap below.

5.4 Shared entry principles

•     Numeric keypad opens automatically wherever an amount is needed

•     Autocomplete on item names and categories, pre-filled from history

•     Save immediately, with an Undo option for a few seconds afterward, instead of a confirm-before-save dialog that slows every entry down

•     One consistent checkmark confirmation animation across every save

•     A voice mic icon next to every amount field — see section 10

6. Credit / Debtor Tracking

Because student credit sales are a normal part of running a canteen, they're tracked separately from cash — a credit sale never touches Cash at Hand until it's actually paid. Each debtor entry records a name, class/section, item, amount owed, and running balance, with reminders for debts unpaid past a chosen number of days, and a one-tap action to convert a payment into a real cash transaction the moment it's collected.

7. Balance Sheet & Reporting

A real accounting-style statement, filterable by day, week, term, or custom range: Opening Balance, plus Sales, minus Stock Purchases, minus Other Expenses, equals Closing Balance — which should always match Cash at Hand at that point in time. Alongside it, Expected Profit (from Stockings in that period) is shown next to Actual Net Change, so the operator can see how closely reality is tracking their plan. Everything exports to PDF or Excel.

8. Multi-Tenant SaaS & Super Admin

SmartCanteen is delivered as a subscription, sold to many canteen operators, each with fully isolated data:

•     UGX 35,000 per canteen account for 4 months (prepay), billed against the operator's own school term calendar rather than a fixed date

•     Automatic pause or reduced rate during school holidays, when canteen income stops

•     A Super Admin area — separate login, invisible to tenants — to create accounts, record payments, suspend/reactivate, and view revenue across all subscribers

•     Per-account customization: branding (logo, accent colour), and a starting category template chosen at signup (Boarding School, Day School, or University Canteen)

9. Renewal & Retention

•     Multi-channel renewal reminders (in-app, SMS, WhatsApp) starting a few days before the due date

•     A short grace period, followed by a soft lock — the operator keeps full access to their historical data, just can't add new entries until payment is recorded

•     A referral incentive — a free month for both parties when an operator refers another canteen that subscribes

10. Voice AI Entry

A hold-to-speak option on every entry flow lets an operator log a stock purchase, a sale, or an expense by talking instead of typing — tolerant of natural English/Luganda code-switching. Speech is transcribed, then parsed into the same structured fields the manual forms use, split into multiple entries if more than one transaction was mentioned in one recording, and always shown on an editable confirmation screen before anything saves. Nothing reaches the ledger without that confirmation step.

11. What's New in Version 2

Beyond consolidating everything above into one connected system, Version 2 introduces several new features aimed at accuracy, accountability, and habit-forming daily use.

11.1 End-of-Day Close-Out

A short guided ritual the operator can run at closing time: confirm today's sales, review today's expenses, count physical cash using the existing Cash Counter tool, and see any mismatch against what the app expects — turning end-of-day reconciliation into a two-minute habit instead of something that only happens when a problem is suspected.

11.2 Low-Stock & Reorder Alerts

For operators using Itemize mode on sales, the system can track approximate stock levels per item and flag anything running low, with a simple “what to restock” list grouped by item — a lighter-weight version of full inventory tracking that only activates for operators who choose to itemize, so it never slows down anyone who prefers the fast lump-sum sales entry.

11.3 Staff PINs

For canteens where more than one person handles the till, individual PINs for helpers/staff (separate from the owner's PIN) so entries can be attributed to whoever made them — useful for accountability without requiring full multi-user account complexity.

11.4 Term Report Card

A single shareable PDF summarizing the whole term at a glance — total sales, expenses, expected vs. actual profit, and outstanding credit — the same kind of document an operator could hand to a school administrator, a family member, or keep for their own records.

11.5 Savings Goal Tracker

The operator can set a savings target for the term (e.g. “save UGX 200,000 by end of term”) and see progress tracked automatically from net profit — a simple, motivating way to turn daily bookkeeping into a longer-term goal instead of just a record-keeping chore.

11.6 WhatsApp Daily Digest

An optional end-of-day message — sales, expenses, and closing cash balance — sent automatically to the operator's own WhatsApp, or to a trusted family member or school administrator if the operator wants an extra layer of visibility and accountability.

11.7 Simple Insights

Occasional plain-language nudges surfaced on the home screen — for example, noting that transport costs have risen over recent weeks, or that one item consistently outperforms another — using the operator's own historical data, not external benchmarks, to stay genuinely useful rather than generic.

12. Closing

Version 2 turns SmartCanteen from a fast way to log transactions into a complete financial home for a canteen business — one connected system from opening capital to term-end profit, built around a single rule: tell the system what happened, and let it do the arithmetic.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://smatcanteen.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/126f7227-609c-4119-8d50-30322d3d60e0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
