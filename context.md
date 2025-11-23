# PitchPerfectly Karaoke Arcade - Complete Project Context

## High-Level Summary

PitchPerfectly is a local, offline karaoke web application that provides professional-grade vocal analysis and scoring for karaoke performances. The system processes karaoke videos with baked-in lyrics alongside original studio audio to create reference data for real-time vocal scoring. Users can upload song pairs, perform karaoke with live feedback, and compete on local leaderboards.

### Core Features Implemented

- **Video Karaoke Playback**: Plays MP4/WebM karaoke videos with frame-accurate timing using `requestVideoFrameCallback`
- **Advanced Audio Processing**: Demucs v4 vocal separation, torch-crepe pitch tracking, DTW alignment for sync handling
- **Real-time Scoring System**: 70% pitch accuracy + 30% energy matching with live visual feedback
- **Echo Cancellation**: NLMS adaptive filtering for speaker playback mode
- **Comprehensive Preprocessing Pipeline**: Automated reference data generation from uploaded content
- **Performance Analytics**: Detailed phrase-level scoring with post-run DTW refinement
- **Local Leaderboard**: SQLite-based score tracking with badge system
- **Retro Arcade UI**: Neon grid aesthetics with CRT shader effects

## Full Technical Architecture

### System Layers Overview

The application consists of four main layers:

1. **Frontend (React/Vite)**: Web interface with real-time audio processing
2. **Backend (Node.js/Express)**: API server, file handling, database management
3. **Python Processing Layer**: Audio analysis, vocal separation, alignment algorithms
4. **Storage Layer**: SQLite database, file system for media assets

### Inter-Layer Communication

- **Frontend ↔ Backend**: REST API calls for song management, session handling, leaderboard
- **Backend ↔ Python**: Child process spawning for preprocessing tasks
- **Frontend Audio Processing**: AudioWorklet for real-time pitch detection and echo cancellation
- **File Streaming**: HTTP range requests for efficient video playback

### Design Patterns

- **MVC Architecture**: Clear separation between UI components, API routes, and data models
- **Pipeline Pattern**: Sequential preprocessing stages with progress tracking
- **Observer Pattern**: Real-time audio processing with event-driven updates
- **Strategy Pattern**: Device-specific optimization (MPS/CUDA/CPU fallbacks)

## Complete Directory + File Breakdown

### Root Level Files

- **`README.md`**: Primary documentation with feature overview, installation, and usage
- **`QUICKSTART.md`**: User-focused setup guide with troubleshooting
- **`Dockerfile`**: Multi-stage containerization for production deployment
- **`docker-compose.yml`**: Production container orchestration
- **`docker-compose.dev.yml`**: Development environment with hot-reloading
- **`docker-dev.sh`**: Development startup script with Docker Compose v2 detection
- **`start.sh`**: Native installation startup script with prerequisite checking
- **`karaoke.db`**: SQLite database file (root-level backup/shared instance)

### Backend Layer (`/backend/`)

- **`server.js`**: Main Express application (918 lines)
  - Multer configuration for video/audio uploads (500MB limit)
  - SQLite database initialization and schema creation
  - REST API endpoints for song management, sessions, leaderboard
  - HTTP range support for video streaming
  - Child process management for Python preprocessing
  - CORS configuration for development

- **`package.json`**: Backend dependencies
  - `express ^4.18.2`: Web framework
  - `multer ^1.4.5-lts.1`: File upload handling
  - `sqlite3 ^5.1.6`: Database interface
  - `uuid ^9.0.1`: Unique identifier generation
  - `ws ^8.14.2`: WebSocket support (legacy, not actively used)

- **`karaoke.db`**: SQLite database with three tables:
  - `songs`: Track metadata, preprocessing status
  - `sessions`: Performance records with results
  - `leaderboard`: Player scores and rankings

- **`uploads/`**: Temporary storage for multipart file uploads
- **`references/`**: Legacy directory (not actively used)
- **`server.log`**: Application logs

### Frontend Layer (`/frontend/`)

#### Core Application Files

- **`src/App.jsx`**: Main application component (192 lines)
  - Screen state management (library → mic-check → karaoke → results)
  - Session lifecycle handling
  - API integration for backend communication
  - Player name and session ID tracking

