FROM node:20-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# The app initializes Mastra Postgres storage while Next.js collects page data.
# Runtime values from docker compose override these build-only placeholders.
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/smart_tender_review
ENV AUTH_SECRET=build-only-secret-build-only-secret-32
ENV AUTH_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV ALIBABA_API_KEY=build-only-placeholder

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]

