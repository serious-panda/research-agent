# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN node ace build

# Stage 2: Production runtime
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build .
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3333
CMD ["sh", "-c", "node ace migration:run --force && node bin/server.js"]
