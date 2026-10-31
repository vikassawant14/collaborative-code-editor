
# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY Frontend/package*.json ./

RUN npm ci

COPY Frontend/ ./

RUN npm run build


# Stage 2: Backend server
FROM node:20-alpine

WORKDIR /app

COPY Backend/package*.json ./

RUN npm ci --omit=dev

COPY Backend/ ./

# Copy React production build
COPY --from=frontend-build /app/frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]

