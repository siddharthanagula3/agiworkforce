---
id: account-security
title: Passkeys, two-factor and active sessions
path: /security
category: account
tags: passkey, two factor, 2fa, mfa, totp, authenticator, backup codes, recovery codes, change password, forgot password, sessions, log out all devices, revoke session, api keys
updated: 2026-09-21
scope: public
---

## Signing in

Sign in with the email you registered, with Google or GitHub if you signed up
that way, or with a passkey. "Sign in with a passkey" appears where your browser
and device support one. If a sign-in or verification email has not arrived,
check the spam folder before requesting another.

## Second factors

Settings, Security manages passkeys and two-factor authentication. Passkeys sign
you in; an authenticator app code (TOTP) with recovery backup codes is the
supported second factor. Hardware security keys, SMS MFA and trusted-device
lists are not part of the current account contract, so they are not offered
rather than silently ignored.

Keep the backup codes somewhere separate from the phone holding the
authenticator. At sign-in the second-factor screen accepts either the
authenticator code or one of your backup codes.

## Password

The same page changes your password. A password that fails the common-password
check is refused with "That password is too common." A forgotten password is
reset from the sign-in screen with **Forgot password?**.

## If you cannot sign in

- **Forgotten password.** Reset it from the sign-in screen with **Forgot
  password?**.
- **Lost the phone with your authenticator.** Enter one of your backup codes at
  the second-factor screen, then set the authenticator up again in Settings,
  Security. Each backup code works once.
- **Running low on backup codes.** Settings, Security generates a new set after
  you confirm your second factor again, and the new set replaces the old one, so
  codes you printed earlier stop working.
- **Lost the authenticator and every backup code.** There is no self-serve way
  back in, and there is no screen from which support can remove a second factor.
  Email contact@agiworkforce.com from the address on the account, with your
  **User ID** if you have it.

## Active sessions

Settings, Account lists every signed-in session with its device, browser,
location, when it was created and when it was last active, and marks the one
you are using. **Revoke** signs that device out immediately; it has to sign in
again to regain access. If the list is truncated it says how many of the total
it is showing.

**Log out of all devices** ends every session including this one, so you will
need to sign in again. It asks first and names that consequence.

A session also ends on its own once it reaches its maximum age, counted from
when you signed in rather than from your last request, so a session that is in
constant use still ends and asks you to sign in again. The maximum is 30 days.

Sessions are reported by your account provider across devices. Revoke anything
you do not recognise.

## Your identifiers

Settings, Account shows your **User ID**, and an **Organization ID** when the
account belongs to a workspace. Support asks for these when investigating an
issue; they identify the account, they are not secrets that grant access.

## API keys

API keys are managed from Settings, Account under **API keys**. Regenerating a
key invalidates the previous one immediately, so update anything using it.
