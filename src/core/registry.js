// A tiny ordered registry. Features register a definition object; the host loops over them.
// Ids are unique so two threads cannot silently shadow each other.
export function createRegistry(kind) {
  const items = [];
  return {
    add(def) {
      if (!def || typeof def.id !== 'string') throw new Error(kind + ': definition needs a string id');
      if (items.some((d) => d.id === def.id)) throw new Error(kind + ': duplicate id "' + def.id + '"');
      items.push(def);
      return def;
    },
    list: () => items.slice(),
    // Calls `hook` on every definition that has it, in registration order.
    run(hook, ...args) { for (const d of items) if (typeof d[hook] === 'function') d[hook](...args); },
  };
}

// Builds a registry from an array of definitions (what each index.js exports).
export function registryOf(kind, defs) {
  const r = createRegistry(kind);
  defs.forEach((d) => r.add(d));
  return r;
}
