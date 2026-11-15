# SHEABLISS ORGANICS — GoDaddy deployment

This repository is prepared for a GoDaddy cPanel Node.js application. The current server is a Node.js ESM application with `server.mjs` as its startup file, `npm start` as its production command, `npm run build` as its build command, and `/_app/health` as its health endpoint.

## 1. Create the MySQL database in GoDaddy

In GoDaddy cPanel, open **MySQL Databases** and create:

- One database for SHEABLISS.
- One dedicated database user with a strong password.
- Full privileges for that user on the SHEABLISS database.

Record the exact cPanel-generated database name, username, host, port, and password. GoDaddy commonly prefixes database and user names with the cPanel account name. Do not use the labels shown in this document as literal values.

Construct `DATABASE_URL` in this form:

```text
mysql://DB_USER:DB_PASSWORD@DB_HOST:3306/DB_NAME
```

URL-encode reserved characters in the password, especially `@`, `:`, `/`, `#`, `?`, and `%`. The application creates the `yoco_orders` and `yoco_webhook_events` tables on first server use. It does not require a build-time database connection.

## 2. Create the Node.js application

In cPanel **Setup Node.js App** (the exact label can vary by GoDaddy plan), create an application with:

- Node.js: **20.x or newer, below 23**
- Application mode: **Production**
- Application root: the directory containing `package.json` and `server.mjs`
- Application URL: the SHEABLISS domain or subdomain
- Startup file: `server.mjs`
- Environment variable: `PORT` supplied by GoDaddy, if the panel supplies one; otherwise use `3000`

Deploy the GitHub repository into the application root. Do not upload `.env`, real credentials, or a database dump into the repository.

Install and build from the application root:

```bash
npm ci
npm run build
```

If cPanel's application panel has a dependency-install button, use that instead of running package installation manually. The production process is:

```bash
npm start
```

The server listens on `0.0.0.0` and honors GoDaddy's `PORT` value. Verify:

```text
https://YOUR_DOMAIN/_app/health
```

It should return JSON containing `{"ok":true}`.

## 3. Add environment variables in cPanel

Add these through the Node.js application's environment-variable panel. Never put values in GitHub, JavaScript, HTML, or chat.

| Variable | Required | Value |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `PORT` | Usually supplied by host | GoDaddy-assigned port, or `3000` if the panel requires a value |
| `DATABASE_URL` | Yes | GoDaddy MySQL connection URL |
| `YOCO_SECRET_KEY` | Yes for checkout | Yoco Production secret key |
| `YOCO_WEBHOOK_SECRET` | Yes for verified payments | Yoco Production webhook secret |
| `GMAIL_SMTP_USER` | Yes for email | `SHEABLISS8@gmail.com` |
| `GMAIL_SMTP_APP_PASSWORD` | Yes for email | Gmail App Password, not the normal password |
| `BOBGO_API_KEY` | Not yet | Add after the Bob Go adapter is implemented |
| `BOBGO_WEBHOOK_SECRET` | Not yet | Add after the Bob Go adapter is implemented |
| `BOBGO_BASE_URL` | Not yet | `https://api.sandbox.bobgo.co.za` for Sandbox |

After changing environment variables, restart the Node.js application from cPanel.

## 4. Webhooks and DNS

Once the new domain serves the application, update the provider webhook URLs:

- Yoco: `https://YOUR_DOMAIN/api/yoco/webhook`
- Bob Go, once enabled: `https://YOUR_DOMAIN/api/bobgo/webhook`

Point the domain or subdomain DNS to the GoDaddy hosting account, enable HTTPS, and test the health endpoint before changing payment webhooks. Keep the existing Manus deployment active until the GoDaddy copy has passed checkout and email testing.

## 5. Safe migration order

1. Create the GoDaddy MySQL database and application.
2. Deploy the private GitHub repository.
3. Add environment variables in cPanel.
4. Restart the Node.js app and verify `/_app/health`.
5. Verify that the storefront and `/cookies.html` load.
6. Test Yoco with the appropriate test credentials before switching the new host to live credentials.
7. Confirm one customer confirmation email and one internal order email for a paid test order.
8. Register the new Yoco webhook URL and verify a webhook reaches the new host.
9. Add Bob Go Sandbox credentials only after the Bob Go adapter is deployed.
10. Switch to production Bob Go and Yoco credentials after successful Sandbox verification.

## 6. Do not commit

Never commit `.env`, database passwords, Yoco keys, Yoco webhook secrets, Gmail App Passwords, Bob Go keys, or database exports. The repository includes `.env.example` only as a names-and-format template.

## Customer accounts and wishlists

Customer profiles, wishlist rows and account-session security records use the MySQL database. Run the additive account migration after configuring the target database and before serving account requests:

```bash
node scripts/migrate-accounts.mjs
```

Account sign-in now uses Manus OAuth. A GoDaddy transfer is **not complete for accounts merely because Node.js, Yoco and Gmail are configured**. Verify continued availability of the project OAuth client, the identity API, the project signing secret, and acceptance of the new HTTPS callback URL (`https://YOUR_DOMAIN/api/account/callback`). Platform-provided authentication values include `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_OAUTH_API_URL`, and the protected `MANUS_JWT_SECRET`; do not put any signing secret in the repository or treat the provider redirect policy as guaranteed for a new host. If the new host cannot use this OAuth client, choose and explicitly configure a portable authentication provider before enabling customer accounts there.

Transfer the account tables together with the existing order tables using a secure database export/import, not through Git. Verify sign-in, explicit customer registration, saved profile edits, ownership checks, sign-out and account-only wishlist visibility on the new domain. Use HTTPS and the application's secure cookies; do not weaken session validation or cookie security to make a migration work.
