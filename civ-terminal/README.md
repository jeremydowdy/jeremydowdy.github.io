# Civ Terminal

A civilization sim played in a terminal, in the browser. Static files only: no backend, no accounts, no trackers, and no requests to any other site. Saves and the civilization's name stay in the player's browser.

> **This game is hidden from the live site.** It stays in the repo so it can be worked on, but it is not published: `_config.yml` at the repo root lists `civ-terminal` under `exclude`, so GitHub Pages leaves it out, there is no link to it on the home page, and its build-log entries live in `dev-log.json` here instead of the public build log.
>
> **Work on it locally:** from the repo root run `python3 -m http.server 8765` and open <http://localhost:8765/civ-terminal/>. Tests: `cd civ-terminal && npm test` (and `node tests/e2e/smoke.mjs` for the browser test).
>
> **To publish it again:** (1) delete the `- civ-terminal` line from `_config.yml`; (2) add the home page entry back in `index.html`, in the Published list, e.g. `<a href="civ-terminal/" class="doc-link">&gt; launch civ_terminal</a>`; (3) optionally move the entries from `dev-log.json` back into `architecture/build-log/build-log.json` and run `python3 architecture/tools/build.py`. The last version that was published is commit `f658734`.
>
> Note: the repository itself is public, so the source is visible on GitHub even while the game is not on the site.

**Status: vertical slice.** One era (the Stone Age) with ten structures, ten discoveries, three expeditions, two dilemma cards, a River Clan you can invite (a gamble), a mushroom event, and a rival playing tit-for-tat. The rest of the design (more eras, the other game-theory modules, simulation-hypothesis cards, CRT effects, era-transition wipes) is not built yet. The Stone Age ends at 130 knowledge; the next era isn't built, so the game says you've mastered the Stone Age and lets you keep playing for score.

**How it looks:** the game starts in a terminal (pure black, one phosphor color): a boot log, then "Name your civilization". Pressing Enter opens a colorful pixel-art game screen: a small map with a blue river, forest and hills, a resource bar, and buttons for building, expeditions and decisions. The terminal is still there as a console drawer (press the backtick key).

## How to play

Open `/civ-terminal/`, name your civilization and press Enter.

- **Next turn / 5 turns** (or press `N` / `5`) lets time pass. A turn is a **season** in the Stone Age (four to a year), and the date shows in the top bar and on the map. Summer and autumn forage well; winter forages at half and is harder on the weak.
- **People are born, grow up and die on their own.** You start with 5 women and 5 men, and all five women are pregnant. A pregnancy lasts 3 turns (nine months), and a woman can get pregnant again the turn after a birth. Births come from **how many women there are**, so a bigger band grows faster, exponentially, until food or room runs out. Along the way some pregnancies are lost (more when people are hungry), some mothers die in childbirth, babies are fragile, and people die of sickness, more in winter. Children eat half as much but don't forage or learn until they grow up, 8 turns later; famine hits them hardest. More births mean more mouths to feed.
- **Unrest.** Hunger and **crowding** (more people than the camp has room for) wear down stability. When it drops too low, some of the band walk away, **taking their share of the food and more than their share of the knowledge with them**. The ones who stay feel a little better afterward.
- **Timeline** shows every turn: its season, the people count, who was born, died or left, and what you did, with a chart of people and food (winters shaded).
- **Food & wood, per turn** shows exactly where food and wood come from (gathering, fish traps, hunting camps, cooking...) and where they go (adults and children eating, arms), for this season. Gathering has strongly diminishing returns as the band grows, so you need other sources.
- **Build** with the buttons. Costs are on the button and come out of the resource bar when you build. Each new building of a kind costs a little more. At the start only the **campfire** can be built: people who gather around a fire share what they know, so fires spread knowledge.
- **Discoveries** unlock as knowledge grows, and each opens something to build: Fishing (4, fish traps), Stone tools (6, woodcutters' camps), Cooking (8, faster learning, fires feed people), Spears (10, hunting camps), Hide and pole work (15, shelters, drying racks), Herbal lore (20, healer's huts that save lives and pregnancies), Oral tradition (28, story circles), Dugout canoes (40), Pottery (60, less spoilage, storage pits) and Warm clothing (80, kinder winters). The Discoveries panel shows the roadmap. Fish run best in spring and summer, game in autumn, and several of the same thing give less each time.
- **Expeditions** send a small party out for a few turns. They cost food and people while away, come home with **+1 knowledge**, and sometimes find food or news. They carry a small risk.
- **Decisions** stop time. Each option shows its upside and its cost, and many have consequences that arrive turns later. Press `A` or `B`, or click. Border decisions with a rival show the payoff matrix.
- **Rivals** shows each rival's strategy, trust and history. You can propose a disarmament pledge, or **invite the River Clan to share what they know**: it costs 6 food as a gift, can be done every 5 turns, and is a gamble. They might teach you (+knowledge), trade, demand tribute, or attack. The more they trust you the better the odds, and a well-armed camp is attacked less. Now and then they bring **mushrooms** that make people see things and seem to help thinking, but nobody knows which are safe: you decide whether one volunteer tastes a little or everyone feasts, and the result is random (what you learn from each try improves the odds). Once you know about them, you can also send a party to **gather mushrooms**.
- **The rules underneath** lists every constant the world runs on. Edit one to see the civilization change; the run is marked as having changed rules.
- **Game** has save, load, a replay link and reset. The game autosaves after every action. The same seed and the same choices always give the same score.

