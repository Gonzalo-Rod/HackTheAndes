# PeruRoad Climate

Climate and road-risk information for the Carretera Central, built for Hack the
Andes 2026. The product scope and team responsibilities are in the
[Team Plan](docs/team-plan.md).

The first implementation is the **SUTRAN source adapter**. It reads and validates
official alerts and per-alert history and returns typed records. Database
ingestion, scheduled polling, and the Next.js application are not implemented yet.

## Development

Requires **Node.js 24.3 or newer** and npm. No credentials are needed for the
adapter's public SUTRAN endpoints.

```sh
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
```

Vitest tests run offline against captured public responses and controlled error
cases. PR CI also runs ESLint, Prettier, TypeScript checks, and Gitleaks. Keep
changes on a feature branch and merge only after passing CI and teammate review.
Run one explicit live check with:

```sh
npm run sutran:check
```

The live check prints a normalized PE-22 batch. It does not store records, start
a timer, or change incident state. It exits unsuccessfully on an upstream failure
or rejected records. Network access is required only for installation and the
live check.

## Documentation

- [SUTRAN adapter](docs/data/sutran-adapter.md): contract, module boundaries,
  integration example, source behavior, and remaining work.
- [Event reference](getting-started/README.md): track, rubric, and deliverables.
- [Progress log](getting-started/PROGRESS.md): short factual updates.
- [Agent instructions](AGENTS.md): language, required reading, and logging rules.
