# Civ Terminal

A civilization sim played in a terminal, in the browser. Static files only: no backend, no accounts, no trackers, and no requests to any other site. Saves and the civilization's name stay in the player's browser.

**Status: vertical slice.** One era (Stone Age), two structures, two dilemma cards, one rival (tit-for-tat) and the recurring border decision. The rest of the design (more eras, the other game-theory modules, simulation-hypothesis cards, bloom and CRT effects) is not built yet.

## How to play

Open `/civ-terminal/`, name your civilization and press Enter. Then type commands:

| Command | What it does |
| --- | --- |
| `help` | list commands |
| `status` | population, food, energy, knowledge, stability, era, turn |
| `wait [n]` | pass n turns (stops when a decision is waiting) |
| `build <structure>` | spend resources; `build` alone lists structures |
| `decide` / `choose <A\|B>` | read the waiting decision, then pick |
| `rivals` | each rival's strategy, history with you, trust |
| `propose disarmament` | pledge with a rival to disarm at the next border decision |
| `history` | past decisions and their delayed consequences |
| `reveal rules` / `set rule <name> <value>` | see and change the constants underneath |
| `map` | describe the map in words |
| `seed` | this run's seed and a replay link |
| `set theme <green\|amber\|white>`, `set speed <normal\|instant\|slow>` | settings |
| `save`, `load`, `reset`, `clear` | saves live in this browser's localStorage |

The game autosaves after every action. The same seed and the same choices always give the same score; share a run with the `#seed=...` link from `seed`.

## Editing the data files

Game content lives in `data/`, not in code:

- `rules.json`: every constant (food per forager, spoilage, trust changes...). Each has a `value` and a `label` shown by `reveal rules`.
- `eras.json`: eras in order. `advanceAt.knowledge` ends the era; `next` names the following era.
- `structures.json`: `cost`, `capacity` (shelter), and `perTurn` gains.
- `dilemmas.json`: cards with two options. Each option has `label`, `upside`, `cost`, `now` (immediate effects), `later` (`after` n turns: `text` + `effects`), `flags`, and `locks` (ids of cards this choice closes off). Effects can change `pop`, `food`, `energy`, `knowledge`, `stability`, `trust`, and lasting `mods` (`foodPerTurn`, `energyPerTurn`, `knowledgePerTurn`, `stabilityPerTurn`, `forageMult`, `spoilMult`).
- `rivals.json`: strategy parameters, and which rivals are `active`.
- `cards.json`: simulation-hypothesis cards (empty for now).

After editing, run the tests: they validate the files and print a balance report for every dilemma.

## Tests

Needs Node 20 or newer; no packages to install.

```sh
cd civ-terminal
npm test
```

Covers the seeded RNG, scoring and replay, the arms-race module, the rival strategies, dilemma data and balance, the terminal commands, and settler movement.

## Layout

- `index.html`, `styles.css`, `main.js`: the page and its wiring.
- `js/state.js`, `rng.js`, `economy.js`, `game.js`, `scoring.js`: the simulation (pure, no DOM).
- `js/dilemmas.js`, `rivals.js`, `gametheory/armsRace.js`: cards, strategies, the prisoner's dilemma.
- `js/commands.js`: terminal commands (pure text in, text out).
- `js/terminal.js`, `boot.js`, `saves.js`, `data.js`: DOM terminal, boot log, localStorage, data loading.
- `js/render.js`, `agents.js`: the WebGL2 map and the settlers. Raw WebGL, no library. Settlers are visual only and never change the score.

## Deploying

The site is served by GitHub Pages from the `main` branch with no build step. Push to `main` and the game is live at `/civ-terminal/`.
