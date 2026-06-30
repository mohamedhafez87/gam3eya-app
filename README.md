# Gam3eya Manager

A zero-dependency static web app for tracking gam3eya associations, members, monthly payments, and payout turns. Data is stored in the browser with `localStorage`.

## Run Locally

```bash
npm run dev
```

Open `http://127.0.0.1:4173/` or `http://localhost:4173/`.

The app can also be opened directly from `index.html` in many browsers, but the local server is recommended because browser security features can behave differently for `file://` pages.

## Publish on GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open the repository settings.
3. Go to **Pages**.
4. Set **Source** to **GitHub Actions**.
5. Push to the `main` branch, or run the **Deploy static site to GitHub Pages** workflow manually.

The published URL will normally be:

```text
https://USERNAME.github.io/REPO_NAME/
```

This app is already configured for repository-subpath hosting because `index.html` uses relative asset paths such as `src/styles.css` and `src/app.js`.

## Local Access Accounts

The GitHub Pages version supports local username/password access:

- First open creates an association admin account.
- Admins can manage associations, members, payments, turn order, and settings.
- Members can log in and see only their own personal info, payment status, current cycle, current receiver, and payment history.
- Passwords are stored as SHA-256 hashes using the browser Web Crypto API.

Existing `localStorage` data is migrated safely. Existing members remain visible and can have blank usernames until an admin updates them.

## Security Note

This GitHub Pages version is for personal/local tracking only. Static hosting cannot protect private data or passwords from a determined user. For real shared secure access, use a backend such as Supabase, Firebase, or a Node API with a database and server-side authentication.
