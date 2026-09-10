# Mercury Computers Limited Invoice CRM

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_AWleTz2zIXdjLBlxfUyMaSHZFwHg)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

## Gmail reminder integration

The CRM uses Firebase HTTPS Functions behind same-origin Vercel rewrites defined in `vercel.json` for `/api/integrations/gmail/*`. The server-side Google OAuth authorization-code flow uses PKCE and requests only `openid`, `userinfo.email`, and `gmail.send`; it cannot read the connected inbox. OAuth start and disconnect operations require the workspace `admin` role. The refresh token is encrypted with AES-256-GCM before it is written to Firestore, and access tokens are never persisted.

Register these exact redirect URIs on the Google OAuth web client:

```text
http://localhost:3000/api/integrations/gmail/callback
https://crm-companion.mercurycomputerslimited.com/api/integrations/gmail/callback
```

Configure the four server-only Firebase Functions secrets. Never paste secret values into source files or use `NEXT_PUBLIC_*` variables:

```bash
firebase functions:secrets:set GMAIL_OAUTH_CLIENT_ID --project ledger-ai-d1931
firebase functions:secrets:set GMAIL_OAUTH_CLIENT_SECRET --project ledger-ai-d1931
openssl rand -base64 48 | firebase functions:secrets:set GMAIL_OAUTH_STATE_SECRET --data-file=- --project ledger-ai-d1931
openssl rand -base64 32 | firebase functions:secrets:set GMAIL_TOKEN_ENCRYPTION_KEY --data-file=- --project ledger-ai-d1931
```

The state-signing and token-encryption values must be independent and must not reuse the OAuth client secret. Deploy the four HTTPS Functions with Firebase, then deploy the frontend and `vercel.json` through Vercel. Vercel proxies the registered custom-domain `/api/integrations/gmail/*` paths to Cloud Functions. For local OAuth testing on the registered localhost callback, use Vercel development mode so those rewrites are active:

```bash
npx vercel dev --listen 3000
```

Integration documents are stored at `workspaces/{workspaceId}/integrations/gmail`. Firestore clients are explicitly denied access; authenticated HTTPS Functions expose connection metadata only. Disconnect attempts Google revocation and removes the local encrypted token regardless of revocation outcome.
