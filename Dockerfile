# One image for every backend service; docker-compose picks the command per service.
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY database/package.json database/
COPY backend/api-gateway/package.json backend/api-gateway/
COPY backend/auth-service/package.json backend/auth-service/
COPY backend/crm-mock/package.json backend/crm-mock/
COPY backend/helpdesk-mock/package.json backend/helpdesk-mock/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY backend backend
COPY database/migrate.js database/
COPY database/migrations database/migrations
COPY database/seeds database/seeds

USER node
CMD ["node", "backend/api-gateway/src/server.js"]
