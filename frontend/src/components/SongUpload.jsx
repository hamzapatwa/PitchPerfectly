import React, { useState, useRef } from 'react';

export default function SongUpload({ onSongUploaded, apiBase }) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (file) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav'];
    if (!allowedTypes.includes(file.type)) {
      alert('Please select an MP3 or WAV file.');
      return;
    }

    // Validate file size (50MB limit)
    if (file.size > 50 * 1024 * 1024) {
      alert('File too large. Please select a file under 50MB.');
      return;
    }

    await uploadFile(file);
  };

  const uploadFile = async (file) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        body: formData,
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      onSongUploaded(result.track_id, result.filename);

    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h2 className="neon-text">🎵 DROP YOUR SONG 🎵</h2>
        <p className="upload-subtitle">
          Upload any MP3 or WAV file and we'll analyze it for karaoke scoring!
        </p>
      </div>

      <div
        className={`upload-zone ${dragActive ? 'drag-active' : ''} ${isUploading ? 'uploading' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/mp3,audio/x-wav"
          onChange={handleFileInputChange}
          style={{ display: 'none' }}
        />

        {isUploading ? (
          <div className="upload-progress">
            <div className="progress-spinner">
              <div className="spinner"></div>
            </div>
            <h3>ANALYZING...</h3>
            <p>Extracting beats, pitch, and musical features</p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="progress-text">{uploadProgress}%</p>
          </div>
        ) : (
          <div className="upload-content">
            <div className="upload-icon">🎤</div>
            <h3>DRAG & DROP</h3>
            <p>or click to browse</p>
            <div className="file-types">
              <span className="file-type">MP3</span>
              <span className="file-type">WAV</span>
            </div>
            <p className="file-limit">Max 50MB</p>
          </div>
        )}
      </div>

      <div className="upload-features">
        <div className="feature">
          <span className="feature-icon">🎯</span>
          <span>Auto Beat Detection</span>
        </div>
        <div className="feature">
          <span className="feature-icon">🎼</span>
          <span>Pitch Analysis</span>
        </div>
        <div className="feature">
          <span className="feature-icon">🎵</span>
          <span>Key Detection</span>
        </div>
        <div className="feature">
          <span className="feature-icon">📊</span>
          <span>Real-time Scoring</span>
        </div>
      </div>
    </div>
  );
}