- **`src/main.jsx`**: React application entry point
  - ReactDOM root mounting
  - Loading screen management
  - CSS imports

#### Component Architecture (`/frontend/src/components/`)

- **`VideoKaraokePlayer.jsx`**: Video playback engine (418 lines)
  - `requestVideoFrameCallback` for frame-accurate timing
  - HTTP range request support for large video files
  - Volume control and playback state management
  - Optional reference vocals playback
  - Session start/stop integration

- **`LiveHUD.jsx`**: Real-time scoring interface (878 lines)
  - AudioWorklet integration for pitch processing
  - NLMS echo cancellation implementation
  - Visual feedback: note lane, cents error bar, beat LEDs
  - Performance tracking and combo system
  - 70/30 pitch/energy scoring algorithm

- **`SongLibrary.jsx`**: Song browser and upload interface (138 lines)
  - Library browsing with metadata display
  - Song selection and detailed loading
  - Upload form integration
  - Preprocessing status polling

- **`MicCheck.jsx`**: Audio setup and testing (implementation details in component)
  - Microphone access and permission handling
  - Audio level monitoring
  - Optional motion tracking setup

- **`ResultsScreen.jsx`**: Performance analysis display
  - Score breakdown and grading
  - Badge system display
  - Leaderboard submission
  - Post-run DTW refinement trigger

- **`Leaderboard.jsx`**: Score ranking display
  - Local high score listing
  - Player name and score display
  - Badge visualization

#### Styling (`/frontend/src/styles/`)

- **`retro.css`**: Primary UI styling with neon/arcade theme
- **`video-karaoke.css`**: Video player and HUD-specific styles

#### Build Configuration

- **`vite.config.js`**: Vite build configuration
  - React plugin integration
  - Proxy setup for API calls
  - Manual chunking for vendor libraries (React, TensorFlow.js)
  - Docker networking compatibility

- **`package.json`**: Frontend dependencies
  - `react ^18.2.0`: UI framework
  - `@tensorflow/tfjs ^4.10.0`: Machine learning (motion tracking)
  - `vite ^4.4.5`: Build tool and dev server

#### Audio Processing Workers

- **`public/workers/pitch-processor-aec.js`**: AudioWorklet processor (283 lines)
  - Real-time pitch detection using YIN algorithm
  - NLMS adaptive echo cancellation
  - Energy and spectral centroid calculation
  - Frame-rate throttling for performance

#### Built Assets (`/frontend/dist/`)

- **`index.html`**: Production HTML entry point
- **`assets/`**: Compiled JavaScript and CSS bundles
- **`workers/`**: Compiled audio worklet processors

### Python Processing Layer (`/python/`)

- **`separate.py`**: Vocal separation engine (244 lines)
  - Demucs v4 model loading and inference
  - Apple Silicon MPS optimization
  - Multi-device support (MPS/CUDA/CPU)
  - Audio format handling and conversion

- **`preprocess_full.py`**: Comprehensive preprocessing pipeline (887 lines)
  - Audio extraction from video files
  - Vocal separation integration
  - DTW alignment between karaoke and reference audio
  - Pitch contour extraction with torch-crepe
  - Note binning and phrase segmentation
  - Reference data JSON generation

- **`refine_results.py`**: Post-performance analysis (290 lines)
  - Phrase-local DTW alignment
  - Improved accuracy calculation
  - Performance data refinement

- **`requirements.txt`**: Python dependencies
  - `torch>=2.0.0`: PyTorch with MPS support
  - `demucs>=4.0.0`: Vocal separation
  - `torchcrepe>=0.0.19`: Pitch extraction
  - `dtaidistance>=2.3.10`: DTW alignment
  - `librosa>=0.10.0`: Audio analysis
  - `soundfile>=0.12.0`: Audio I/O

### Data Storage Structure

#### Songs Directory (`/songs/<uuid>/`)

Each processed song creates a directory with:

- **`karaoke.mp4`**: Original karaoke video
- **`original_audio.{wav|mp3}`**: Studio reference audio
- **`karaoke_audio.wav`**: Extracted karaoke audio track
- **`vocals.wav`**: Separated vocal track from original
- **`accompaniment.wav`**: Separated instrumental track
- **`reference.json`**: Comprehensive scoring reference data

