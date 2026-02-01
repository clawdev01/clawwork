"use client";

export default function AnimatedClaws() {
  return (
    <div className="flex items-center justify-center mb-8">
      <svg
        width="120"
        height="80"
        viewBox="0 0 120 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="opacity-90"
      >
        <defs>
          <linearGradient id="clawGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E01B24" />
            <stop offset="50%" stopColor="#FF6B35" />
            <stop offset="100%" stopColor="#FFB800" />
          </linearGradient>
        </defs>

        {/* Left W */}
        <g className="animate-claw-left" style={{ transformOrigin: "30px 75px" }}>
          {/* W shape */}
          <path
            d="M5 10 L18 70 L30 35 L42 70 L55 10"
            stroke="url(#clawGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Left claw tip */}
          <g className="animate-claw-tip-left" style={{ transformOrigin: "5px 10px" }}>
            <circle cx="5" cy="12" r="3" fill="#FF6B35" opacity="0.8" />
            <path
              d="M5 10 C2 4, -2 2, -1 -2"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M5 10 C8 5, 6 1, 3 -1"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          {/* Middle claw tip */}
          <g className="animate-claw-tip-left" style={{ transformOrigin: "30px 35px" }}>
            <circle cx="30" cy="36" r="2.5" fill="#FF6B35" opacity="0.8" />
          </g>
          {/* Right claw tip */}
          <g style={{ transformOrigin: "55px 10px" }}>
            <circle cx="55" cy="12" r="3" fill="#FF6B35" opacity="0.8" />
            <path
              d="M55 10 C52 4, 48 2, 49 -2"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M55 10 C58 5, 60 1, 58 -1"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </g>

        {/* Right W */}
        <g className="animate-claw-right" style={{ transformOrigin: "90px 75px" }}>
          {/* W shape */}
          <path
            d="M65 10 L78 70 L90 35 L102 70 L115 10"
            stroke="url(#clawGrad)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* Left claw tip */}
          <g style={{ transformOrigin: "65px 10px" }}>
            <circle cx="65" cy="12" r="3" fill="#FF6B35" opacity="0.8" />
            <path
              d="M65 10 C62 4, 58 2, 59 -2"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M65 10 C68 5, 66 1, 63 -1"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          {/* Middle claw tip */}
          <g className="animate-claw-tip-right" style={{ transformOrigin: "90px 35px" }}>
            <circle cx="90" cy="36" r="2.5" fill="#FF6B35" opacity="0.8" />
          </g>
          {/* Right claw tip */}
          <g className="animate-claw-tip-right" style={{ transformOrigin: "115px 10px" }}>
            <circle cx="115" cy="12" r="3" fill="#FF6B35" opacity="0.8" />
            <path
              d="M115 10 C112 4, 108 2, 109 -2"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M115 10 C118 5, 120 1, 118 -1"
              stroke="url(#clawGrad)"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
            />
          </g>
        </g>
      </svg>

      <style jsx>{`
        @keyframes clawLeft {
          0%, 100% { transform: rotate(0deg); }
          30%, 50% { transform: rotate(3deg); }
        }
        @keyframes clawRight {
          0%, 100% { transform: rotate(0deg); }
          30%, 50% { transform: rotate(-3deg); }
        }
        @keyframes tipLeft {
          0%, 100% { transform: rotate(0deg); }
          35%, 45% { transform: rotate(5deg); }
        }
        @keyframes tipRight {
          0%, 100% { transform: rotate(0deg); }
          35%, 45% { transform: rotate(-5deg); }
        }
        .animate-claw-left {
          animation: clawLeft 3s ease-in-out infinite;
        }
        .animate-claw-right {
          animation: clawRight 3s ease-in-out infinite;
        }
        .animate-claw-tip-left {
          animation: tipLeft 3s ease-in-out infinite;
        }
        .animate-claw-tip-right {
          animation: tipRight 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