### The console

Press the backtick key (or use **Game > Console**) for the terminal. It does everything the buttons do:

| Command | What it does |
| --- | --- |
| `help` | list commands |
| `status` | population, food, energy, knowledge, stability, era, turn |
| `wait [n]` | pass n turns (stops when a decision is waiting) |
| `build <structure>` | build; `build` alone lists structures and what is locked |
| `explore <expedition>` | send a party; `explore` alone lists them |
| `decide` / `choose <A\|B>` | read the waiting decision, then pick |
| `rivals` | each rival's strategy, history with you, trust |
| `invite [now]` | invite the River Clan to share what they know (random outcome) |
| `propose disarmament` | pledge with a rival to disarm at the next border decision |
| `timeline` | what happened each turn: the date, births, deaths, people who left |
| `history` | past decisions and the consequences that followed |
| `reveal rules` / `set rule <name> <value>` | see and change the constants underneath |
| `map` | describe the map in words |
| `seed` | this run's seed and a replay link |
| `set theme <green\|amber\|white>`, `set speed <normal\|instant\|slow>` | console and start-screen settings |
| `save`, `load`, `reset`, `clear` | saves live in this browser's localStorage |

## Editing the data files

Game content lives in `data/`, not in code:

- `rules.json`: every constant (food per forager, birth and death rates, how easily people leave, trust changes...). Each has a `value` and a `label` shown by `reveal rules`.
- `eras.json`: eras in order. `advanceAt.knowledge` ends the era; `next` names the following era. `clock` sets how time passes: `perYear` turns to a year with named `seasons` (each with `forage`, `death`, `cold`, a `note` and a map `tint`), or `yearsPerTurn` for later eras where a turn is longer.
- `structures.json`: `cost`, `costGrowth` (each one built costs this much more), `capacity` (shelter), `health` (healer's hut: fewer deaths and lost pregnancies), and `perTurn` gains. `seasonKey` (`fish` or `hunt`) makes a food source follow that season's multiplier, and `diminish` makes each extra copy worth less. A structure is available from the start unless a discovery lists it under `unlocks`.
- `discoveries.json`: things your people learn at a knowledge level (`at.knowledge`). A discovery can apply `effects` once (for example `mods.knowledgeMult`), `boost` what a structure gives each turn, and `unlock` structures.
- `expeditions.json`: `people`, `turns`, `cost`, `reward`, `risk`, optional `finds` (a `chance`, some `text`, and `effects`), and `minKnowledge`.
- `dilemmas.json`: cards with two options. Each option has `label`, `upside`, `cost`, `now` (immediate effects), `later` (`after` n turns: `text` + `effects`), `flags`, and `locks` (ids of cards this choice closes off). Effects can change `pop`, `food`, `energy`, `knowledge`, `stability`, `trust`, and lasting `mods` (`foodPerTurn`, `energyPerTurn`, `knowledgePerTurn`, `stabilityPerTurn`, `forageMult`, `spoilMult`).
- `rivals.json`: strategy parameters, and which rivals are `active`.
- `events.json`: random events. Each outcome has a `weight` and optional shifts by rival `trust`, your `arms`, and `perFlag` counters (what you've learned), plus `requires`, `effects`, `flags`, and a `then` that chains to another event. The invite and the mushroom decision live here.
- `cards.json`: simulation-hypothesis cards (empty for now).

After editing, run the tests: they validate the files and print a balance report for every dilemma.

## Tests

Needs Node 20 or newer; no packages to install.

```sh
cd civ-terminal
npm test
```

Covers pregnancy, miscarriage, childbirth, children, exponential growth, the food and wood ledger, the River Clan and mushroom gambles (the odds, and that the dice follow them), the seeded RNG, scoring and replay, the arms-race module, the rival strategies, dilemma data and balance, discoveries, unlocks, rising costs and expeditions, the calendar and seasons, births, children, famine, crowding, people leaving, per-turn records and old-save migration, world generation, sprites, the console commands, and settler movement.

There is also a browser smoke test that plays the game end to end (starting at the terminal, building, an expedition, decisions, the console, saving, a phone-sized screen, reduced motion, and a check that nothing is requested from another site). It needs Playwright with Chromium:

```sh
node tests/e2e/smoke.mjs
```

## Layout

- `index.html`, `styles.css` (terminal), `game.css` (game screen), `main.js`: the page and its wiring.
- `js/state.js`, `rng.js`, `economy.js`, `game.js`, `scoring.js`: the simulation (pure, no DOM).
- `js/dilemmas.js`, `rivals.js`, `gametheory/armsRace.js`: cards, strategies, the prisoner's dilemma.
- `js/commands.js`: console commands (pure text in, text out).
- `js/terminal.js`, `boot.js`, `saves.js`, `data.js`: DOM terminal, boot log, localStorage, data loading.
- `js/ui.js`: the game screen (resource bar, build and expedition buttons, rivals, decision card, log).
- `js/world.js`, `pixelmap.js`, `sprites.js`, `agents.js`: the pixel-art map on a small 2D canvas (320x200, scaled up with hard edges), its sprites, and the settlers' boids movement. No library. Settlers are visual only and never change the score.

## Deploying

The site is served by GitHub Pages from the `main` branch with no build step. Push to `main` and the game is live at `/civ-terminal/`.
