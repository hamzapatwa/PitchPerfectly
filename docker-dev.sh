#!/bin/bash
# Helper script to start Karaoke Arcade in DEVELOPMENT mode with Docker

echo "🎤 Karaoke Arcade - Development Mode"
echo "===================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo ""
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed!"
    exit 1
fi

# Use 'docker compose' (v2) if available, fallback to 'docker-compose' (v1)
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

echo "🔧 Starting development environment..."
echo ""
echo "This will:"
echo "  • Mount your source code for live reloading"
echo "  • Run dev servers (Vite + Node watch mode)"
echo "  • Expose ports 3000 (frontend) and 8080 (backend)"
echo ""

# Stop any existing containers that might conflict
echo "🛑 Stopping any existing containers and cleaning up networks..."
$COMPOSE_CMD -f docker-compose.dev.yml down --remove-orphans 2>/dev/null || true
$COMPOSE_CMD down --remove-orphans 2>/dev/null || true
docker stop karaoke-arcade karaoke-backend-dev karaoke-frontend-dev 2>/dev/null || true
docker network prune -f > /dev/null 2>&1 || true
echo ""

# Check if image exists, if not build it
if [ "$1" == "--build" ] || ! docker images | grep -q karaoke-arcade-skeleton-backend; then
    echo "📦 Building Docker image (this may take 10-15 minutes on first run)..."
    $COMPOSE_CMD -f docker-compose.dev.yml build
    if [ $? -ne 0 ]; then
        echo "❌ Build failed!"
        exit 1
    fi
    echo ""
fi

# Start the containers (using only dev compose file to avoid conflicts)
echo "🚀 Starting development containers..."
$COMPOSE_CMD -f docker-compose.dev.yml up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start containers!"
    exit 1
fi

echo ""
echo "✅ Development environment is running!"
echo ""
echo "🌐 Access the app:"
echo "   Frontend (Vite): http://localhost:3000"
echo "   Backend API:     http://localhost:8080"
echo ""
echo "📝 Development tips:"
echo "   • Edit files in ./frontend or ./backend - changes will hot-reload"
echo "   • Frontend changes: Instant via Vite HMR"
echo "   • Backend changes: Auto-restart via Node --watch"
echo ""
echo "📖 Useful commands:"
echo "   $COMPOSE_CMD -f docker-compose.dev.yml logs -f    # View all logs"
echo "   $COMPOSE_CMD -f docker-compose.dev.yml logs -f backend    # Backend logs only"
echo "   $COMPOSE_CMD -f docker-compose.dev.yml logs -f frontend   # Frontend logs only"
echo "   $COMPOSE_CMD -f docker-compose.dev.yml down       # Stop containers"
echo "   $COMPOSE_CMD -f docker-compose.dev.yml restart    # Restart containers"
echo ""
echo "Press Ctrl+C to stop viewing logs (containers will keep running)"
echo ""

# Show logs
$COMPOSE_CMD -f docker-compose.dev.yml logs -f