#### Sessions Directory (`/sessions/<uuid>/`)

Performance data storage:

- **`performance.json`**: Raw performance data
- **`refined.json`**: Post-processed results with DTW refinement

#### Reference Data Schema (`/schemas/reference.schema.json`)

JSON schema defining reference data structure (251 lines):

- Version 2.0 format specification
- DTW alignment mapping (`warp_T`)
- Pitch contour data (`f0_ref_on_k`)
- Note bins for discrete scoring
- Beat and phrase timing information
- Configuration parameters

### Demo Content

#### Demo Tracks (`/demo_tracks/`)

Sample content for testing:

- **`Adele - Someone Like You Official Music Video.mp3`**
- **`Only Girl (In the World) - Rihanna   Karaoke Version   KaraFun - 01.mp4`**
- **`Rihanna - Only Girl (In The World) (Lyrics) (1).wav`**
- **`Someone Like You - Adele | Karaoke Version | KaraFun.mp4`**

#### Assets (`/assets/badges/`)

SVG badge graphics:

- **`combo_king.svg`**: Longest accuracy streak
- **`mic_melter.svg`**: High energy performance
- **`on_beat_bandit.svg`**: Perfect rhythm accuracy
- **`smooth_operator.svg`**: Perfect pitch accuracy

## Data Flow + System Behavior

### Song Upload and Preprocessing Flow

1. **Frontend Upload**: User selects karaoke video + original audio via `SongLibrary` component
2. **Backend Reception**: Express server receives multipart upload via Multer
3. **File Storage**: Files saved to `/songs/<uuid>/` directory with standardized names
4. **Database Insert**: Song record created in SQLite with "pending" status
5. **Python Invocation**: Backend spawns `preprocess_full.py` child process
6. **Audio Extraction**: FFmpeg extracts audio from karaoke video
7. **Vocal Separation**: Demucs v4 separates vocals from original audio
8. **DTW Alignment**: Chroma feature alignment between karaoke and reference
9. **Pitch Extraction**: torch-crepe generates F0 contour from separated vocals
10. **Reference Generation**: Comprehensive JSON reference data created
11. **Status Update**: Database updated to "complete" with metadata
12. **Frontend Polling**: UI polls `/songs/:id/status` for completion

### Real-time Performance Flow

1. **Session Initialization**: Backend creates session record, returns session ID
2. **Audio Setup**: Frontend requests microphone access, initializes AudioContext
3. **WorkletLoader**: `pitch-processor-aec.js` loaded into AudioWorklet
4. **Video Playback**: `VideoKaraokePlayer` starts karaoke video with frame callbacks
5. **Audio Processing**: Continuous microphone input processed for:
   - NLMS echo cancellation (removes karaoke playback bleed)
   - YIN pitch detection (fundamental frequency estimation)
   - Energy calculation (RMS and LUFS)
   - Spectral analysis (brightness/timbre)
6. **Scoring Engine**: `LiveHUD` compares real-time data against reference:
   - Pitch accuracy: ±10 cents = perfect, ±50 cents = acceptable
   - Energy matching: ±6dB tolerance with anti-shout protection
   - Combo tracking: 5+ consecutive accurate notes
7. **Visual Feedback**: Real-time HUD updates:
   - Note lane with pitch visualization
   - Cents error bar showing accuracy
   - Beat LEDs synchronized to tempo
   - Combo counter and score displays
8. **Performance Recording**: All samples stored for post-analysis
9. **Session Completion**: Results calculated and stored to database
10. **Leaderboard Submission**: Optional player name submission for rankings

### Post-Performance Refinement

1. **Refinement Trigger**: User clicks "REFINE RESULTS" in `ResultsScreen`
2. **Python Invocation**: Backend spawns `refine_results.py` process
3. **Phrase-level DTW**: More accurate alignment per musical phrase
4. **Improved Scoring**: Recalculated accuracy with better temporal alignment
5. **Results Update**: Refined data stored alongside original performance

## API Routes & External Interfaces

### Song Management

