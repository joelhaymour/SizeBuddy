FROM node:22-slim

# Install system deps needed for sqlite3/node-gyp prebuilds
RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make g++ ca-certificates && \
  rm -rf /var/lib/apt/lists/*

ARG SHOPIFY_API_KEY
ENV SHOPIFY_API_KEY=$SHOPIFY_API_KEY
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Install backend deps first for better caching
COPY web/package*.json ./
RUN npm ci --omit=dev

# Copy backend code and frontend
COPY web ./

# Build frontend
WORKDIR /app/frontend
RUN npm ci --omit=dev && npm run build

# Back to backend workdir to start server
WORKDIR /app
EXPOSE 3000
CMD ["npm", "run", "serve"]
