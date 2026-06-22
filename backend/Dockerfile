FROM node:20-alpine

WORKDIR /app

# Copy package files first so Docker can cache the npm install layer
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy source code (node_modules and .env excluded by .dockerignore)
COPY . .

# Render assigns the PORT env var dynamically
EXPOSE 5000

# Run as non-root user for security
USER node

CMD ["node", "server.js"]
