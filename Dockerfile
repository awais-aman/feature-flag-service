# syntax=docker/dockerfile:1

########################
# deps: install all dependencies (dev + prod) once, reused by build & dev stages
########################
FROM node:20-alpine AS deps
WORKDIR /app
# Prisma's query engine dynamically links libssl; alpine's musl base doesn't
# ship it by default, so `prisma generate`/migrate silently produce a
# non-JSON engine response without this.
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci

########################
# build: compile TypeScript and the Prisma client
########################
FROM deps AS build
WORKDIR /app
COPY . .
RUN npx prisma generate
RUN npm run build

########################
# production-deps: install only production dependencies, separately from the
# dev-inclusive `deps` stage, so nothing dev-only leaks into the final image
########################
FROM node:20-alpine AS production-deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

########################
# runtime: small, non-root, only what's needed to run the compiled app
########################
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl && addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY package.json ./

USER nestjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/main.js"]

########################
# development: full deps + source, used only by docker-compose for local dev
########################
FROM deps AS development
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]
