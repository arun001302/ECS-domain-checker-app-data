# ── Stage 1: Builder ──────────────────────────────────────────────────────
# We use the full Python image here because we may need build tools
# (gcc, headers) to compile certain Python packages like pyOpenSSL
FROM python:3.11-slim AS builder

WORKDIR /app

# Copy only requirements first — Docker layer caching means if requirements.txt
# hasn't changed, this expensive pip install step is skipped on rebuild.
# This is a critical optimization for CI/CD pipeline build times.
COPY requirements.txt .

# Install into a local directory so we can copy just this folder to Stage 2
# --no-cache-dir keeps the layer smaller by not storing the pip cache
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── Stage 2: Runner ───────────────────────────────────────────────────────
# python:3.11-slim is ~45MB vs ~900MB for the full image
FROM python:3.11-slim AS runner

WORKDIR /app

# Security best practice: never run as root inside a container.
# In EKS you'd enforce this via PodSecurityPolicy/PSA.
# In ECS this is enforced here in the Dockerfile + task definition.
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy installed packages from builder stage only — no pip, no gcc, nothing else
COPY --from=builder /install /usr/local

# Copy application source code
COPY app.py .

# Switch to non-root user
USER appuser

# Document which port the app listens on (informational — ECS uses task def for actual mapping)
EXPOSE 5000

# Health check baked into the image itself.
# ECS will also define its own health check in the task definition,
# but having it here means you can test it with plain Docker too.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/health')"

# Gunicorn: production WSGI server
# --workers 2: 2 worker processes (good for 0.5 vCPU Fargate task)
# --bind 0.0.0.0:5000: bind to all interfaces inside the container
# --timeout 120: give DNS/SSL checks enough time to complete
# --access-logfile -: log to stdout so CloudWatch picks it up
# app:app means: from app.py, use the Flask object named app
CMD ["gunicorn", "--workers", "2", "--bind", "0.0.0.0:5000", "--timeout", "120", "--access-logfile", "-", "app:app"]