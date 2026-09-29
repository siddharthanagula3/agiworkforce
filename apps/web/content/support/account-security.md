---
id: account-security
title: Passkeys, two-factor and active sessions
path: /security
category: account
tags: passkey, two factor, 2fa, mfa, totp, authenticator, backup codes, recovery codes, advanced account security, security key, recovery key, change password, forgot password, sessions, log out all devices, revoke session, api keys
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
multi-factor authentication until they return. SMS MFA is not part of the
current account contract, so it is not offered rather than silently ignored.
Hardware security keys work with Advanced Account Security.

No device skips the sign-in checks. Devices you linked, such as the CLI, VS
Code, the Chrome extension or the desktop app, are listed in Settings, Account
under **Linked devices**, where you can unlink each one.

## Advanced Account Security

Advanced Account Security is an optional setting in Settings, Security for
accounts at higher risk of targeted attacks. Signing in needs one of your
passkeys or security keys. A password or an email code alone no longer gets in.
To turn it on, add at least two passkeys or security keys, including one that
works across devices, such as a passkey synced by your password manager or a
hardware security key, then save your recovery keys. Turning it on requires a
code we email to the address on your account and one of the passkeys or security
keys you added. It cannot be turned on within 7 days of the email address on
your account being set or changed. Every other device is signed out when you turn it
on. We also email the address that got the code a link that turns it off
without a passkey, for 48 hours after it was turned on, in case it was not you.
The link signs everyone out, resets your password and removes the passkeys,
security keys and recovery keys added when it was turned on.

Email account recovery no longer restores access. A recovery key starts
recovery, and the account unlocks 48 hours later. Each recovery key works once,
and replacing your recovery keys stops the old ones from working. Every new
sign-in is emailed to you, and each session has to be confirmed with your
passkey or security key again every 7 days. Your API keys keep working; review
them under **API keys** when you turn it on.

Turning it off asks you to confirm with one of your passkeys or security keys.
Your passkeys and security keys stay on the account, and your recovery keys are
removed. Advanced Account Security is not available for an account your
organization manages or for an account on a domain an organization has
verified.

## What support can do with Advanced Account Security on

AGI support cannot turn Advanced Account Security off, add a sign-in method,
change the email address or restore access for you. A recovery request sent to
support for such an account is not acted on; you are told that it was made,
and a recovery key is the only way back in.

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
- **Lost the authenticator and every backup code, or the email address.** Ask
  for account recovery at /recover. A person checks that the account is yours
  before removing the second factor or changing the sign-in email, the account
  owner is told a recovery was requested, and every other session is signed
  out when access is restored.
- **Lost every passkey and security key with Advanced Account Security on.** On
  the screen that asks for your passkey, choose to use a recovery key. We email
  you that recovery started, and you finish it on the same device once the 48
  hours are up. Then add a new passkey or security key and replace your
  recovery keys. Support cannot do this for you, and the link that turns the
  setting off works only for 48 hours after it was turned on; after that a
  passkey, a security key or a recovery key is the only way in.

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