- **`POST /songs/upload`**: Multipart upload of karaoke video + original audio
  - Input: `song_name` (string), `karaoke_video` (file), `original_audio` (file)
  - Output: `{song_id, status: "processing"}`
  - Side Effects: File storage, database insert, Python preprocessing spawn

- **`GET /songs/:id/status`**: Check preprocessing progress
  - Output: `{status, progress, error?}`
  - Status values: "pending", "processing", "complete", "failed"

- **`GET /songs`**: List all songs (legacy endpoint)
- **`GET /library`**: List ready songs for performance
  - Output: Array of song metadata with preprocessing status
- **`GET /library/:id`**: Get detailed song data including reference
  - Output: Complete song object with reference data for scoring

### Media Streaming

- **`GET /video/:song_id/:filename`**: Video streaming with HTTP range support
  - Headers: Range request handling for efficient playback
  - MIME type: Proper video/* content type setting

- **`GET /audio/:song_id/:filename`**: Audio file streaming
  - Used for reference vocals playback

### Session Management

- **`POST /sessions/start`**: Create new performance session
  - Input: `{song_id}`
  - Output: `{session_id}`
  - Side Effects: Database session record creation

- **`POST /sessions/:id/finish`**: Save performance results
  - Input: Complete performance data object
  - Side Effects: Results stored as JSON in database

- **`POST /sessions/:id/refine`**: Trigger post-run DTW refinement
  - Side Effects: Python process spawn, refined results storage

- **`GET /sessions/:id/results`**: Retrieve session results
  - Output: `{results, refined?}` with performance data

### Leaderboard

- **`POST /leaderboard/submit`**: Submit score to leaderboard
  - Input: `{session_id, player_name, scores, badges}`
  - Side Effects: Leaderboard table insert

- **`GET /leaderboard`**: Get high scores
  - Output: Ranked list of performances with player names

## Key Components / Classes / Functions

### Frontend Components

#### VideoKaraokePlayer
- **Purpose**: Frame-accurate video playback with session management
- **Dependencies**: React hooks, browser Video API
- **Key Methods**:
  - `updateVideoTime()`: `requestVideoFrameCallback` handler
  - `handlePlayPause()`: Playback state management
  - `handleVolumeChange()`: Audio level control
- **Side Effects**: Time updates to parent components, session lifecycle events

#### LiveHUD
- **Purpose**: Real-time scoring engine and visual feedback
- **Dependencies**: AudioContext, AudioWorklet, Canvas API
- **Key State**:
  - `currentScore`: Live score tracking
  - `liveMetrics`: Real-time audio analysis data
  - `performanceData`: Historical sample storage
- **Algorithms**:
  - Pitch accuracy: Cents-based error calculation with key-shift forgiveness
  - Energy matching: LUFS-based loudness comparison
  - Combo tracking: Consecutive accuracy streak detection
- **Side Effects**: Microphone access, AudioWorklet messaging, performance data storage

#### SongLibrary
- **Purpose**: Song browsing and upload interface
- **Dependencies**: Fetch API for backend communication
- **Key Methods**:
  - `loadLibrary()`: Fetch available songs
  - `handleSongSelect()`: Load detailed song data
- **Side Effects**: API calls, state updates to parent App component

### Backend Core Functions

#### Multer Configuration
- **Purpose**: Handle large video/audio file uploads
- **Key Features**:
  - 500MB file size limit
  - UUID-based directory creation
  - File type validation (video/audio MIME types + extensions)
  - Standardized filename mapping

#### Database Schema Management
- **Tables**:
  - `songs`: Metadata and preprocessing status
  - `sessions`: Performance records with JSON results
  - `leaderboard`: Player rankings and scores
- **Relationships**: Foreign key constraints between sessions/songs/leaderboard

#### Python Process Management
- **Purpose**: Spawn and monitor preprocessing tasks
- **Implementation**: Node.js `child_process.spawn()`
- **Progress Tracking**: In-memory queue with status updates
- **Error Handling**: stderr capture and database error logging

### Python Processing Classes

#### PreprocessorConfig
- **Purpose**: Centralized configuration for audio processing
- **Key Parameters**:
  - `SAMPLE_RATE = 48000`: Low-latency audio processing
  - `HOP_LENGTH = 1024`: ~21ms frame size
  - `CREPE_MODEL = 'full'`: High-quality pitch tracking
  - `DTW_BAND_WIDTH = 0.1`: Alignment constraint

#### Vocal Separation Pipeline
- **Models**: Demucs v4 "htdemucs_ft" for state-of-the-art separation
- **Device Optimization**: MPS (Apple Silicon) > CUDA > CPU fallback
- **Output**: Clean vocal and accompaniment tracks

#### DTW Alignment Engine
- **Purpose**: Handle tempo variations and sync drift between karaoke/reference
- **Implementation**: Chroma feature-based alignment with quality scoring
- **Output**: Piecewise linear warping function for timeline mapping

### Audio Processing (AudioWorklet)

#### PitchProcessorAEC Class
- **Purpose**: Real-time audio analysis with echo cancellation
- **Key Algorithms**:
  - **YIN Pitch Detection**: Autocorrelation-based F0 estimation
  - **NLMS Echo Cancellation**: Adaptive filter for speaker bleed removal
  - **Energy Analysis**: RMS and spectral centroid calculation
- **Performance**: 4-frame throttling (~20ms updates) for efficiency
- **Parameters**:
  - Filter length: 512 taps
  - Learning rate: 0.01
  - Frequency range: 80-1000 Hz

## Libraries & Dependencies

### Frontend Stack

#### React Ecosystem
- **`react ^18.2.0`**: Core UI framework with hooks and functional components
- **`react-dom ^18.2.0`**: DOM rendering and event handling
- **Usage**: Component-based architecture, state management, lifecycle handling

#### Build Tools
- **`vite ^4.4.5`**: Modern build tool with HMR and ES modules
- **`@vitejs/plugin-react ^4.0.3`**: JSX transformation and React optimization
- **Usage**: Development server, production bundling, proxy configuration

#### Machine Learning
- **`@tensorflow/tfjs ^4.10.0`**: Browser-based ML for motion tracking
- **Usage**: Optional pose detection for bonus scoring (not actively implemented)

### Backend Stack

#### Web Framework
- **`express ^4.18.2`**: Minimal web application framework
- **Usage**: REST API routing, middleware, static file serving

#### File Handling
- **`multer ^1.4.5-lts.1`**: Multipart form data parsing for file uploads
- **Usage**: Video/audio upload processing, disk storage management

#### Database
- **`sqlite3 ^5.1.6`**: Embedded SQL database
- **Usage**: Song metadata, session records, leaderboard storage

#### Utilities
- **`uuid ^9.0.1`**: RFC4122 UUID generation
- **Usage**: Unique identifiers for songs and sessions
- **`ws ^8.14.2`**: WebSocket library (legacy, not actively used)

### Python Audio Processing

#### Deep Learning
- **`torch >=2.0.0`**: PyTorch with Apple Silicon MPS support
- **`torchcrepe >=0.0.19`**: CREPE pitch tracking with GPU acceleration
- **`demucs >=4.0.0`**: State-of-the-art vocal separation

#### Audio Analysis
- **`librosa >=0.10.0`**: Music information retrieval
  - Chroma feature extraction for alignment
  - Beat tracking and tempo estimation
  - Audio loading and resampling
- **`soundfile >=0.12.0`**: Audio I/O with multiple format support

#### Signal Processing
- **`scipy >=1.9.0`**: Scientific computing
  - Signal filtering and interpolation
  - Statistical analysis
- **`numpy >=1.21.0`**: Numerical computing foundation

#### Alignment
- **`dtaidistance >=2.3.10`**: Fast DTW implementation
- **Usage**: Temporal alignment between karaoke and reference audio

#### Utilities
- **`av >=10.0.0`**: FFmpeg Python bindings for video processing
- **`tqdm >=4.65.0`**: Progress bars for long-running operations

## Core Algorithms / Pipelines

### Vocal Separation Pipeline

1. **Audio Loading**: Load original studio track at 48kHz
2. **Model Initialization**: Load Demucs v4 "htdemucs_ft" model to MPS device
3. **Preprocessing**: Normalize audio, pad to required length
4. **Inference**: Feed through neural network for source separation
5. **Postprocessing**: Extract vocals and accompaniment stems
6. **Quality Control**: Validate separation quality via spectral analysis

### DTW Alignment Algorithm

1. **Feature Extraction**:
   - Compute chroma features for both karaoke and reference audio
   - 12-dimensional pitch class profiles with hop length 1024
2. **Distance Matrix**: Calculate cosine distance between chroma vectors
3. **DTW Computation**: Find optimal alignment path with band constraint
4. **Warping Function**: Generate piecewise linear mapping function
5. **Quality Assessment**: Calculate R² score for alignment quality
6. **Segmentation**: Break into linear segments for efficient runtime lookup

### Real-time Scoring Engine

#### Pitch Accuracy (70% weight)

1. **Frequency Extraction**: YIN algorithm on 2048-sample buffers
2. **Confidence Filtering**: Reject low-confidence pitch estimates
3. **Reference Lookup**: Find expected pitch at current time using DTW mapping
4. **Cents Calculation**: `1200 * log2(detected_f0 / reference_f0)`
5. **Accuracy Mapping**:
   - ±10 cents: 100% (perfect)
   - ±25 cents: 90% (good)
   - ±50 cents: 70% (acceptable)
   - >±50 cents: Exponential decay
6. **Key-shift Detection**: Octave error forgiveness (±1200 cents tolerance)

#### Energy Matching (30% weight)

1. **RMS Calculation**: Root mean square of audio samples
2. **LUFS Conversion**: Perceptual loudness measurement
3. **Reference Comparison**: Compare against expected energy at current time
4. **Tolerance**: ±6dB acceptable range with anti-shout capping
5. **Smoothing**: Exponential moving average with 250ms window

#### Combo System

1. **Accuracy Threshold**: Both pitch and energy must be "good" or better
2. **Streak Tracking**: Count consecutive accurate samples
3. **Combo Activation**: 5+ accurate samples triggers combo mode
4. **Visual Feedback**: Combo counter with color-coded intensity
5. **Scoring Bonus**: Multiplicative bonus for sustained accuracy

### NLMS Echo Cancellation

1. **Reference Buffer**: Store karaoke playback samples (512-tap history)
2. **Adaptive Filter**: 512-coefficient FIR filter updated per sample
3. **Error Calculation**: `error = microphone_input - filter_output`
4. **Weight Update**: `weights += step_size * error * reference_samples / power`
5. **Normalization**: Regularization prevents division by zero
6. **Learning Rate**: 0.01 step size balances adaptation speed vs. stability

### Post-Performance DTW Refinement

1. **Phrase Segmentation**: Split performance into musical phrases
2. **Local Alignment**: Run DTW on each phrase independently
3. **Accuracy Recalculation**: More precise pitch error measurement
4. **Timing Analysis**: Identify rushed or dragged sections
5. **Quality Metrics**: Per-phrase accuracy and timing scores
6. **Result Merging**: Combine phrase-level results into overall performance

## Runtime, Build, and Environment Details

### Development Workflow

#### Native Development
1. **Prerequisites**: Node.js 20+, Python 3.10+, ffmpeg
2. **Backend Setup**: `cd backend && npm install`
3. **Frontend Setup**: `cd frontend && npm install`
4. **Python Setup**: `cd python && python -m venv .venv && pip install -r requirements.txt`
5. **Startup**: `./start.sh` or manually start backend with `node server.js`

#### Docker Development
1. **Command**: `./docker-dev.sh` or `docker-compose -f docker-compose.dev.yml up`
2. **Features**:
   - Hot module replacement for frontend (Vite dev server on port 3000)
   - Auto-restart for backend (Node --watch on port 8080)
   - Source code mounted as volumes for live editing
   - Separate containers for frontend/backend

### Build Process

#### Frontend Build
1. **Vite Build**: `npm run build` in frontend directory
2. **Output**: Static files in `frontend/dist/`
3. **Chunking**: Vendor libraries separated for caching
4. **Assets**: JS/CSS bundles with content hashing

#### Docker Production Build
1. **Multi-stage**: Build dependencies in first stage, runtime in second
2. **Python Dependencies**: Pre-installed in base image
3. **Node.js Installation**: Via NodeSource repository
4. **Frontend Build**: Compiled during Docker build process
5. **Final Image**: Production-ready with minimal runtime dependencies

### Environment Variables

#### Development
- **`NODE_ENV=development`**: Enables debug logging and error details
- **`VITE_PROXY_TARGET`**: Backend URL for Vite proxy (Docker networking)

#### Production
- **`DEVICE=cpu`**: Force CPU mode in Docker (no MPS available)
- **`PORT=8080`**: Server listening port
- **`NODE_ENV=production`**: Optimized runtime behavior

### Runtime Dependencies

#### System Requirements
- **macOS 12.3+**: For MPS (Metal Performance Shaders) acceleration
- **FFmpeg**: Video processing and audio extraction
- **Node.js 20+**: ES modules and modern JavaScript features
- **Python 3.10+**: Modern Python with type hints

#### Performance Characteristics
- **Preprocessing Time**: 90-180s for 3-minute song (varies by device)
- **Real-time Latency**: <10ms for pitch detection and scoring
- **Memory Usage**: ~2GB during preprocessing, ~500MB during playback
- **Storage**: ~100-200MB per processed song

### Database Configuration

#### SQLite Settings
- **File Location**: `backend/karaoke.db`
- **Journal Mode**: Default (DELETE)
- **Synchronous**: Default (FULL)
- **Auto-vacuum**: Disabled (manual maintenance required)

#### Schema Evolution
- **Version 1**: Basic song and session tables
- **Version 2**: Added leaderboard table and refined results
- **Migration**: Handled via `CREATE TABLE IF NOT EXISTS`

## Bottlenecks, Inefficiencies, & Pain Points

### Performance Issues

#### Preprocessing Bottlenecks
- **Demucs Inference**: 45-90s for vocal separation on CPU, 15-30s on MPS
- **DTW Alignment**: O(n²) complexity can be slow for long songs
- **File I/O**: Large video files (100MB+) cause memory pressure during upload
- **Python Startup**: Cold start overhead for each preprocessing job

#### Real-time Processing Limitations
- **AudioWorklet Latency**: 20ms update rate may feel sluggish for fast passages
- **Canvas Rendering**: HUD visualization can cause frame drops on older hardware
- **Echo Cancellation**: NLMS convergence takes 2-3 seconds, affecting early performance

#### Memory Inefficiencies
- **Video Loading**: Entire karaoke video loaded into memory for range requests
- **Reference Data**: Large JSON files (>1MB) for long songs with dense pitch data
- **Audio Buffers**: Multiple copies of audio data during processing pipeline

### Scaling Constraints

#### Single-User Architecture
- **No Concurrency**: One preprocessing job at a time
- **Local Storage**: No cloud backup or sync capabilities
- **Session Isolation**: No multi-user or collaborative features

#### Resource Limitations
- **CPU Bound**: Preprocessing limited by single-threaded Python operations
- **Disk I/O**: No optimization for SSD vs. HDD storage patterns
- **Network**: No CDN or streaming optimization for large video files

### Code Quality Issues

#### Error Handling Gaps
- **Preprocessing Failures**: Limited retry logic and error recovery
- **Network Timeouts**: No robust handling of interrupted uploads
- **Device Compatibility**: Inconsistent fallback behavior across platforms

#### Technical Debt
- **Mixed Architecture**: WebSocket infrastructure present but unused
- **Legacy Code**: Some components reference removed features (rhythm scoring)
- **Inconsistent Patterns**: Mix of async/await and Promise.then() patterns

## Quirks, Assumptions, & Edge Cases

### Implementation Quirks

#### File Naming Conventions
- **UUID Directories**: Song storage uses UUIDs, not human-readable names
- **Extension Preservation**: Original file extensions maintained for compatibility
- **Standardized Names**: Internal files always use consistent names regardless of upload

#### Audio Processing Assumptions
- **Sample Rate**: Hardcoded 48kHz assumption throughout pipeline
- **Bit Depth**: 32-bit float processing with 16-bit file storage
- **Mono Conversion**: Vocals separated to mono, karaoke stays stereo

#### Browser Compatibility
- **Modern APIs**: Requires `requestVideoFrameCallback`, `AudioWorklet` support
- **CORS Requirements**: Development needs specific header configuration
- **File API**: Assumes modern File and Blob support

### Edge Cases and Limitations

#### Audio Content Restrictions
- **Same Key Requirement**: Karaoke and original must be in same musical key
- **Tempo Matching**: Significant tempo differences cause alignment failures
- **Genre Limitations**: Optimized for vocal-centric Western popular music

#### Technical Edge Cases
- **Zero-Duration Videos**: Can cause division by zero in timing calculations
- **Silent Sections**: Pitch detection fails during instrumental breaks
- **Microphone Issues**: No graceful degradation if mic access denied mid-session

#### User Experience Assumptions
- **Single Session**: No save/resume functionality for interrupted performances
- **Local Network**: Assumes stable localhost connectivity
- **Desktop Usage**: UI not optimized for mobile or tablet interfaces

### Fragile Components

#### Preprocessing Dependencies
- **Python Environment**: Sensitive to PyTorch/MPS version compatibility
- **FFmpeg Path**: Hardcoded assumptions about system FFmpeg installation
- **Model Downloads**: Demucs models downloaded on first use (no offline mode)

#### Real-time Processing
- **AudioContext State**: Can become suspended and require manual resumption
- **WorkerLoader**: AudioWorklet loading can fail silently
- **Echo Cancellation**: Sensitive to audio routing changes during performance

### TODOs and Known Issues

#### Documented TODOs
- Unit and integration test coverage
- Mobile responsive design
- Error recovery and fallback mechanisms
- Performance optimization for older hardware

#### Implicit Technical Debt
- **Database Migrations**: No formal schema versioning system
- **Configuration Management**: Hardcoded parameters scattered throughout codebase
- **Logging Infrastructure**: Inconsistent logging levels and formats
- **Monitoring**: No metrics collection or performance monitoring

## Glossary of Internal Terms

### Audio Processing Terms

- **AEC**: Adaptive Echo Cancellation - NLMS algorithm for removing karaoke playback bleed
- **Cents**: Musical interval measurement (1200 cents = 1 octave)
- **Chroma**: 12-dimensional pitch class profile for key-invariant analysis
- **Crepe**: Convolutional neural network for pitch estimation
- **DTW**: Dynamic Time Warping - algorithm for temporal alignment
- **F0**: Fundamental frequency (pitch) of audio signal
- **LUFS**: Loudness Units relative to Full Scale - perceptual loudness measurement
- **MPS**: Metal Performance Shaders - Apple Silicon GPU acceleration
- **NLMS**: Normalized Least Mean Squares - adaptive filtering algorithm
- **RMS**: Root Mean Square - energy measurement for audio signals
- **YIN**: Autocorrelation-based pitch detection algorithm

### System Architecture Terms

- **HUD**: Heads-Up Display - real-time scoring interface overlay
- **Reference Data**: Comprehensive JSON file containing all scoring information
- **Session**: Single performance instance with unique ID
- **Song Pair**: Karaoke video + original audio combination
- **Warp Function**: DTW-derived mapping between karaoke and reference timelines
- **WorkletProcessor**: AudioWorklet-based real-time audio processing

### Scoring and Performance Terms

- **Badge**: Achievement unlocked based on performance metrics
- **Combo**: Consecutive accurate notes streak (5+ for activation)
- **Energy Match**: Loudness similarity between singer and reference
- **Key-shift Forgiveness**: Octave error tolerance in pitch scoring
- **Note Bin**: Discrete pitch target for scoring accuracy
- **Phrase**: Musical segment for detailed analysis
- **Refinement**: Post-performance DTW analysis for improved accuracy

### File and Data Terms

- **Accompaniment**: Instrumental track separated from original audio
- **Karaoke Timeline**: Video playback timebase for synchronization
- **Reference Timeline**: Original audio timebase before alignment
- **Song ID**: UUID identifier for uploaded song pairs
- **Stems**: Separated audio components (vocals, accompaniment)
- **Vocals**: Isolated vocal track from original audio

This context document provides complete situational awareness of the PitchPerfectly karaoke system, enabling AI assistants to understand the architecture, data flow, and implementation details without requiring additional codebase exploration.
