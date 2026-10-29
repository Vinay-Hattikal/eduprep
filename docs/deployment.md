# Going live

How to switch each development stand-in to the real service, and how to run the app in
production. Every switch is an environment variable (see [.env.example](../.env.example)); the
app refuses to start if a real driver is chosen without its keys, or if a development driver is
used with `APP_ENV=production`.

Status: all code paths below are built and tested with development drivers and faked provider
responses. **Each real service still needs one manual test with real keys before launch** (marked
☐ below).

---

## 1. Accounts (D-043): already real

Email + password sign-up with an emailed code, phone OTP sign-in, password reset and revocable
sessions are live code. Going live only needs:

- `AUTH_MODE=live` (removes the `/dev-login` picker; required in production).
- A strong `AUTH_SECRET` (32+ random bytes). Changing it signs everyone out.
- Real email (section 3) and SMS (section 4), so codes reach people.

☐ Sign up, sign in, reset a password and sign in by phone on staging with real email and SMS.

## 2. Payments: Razorpay (D-044)

1. Create a Razorpay account and finish KYC. Start with **test mode** keys (`rzp_test_…`).
2. Dashboard › Settings › API keys: set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
3. Dashboard › Settings › Payment capture: **automatic capture**.
4. Dashboard › Webhooks › Add: URL `https://<your-domain>/api/payments/webhook/razorpay`, events
   `payment.captured`, `payment.failed`, `refund.processed`, a strong secret, which goes into
   `RAZORPAY_WEBHOOK_SECRET`.
5. Set `PAYMENT_DRIVER=razorpay`.

