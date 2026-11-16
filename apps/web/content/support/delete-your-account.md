---
id: delete-your-account
title: Delete your account, or cancel a scheduled deletion
path: /privacy
category: account
tags: delete account, close account, erase, deletion, cancel deletion, undo deletion, permanently delete, account erasure, remove my data
updated: 2026-11-15
description: How to delete your account on the web or in the AGI Mobile app, what is deleted and what is kept, how to cancel a scheduled deletion and how to delete conversations without deleting the account.
scope: public
---

## Delete your account on the web

You can delete your AGI Mobile account here on the web, without the app. Sign
in at [agiworkforce.com/settings/account](https://agiworkforce.com/settings/account)
with the account you use in the app and choose **Delete account**. It is the
same request the app makes, with the same cancellation window.

If you cannot sign in, email
[{{CONTACT.email}}](mailto:{{CONTACT.email}}?subject=Privacy%20request) from
your account address with the subject line "Privacy request", or use the form
at [agiworkforce.com/privacy/requests](https://agiworkforce.com/privacy/requests),
which gives you a reference. Requests are worked by a person, not by an
automatic process.

If you created the account in the iPhone app with Sign in with Apple and the
sign-in page here has no Apple button, use the form at
[agiworkforce.com/privacy/requests](https://agiworkforce.com/privacy/requests),
choose Erasure and say in the details that you signed up with Apple.

## How deletion works

Settings, Account carries **Delete account**, marked "This cannot be undone."
Confirming requires typing `DELETE` into the dialog. The dialog states what
happens: your account and its Cloud data are scheduled for permanent deletion,
and erasure starts after a cancellation deadline 24 hours later. It also says
that anything the law or an active legal hold requires us to keep is kept.

In the AGI Mobile app for iPhone and Android, Settings, Account carries
**Delete Account**.

After you confirm, the dialog shows the date and time the 24 hours are up, and
you are signed out when you continue. That is the earliest moment erasure can
begin, not the moment it finishes: the job that erases accounts runs once a day,
so the work starts on the first daily run after that deadline passes.

If an active legal hold covers your account, for example one your workspace has
placed, nothing is erased until the hold is released.

## What is deleted and what is kept

The daily job erases your user-scoped records and stored objects and deletes
your identity at our authentication provider. Section 05 of the
[privacy policy](https://agiworkforce.com/privacy#s-05) holds the full retention
schedule and says why each of these is kept after erasure:

- Security and organisation audit log entries naming you. Erasure does not purge
  them. The security audit log keeps an entry for 90 days. Organisation audit log
  entries have no automatic end date: a separate privileged routine exists to
  purge them, and it is not part of the automatic path.
- A record that you were erased, so the system can tell that you must stay
  erased.
- Double-charge protection keys, deleted once their 24-hour window closes, and
  any payment still moving when you delete.
- Rows that belong to an organisation rather than to you, such as its billing
  ledger row with your user id removed. Books of account are kept
  {{RETENTION.statutoryRecordYears}} years and then deleted.
- Stripe's own record of your payments and invoices, under Stripe's retention.
- Platform logs and database or object-storage snapshots, retained according to
  our hosting vendors' own configuration.

## Changing your mind

The 24 hours are a real cancellation window, not a formality. Sign back in
before the deadline and Settings, Account shows **Account deletion scheduled**
with the erasure time and a **Cancel deletion** button. Cancelling keeps the
account active and removes nothing. If deleting the account stops your web plan
from renewing, cancelling the deletion turns its renewal back on.

Once the window closes the button is gone and the page says the cancellation
window has closed and erasure is already underway.

## If you signed in with Apple

Apple keeps AGI Mobile in the list of apps that use Sign in with Apple until you
remove it there. On iPhone, open Settings, tap your name, tap **Sign in with
Apple**, choose the app and tap **Delete**. Apple's guide is
[Manage your apps with Sign in with Apple](https://support.apple.com/en-us/102571).

## Before you confirm

Export your conversations first. The export is a self-service download from
Settings, Privacy, and it cannot be run once the account is gone.

If your plan is billed on the web and still renews, deleting your account turns
its renewal off, so you are not charged again. If you bought the plan from Apple
or Google, deleting your account does not cancel it: the confirmation says so
and links to the page where you cancel it with the store. A plan you have already cancelled does not block deletion: it ends when
erasure runs, and its unused time is not refunded. While a payment on the plan
is still being collected, the request is refused and nothing is scheduled.

If you are the only owner of a workspace, the request is refused and nothing is
scheduled. The message names every workspace you own alone, so hand each one to
another owner or delete it first, then try again.

## Deleting conversations without deleting the account

Settings, Privacy has narrower controls for the workspace you are currently
using. **Archive all chats** moves that workspace's chats out of the sidebar and
can be undone from Archived chats. **Delete all chats** moves that workspace's
active and archived conversations to Recently deleted, where you can restore
them. Both ask first and name the current-workspace scope.
