FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
# Install native deps (sharp, canvas) at runtime stage
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY dataset/ ./dataset/
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
