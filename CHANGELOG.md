# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.0] - 2026-04-26

### Added

- Initial stable GitHub release metadata: MIT license, contribution guide, security policy, changelog, issue templates and PR template.
- GitHub Actions CI for backend tests, frontend install/test/build and Docker Compose config validation.
- Production Docker builds for backend and frontend.
- README sections for architecture, quick start, environment variables, security notes, tests, Docker usage, known limits and release checklist.

### Stable Scope

- Encrypted diary entries with browser-side AES-GCM encryption.
- Login, registration and 7-day same-browser session recovery.
- Local preview mode.
- Entry create, edit, favorite, soft delete, restore and permanent delete.
- Placeholder flow for future image support.

### Not Included

- Real image or attachment upload.
- Public production deployment.
- Cross-device decryption sync.
- Server-side plaintext search.
