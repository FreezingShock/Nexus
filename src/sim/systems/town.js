// The town's name and badge (state.town). Saved with the town; the commands are the only way the HUD changes them.
import { DEFAULT_TOWN, TOWN_COLORS, TOWN_ICONS, cleanName, sanitizeTown } from '../town.js';

export default {
  id: 'town',
  state: () => ({ town: { ...DEFAULT_TOWN } }),
  sanitize: (raw) => ({ town: sanitizeTown(raw.town) }),

  commands: {
    // An empty or blank name is ignored, so the old name stays.
    renameTown(ctx, cmd) {
      const name = cleanName(cmd && cmd.name);
      if (name) ctx.state.town = { ...ctx.state.town, name };
    },
    // Only a known icon or colour is kept; the other half of the badge stays as it was.
    setTownBadge(ctx, cmd) {
      const cur = ctx.state.town, next = sanitizeTown({ ...cur, icon: cmd && cmd.icon, color: cmd && cmd.color });
      ctx.state.town = { ...cur, icon: TOWN_ICONS.includes(cmd && cmd.icon) ? next.icon : cur.icon, color: Object.keys(TOWN_COLORS).includes(cmd && cmd.color) ? next.color : cur.color };
    },
  },
};
