# Phase 3 — Distribution checklist

Everything in the repo is ready. The steps below are the ones that need YOUR
accounts/credentials — I can't run them for you, but each is copy-paste. Do
them in order.

## 1. Public GitHub repo (MIT)

Create a repo (e.g. `Shauliko/meisimusa-mcp`) and push the `mcp-esim/` contents
to its root. Add a `LICENSE` (MIT). The `server.json`, `smithery.yaml`, and
`.github/workflows/publish.yml` assume the package sits at the repo root — if
you instead keep it in the monorepo, set the workflow's `working-directory` to
`./mcp-esim`.

## 2. First npm publish + Trusted Publishing

```bash
cd mcp-esim
npm install
npm run build
npm test
npm login          # one time, your npm account
npm publish --access public   # claims the name "meisimusa-mcp"
```

Then on npmjs.com → the package → **Settings → Trusted Publishing** → add your
GitHub repo and workflow file `publish.yml`. After that, every GitHub **Release**
auto-publishes (no token stored). Verify: `npx meisimusa-mcp --mock` should boot.

## 3. Host the remote endpoint (reach web + ChatGPT)

Run the Streamable HTTP server as a long-lived process on your Vultr box (same
pattern as the bot/relay, behind Caddy):

- DNS: `mcp.meisimusa.com` → `45.77.104.24` (DNS-only, like the others).
- Run it (Docker or pm2/systemd): `MEISIMUSA_MOCK= node dist/http-server.js` (port 8787).
- Caddy block:
  ```
  mcp.meisimusa.com {
      reverse_proxy localhost:8787
  }
  ```
- Test: `https://mcp.meisimusa.com/health` returns `{ok:true}`. The MCP URL is
  `https://mcp.meisimusa.com/mcp`.

Then in claude.ai → Settings → Connectors → Add custom connector → paste that
URL. (Same URL works for ChatGPT and Perplexity custom connectors.)

## 4. Smithery.ai

Go to smithery.ai → Add server → connect the GitHub repo. It reads
`smithery.yaml` automatically. Confirm the install card renders and the
config (optional key) shows.

## 5. Official MCP registry + servers list

- Registry: install the publisher CLI (`mcp-publisher`), authenticate with
  GitHub, and run `mcp-publisher publish` from the folder with `server.json`.
  (Confirm the current `$schema` version at registry.modelcontextprotocol.io
  before publishing; bump the date in `server.json` if it changed.)
- Servers list: open a PR to `modelcontextprotocol/servers` adding one line for
  `meisimusa-mcp` under the community servers section.

## 6. dev.to launch post

`LAUNCH_POST.md` is ready (front-matter `published: false`). Paste into dev.to,
set a cover image, flip to published. Cross-post to your own blog if you have one.

## 7. ChatGPT Apps (apps.openai.com)

OpenAI's connectors/apps now speak MCP, so the **same remote endpoint** from
step 3 is the backbone. Sign in to the OpenAI developer console, create an app
that points at `https://mcp.meisimusa.com/mcp`, and submit for review. (No
separate OpenAPI rewrite is required now that connectors use MCP — if their
console still asks for an OpenAPI spec for your tier, tell me and I'll generate
one from the same four tools.)

## 8. Reddit + Indie Hackers

Short, non-spammy posts. Suggested:

> **r/SideProject / Indie Hackers title:** "I put my eSIM store inside Claude and ChatGPT — buy travel data without leaving the chat"
>
> Body: 3 sentences on the problem (tourists hate app installs / roaming), one on how it works (MCP server wrapping our existing API, pay via Stripe link in chat), and the `npx meisimusa-mcp` + connector URL. Link the dev.to post for the build story. Reply to every comment for the first 24h.

---

### Order of impact
Steps 2 + 3 unlock everything (package + web reach). 4/5/7 are discovery. 6/8
are launch noise. Do 2 and 3 first; the rest can trickle over a week.
