# CartCheck documentation

CartCheck is a completed application as of October 6, 2026. These guides describe its delivered behavior and maintenance procedures.

Keep documentation here when it helps someone understand, run, maintain, or contribute to the application.

| Document | Purpose |
| --- | --- |
| [Product requirements](PRODUCT_REQUIREMENTS.md) | Approved behavior and acceptance criteria |
| [System design](architecture/SYSTEM_DESIGN.md) | Architecture, data model, API, and security boundaries |
| [Design system](design/README.md) | Interface tokens, components, and responsive behavior |
| [Database setup](MILESTONE_1_SETUP.md) | Local setup, migrations, TLS, and verification |
| [Migration guide](MIGRATIONS.md) | Multiple-list upgrade and coordinated release constraints |
| [Account email setup](ACCOUNT_EMAIL_SETUP.md) | Verification and password-recovery configuration |
| [Test safety](MILESTONE_7_TEST_SAFETY.md) | Guarded integration testing and cleanup |
| [Security and privacy checklist](SECURITY_CHECKLIST.md) | Verified controls, dependency findings, and open maintenance checks |

Course submissions, superseded planning documents, implementation reports, private release evidence, prototypes, and generated screenshots belong in the local Git-ignored `archive/`. Generated UI review output is also ignored at its existing tool output paths. Essential source code, tests, environment examples, and development tools remain versioned.

Archiving removes files from the next committed tree; earlier copies remain in Git history. The archive is local and needs a separate backup to retain it across machines.
