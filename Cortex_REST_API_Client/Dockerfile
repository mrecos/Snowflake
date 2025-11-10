# Snowpark Container Services - Cortex Agent REST API Client
# Base image: Node.js 18 on Alpine Linux for minimal size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY backend/package*.json ./
RUN npm ci --production --silent

# Copy application code
COPY backend/server.js ./
COPY public/ ./public/

# Expose port 8080 (SPCS standard)
EXPOSE 8080

# Set environment variable for port
ENV PORT=8080

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start the server
CMD ["node", "server.js"]

