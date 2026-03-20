FROM node:20-alpine

WORKDIR /app

# Copy backend
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy built frontend
COPY dist/ ./dist/

COPY backend/ ./backend/

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "server.js"]