How it works: checkout opens Razorpay in the page; its callback is checked (signature, then the
payment is fetched to confirm it's captured) and the webhook confirms it again; either one
grants access, once. Refunds from admin › Users call Razorpay's refund API.

☐ Test mode: buy Pro, a company pack and an interview credit; fail a payment; refund one.
☐ Switch to live keys only after the test-mode run passes.

Interviewer payouts stay manual (admin › Payouts records bank transfers) until Razorpay Route is
activated (plan 6.3).

## 3. Email: Resend (D-045)

1. Create a Resend account, add your domain and its DNS records (SPF, DKIM), wait for "verified".
2. Set `RESEND_API_KEY`, `EMAIL_FROM="<Brand> <no-reply@yourdomain.com>"`, `EMAIL_DRIVER=resend`.

☐ Sign up with a Gmail and an Outlook address; check the code arrives in the inbox, not spam.

## 4. SMS OTP: MSG91 (D-045)

Indian SMS needs DLT registration before anything is delivered.

1. Register the business (entity) and a sender ID (header) on a DLT portal (e.g. Jio, Vodafone Idea).
2. Register a **service-implicit** OTP template, for example:
   `{#var#} is your <Brand> code. It expires in 10 minutes. Do not share it.`
3. In MSG91, create a Flow (SMS) template linked to that DLT template ID, with the variable
   named `otp`. Put its template ID in `MSG91_OTP_TEMPLATE_ID`, your auth key in
   `MSG91_AUTH_KEY`, and set `SMS_DRIVER=msg91`.

☐ Sign in by phone on Jio, Airtel and Vi numbers.

## 5. WhatsApp: Cloud API (D-045)

1. Meta Business Manager › WhatsApp › add a phone number; get a permanent access token and the
   phone number ID.
2. Create and get approved a **utility** template named `account_update` (or set
   `WHATSAPP_TEMPLATE`) with body `{{1}}: {{2}}` (subject, message).
3. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_DRIVER=cloud`.

Messages go to users who have a phone number on their account.

☐ Book an interview with a phone-verified account; confirm the WhatsApp message.

## 6. Google Meet links (D-041)

1. Google Workspace account for the company (e.g. `interviews@yourdomain.com`).
2. Google Cloud: a service account with the Calendar API enabled; download its key.
3. Workspace admin › Security › API controls › Domain-wide delegation: allow the service
   account's client ID the scope `https://www.googleapis.com/auth/calendar.events`.
4. Set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (with `\n` line breaks),
   `GOOGLE_CALENDAR_OWNER=interviews@yourdomain.com`, `MEETING_DRIVER=google`.

☐ Book, move and cancel an interview; check both people get the calendar invite and Meet link.

## 7. Code judge: Judge0 (D-033)

Run Judge0 on its own VM (it needs privileged containers), using its official
docker-compose release, behind a firewall that only allows the worker's IP. Set
`JUDGE_DRIVER=judge0`, `JUDGE0_URL`, `JUDGE0_TOKEN` (Judge0's `AUTHN_TOKEN`).

☐ Run the problem checks (admin › Coding problems › Check in judge) for every problem.

## 8. Queue: Redis + BullMQ (D-046)

Optional at launch; the PostgreSQL queue handles thousands of jobs a day. With Redis, jobs start
instantly and several workers share the load. Set `REDIS_URL` (Upstash, a managed Redis or the
compose `redis` service) and `QUEUE_DRIVER=bullmq` for both the web app and the worker. The
`jobs` table stays the record (admin › Jobs and judge shows the same view).

☐ With Redis, submit code and book an interview; both finish within a few seconds.

## 9. Hosting (D-047)

The repository builds one Docker image ([Dockerfile](../Dockerfile)) used three ways: web
(`npm run start`), worker (`npm run worker`) and migrations (`npx prisma migrate deploy`).
[docker-compose.yml](../docker-compose.yml) runs PostgreSQL, Redis, migrations, web and worker
on one machine.

Options, simplest first:

| Option | What runs where | Good for |
|---|---|---|
| **One VM** (e.g. AWS Lightsail, DigitalOcean, Hetzner) in Mumbai/Bangalore | `docker compose up -d` with managed or local PostgreSQL; Judge0 on a second VM | Launch and the first few thousand users |
| **Managed platform** (Railway, Render, Fly.io) | Web and worker as two services from the same image; managed PostgreSQL and Redis; Judge0 on a VM | Less server upkeep |
| Vercel + VM (D-014) | Web on Vercel; worker, Redis, Judge0 on a VM | Later, if edge performance matters |

Whatever the choice:

- PostgreSQL 15+ with **UTF-8** encoding (D-037), daily backups, and a tested restore.
- Persistent storage for `.data/storage` (uploaded images), or move it to object storage (R2).
- HTTPS everywhere (the app sends HSTS when `APP_ENV` is staging or production).
- `GET /api/health` for the load balancer and uptime monitoring.
- Run migrations before starting the new version.

☐ Restore last night's backup into a scratch database once before launch.

## 10. Search engines and public pages (D-058)

- [ ] Set `NEXT_PUBLIC_APP_URL` to the real domain: canonical links, sitemaps and structured data use it.
- [ ] Add the site to Google Search Console and Bing Webmaster Tools; submit `/sitemap.xml` and
      `/sitemaps/questions` (both are also listed in `/robots.txt`).
- [ ] The host must send `X-Forwarded-For`. The public-page rate limit (60 pages a minute per
      visitor, 300 for search crawlers, 300 for link preloads) counts from the **right** end,
      which our own proxies write, so a forged value on the left doesn't help a scraper. Set
      `TRUSTED_PROXY_HOPS` to the number of public proxies in front of the app (1 = just the
      host, 2 = a CDN such as Cloudflare in front of it). With several app servers, move the
      limit to Redis or the CDN's rate limiting, because the built-in one is per server.
- [ ] Check a few pages in Google's Rich Results Test (breadcrumbs, quiz) after launch.

## 11. Before launch

- [ ] Every ☐ above done on staging.
- [ ] `APP_ENV=production`, `AUTH_MODE=live`, no `mock` or `outbox` drivers.
- [ ] Legal pages (`/terms`, `/privacy`, `/refund-policy`) reviewed by a lawyer; GSTIN and
      registered address added to invoices.
- [ ] Monitoring: error tracking (e.g. Sentry) and uptime checks on `/api/health`.
- [ ] Seeded test accounts removed, or their passwords never set (they can't sign in without
      `/dev-login`).
