# Contributing

## Prerequisites

- Windows 10/11
- Node.js LTS (>= 20)

## Setup

```bash
npm install
```

## Development Workflow

1. Create a branch from `main`.
2. Make focused changes.
3. Run quality gates locally.
4. Open a pull request with context and test evidence.

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

## Coding Expectations

- Keep TypeScript strict and ESLint clean.
- Add tests for behavior changes.
- Do not log secrets, tokens, or private identifiers.
- Prefer small, composable functions and explicit naming.

## Pull Request Checklist

- [ ] Behavior is documented in `README.md` if user-facing.
- [ ] New logic has unit tests.
- [ ] Coverage remains at or above project threshold (`.c8rc.json`).
- [ ] No sensitive data was added to the repository.
