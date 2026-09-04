import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface HeroSectionProps {
  onLogin?: () => void;
  onExploreFeatures?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn("Autoplay muted fallback:", err);
      });
    }
  }, []);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <section className="relative w-full min-h-[70vh] sm:min-h-[80vh] lg:min-h-[88vh] overflow-hidden select-none bg-[#06152F] flex items-center">
      {/* 1. Full Edge-to-Edge Clean Video Presentation */}
      <div className="absolute inset-0 w-full h-full">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          preload="auto"
          className="w-full h-full object-cover object-center scale-105 filter brightness-100 contrast-100"
        >
          <source src="/hero_video.mp4" type="video/mp4" />
          Your browser does not support video playback.
        </video>
        {/* Subtle Bottom Gradient for seamless section transition */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06152F] via-transparent to-black/10 pointer-events-none" />
      </div>

      {/* 2. Bottom Right Floating Video Controls */}
      <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-white/20 rounded-full px-4 py-2 text-xs text-white shadow-2xl">
        <button
          onClick={togglePlay}
          type="button"
          className="p-1 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
          title={isPlaying ? "Pause Video" : "Play Video"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleMute}
          type="button"
          className="p-1 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
          title={isMuted ? "Unmute Audio" : "Mute Audio"}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <span className="text-[10px] font-extrabold tracking-wider uppercase text-cyan-300 pl-2 border-l border-white/20">
          HD Video
        </span>
      </div>
    </section>
  );
};


