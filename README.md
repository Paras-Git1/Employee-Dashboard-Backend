# Employee Task Dashboard (backend)

Backend services for the Employee Task Dashboard.

## Local development

Requires Node.js 22+ and PostgreSQL 16+.

```bash
npm install
npm run setup   # creates local .env files and the local database
npm run dev
npm test
```

Configuration is read from environment variables; see the `.env.example` file in each service.

## Deployment

Pushes to `main` are tested and deployed automatically by the CI/CD workflow.
Deployment settings are kept outside this repository.
