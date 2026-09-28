# AI usage

This project was built with AI assistance. This file is the record of it. It is
graded as the finals badge, and it is worth 100 points.

Start it in week 1 and keep it up as you go. The commit history of this file is
part of the evidence: a file written all at once the night before the deadline
looks exactly like what it is.

## Entries recorded so far

### 2026-09-28 - Milestone 7 implementation and verification

- **Tool:** Codex, with a read-only specialist review during final audit.
- **What I asked for:** Complete Finish Shopping, trip history/corrections, safe integration tests on the existing Supabase development database, an authenticated browser walkthrough, and a pre-commit review.
- **What it gave back:** Owner-scoped transactional trip APIs, React trip screens, migration 002, guarded temporary-data tooling, tests, and local browser verification. The review identified a too-broad test database target check and malformed cursor handling; both were tightened and focused tests passed.
- **What I kept, what I changed, and why:** The temporary test data was removed after baseline verification. A project identity pin was added to prevent the guarded runner from accepting another Supabase project, and malformed cursors now fail validation before reaching PostgreSQL. The owner approved the final review.
- **Commit:** The Milestone 7 commit hash must be linked in a later course-evidence update; a commit cannot include its own hash. No student-authored code is claimed here.

### 2026-09-23 - Week 1 documentation and journal correction

- **Tool:** Codex.
- **What I asked for:** Draft the Week 1 documentation update, increment report, and reflection, then correct the reflection after I identified it as a midterm entry.
- **What it gave back:** A CartCheck README and report, a separate finals Week 1 journal, and a preserved midterm reflection in the private course workspace.
- **What I kept, what I changed, and why:** The documentation and report were kept. The original reflection was reclassified as a midterm record, and a new Week 1 entry was drafted from CartCheck work so the finals journal described the correct period.
- **Commits:** [CartCheck documentation](https://github.com/EJhayGit/CartCheck/commit/e25d3e4); private workspace commit `4dd9447`.

### 2026-09-27 - Week 2 documentation and security checklist

- **Tool:** Codex.
- **What I asked for:** Create the Week 2 documentation update, increment report, and reflection from the current CartCheck repository.
- **What it gave back:** An updated README and report plus a Week 2 journal and 31-row security checklist in the private course workspace.
- **What I kept, what I changed, and why:** The drafts were committed with explicit limits: the UI has accounts, catalog, and list editing, while purchase tracking, deployment, and a running-app screenshot remain unfinished. Personal review and any further edits are pending.
- **Commits:** [CartCheck documentation](https://github.com/EJhayGit/CartCheck/commit/97accd9); private workspace commit `37d5e2f`.

### Real AI mistake recorded so far

Codex initially treated a course-wide midterm reflection as the finals Week 1 journal. After the owner corrected this, the original text was preserved as `journal/midterm-reflection.md` and a new weekly entry was written. See private workspace commit `4dd9447`. Further error cases and student-authored code evidence have not yet been documented; they should not be invented.

## 1. How I used AI

At least six entries. One per real use. Every entry needs a commit link.

### YYYY-MM-DD - short title

- **Tool:**
- **What I asked for:**
- **What it gave back:**
- **What I kept, what I changed, and why:**
- **Commit:** https://github.com/YOUR-USERNAME/YOUR-REPO/commit/SHA

## 2. Where the AI got it wrong

Three cases. Be specific. If you write that the AI was never wrong, this section
scores zero.

### Case 1 - short title

- **What it gave me:**
- **What was wrong with it:**
- **What I did instead:**
- **Commit:** https://github.com/YOUR-USERNAME/YOUR-REPO/commit/SHA

## 3. Who wrote what

At least a fifth of this project is code you wrote yourself. Name it, and explain
it in your own words.

> Group projects: give each member their own heading below, and use your GitHub
> handle as the heading. You are graded on your own section.

### Written by me

- **File:**
- **Commit:**
- **What it does and why it is built this way:**

### The AI-written part I understand best

- **File:**
- **Commit:**
- **What it does and why we kept it:**
