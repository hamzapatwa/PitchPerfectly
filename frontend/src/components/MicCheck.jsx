import React, { useState, useEffect, useRef } from 'react';

export default function MicCheck({ onComplete, onMotionToggle, motionEnabled, wsUrl }) {
  const [micPermission, setMicPermission] = useState(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [webcamPermission, setWebcamPermission] = useState(null);
  const [webcamStream, setWebcamStream] = useState(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneRef = useRef(null);
  const webcamRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
      if (microphoneRef.current) {
        microphoneRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      microphoneRef.current = stream;
      setMicPermission(true);
      setupAudioAnalysis(stream);
    } catch (error) {
      console.error('Microphone access denied:', error);
      setMicPermission(false);
    }
  };

  const setupAudioAnalysis = (stream) => {
    try {
      console.log('Setting up audio analysis with stream:', stream);
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      console.log('Audio analyser configured:', {
        fftSize: analyserRef.current.fftSize,
        frequencyBinCount: analyserRef.current.frequencyBinCount,
        sampleRate: audioContextRef.current.sampleRate
      });

      startAudioLevelMonitoring();
    } catch (error) {
      console.error('Audio analysis setup failed:', error);
    }
  };

  const startAudioLevelMonitoring = () => {
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

    const updateLevel = () => {
      if (analyserRef.current) {
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate RMS level with better sensitivity
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // More sensitive normalization - scale by 64 instead of 128
        const normalizedLevel = Math.min(rms / 64, 1);

        // Add some minimum threshold to show activity
        const displayLevel = Math.max(normalizedLevel, 0.05);

        // Debug logging (remove in production)
        if (Math.random() < 0.01) { // Log 1% of the time to avoid spam
          console.log('Audio level debug:', {
            rawData: Array.from(dataArray).slice(0, 10),
            rms: rms,
            normalizedLevel: normalizedLevel,
            displayLevel: displayLevel
          });
        }

        setAudioLevel(displayLevel);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      }
    };

    updateLevel();
  };

  const requestWebcamPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        }
      });

      console.log('Webcam stream obtained:', stream);
      setWebcamStream(stream);
      setWebcamPermission(true);

      if (webcamRef.current) {
        webcamRef.current.srcObject = stream;
        console.log('Video element srcObject set');

        // Ensure the video plays
        webcamRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded');
          webcamRef.current.play().catch(e => console.error('Video play failed:', e));
        };
      }
    } catch (error) {
      console.error('Webcam access denied:', error);
      setWebcamPermission(false);
    }
  };

  const toggleMotionTracking = () => {
    if (motionEnabled) {
      // Disable motion tracking
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        setWebcamStream(null);
        setWebcamPermission(null);
      }
      onMotionToggle(false);
    } else {
      // Enable motion tracking
      requestWebcamPermission();
      onMotionToggle(true);
    }
  };

  const startListening = () => {
    setIsListening(true);
  };

  const stopListening = () => {
    setIsListening(false);
  };

  const proceedToLive = () => {
    onComplete();
  };

  const getAudioLevelColor = () => {
    if (audioLevel < 0.1) return '#ff3d00'; // Red - too quiet
    if (audioLevel < 0.3) return '#ffd700'; // Yellow - getting there
    if (audioLevel < 0.7) return '#39ff14'; // Green - good
    return '#ff00e6'; // Pink - too loud
  };

  const getAudioLevelText = () => {
    if (audioLevel < 0.1) return 'TOO QUIET';
    if (audioLevel < 0.3) return 'GETTING THERE';
    if (audioLevel < 0.7) return 'PERFECT';
    return 'TOO LOUD';
  };

  return (
    <div className="mic-check-container">
      <div className="mic-check-header">
        <h2 className="neon-text">🎤 MIC CHECK 🎤</h2>
        <p>Let's make sure everything is working perfectly!</p>
      </div>

      <div className="mic-check-content">
        {/* Microphone Section */}
        <div className="mic-section">
          <h3>Microphone</h3>

          {micPermission === null && (
            <button
              className="retro-button large"
              onClick={requestMicPermission}
            >
              🎤 ENABLE MICROPHONE
            </button>
          )}

          {micPermission === false && (
            <div className="permission-denied">
              <p>❌ Microphone access denied</p>
              <p>Please allow microphone access to continue</p>
              <button
                className="retro-button"
                onClick={requestMicPermission}
              >
                TRY AGAIN
              </button>
            </div>
          )}

          {micPermission === true && (
            <div className="mic-status">
              <div className="audio-level-display">
                <div
                  className="audio-level-bar"
                  style={{
                    height: `${audioLevel * 100}%`,
                    backgroundColor: getAudioLevelColor()
                  }}
                ></div>
              </div>

              <div className="audio-level-info">
                <p className={`level-text ${getAudioLevelText().replace(' ', '-').toLowerCase()}`}>
                  {getAudioLevelText()}
                </p>
                <p className="level-value">{(audioLevel * 100).toFixed(0)}%</p>
              </div>

              <div className="mic-controls">
                {!isListening ? (
                  <button
                    className="retro-button"
                    onClick={startListening}
                  >
                    🎵 START LISTENING
                  </button>
                ) : (
                  <button
                    className="retro-button"
                    onClick={stopListening}
                  >
                    ⏹️ STOP LISTENING
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Webcam Section */}
        <div className="webcam-section">
          <h3>Motion Tracking (Optional)</h3>

          <div className="motion-toggle">
            <button
              className={`retro-button ${motionEnabled ? 'active' : ''}`}
              onClick={toggleMotionTracking}
            >
              {motionEnabled ? '📹 DISABLE MOTION' : '📹 ENABLE MOTION'}
            </button>

            {motionEnabled && webcamPermission === true && (
              <div className="webcam-preview">
                <video
                  ref={webcamRef}
                  autoPlay
                  muted
                  playsInline
                  className="webcam-feed"
                  style={{ width: '100%', maxWidth: '320px', height: 'auto' }}
                />
                <div className="motion-indicator">
                  <span className="pulse">📹</span>
                  <span>Motion tracking active</span>
                </div>
              </div>
            )}

            {motionEnabled && webcamPermission === false && (
              <div className="permission-denied">
                <p>❌ Webcam access denied</p>
                <p>Motion tracking disabled</p>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions">
          <h4>Instructions:</h4>
          <ul>
            <li>🎤 Enable microphone and test your audio levels</li>
            <li>📹 Optionally enable motion tracking for bonus points</li>
            <li>🎵 Sing a few notes to test your setup</li>
            <li>✨ When ready, proceed to the live performance!</li>
          </ul>
        </div>

        {/* Proceed Button */}
        {micPermission === true && (
          <div className="proceed-section">
            <button
              className="retro-button large proceed"
              onClick={proceedToLive}
              disabled={audioLevel < 0.1}
            >
              🚀 START PERFORMANCE
            </button>
            {audioLevel < 0.1 && (
              <p className="warning">⚠️ Please test your microphone first</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
