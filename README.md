# Stack

Track your daily supplement stack: what you take, when, why, what it costs, and
whether the exact product you buy is independently tested. Buttons send Claude
off to research each item, re-check brands and prices, and look for red flags
and interactions across everything you take, prescriptions included.

Runs locally. Your data lives in its own folder, never in this repo.

## What it does

- **AM / PM lists** with dose, link, store, and why you take each item
- **Cost**: per serving, per day for each item, and your whole stack per day and month
- **Third-party testing** status per product: certified (USP, NSF, Informed
  Choice/Sport, BSCG), brand-tested only, not tested, or not checked
- **Research with Claude** per item: evidence with sources, typical vs. your
  dose, testing status, red flags (recalls, FDA letters, contamination, failed
  tests), and better or cheaper certified alternatives
- **Chat with Claude** on each item to learn about it. Claude knows your dose,
  brand, research and the rest of your stack, and can search the web.
  A short **What I've learned** digest updates after each reply and sits in
  the **At a glance** card at the top of every item
- **Interactions** check across your whole active stack, supplements and meds
- **Review before saving**: research lands as a dated report. Nothing changes
  until you accept it, and every run is kept as history
- **Stop tracking** with a reason, so you remember why you quit something
- **Sharing controls** per item, ready for the friends feature. Supplements are
  shared by default; prescriptions and OTC meds are private unless you turn
  them on (per item, or for all of them in Settings)

## Setup

You need Node 20+ and [Claude Code](https://claude.com/claude-code). Install
Claude Code and run `claude` once to log in. The research buttons use that login,
so there's no API key to manage.

```bash
git clone https://github.com/brianthomas17/stack.git
cd stack
npm install
cp .env.example .env            # points STACK_DATA_DIR at ../stack-data
cp -r data-example ../stack-data   # optional: start with one example item
npm run dev
```

Open http://localhost:5173.

### Keeping your data

`STACK_DATA_DIR` holds plain JSON: one file per item in `supplements/`, every
research run in `reports/`, conversations in `chats/`, and `settings.json`. Make that folder its own
**private** git repo and you get a full history of your stack and its research:

```bash
cd ../stack-data && git init && git add -A && git commit -m "My stack"
```

When the data folder is a git repo, the app commits changes automatically a
few seconds after you stop editing, and pushes if the repo has a remote. A chat
reply and its learnings update, or a batch of research results, land as one
commit. Set `STACK_DATA_AUTOCOMMIT=false` in `.env` to turn it off.

## How research works

Each button runs the Claude Code CLI in the background (`claude -p`) with only
web search and web fetch enabled, and asks for structured findings. A run takes
a few minutes; up to three run at once. Chat uses the same login: each message
is one `claude -p` call with the conversation replayed, and the learnings
digest runs on Haiku. Optional `.env` overrides: `STACK_RESEARCH_MODEL`,
`STACK_CHAT_MODEL`, `STACK_SUMMARY_MODEL`.

Research is informational, not medical advice. It won't tell you to stop a
prescription; talk to your doctor.

## Roadmap

- **Friends**: a Publish button and a Friends tab backed by a small Cloudflare
  Worker, so friends can see each other's stacks and why they take them.
  Only items marked shared get published.
