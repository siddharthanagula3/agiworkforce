# Mobile Store Billing Boundary

Status: Accepted

Date: 2026-07-30

Owners: Mobile and Web billing

## Context

Mobile contained a StoreKit/Play Billing client, restore controls, a Web
receipt-verification endpoint, and provider adapters. The entire vertical slice
was unreachable behind a hard-disabled feature flag. Every product identifier
was explicitly a placeholder because the corresponding App Store Connect and
Google Play products do not exist.

Enabling the flag would therefore expose broken purchase controls. Keeping the
code also overstated readiness: neither store notification lifecycle, durable
reverification, real credential contract, nor sanctioned device/store sandbox
validation existed.

The current product decision still makes Basic IAP-first. Existing subscription
rows can also record Apple or Google as their historical owner.

## Decision

Remove the unreachable placeholder-backed purchase, restore, and verification
implementation as one vertical slice. Classify StoreKit purchase, Play Billing,
subscription restore, and receipt validation as Missing.

Do not cancel the IAP-first product decision. Reimplement the slice only after
real products and identifiers exist in both store consoles. The production
design must include server notification and reverification lifecycles,
idempotent receipt reconciliation, account-conflict policy, live credential
contracts, and sanctioned sandbox/device QA.

Retain read-only subscription source data and route entitled customers to the
management surface that owns their recorded plan. Retain the Web/Stripe
subscription path independently.

## Consequences

Mobile no longer ships a native purchase dependency, dormant purchase UI, or a
fake restore action. Web no longer advertises unused Apple/Google verification
environment variables or exposes an endpoint with no reachable caller.

Historical Apple/Google subscription records remain fail closed at their
recorded period boundary and can still be directed to the appropriate store
management page. Native store commerce remains explicit roadmap work with
external store-console prerequisites, not a claimed implementation.
