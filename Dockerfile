# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY bun.lockb ./

RUN npm install -g bun
RUN bun install

COPY . .

RUN bun run build

# Production stage
FROM nginx:alpine

# Copy the built static files to nginx html directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration (optional, using default for now)
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80 (nginx default)
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]