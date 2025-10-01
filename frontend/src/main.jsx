import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles/retro.css';

// Hide loading screen
const loadingScreen = document.querySelector('.loading-screen');
if (loadingScreen) {
  loadingScreen.style.display = 'none';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
