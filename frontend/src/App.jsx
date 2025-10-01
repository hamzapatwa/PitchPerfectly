import React, { useState, useEffect, useRef } from 'react';
import './styles/retro.css';
import LiveHUD from './components/LiveHUD';
import SongUpload from './components/SongUpload';
import MicCheck from './components/MicCheck';
import ResultsScreen from './components/ResultsScreen';
import Leaderboard from './components/Leaderboard';
import MotionTracker from './components/MotionTracker';

const API_BASE = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/room';

function App() {
  const [currentScreen, setCurrentScreen] = useState('upload'); // upload, mic-check, live, results
  const [trackId, setTrackId] = useState(null);
  const [referenceId, setReferenceId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [referenceData, setReferenceData] = useState(null);
  const [roomId, setRoomId] = useState('main');
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [playerName, setPlayerName] = useState('');

  // WebSocket connection
  const wsRef = useRef(null);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    // Generate room ID
    const room = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setRoomId(room);
  }, []);

  const connectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`${WS_URL}/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: 'join', roomId }));
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return ws;
  };

  const handleSongUploaded = async (trackId, filename) => {
    setTrackId(trackId);

    // Start analysis
    try {
      const response = await fetch(`${API_BASE}/analyze/${trackId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const result = await response.json();

      if (result.status === 'ready') {
        setReferenceId(result.reference_id);
        await loadReferenceData(result.reference_id);
        setCurrentScreen('mic-check');
      } else if (result.job_id) {
        // Poll for completion
        await pollAnalysisStatus(result.job_id);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Analysis failed. Please try again.');
    }
  };

  const pollAnalysisStatus = async (jobId) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/analyze/status/${jobId}`);
        const status = await response.json();

        if (status.status === 'completed') {
          clearInterval(pollInterval);
          setReferenceId(status.referenceId);
          await loadReferenceData(status.referenceId);
          setCurrentScreen('mic-check');
        } else if (status.status === 'error') {
          clearInterval(pollInterval);
          alert('Analysis failed. Please try again.');
        }
      } catch (error) {
        console.error('Status check failed:', error);
        clearInterval(pollInterval);
      }
    }, 2000);
  };

  const loadReferenceData = async (referenceId) => {
    try {
      const response = await fetch(`${API_BASE}/reference/${referenceId}`);
      const data = await response.json();
      setReferenceData(data);
    } catch (error) {
      console.error('Failed to load reference data:', error);
    }
  };

  const handleMicCheckComplete = () => {
    setCurrentScreen('live');
    connectWebSocket();
  };

  const handleSessionComplete = async (results) => {
    try {
      // Save results to backend
      await fetch(`${API_BASE}/session/finish/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(results)
      });

      // Submit to leaderboard if player name provided
      if (playerName) {
        await fetch(`${API_BASE}/leaderboard/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            player_name: playerName,
            scores: results.totals,
            badges: results.badges
          })
        });
      }

      setCurrentScreen('results');
    } catch (error) {
      console.error('Failed to save results:', error);
      setCurrentScreen('results');
    }
  };

  const startNewSession = () => {
    setCurrentScreen('upload');
    setTrackId(null);
    setReferenceId(null);
    setSessionId(null);
    setReferenceData(null);
    setPlayerName('');
    if (wsRef.current) {
      wsRef.current.close();
    }
  };

  const renderCurrentScreen = () => {
    switch (currentScreen) {
      case 'upload':
        return (
          <SongUpload
            onSongUploaded={handleSongUploaded}
            apiBase={API_BASE}
          />
        );

      case 'mic-check':
        return (
          <MicCheck
            onComplete={handleMicCheckComplete}
            onMotionToggle={setMotionEnabled}
            motionEnabled={motionEnabled}
            wsUrl={`${WS_URL}/${roomId}`}
          />
        );

      case 'live':
        return (
          <div className="live-container">
            <LiveHUD
              wsUrl={`${WS_URL}/${roomId}`}
              referenceData={referenceData}
              motionEnabled={motionEnabled}
              onSessionComplete={handleSessionComplete}
              onStartSession={async () => {
                const response = await fetch(`${API_BASE}/session/start`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    track_id: trackId,
                    reference_id: referenceId
                  })
                });
                const result = await response.json();
                setSessionId(result.session_id);
              }}
            />
            {motionEnabled && (
              <MotionTracker
                wsUrl={`${WS_URL}/${roomId}`}
              />
            )}
          </div>
        );

      case 'results':
        return (
          <ResultsScreen
            sessionId={sessionId}
            apiBase={API_BASE}
            onNewSession={startNewSession}
            playerName={playerName}
            onPlayerNameChange={setPlayerName}
          />
        );

      default:
        return <div>Unknown screen</div>;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="neon-title">🎤 KARAOKE ARCADE 🎤</h1>
        <div className="status-indicators">
          <span className={`status ${wsConnected ? 'connected' : 'disconnected'}`}>
            {wsConnected ? '🟢 LIVE' : '🔴 OFFLINE'}
          </span>
          {motionEnabled && <span className="motion-indicator">📹 MOTION</span>}
        </div>
      </header>

      <main className="app-main">
        {renderCurrentScreen()}
      </main>

      <footer className="app-footer">
        <div className="controls">
          <button
            className="retro-button"
            onClick={startNewSession}
            disabled={currentScreen === 'upload'}
          >
            🎵 NEW SONG
          </button>
          <button
            className="retro-button"
            onClick={() => setCurrentScreen('results')}
            disabled={!sessionId}
          >
            📊 LEADERBOARD
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
