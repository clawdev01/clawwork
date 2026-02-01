"use client";

/**
 * Animated WW claws from the ClawWork logo.
 * Just the claw section with a detailed handshake animation.
 * 
 * The WW is split into left-W and right-W halves, each rotating
 * toward the other to create a handshake/grip effect.
 * 
 * Source: logo-nav-final.png (1119x212), WW region: x 350-760
 */
export default function AnimatedLogo({ className = "", height = 80 }: { className?: string; height?: number }) {
  const srcW = 1119;
  const srcH = 212;
  const scale = height / srcH;

  // WW region in source pixels
  const wwStart = 350;
  const wwEnd = 760;
  const wwMid = Math.round((wwStart + wwEnd) / 2); // center split point
  const wwW = Math.round((wwEnd - wwStart) * scale);
  const fullW = Math.round(srcW * scale);

  // Left half of WW
  const leftW = Math.round((wwMid - wwStart) * scale);
  // Right half of WW
  const rightW = Math.round((wwEnd - wwMid) * scale);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: wwW, height }}
    >
      {/* Left W - rotates clockwise (toward right) */}
      <div
        className="absolute top-0 left-0 overflow-hidden claw-left"
        style={{
          width: leftW,
          height,
          transformOrigin: `${leftW}px ${height}px`,
        }}
      >
        <img
          src="/branding/logo-nav-final.png"
          alt="ClawWork"
          draggable={false}
          style={{
            height,
            width: fullW,
            maxWidth: "none",
            marginLeft: -Math.round(wwStart * scale),
          }}
        />
      </div>

      {/* Right W - rotates counter-clockwise (toward left) */}
      <div
        className="absolute top-0 overflow-hidden claw-right"
        style={{
          left: leftW,
          width: rightW,
          height,
          transformOrigin: `0px ${height}px`,
        }}
      >
        <img
          src="/branding/logo-nav-final.png"
          alt=""
          draggable={false}
          style={{
            height,
            width: fullW,
            maxWidth: "none",
            marginLeft: -Math.round(wwMid * scale),
          }}
        />
      </div>

      <style jsx>{`
        @keyframes clawLeftShake {
          0%, 100% {
            transform: rotate(0deg);
          }
          12% {
            transform: rotate(2.5deg);
          }
          24% {
            transform: rotate(0deg);
          }
          36% {
            transform: rotate(2deg);
          }
          48% {
            transform: rotate(0deg);
          }
          60% {
            transform: rotate(1.2deg);
          }
          72% {
            transform: rotate(0deg);
          }
        }
        @keyframes clawRightShake {
          0%, 100% {
            transform: rotate(0deg);
          }
          12% {
            transform: rotate(-2.5deg);
          }
          24% {
            transform: rotate(0deg);
          }
          36% {
            transform: rotate(-2deg);
          }
          48% {
            transform: rotate(0deg);
          }
          60% {
            transform: rotate(-1.2deg);
          }
          72% {
            transform: rotate(0deg);
          }
        }
        .claw-left {
          animation: clawLeftShake 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .claw-right {
          animation: clawRightShake 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
