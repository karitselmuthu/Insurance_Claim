FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
# Only ship the two reference CSVs the server reads at startup.
# Test images, sample claims, batch inputs, and eval data stay out.
COPY dataset/user_history.csv ./dataset/user_history.csv
COPY dataset/evidence_requirements.csv ./dataset/evidence_requirements.csv
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
