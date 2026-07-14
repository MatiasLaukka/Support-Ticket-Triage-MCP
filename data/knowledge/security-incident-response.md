---
id: security-incident-response
title: Security Incident Response
tags: security, credentials, api-keys, audit
---
# Security incident response

Security tickets involving API keys, private keys, credentials, unknown key
creation, or possible unauthorized access must be routed to the security team.
Useful evidence includes the key identifier or last four characters, where the
key or credential was shared, whether the key was used after exposure, whether
it has been rotated or revoked, audit source details, and the affected scope.

Ask for redacted logs, request IDs, source IP or actor if available, key
identifier without the secret value, exposure location, and rotation status. Do
not ask for live secrets, full keys, passwords, or unredacted private logs.
Preserve evidence and compare audit history before saying data was accessed or
that there was no exposure.

Customer-facing phrasing should explain containment review, ask for redacted
evidence, and avoid claiming unauthorized access until audit evidence supports
it. Recommend rotation or revocation only as a safety action, not as proof that
the key was used.
