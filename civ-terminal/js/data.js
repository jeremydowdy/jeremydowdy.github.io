// Loads the game's data files. These are same-origin static files that ship
// with the page; nothing is fetched from anywhere else.
const FILES = ['rules', 'eras', 'structures', 'discoveries', 'expeditions', 'events', 'dilemmas', 'cards', 'rivals'];

export async function loadData(base = 'data/') {
  const data = {};
  await Promise.all(FILES.map(async (name) => {
    const res = await fetch(`${base}${name}.json`);
    if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
    data[name] = await res.json();
  }));
  return data;
}
