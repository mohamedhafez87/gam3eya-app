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

The app is configured for repository-subpath hosting because `index.html` uses relative asset paths such as `src/styles.css` and `src/app.js`.

## Local Access Accounts

Each association has its own local admin account:

- If an association has no admin yet, selecting it shows first-time admin setup.
- An admin can manage only the association they logged into.
- Creating a new association does not copy the current admin credentials. The new association requires its own admin setup.
- Members can log in only to the association where their username exists.
- Members see only their own personal info, payment status, current cycle, receiver, and payment history.

Passwords are stored locally as salted PBKDF2-SHA-256 password records through the browser Web Crypto API. Older SHA-256 password hashes are still accepted and are upgraded after a successful login.

Existing `localStorage` data is migrated safely. Associations, members, payments, turn order, old admin hashes, and old member hashes are preserved.

## Export and Import

Admins can export only the currently logged-in association.

- **Backup JSON** includes association data plus local auth password hashes/records. Use it to restore the association in the same browser or another personal device.
- **Share JSON** removes admin credentials, member password hashes/records, and member national IDs. Use it when sending non-auth association data to someone else.

To restore data, log in as an admin and choose **Import**. The app accepts Gam3eya backup/share JSON files or a single exported association object. If the imported association ID already exists, the app asks whether to replace the existing association or import it as a copy. Share imports without admin credentials will require first-time admin setup before management.

## Security Note

This GitHub Pages version is for personal/local tracking only. Static GitHub Pages/localStorage cannot protect private data or passwords from a determined user. For real shared secure access, use a backend/database such as Supabase, Firebase, or a Node API.
