import React, { useEffect, useRef, useState } from 'react';

export default function LiveHUD({ wsUrl }) {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState({ pitch: 0, conf: 0, energy: 0, onBeat: false, combo: 0, timingErr: 0 });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.type === 'hud') {
        setStats(s => ({ ...s, ...msg.payload }));
      }
    };
    return () => ws.close();
  }, [wsUrl]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    function draw() {
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;
      ctx.clearRect(0,0,w,h);

      // Neon grid background
      ctx.globalAlpha = 0.2;
      for (let x=0; x<w; x+=20){ ctx.fillRect(x, 0, 1, h); }
      for (let y=0; y<h; y+=20){ ctx.fillRect(0, y, w, 1); }
      ctx.globalAlpha = 1.0;

      // Pitch bar
      const pitchNorm = Math.min(1, stats.pitch / 1000);
      ctx.fillStyle = '#39ff14';
      ctx.fillRect(20, h-40, (w-40)*pitchNorm, 12);

      // Energy meter
      const eNorm = Math.min(1, stats.energy / 1.0);
      ctx.fillStyle = '#ff00e6';
      ctx.fillRect(20, h-70, (w-40)*eNorm, 10);

      // Timing indicator
      ctx.fillStyle = stats.onBeat ? '#00e5ff' : '#ff3d00';
      const center = w/2;
      ctx.fillRect(center-2 + stats.timingErr*50, 20, 4, 20);

      // Combo
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`COMBO x${stats.combo}`, 20, 30);

      requestAnimationFrame(draw);
    }
    draw();
  }, [stats]);

  return (
    <div className="hud">
      <canvas ref={canvasRef} width={800} height={300} className="crt"/>
      <div className="lights">
        <span className={connected ? 'ok' : 'bad'}>{connected ? 'LIVE' : 'OFFLINE'}</span>
        <span>Conf: {(stats.conf||0).toFixed(2)}</span>
      </div>
    </div>
  );
}