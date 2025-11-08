import { useEffect, useState } from 'react';

interface LogoProps {
  size?: number;
  animated?: boolean;
}

export default function Logo({ size = 80, animated = false }: LogoProps) {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (animated) {
      setAnimate(true);
    }
  }, [animated]);

  return (
    <div style={{
      width: size,
      height: size,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <svg 
        version="1.1" 
        viewBox="0 0 1024 1024" 
        width={size} 
        height={size} 
        xmlns="http://www.w3.org/2000/svg"
        style={{
          overflow: 'visible'
        }}
      >
        <defs>
          <style>
            {`
              @keyframes circleStroke {
                0% {
                  stroke-dashoffset: 2500;
                }
                50% {
                  stroke-dashoffset: 0;
                }
                100% {
                  stroke-dashoffset: 0;
                }
              }

              @keyframes zoomIn {
                0% {
                  transform: scale(3);
                  opacity: 0;
                }
                50% {
                  transform: scale(3);
                  opacity: 0;
                }
                70% {
                  opacity: 1;
                }
                100% {
                  transform: scale(1);
                  opacity: 1;
                }
              }

              @keyframes flash {
                0%, 50% {
                  opacity: 1;
                }
                55%, 65% {
                  opacity: 0.3;
                }
                70%, 80% {
                  opacity: 1;
                }
                85%, 90% {
                  opacity: 0.5;
                }
                95%, 100% {
                  opacity: 1;
                }
              }

              .power-cord {
                stroke-dasharray: 2500;
                stroke-dashoffset: 2500;
                fill: none;
                stroke: #0A4C5A;
                stroke-width: 2;
              }

              .power-cord.animated {
                animation: circleStroke 2s ease-out forwards;
              }

              .zap-bolt {
                transform-origin: center;
                opacity: 0;
              }

              .zap-bolt.animated {
                animation: zoomIn 2s ease-out forwards, flash 2s ease-in-out 2s forwards;
              }
            `}
          </style>
        </defs>
        
        {/* Power cord path (circle outline) */}
        <path 
          className={`power-cord ${animate ? 'animated' : ''}`}
          transform="translate(239,184)" 
          d="m0 0h11l8 4 6 8 1 4v100h81v-101l4-8 8-6 3-1h10l8 4 5 6 2 4v102h36l8 7 1 3v38l-3 5-5 4-2 1h-8v41l-2 16-5 16-9 17-10 13-10 10-14 10-16 8-15 5-6 1-1 34v86l2 21 4 22 6 20 8 18 8 15 9 12 9 10 6 7 11 9 14 10 14 8 20 9 15 5 17 4 24 3h27l24-3 21-5 20-7 25-12 16-10 14-10 10-8 14-12 16-15 8-8 7-8 10-11 9-11 11-14 12-16 12-17 12-19 12-23 9-25 5-25 1-10v-25l-3-23-5-20-7-19-9-17-11-16-12-14-14-14-15-11-17-10-21-9-21-6-18-3-11-1h-18l-23 3-19 5-16 6-16 8-16 10-13 11-15 15-11 14-10 15-9 17-7 19-5 20-2 15v32l4 25 6 20 7 16 9 17 12 16 9 10 13 13 15 11 15 9 20 9 12 4 5 6v34l-3 3h-9l-21-7-22-10-15-9-14-10-14-12-12-11-9-9-9-11-10-14-12-22-10-25-6-21-4-25v-44l3-22 5-21 7-20 7-16 12-21 12-16 12-14 11-11 11-9 15-11 15-9 19-10 21-8 24-6 12-2 11-1h19l21 1 25 4 22 6 19 7 19 9 16 10 12 9 14 12 13 13 11 14 10 14 10 17 10 23 8 26 4 22 2 20v21l-3 27-5 23-8 24-9 19-12 20-16 24-14 19-11 14-11 13-9 11-15 16-26 26-8 7-13 11-16 12-15 10-17 10-16 8-16 7-26 8-25 5-21 2h-30l-20-2-25-5-25-8-18-8-17-9-12-8-13-10-12-11-10-10-9-11-12-17-9-16-9-19-7-21-5-22-3-21-1-24v-109l-1-1-17-3-12-4-15-8-9-7-11-11-8-13-4-8-4-13-2-11v-63h-10l-6-4-3-4-1-3v-35l3-7 5-4 2-1 34-1v-97l3-9 8-7z" 
          fill="none"
        />
        
        {/* Fill for power cord */}
        <path 
          transform="translate(239,184)" 
          d="m0 0h11l8 4 6 8 1 4v100h81v-101l4-8 8-6 3-1h10l8 4 5 6 2 4v102h36l8 7 1 3v38l-3 5-5 4-2 1h-8v41l-2 16-5 16-9 17-10 13-10 10-14 10-16 8-15 5-6 1-1 34v86l2 21 4 22 6 20 8 18 8 15 9 12 9 10 6 7 11 9 14 10 14 8 20 9 15 5 17 4 24 3h27l24-3 21-5 20-7 25-12 16-10 14-10 10-8 14-12 16-15 8-8 7-8 10-11 9-11 11-14 12-16 12-17 12-19 12-23 9-25 5-25 1-10v-25l-3-23-5-20-7-19-9-17-11-16-12-14-14-14-15-11-17-10-21-9-21-6-18-3-11-1h-18l-23 3-19 5-16 6-16 8-16 10-13 11-15 15-11 14-10 15-9 17-7 19-5 20-2 15v32l4 25 6 20 7 16 9 17 12 16 9 10 13 13 15 11 15 9 20 9 12 4 5 6v34l-3 3h-9l-21-7-22-10-15-9-14-10-14-12-12-11-9-9-9-11-10-14-12-22-10-25-6-21-4-25v-44l3-22 5-21 7-20 7-16 12-21 12-16 12-14 11-11 11-9 15-11 15-9 19-10 21-8 24-6 12-2 11-1h19l21 1 25 4 22 6 19 7 19 9 16 10 12 9 14 12 13 13 11 14 10 14 10 17 10 23 8 26 4 22 2 20v21l-3 27-5 23-8 24-9 19-12 20-16 24-14 19-11 14-11 13-9 11-15 16-26 26-8 7-13 11-16 12-15 10-17 10-16 8-16 7-26 8-25 5-21 2h-30l-20-2-25-5-25-8-18-8-17-9-12-8-13-10-12-11-10-10-9-11-12-17-9-16-9-19-7-21-5-22-3-21-1-24v-109l-1-1-17-3-12-4-15-8-9-7-11-11-8-13-4-8-4-13-2-11v-63h-10l-6-4-3-4-1-3v-35l3-7 5-4 2-1 34-1v-97l3-9 8-7z" 
          fill="#0A4C5A" 
          opacity="0.3"
        />
        
        {/* Zap bolt */}
        <path 
          className={`zap-bolt ${animate ? 'animated' : ''}`}
          transform="translate(651,377)" 
          d="m0 0 4 1-4 18-17 64-6 22v3l61 1 2 2-1 5-20 26-14 18-10 13-16 21-13 17-11 14-14 17-9 11-7 9-3 1-1-5 9-30 20-69v-3h-58l-4-2 1-6 10-13 14-19 10-13 16-21 14-19 16-21 14-19 9-12z" 
          fill="#92DEE4"
        />
      </svg>
    </div>
  );
}