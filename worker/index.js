// The Cloudflare Worker in front of playnexus.dev. Static files are served straight from dist/ (wrangler.jsonc sends only
// /api/* and /admin/* here first), so the game itself never touches this code. It holds the feedback route and the
// private page for reading feedback. See docs/FEEDBACK.md.
import { handleFeedback, handleAdmin } from './feedback.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/feedback') return handleFeedback(request, env);
    if (pathname === '/admin/feedback') return handleAdmin(request, env);
    return env.ASSETS.fetch(request);
  },
};
