---
id: account-security
title: Passkeys, two-factor and active sessions
path: /security
category: account
tags: passkey, two factor, 2fa, mfa, totp, authenticator, backup codes, recovery codes, change password, forgot password, sessions, log out all devices, revoke session, api keys
updated: 2026-09-17
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

## Active sessions

Settings, Account lists every signed-in session with its device, browser,
location, when it was created and when it was last active, and marks the one
you are using. **Revoke** signs that device out immediately; it has to sign in
again to regain access. If the list is truncated it says how many of the total
it is showing.

**Log out of all devices** ends every session including this one, so you will
need to sign in again. It asks first and names that consequence.

Sessions are reported by your account provider across devices. Revoke anything
you do not recognise.

## Your identifiers

Settings, Account shows your **User ID**, and an **Organization ID** when the
account belongs to a workspace. Support asks for these when investigating an
issue; they identify the account, they are not secrets that grant access.

## API keys

API keys are managed from Settings, Account under **API keys**. Regenerating a
key invalidates the previous one immediately, so update anything using it.
