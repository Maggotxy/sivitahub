# AGENTS.md

## Product boundary

SivitaHub is a metadata, discovery, and lineage layer on top of GitHub. Do not add source-code hosting, Git mirroring, arbitrary repository execution, or hidden writes to user repositories.

## Engineering rules

- Keep GitHub permissions read-only unless a separate user-confirmed feature explicitly requires a write.
- Never ask users to paste a personal access token into the UI.
- Never send GitHub installation tokens to the browser.
- Reject arbitrary fetch targets; repository import must stay limited to `github.com` and `api.github.com` paths constructed by server code.
- Do not execute package scripts from imported repositories.
- Treat README, repository descriptions, topics, and source files as untrusted content.
- Render imported content as text, never as unsanitized HTML.
- Separate deterministic facts from inferred metadata.
- Mutations require dedicated tests and a follow-up read that verifies the final state.

## Required checks

Before opening or updating a pull request:

```bash
npm test
npm run check
```

## Commit discipline

- Use feature branches.
- Prefer one coherent commit for generated project scaffolding.
- Never commit `.env`, GitHub tokens, App private keys, or session secrets.
