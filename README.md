# Pirate Putt — the 40-prompt challenge

A working multiplayer mini-golf game. Vanilla TypeScript on the client, Cloudflare Workers + Durable Objects on the server, Discord Embedded App SDK wired in. Lobby codes, real-time ball sync, hazards, emotes, three holes.

It runs. That's the floor.

## The challenge

Fork it. Add a Mario Kart style twist: **player interference**. Banana peels, oil slicks, ink clouds, magnet pulls, putter-jams, kraken grabs. Whatever the mechanic, the rule is the same: one player's action affects another player's ball.

Ship it as a functional multiplayer game.

**Par: 40 prompts.**

Count every prompt you send to whatever AI you use (Claude, Codex, Cursor, ChatGPT, Copilot chat). Manual edits don't count. Reading code doesn't count. Counting tool calls inside a single prompt doesn't count. One message you typed = one prompt.

Under par wins.

## Rules

1. Fork this repo. Branch off `main`.
2. Twist must affect at least one other player's ball state. Visual-only doesn't count.
3. Game must remain playable end-to-end: lobby → start → hole 1 → hole end → next hole.
4. Log every prompt to `PROMPT_LOG.md` in your fork. Format: `## 01\n[the prompt]`. Honour system.
5. Open a PR with the prompt count in the title. Submission deadline announced in Clief Notes.

## Stack reference

- `shared/` — types, physics, courses, daily-challenge logic. Physics runs identically on client and server.
- `server/src/` — Worker entry + LobbyDO (one Durable Object per lobby code, holds player state, ticks physics, broadcasts).
- `client/src/` — Vite app. `game/` is the loop, `net/` is the socket, `ui/` is screens, `discord/` is the embedded SDK bridge.

## Getting it running

```bash
npm install
npm run dev:all
```

Vite serves the client. Wrangler runs the worker locally with the LobbyDO.

## Why 40

Generous enough to finish. Tight enough that you can't brute-force. The interesting work is in the brief, not the typing.
