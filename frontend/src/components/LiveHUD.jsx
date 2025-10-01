import React, { useEffect, useRef, useState, useCallback } from 'react';

export default function LiveHUD({ wsUrl, referenceData, motionEnabled, onSessionComplete, onStartSession }) {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const animationFrameRef = useRef(null);
  const workerRef = useRef(null);

  const [stats, setStats] = useState({
    pitch: 0,
    confidence: 0,
    energy: 0,
    onBeat: false,
    combo: 0,
    timingErr: 0,
    motionScore: 0,
    totalScore: 0,
    pitchScore: 0,
    rhythmScore: 0,
    energyScore: 0
  });

  const [connected, setConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionData, setSessionData] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [beats, setBeats] = useState([]);
  const [currentBeat, setCurrentBeat] = useState(0);

  // Scoring state
  const [scoringEnabled, setScoringEnabled] = useState(false);
  const [phraseScores, setPhraseScores] = useState([]);
  const [badges, setBadges] = useState([]);

  // Initialize audio processing
  useEffect(() => {
    initializeAudio();
    return () => {
      cleanup();
    };
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: 'join', roomId: 'main' }));
    };

    ws.onclose = () => setConnected(false);

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'hud') {
        setStats(prev => ({ ...prev, ...msg.payload }));
      } else if (msg.type === 'beat') {
        handleBeatEvent(msg.payload);
      }
    };

    return () => ws.close();
  }, [wsUrl]);

  // Initialize reference data
  useEffect(() => {
    if (referenceData) {
      setBeats(referenceData.beats || []);
      setScoringEnabled(true);
    }
  }, [referenceData]);

  const initializeAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      microphoneRef.current = stream;

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.8;

      // Load AudioWorklet processor
      await audioContextRef.current.audioWorklet.addModule('/workers/pitch-processor.js');
      const processor = new AudioWorkletNode(audioContextRef.current, 'pitch-energy-processor');

      source.connect(processor);
      processor.port.onmessage = handleAudioData;

      startAudioProcessing();
    } catch (error) {
      console.error('Audio initialization failed:', error);
    }
  };

  const handleAudioData = useCallback((event) => {
    if (event.data.type === 'frame') {
      const { f0, energy, confidence } = event.data;

      // Calculate scoring metrics
      const newStats = calculateScoringMetrics(f0, energy, confidence);

      // Update session data
      const frameData = {
        time: currentTime,
        f0,
        energy,
        confidence,
        ...newStats
      };

      setSessionData(prev => [...prev, frameData]);

      // Send to WebSocket
      if (connected) {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({
            type: 'hud',
            payload: { ...stats, ...newStats }
          }));
          ws.close();
        };
      }

      setStats(prev => ({ ...prev, ...newStats }));
    }
  }, [currentTime, connected, wsUrl, stats]);

  const calculateScoringMetrics = (f0, energy, confidence) => {
    if (!referenceData || !scoringEnabled) {
      return { pitch: f0, confidence, energy };
    }

    const currentTimeMs = currentTime * 1000;
    const hopSize = referenceData.hopLength || 512;
    const sampleRate = referenceData.sampleRate || 22050;
    const frameIndex = Math.floor(currentTimeMs * sampleRate / hopSize);

    // Pitch scoring
    let pitchScore = 0;
    if (frameIndex < referenceData.refPitchHz.length && f0 > 0) {
      const refPitch = referenceData.refPitchHz[frameIndex];
      if (refPitch > 0) {
        const pitchError = Math.abs(f0 - refPitch) / refPitch;
        pitchScore = Math.max(0, 1 - pitchError * 2); // Scale to 0-1
      }
    }

    // Rhythm scoring
    let rhythmScore = 0;
    let onBeat = false;
    let timingErr = 0;

    if (beats.length > 0) {
      const nextBeat = beats.find(beat => beat > currentTime);
      const prevBeat = beats.filter(beat => beat <= currentTime).pop();

      if (nextBeat && prevBeat) {
        const beatInterval = nextBeat - prevBeat;
        const timeFromPrevBeat = currentTime - prevBeat;
        const beatPosition = timeFromPrevBeat / beatInterval;

        // Check if we're on beat (within 20% of beat)
        const beatTolerance = 0.2;
        if (beatPosition >= (1 - beatTolerance) && beatPosition <= beatTolerance) {
          onBeat = true;
          rhythmScore = 1.0;
        } else {
          timingErr = Math.min(Math.abs(beatPosition - 0.5), 0.5);
          rhythmScore = Math.max(0, 1 - timingErr * 2);
        }
      }
    }

    // Energy scoring (normalized)
    const energyScore = Math.min(energy / 0.5, 1.0); // Cap at 0.5 RMS

    // Calculate total score
    const totalScore = (
      pitchScore * 0.6 +      // 60% pitch
      rhythmScore * 0.25 +    // 25% rhythm
      energyScore * 0.1 +     // 10% energy
      (stats.motionScore || 0) * 0.05  // 5% motion
    ) * 100;

    return {
      pitch: f0,
      confidence,
      energy,
      pitchScore: pitchScore * 100,
      rhythmScore: rhythmScore * 100,
      energyScore: energyScore * 100,
      totalScore,
      onBeat,
      timingErr: timingErr * 100,
      combo: onBeat ? (stats.combo || 0) + 1 : 0
    };
  };

  const handleBeatEvent = (beatData) => {
    setCurrentBeat(beatData.beatIndex || 0);
  };

  const startSession = async () => {
    if (!sessionStarted) {
      await onStartSession();
      setSessionStarted(true);
      setIsRecording(true);
      setCurrentTime(0);
      setSessionData([]);
      setPhraseScores([]);
      setBadges([]);

      // Start timer
      const timer = setInterval(() => {
        setCurrentTime(prev => prev + 0.02); // 20ms updates
      }, 20);

      // Auto-stop after song duration
      if (referenceData?.duration) {
        setTimeout(() => {
          stopSession();
          clearInterval(timer);
        }, referenceData.duration * 1000);
      }
    }
  };

  const stopSession = () => {
    setIsRecording(false);
    calculateFinalResults();
  };

  const calculateFinalResults = () => {
    if (sessionData.length === 0) return;

    // Calculate phrase-level scores
    const phraseResults = [];
    if (referenceData?.phrases) {
      referenceData.phrases.forEach((phrase, index) => {
        const phraseData = sessionData.filter(frame =>
          frame.time >= phrase.start && frame.time <= phrase.end
        );

        if (phraseData.length > 0) {
          const avgPitchScore = phraseData.reduce((sum, f) => sum + f.pitchScore, 0) / phraseData.length;
          const avgRhythmScore = phraseData.reduce((sum, f) => sum + f.rhythmScore, 0) / phraseData.length;
          const avgEnergyScore = phraseData.reduce((sum, f) => sum + f.energyScore, 0) / phraseData.length;

          phraseResults.push({
            phrase: index,
            start: phrase.start,
            end: phrase.end,
            pitchScore: avgPitchScore,
            rhythmScore: avgRhythmScore,
            energyScore: avgEnergyScore,
            totalScore: avgPitchScore * 0.6 + avgRhythmScore * 0.25 + avgEnergyScore * 0.1
          });
        }
      });
    }

    // Calculate badges
    const earnedBadges = calculateBadges(sessionData);

    // Calculate totals
    const totals = {
      total: sessionData.reduce((sum, f) => sum + f.totalScore, 0) / sessionData.length,
      pitch: sessionData.reduce((sum, f) => sum + f.pitchScore, 0) / sessionData.length,
      rhythm: sessionData.reduce((sum, f) => sum + f.rhythmScore, 0) / sessionData.length,
      energy: sessionData.reduce((sum, f) => sum + f.energyScore, 0) / sessionData.length,
      motion: stats.motionScore || 0
    };

    const results = {
      totals,
      perPhrase: phraseResults,
      badges: earnedBadges,
      graphs: {
        pitchTimeline: sessionData.map(f => ({ time: f.time, pitch: f.pitch, score: f.pitchScore })),
        energyGraph: sessionData.map(f => ({ time: f.time, energy: f.energy })),
        rhythmHeatmap: sessionData.map(f => ({ time: f.time, onBeat: f.onBeat, timingErr: f.timingErr }))
      }
    };

    onSessionComplete(results);
  };

  const calculateBadges = (data) => {
    const badges = [];

    // Combo King - longest streak
    let maxCombo = 0;
    let currentCombo = 0;
    data.forEach(frame => {
      if (frame.onBeat) {
        currentCombo++;
        maxCombo = Math.max(maxCombo, currentCombo);
      } else {
        currentCombo = 0;
      }
    });

    if (maxCombo >= 10) badges.push({ name: 'Combo King', description: `${maxCombo} beat streak!` });

    // On-Beat Bandit - rhythm accuracy
    const rhythmAccuracy = data.reduce((sum, f) => sum + f.rhythmScore, 0) / data.length;
    if (rhythmAccuracy >= 80) badges.push({ name: 'On-Beat Bandit', description: 'Perfect rhythm!' });

    // Mic Melter - energy consistency
    const avgEnergy = data.reduce((sum, f) => sum + f.energy, 0) / data.length;
    if (avgEnergy >= 0.3) badges.push({ name: 'Mic Melter', description: 'High energy performance!' });

    // Smooth Operator - pitch accuracy
    const pitchAccuracy = data.reduce((sum, f) => sum + f.pitchScore, 0) / data.length;
    if (pitchAccuracy >= 85) badges.push({ name: 'Smooth Operator', description: 'Perfect pitch!' });

    return badges;
  };

  const startAudioProcessing = () => {
    const processAudio = () => {
      if (analyserRef.current && isRecording) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate energy
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const energy = Math.sqrt(sum / dataArray.length) / 128;

        setStats(prev => ({ ...prev, energy }));
      }

      animationFrameRef.current = requestAnimationFrame(processAudio);
    };

    processAudio();
  };

  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (microphoneRef.current) {
      microphoneRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
  };

  // Render HUD
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;
      ctx.clearRect(0, 0, w, h);

      // Neon grid background
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#39ff14';
      for (let x = 0; x < w; x += 20) {
        ctx.fillRect(x, 0, 1, h);
      }
      for (let y = 0; y < h; y += 20) {
        ctx.fillRect(0, y, w, 1);
      }
      ctx.globalAlpha = 1.0;

      // Pitch bar
      const pitchNorm = Math.min(1, stats.pitch / 1000);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(20, h - 40, (w - 40) * pitchNorm, 12);

      // Energy meter
      const eNorm = Math.min(1, stats.energy / 1.0);
      ctx.fillStyle = '#ff00e6';
      ctx.fillRect(20, h - 70, (w - 40) * eNorm, 10);

      // Timing indicator
      ctx.fillStyle = stats.onBeat ? '#00e5ff' : '#ff3d00';
      const center = w / 2;
      ctx.fillRect(center - 2 + stats.timingErr * 50, 20, 4, 20);

      // Score display
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`SCORE: ${Math.round(stats.totalScore || 0)}`, 20, 40);
      ctx.fillText(`COMBO x${stats.combo || 0}`, 20, 60);

      // Combo popup animation
      if (stats.combo > 5) {
        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`COMBO x${stats.combo}!`, w / 2 - 60, h / 2);
      }

      requestAnimationFrame(draw);
    };

    draw();
  }, [stats]);

  return (
    <div className="hud">
      <div className="hud-controls">
        <button
          className={`retro-button ${sessionStarted ? 'stop' : 'start'}`}
          onClick={sessionStarted ? stopSession : startSession}
        >
          {sessionStarted ? '⏹️ STOP' : '▶️ START'}
        </button>

        <div className="session-info">
          <span className={connected ? 'ok' : 'bad'}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
          <span>Time: {currentTime.toFixed(1)}s</span>
          <span>Beat: {currentBeat}</span>
        </div>
      </div>

      <canvas ref={canvasRef} width={800} height={300} className="crt"/>

      <div className="hud-stats">
        <div className="stat">
          <span className="stat-label">PITCH</span>
          <span className="stat-value">{Math.round(stats.pitchScore || 0)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">RHYTHM</span>
          <span className="stat-value">{Math.round(stats.rhythmScore || 0)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">ENERGY</span>
          <span className="stat-value">{Math.round(stats.energyScore || 0)}</span>
        </div>
        {motionEnabled && (
          <div className="stat">
            <span className="stat-label">MOTION</span>
            <span className="stat-value">{Math.round(stats.motionScore || 0)}</span>
          </div>
        )}
      </div>

      <div className="badges-preview">
        {badges.map((badge, index) => (
          <div key={index} className="badge-preview">
            <span className="badge-icon">🏆</span>
            <span className="badge-name">{badge.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}