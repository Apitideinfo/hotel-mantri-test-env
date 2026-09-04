import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';

interface HeroSectionProps {
  onLogin?: () => void;
  onExploreFeatures?: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onLogin, onExploreFeatures }) => {
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
          className="w-full h-full object-cover object-center scale-105 filter brightness-[0.85] contrast-[1.05]"
        >
          <source src="/hero_video.mp4" type="video/mp4" />
          Your browser does not support video playback.
        </video>
        {/* Dark Vignette and Gradient Overlay for perfect text contrast */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#06152F]/95 via-[#06152F]/75 to-[#06152F]/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#06152F] via-transparent to-[#06152F]/40" />
      </div>

      {/* 2. Hero Content Overlay */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 w-full">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-slate-900/80 backdrop-blur-xl border border-cyan-400/30 px-4 py-2 rounded-full text-xs font-bold text-cyan-300 shadow-xl mb-6">
            <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
            <span>#1 All-In-One Hotel Operating System</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.1] mb-6">
            Smart Hotel Operations.{' '}
            <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              Zero Complexity.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-slate-200 text-base sm:text-xl leading-relaxed font-normal mb-8 max-w-2xl text-shadow-sm">
            Elevate guest experience and maximize revenue with modern Front Desk, Reservations, Financial Accounting, POS, and Channel Management.
          </p>

          {/* Key Value Points */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-6 text-xs sm:text-sm font-semibold text-slate-300 mb-9">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>All-in-One Cloud PMS</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>No Hardware Required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>Instant Setup</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <button
              onClick={onLogin}
              type="button"
              className="group bg-[#1a68fb] hover:bg-blue-600 active:bg-blue-700 text-white font-extrabold text-base px-8 py-4 rounded-2xl shadow-xl shadow-blue-500/30 transition-all duration-200 flex items-center justify-center gap-3 cursor-pointer transform hover:-translate-y-0.5"
            >
              <span>Login to Platform</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={onExploreFeatures}
              type="button"
              className="bg-slate-900/80 hover:bg-slate-800/90 text-white font-bold text-base px-8 py-4 rounded-2xl border border-white/20 backdrop-blur-xl transition-all duration-200 text-center cursor-pointer"
            >
              Explore Features
            </button>
          </div>
        </div>
      </div>

      {/* 3. Bottom Right Floating Video Controls */}
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


