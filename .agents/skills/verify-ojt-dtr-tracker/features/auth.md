# Auth

Auth lets a user create an account, stay signed in across reloads, sign out, and sign back in. The API issues a session token that the browser stores and sends with every request.

## Sub-features

- `auth-register` creates an account and lands on the Dashboard.
- `auth-session` keeps the signed-in user across a full page reload.
- `auth-logout` clears the stored session and returns to the sign-in form.
- `auth-login` accepts the same credentials again.

## How to get to it (user POV)

- Open `http://127.0.0.1:5180/` to reach the sign-in form.
- Choose `Register` under the form to switch to account creation.
- Choose `Logout` in the sidebar while signed in.
- Submit the sign-in form with an existing username and password.

## Driving it with verify.mjs

Preconditions:

- The isolated stack is healthy: `npm run verify -- doctor` passes.
- The browser starts signed out.

Run `npm run verify -- run auth`. The journey performs every action below and writes evidence to `output/verification/<runId>-auth/`.

- **Open the form.** Visit `/`. The heading reads `Welcome Back`. Evidence: `01-login-page.png`.
- **Switch to registration.** Choose `Register` (`#switch-mode`). The heading reads `Create Account`.
- **Register.** Fill `#auth-user` with `verify_<runId>` and `#auth-pass` with a password of at least 8 characters, then choose `Create Account`. The Dashboard heading appears and `localStorage` holds both `dtr_user_id` and `dtr_auth_token`. Evidence: `02-account-created.png`.
- **Reload.** Reload the page. The Dashboard still renders and no form appears. Evidence: `03-session-survives-reload.png`.
- **Log out.** Choose `Logout` in the sidebar (`#btn-logout`). The heading reads `Welcome Back` and `dtr_auth_token` is absent. Evidence: `04-logged-out.png`.
- **Sign in again.** Submit the same credentials. The Dashboard appears. Evidence: `05-signed-in-again.png`.

Proof: `result.json` has `"ok": true`, `data.sessionPersisted` and `data.logoutClearedSession` are both `true`, and all five screenshots exist.

## Gotchas

- Usernames are lowercased and limited to letters, numbers, dot, underscore, and hyphen. Passwords must be 8 to 128 characters.
- The session token is a credential. Never copy it into evidence or a report. The harness redacts token query parameters from failed requests.
- The `/api/sync` event stream aborts when the page navigates or closes. The harness filters that expected abort.
- Refreshing an already signed-in browser skips the sign-in form by design. The journey clears the session by driving logout, not by deleting storage.
