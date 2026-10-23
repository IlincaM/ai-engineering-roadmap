# AI Engineering Roadmap — learning dashboard

Personal AI engineering learning dashboard in Romanian, tailored to .NET/C#: **12 weeks, 60 activities, 6 quizzes, official free learning resources and notes**.

## Open on laptop or phone

When GitHub Pages is enabled:

**https://ilincam.github.io/ai-engineering-roadmap/**

The site is static and free to host; each user's progress is saved locally and can be synchronized with Supabase after signing in using the same email on both devices.

## Current setup

- GitHub repository: https://github.com/IlincaM/ai-engineering-roadmap
- Supabase project: `pajthfuwxzptjgocsspt` (eu-west-1)
- `config.js` contains only **public** Supabase URL and publishable key.
- The `roadmap_progress` table and RLS policies **have already been applied** in Supabase; `supabase/001_progress.sql` is retained as documentation. Do not apply it a second time.
- Hosting and Supabase Auth redirect URLs need to be configured in the respective dashboards.

## One-time deployment actions

1. In [GitHub repository → Settings → Pages](https://github.com/IlincaM/ai-engineering-roadmap/settings/pages), choose **Build and deployment → Deploy from a branch**, branch **main**, folder **/(root)**, then Save.
2. In [Supabase Authentication → URL Configuration](https://supabase.com/dashboard/project/pajthfuwxzptjgocsspt/auth/url-configuration), set **Site URL** to `https://ilincam.github.io/ai-engineering-roadmap/` and add the same address to the **Redirect URLs** list.
3. In Supabase **Authentication → Providers → Email**, ensure email authentication is enabled. This app requests default magic links using `signInWithOtp`. Supabase's built-in email service is rate-limited and can restrict recipients; external SMTP may be required if emails are not delivered.
4. Open the published website on both devices, select **Conectare cont**, request an email link and open that link **on the same device**. Sign in with the **same email** on both devices.
5. Test: check an activity on laptop, wait for **✓ Sincronizat în cloud**, then open/refocus the site on the phone and verify that activity is checked there.

## How progress is synchronized

- Individual tasks, notes, quiz answers, quiz results and start date are stored as separate records.
- Progress is saved immediately to the browser and queued locally when offline.
- The client periodically refreshes cloud data and when the tab regains focus.
- Concurrent updates to the same item are detected by optimistic version checking. The app asks whether to keep the local or remote value.
- Use **Export progres** periodically for a JSON backup; you can import earlier local progress.

## Security

Supabase **Row Level Security** limits access to rows where `user_id = auth.uid()`. The frontend must **never** contain Supabase `service_role` / secret keys, database passwords or authentication tokens. Do not put sensitive information in notes. The code is publicly readable because it is on GitHub Pages.

The project is an educational personal dashboard, not a production learning management system. This repository is independent of Ever Ahead.
