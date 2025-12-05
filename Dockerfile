# Multi-stage Dockerfile for Karaoke Arcade with GPU support
# Supports NVIDIA CUDA GPUs with automatic CPU fallback
FROM python:3.11-slim as base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    ffmpeg \
    libffi-dev \
    libsndfile1 \
    git \
    cmake \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

WORKDIR /app

# Copy Python dependencies first for better caching
COPY python/requirements.txt /app/python/requirements.txt

# Install PyTorch with CUDA support (includes CPU fallback)
# This version works with both CUDA 11.8+ and CPU-only environments
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install remaining Python dependencies
RUN pip install --no-cache-dir -r python/requirements.txt

# Copy Python scripts
COPY python/ /app/python/

# Copy backend package files and install
COPY backend/package*.json /app/backend/
RUN cd /app/backend && npm ci --production

# Copy backend code
COPY backend/ /app/backend/

# Copy frontend package files and install
COPY frontend/package*.json /app/frontend/
RUN cd /app/frontend && npm ci

# Copy frontend code
COPY frontend/ /app/frontend/

# Build frontend
RUN cd /app/frontend && npm run build

# Copy other necessary files
COPY schemas/ /app/schemas/

# Create necessary directories
RUN mkdir -p /app/songs /app/sessions /app/backend/uploads /app/backend/references

# Final stage
FROM python:3.11-slim

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs

WORKDIR /app

# Copy Python dependencies
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=base /usr/local/bin /usr/local/bin

# Copy application code
COPY --from=base /app/python /app/python
COPY --from=base /app/backend /app/backend
COPY --from=base /app/frontend/dist /app/frontend/dist
COPY --from=base /app/schemas /app/schemas
COPY --from=base /app/frontend/public /app/frontend/public

# Create directories
RUN mkdir -p /app/songs /app/sessions /app/backend/uploads /app/backend/references

# Expose port
EXPOSE 8080

# Set environment variables with auto device detection
ENV DEVICE=auto
ENV PORT=8080

# Create startup script with GPU detection
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "🎤 Starting Karaoke Arcade in Docker..."\n\
echo "===================================="\n\
echo ""\n\
\n\
# Detect GPU availability\n\
if command -v nvidia-smi &> /dev/null; then\n\
    echo "GPU Detection:"\n\
    nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true\n\
    echo ""\n\
    if [ "$DEVICE" = "auto" ]; then\n\
        echo "NVIDIA GPU detected - will use CUDA acceleration"\n\
        export DEVICE=cuda\n\
    fi\n\
else\n\
    if [ "$DEVICE" = "auto" ]; then\n\
        echo "No GPU detected - using CPU mode"\n\
        export DEVICE=cpu\n\
    fi\n\
fi\n\
\n\
echo "🔧 Device mode: $DEVICE"\n\
echo ""\n\
\n\
# Create Python venv for compatibility (even though packages are global)\n\
if [ ! -d "/app/python/.venv" ]; then\n\
    echo "📦 Creating Python virtual environment..."\n\
    python3 -m venv /app/python/.venv\n\
    # Link the global packages to the venv\n\
    ln -s /usr/local/lib/python3.11/site-packages/* /app/python/.venv/lib/python3.11/site-packages/ 2>/dev/null || true\n\
fi\n\
\n\
# Start the server\n\
echo "🚀 Starting server on port $PORT..."\n\
cd /app/backend\n\
exec node server.js\n\
' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]

