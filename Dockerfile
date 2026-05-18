FROM node:20-alpine

WORKDIR /app

# Copy package files first (layer caching — only reinstalls if deps change)
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

EXPOSE 3000

# Use non-root user for security
USER node

CMD ["node", "src/app.js"]