import React, { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';

export default function MotionTracker({ wsUrl }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isTracking, setIsTracking] = useState(false);
  const [motionScore, setMotionScore] = useState(0);
  const [model, setModel] = useState(null);
  const [stream, setStream] = useState(null);
  const animationFrameRef = useRef(null);

  // Motion detection state
  const [previousPoses, setPreviousPoses] = useState([]);
  const [motionHistory, setMotionHistory] = useState([]);
  const [currentMotionType, setCurrentMotionType] = useState('idle');

  useEffect(() => {
    loadMoveNetModel();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const loadMoveNetModel = async () => {
    try {
      // Load MoveNet model
      const moveNetModel = await tf.loadGraphModel('https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4');
      setModel(moveNetModel);
      console.log('MoveNet model loaded successfully');
    } catch (error) {
      console.error('Failed to load MoveNet model:', error);
    }
  };

  const startTracking = async () => {
    if (!model) {
      console.error('MoveNet model not loaded');
      return;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        }
      });

      setStream(videoStream);

      if (videoRef.current) {
        videoRef.current.srcObject = videoStream;
        videoRef.current.play();
      }

      setIsTracking(true);
      startMotionDetection();
    } catch (error) {
      console.error('Failed to start video tracking:', error);
    }
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const startMotionDetection = () => {
    const detectMotion = async () => {
      if (!isTracking || !model || !videoRef.current) return;

      try {
        // Get pose estimation
        const pose = await estimatePose(videoRef.current);

        if (pose) {
          // Calculate motion metrics
          const motionMetrics = calculateMotionMetrics(pose);

          // Update motion score
          const newMotionScore = calculateMotionScore(motionMetrics);
          setMotionScore(newMotionScore);

          // Detect motion type
          const motionType = detectMotionType(motionMetrics);
          setCurrentMotionType(motionType);

          // Send to WebSocket
          sendMotionData({
            motionScore: newMotionScore,
            motionType,
            metrics: motionMetrics
          });

          // Draw pose on canvas
          drawPose(pose);
        }
      } catch (error) {
        console.error('Motion detection error:', error);
      }

      animationFrameRef.current = requestAnimationFrame(detectMotion);
    };

    detectMotion();
  };

  const estimatePose = async (video) => {
    if (!model) return null;

    try {
      // Prepare input tensor
      const tensor = tf.browser.fromPixels(video);
      const resized = tf.image.resizeBilinear(tensor, [192, 192]);
      const normalized = resized.div(255.0);
      const batched = normalized.expandDims(0);

      // Run inference
      const predictions = await model.predict(batched);
      const pose = await predictions.array();

      // Cleanup tensors
      tensor.dispose();
      resized.dispose();
      normalized.dispose();
      batched.dispose();
      predictions.dispose();

      return pose[0][0]; // Single pose output
    } catch (error) {
      console.error('Pose estimation error:', error);
      return null;
    }
  };

  const calculateMotionMetrics = (pose) => {
    if (!pose || pose.length < 17) return null;

    // Key point indices for MoveNet
    const keyPoints = {
      nose: 0,
      leftEye: 1,
      rightEye: 2,
      leftEar: 3,
      rightEar: 4,
      leftShoulder: 5,
      rightShoulder: 6,
      leftElbow: 7,
      rightElbow: 8,
      leftWrist: 9,
      rightWrist: 10,
      leftHip: 11,
      rightHip: 12,
      leftKnee: 13,
      rightKnee: 14,
      leftAnkle: 15,
      rightAnkle: 16
    };

    const metrics = {
      armMovement: 0,
      bodyMovement: 0,
      headMovement: 0,
      overallMotion: 0
    };

    // Calculate arm movement (wrist to shoulder distance changes)
    if (pose[keyPoints.leftWrist] && pose[keyPoints.leftShoulder] &&
        pose[keyPoints.rightWrist] && pose[keyPoints.rightShoulder]) {
      const leftArmDist = Math.sqrt(
        Math.pow(pose[keyPoints.leftWrist].x - pose[keyPoints.leftShoulder].x, 2) +
        Math.pow(pose[keyPoints.leftWrist].y - pose[keyPoints.leftShoulder].y, 2)
      );
      const rightArmDist = Math.sqrt(
        Math.pow(pose[keyPoints.rightWrist].x - pose[keyPoints.rightShoulder].x, 2) +
        Math.pow(pose[keyPoints.rightWrist].y - pose[keyPoints.rightShoulder].y, 2)
      );
      metrics.armMovement = (leftArmDist + rightArmDist) / 2;
    }

    // Calculate body movement (hip to shoulder distance)
    if (pose[keyPoints.leftHip] && pose[keyPoints.leftShoulder] &&
        pose[keyPoints.rightHip] && pose[keyPoints.rightShoulder]) {
      const leftBodyDist = Math.sqrt(
        Math.pow(pose[keyPoints.leftHip].x - pose[keyPoints.leftShoulder].x, 2) +
        Math.pow(pose[keyPoints.leftHip].y - pose[keyPoints.leftShoulder].y, 2)
      );
      const rightBodyDist = Math.sqrt(
        Math.pow(pose[keyPoints.rightHip].x - pose[keyPoints.rightShoulder].x, 2) +
        Math.pow(pose[keyPoints.rightHip].y - pose[keyPoints.rightShoulder].y, 2)
      );
      metrics.bodyMovement = (leftBodyDist + rightBodyDist) / 2;
    }

    // Calculate head movement (nose position)
    if (pose[keyPoints.nose]) {
      metrics.headMovement = Math.sqrt(
        Math.pow(pose[keyPoints.nose].x - 0.5, 2) +
        Math.pow(pose[keyPoints.nose].y - 0.5, 2)
      );
    }

    // Overall motion magnitude
    metrics.overallMotion = (metrics.armMovement + metrics.bodyMovement + metrics.headMovement) / 3;

    return metrics;
  };

  const calculateMotionScore = (metrics) => {
    if (!metrics) return 0;

    // Motion score based on movement magnitude
    let score = Math.min(metrics.overallMotion * 100, 100);

    // Bonus for sustained movement
    setMotionHistory(prev => {
      const newHistory = [...prev, metrics.overallMotion].slice(-10); // Keep last 10 frames
      const avgMotion = newHistory.reduce((sum, m) => sum + m, 0) / newHistory.length;

      if (avgMotion > 0.1) {
        score += 10; // Bonus for sustained movement
      }

      return newHistory;
    });

    return Math.min(score, 100); // Cap at 100
  };

  const detectMotionType = (metrics) => {
    if (!metrics) return 'idle';

    const { armMovement, bodyMovement, headMovement } = metrics;

    // Simple heuristics for motion types
    if (armMovement > 0.15) {
      return 'arm-wave';
    } else if (bodyMovement > 0.1) {
      return 'body-sway';
    } else if (headMovement > 0.05) {
      return 'head-move';
    } else if (metrics.overallMotion > 0.05) {
      return 'general-motion';
    }

    return 'idle';
  };

  const sendMotionData = (data) => {
    try {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'hud',
          payload: { motionScore: data.motionScore }
        }));
        ws.close();
      };
    } catch (error) {
      console.error('Failed to send motion data:', error);
    }
  };

  const drawPose = (pose) => {
    const canvas = canvasRef.current;
    if (!canvas || !pose) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw key points
    pose.forEach((keypoint, index) => {
      if (keypoint.score > 0.3) { // Confidence threshold
        ctx.beginPath();
        ctx.arc(keypoint.x * canvas.width, keypoint.y * canvas.height, 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#39ff14';
        ctx.fill();
      }
    });

    // Draw connections
    const connections = [
      [0, 1], [0, 2], [1, 3], [2, 4], // Head
      [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
      [5, 11], [6, 12], [11, 12], // Torso
      [11, 13], [13, 15], [12, 14], [14, 16] // Legs
    ];

    connections.forEach(([startIdx, endIdx]) => {
      const start = pose[startIdx];
      const end = pose[endIdx];

      if (start && end && start.score > 0.3 && end.score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
        ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
        ctx.strokeStyle = '#ff00e6';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  };

  return (
    <div className="motion-tracker">
      <div className="motion-header">
        <h3>📹 MOTION TRACKING</h3>
        <div className="motion-controls">
          {!isTracking ? (
            <button className="retro-button small" onClick={startTracking}>
              START MOTION
            </button>
          ) : (
            <button className="retro-button small" onClick={stopTracking}>
              STOP MOTION
            </button>
          )}
        </div>
      </div>

      <div className="motion-content">
        <div className="video-container">
          <video
            ref={videoRef}
            width="320"
            height="240"
            style={{ display: 'none' }}
          />
          <canvas
            ref={canvasRef}
            width="320"
            height="240"
            className="pose-canvas"
          />
        </div>

        <div className="motion-stats">
          <div className="motion-score">
            <span className="score-label">MOTION SCORE</span>
            <span
              className="score-value"
              style={{ color: motionScore > 50 ? '#39ff14' : '#ff3d00' }}
            >
              {Math.round(motionScore)}
            </span>
          </div>

          <div className="motion-type">
            <span className="type-label">MOTION TYPE</span>
            <span className="type-value">{currentMotionType}</span>
          </div>
        </div>
      </div>

      <div className="motion-info">
        <p>Motion tracking adds bonus points to your score!</p>
        <p>Move your arms, sway your body, or dance to earn motion points.</p>
      </div>
    </div>
  );
}
