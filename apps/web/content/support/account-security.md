---
id: account-security
title: Passkeys, two-factor and active sessions
path: /security
category: account
tags: passkey, two factor, 2fa, mfa, totp, authenticator, backup codes, recovery codes, change password, forgot password, sessions, log out all devices, revoke session, api keys
updated: 2026-09-28
scope: public
---

## Signing in

Sign in with the email you registered, with Google or GitHub if you signed up
that way, or with a passkey. "Sign in with a passkey" appears where your browser
and device support one. If a sign-in or verification email has not arrived,
check the spam folder before requesting another.

## Second factors

Settings, Security manages passkeys and two-factor authentication. Passkeys sign
you in. Authenticator apps (TOTP) and backup codes are temporarily unavailable:
Settings, Security shows **Temporarily unavailable** where you would set one up
or replace your backup codes, and a workspace cannot start requiring
multi-factor authentication until they return. Hardware security keys, SMS MFA
and trusted-device lists are not part of the current account contract, so they
are not offered rather than silently ignored.

## Password

The same page changes your password. Changing it requires your current password,
and a code from your authenticator app as well when two-factor authentication is
on. An account that signs in without a password can add one after confirming it
is you. Every other device signed in to the account is signed out when the
password changes. A password that fails the common-password check is refused
with "That password is too common." A forgotten password is reset from the
sign-in screen with **Forgot password?**.

## Email address

Settings, Account changes the email address on the account. The new address gets
a code to prove you own it, then you confirm it is you and it becomes the
address on the account. The previous address is removed unless a sign-in method
still uses it. Password resets and security notices go to the new address.

## Confirming it is you

Deleting the account, logging out of all devices, creating an API key, turning
two-factor authentication on or off, replacing backup codes and changing the
email address each requires you to confirm it is you, even when you are already
signed in. With two-factor authentication on, you confirm with your
authenticator app or a backup code; without it, you confirm with your password,
a passkey or a code sent to your email. A confirmation stays valid for up to 5
minutes, so a second change right after the first does not ask again.

## If you cannot sign in

- **Forgotten password.** Reset it from the sign-in screen with **Forgot
  password?**.
- **Lost the phone with your authenticator.** Enter one of your backup codes at
  the second-factor screen. Each backup code works once.
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

API keys are managed in the developer console at /developers, and from Settings,
Account under **API keys**. Regenerating a key invalidates the previous one
immediately, so update anything using it.
