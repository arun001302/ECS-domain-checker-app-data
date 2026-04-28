# ── Stage 1: Builder ──────────────────────────────────────────────────────
# Node is only needed to run Vite and compile React — not to serve it.
# The output is just static HTML/CSS/JS files.
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files first for layer caching (same principle as backend)
COPY package.json package-lock.json* ./

# Clean install — uses exact versions from lockfile, safer for CI
RUN npm ci

# Copy source and build
# Vite outputs to /app/dist — a folder of pure static files
COPY index.html .
COPY vite.config.js .
COPY src/ ./src/

RUN npm run build


# ── Stage 2: Runner ───────────────────────────────────────────────────────
# Nginx is a high-performance static file server — ~23MB image.
# Node.js is NOT present in this final image at all.
# This is the key multi-stage win: Node was ~400MB, final image is ~30MB.
FROM nginx:alpine AS runner

# Remove the default nginx page
RUN rm -rf /usr/share/nginx/html/*

# Copy the built React app from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config — critical for React Router and ALB health checks
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]