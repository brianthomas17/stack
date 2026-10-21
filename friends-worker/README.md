# stack-friends

The shared server behind Stack's Friends feature: a Cloudflare Worker with one
KV namespace. Groups, hashed member keys and each member's published profile.

```bash
npm install
npm run dev      # local, at http://localhost:8787
npm run deploy   # needs CLOUDFLARE_API_TOKEN and account_id, see below
```

Deploying: pin `account_id` in `wrangler.jsonc` and put an account-scoped
"Edit Cloudflare Workers" API token in `.env` as `CLOUDFLARE_API_TOKEN`. The KV
namespace is created on first deploy. Then set `STACK_FRIENDS_URL` in the app's
`.env` to the Worker URL.
