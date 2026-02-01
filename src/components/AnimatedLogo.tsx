"use client";

/**
 * Animated ClawWork logo using actual logo image layers.
 * The WW+claws section has a subtle "handshake" wobble animation.
 * Layout: [Cla] [animated WW] [ork] assembled via absolute positioning.
 * 
 * Source image: logo-nav-final.png (1119x212)
 * Cla:  0-330,   WW: 330-760,   ork: 760-1119
 */
export default function AnimatedLogo({ className = "", height = 64 }: { className?: string; height?: number }) {
  // Original image dimensions
  const srcW = 1119;
  const srcH = 212;
  const scale = height / srcH;
  const totalWidth = Math.round(srcW * scale);

  // Slice boundaries (in source pixels)
  const claEnd = 330;
  const wwStart = 330;
  const wwEnd = 760;
  const orkStart = 760;

  // Scaled positions
  const claW = Math.round(claEnd * scale);
  const wwX = Math.round(wwStart * scale);
  const wwW = Math.round((wwEnd - wwStart) * scale);
  const orkX = Math.round(orkStart * scale);
  const orkW = Math.round((srcW - orkStart) * scale);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: totalWidth, height }}
    >
      {/* Cla - static */}
      <div
        className="absolute top-0 left-0 overflow-hidden"
        style={{ width: claW, height }}
      >
        <img
          src="/branding/logo-nav-final.png"
          alt=""
          style={{
            height,
            width: totalWidth,
            maxWidth: "none",
          }}
        />
      </div>

      {/* WW + claws - animated handshake wobble */}
      <div
        className="absolute top-0 overflow-hidden animate-claw-shake"
        style={{
          left: wwX,
          width: wwW,
          height,
          transformOrigin: "center bottom",
        }}
      >
        <img
          src="/branding/logo-nav-final.png"
          alt=""
          style={{
            height,
            width: totalWidth,
            maxWidth: "none",
            marginLeft: -wwX,
          }}
        />
      </div>

      {/* ork - static */}
      <div
        className="absolute top-0 overflow-hidden"
        style={{ left: orkX, width: orkW, height }}
      >
        <img
          src="/branding/logo-nav-final.png"
          alt=""
          style={{
            height,
            width: totalWidth,
            maxWidth: "none",
            marginLeft: -orkX,
          }}
        />
      </div>

      <style jsx>{`
        @keyframes clawShake {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(1.5deg); }
          40% { transform: rotate(-1.5deg); }
          60% { transform: rotate(1deg); }
          80% { transform: rotate(-0.5deg); }
        }
        .animate-claw-shake {
          animation: clawShake 2.5s ease-in-out infinite;
          animation-delay: 1s;
        }
      `}</style>
    </div>
  );
}
