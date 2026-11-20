# Report relay (Cloudflare Workers, free)

Lets anyone send a "Pin in the wrong place?" report from the app without signing
in. It runs on Cloudflare's free Workers plan, which doesn't require a card.

## What it does

`worker.js` receives a report from the app and:

1. accepts reports only from the app's own website;
2. checks the invisible Cloudflare Turnstile bot test plus a hidden spam trap;
3. limits reports to 200 a day overall and 10 a day per visitor (visitors are
   a salted hash; IP addresses are never stored);
4. saves the report as `data/inbox/<id>.json` in the repo.
   `.github/workflows/pin-inbox.yml` takes it from there.

## One-time setup

Run these from this `relay` folder.

1. **Cloudflare account:** free, at https://dash.cloudflare.com/sign-up.
2. **Sign in the command-line tool.** Run `npx wrangler login`; a browser window
   opens, and you click **Allow**.
3. **Storage for the daily limits:**
   ```powershell
   npx wrangler kv namespace create REPORTS
   ```
   Put the printed `id` into `wrangler.toml` and uncomment the `[[kv_namespaces]]` block.
4. **Turnstile widget:** in the Cloudflare dashboard, open **Turnstile → Add
   widget**. Name it "Pagmamahal", add the hostname `lordgrim336-pixel.github.io`,
   and keep the "Managed" mode. Copy the **site key** into `public/js/config.js`
   (`turnstileSiteKey`). The **secret key** goes in step 6.
5. **GitHub key for saving reports:** at https://github.com/settings/personal-access-tokens/new
   create a fine-grained token:
   - Name: "Pagmamahal relay", expiration: 1 year.
   - Repository access: **Only select repositories → pagmamahal**.
   - Permissions → Repository → **Contents: Read and write**. Nothing else.
6. **Store the secrets.** Each command asks you to paste the value; it's never
   shown or saved in the project:
   ```powershell
   npx wrangler secret put TURNSTILE_SECRET
   ```
   ```powershell
   npx wrangler secret put GITHUB_TOKEN
   ```
   ```powershell
   npx wrangler secret put IP_SALT
   ```
   For `IP_SALT`, paste any long random text.
7. **Deploy** with `npx wrangler deploy`. Then put the printed address plus
   `/report` into `public/js/config.js` (`endpoint`), e.g.
   `https://pagmamahal-reports.<your-subdomain>.workers.dev/report`.

The GitHub token expires after a year. Create a new one and repeat
`wrangler secret put GITHUB_TOKEN` before then.

## Testing locally

`.dev.vars` (not committed) holds test values: Cloudflare's always-pass
Turnstile test secret `1x0000000000000000000000000000000AA` and `DRY_RUN=1`.
Run `npx wrangler dev`. In dry-run mode the relay returns the report instead of
saving it.
