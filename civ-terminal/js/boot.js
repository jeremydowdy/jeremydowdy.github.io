// The boot log shown before the name prompt. Any key skips it.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBoot(term, { strategyCount, storageOk, reducedMotion }) {
  const lines = [
    ['civ_terminal 0.1 (stone age build)', 'dim'],
    ['mounting civilization.img ... ok', ''],
    ['seeding RNG ... ok', ''],
    [`loading rival strategies ... ${strategyCount} found`, ''],
    [storageOk ? 'checking save storage ... ok' : 'checking save storage ... unavailable', ''],
    ['starting terminal ...', 'dim'],
  ];
  let skipped = false;
  const skip = (e) => { skipped = true; if (e.type === 'keydown') e.preventDefault(); };
  window.addEventListener('keydown', skip, { once: true });
  window.addEventListener('pointerdown', skip, { once: true });
  const pause = reducedMotion ? 120 : 330;
  for (const [text, cls] of lines) {
    if (skipped) break;
    term.printNow(text, cls);
    await sleep(pause);
  }
  if (!skipped) await sleep(350);
  window.removeEventListener('keydown', skip);
  window.removeEventListener('pointerdown', skip);
  term.clear();
}
