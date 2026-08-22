import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { RevenueWidget, RoomWidget, StaffWidget, BookingWidget } from './Widgets';

interface HotelVisualizationProps {
  videoUrl?: string;
}

export const HotelVisualization: React.FC<HotelVisualizationProps> = ({
  videoUrl = '/hero_video.mp4'
}) => {
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
  }, [videoUrl]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="relative max-w-xl mx-auto lg:mx-0 my-6">
      {/* Ambient Glow behind video */}
      <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/30 via-blue-600/30 to-indigo-600/30 rounded-3xl blur-xl opacity-60 group-hover:opacity-80 transition duration-500 pointer-events-none" />

      {/* 3D Modern Video Render Card Container */}
      <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-white/20 bg-slate-900/90 backdrop-blur-sm group">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted={isMuted}
          playsInline
          preload="auto"
          className="w-full h-[300px] sm:h-[360px] lg:h-[400px] object-cover object-center transform transition duration-700 group-hover:scale-105"
        >
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        {/* Cinematic Vignette & Lighting Layer */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06152F] via-transparent to-black/20 pointer-events-none opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#06152F]/40 via-transparent to-[#06152F]/40 pointer-events-none" />

        {/* Floating Video Badge & Controls */}
        <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-white/15 rounded-full px-3 py-1.5 text-xs text-white shadow-xl opacity-90 group-hover:opacity-100 transition-opacity">
          <button
            onClick={togglePlay}
            type="button"
            className="p-1 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
            title={isPlaying ? "Pause Video" : "Play Video"}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={toggleMute}
            type="button"
            className="p-1 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
            title={isMuted ? "Unmute Audio" : "Mute Audio"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-300 pl-1 border-l border-white/20">
            HD Video
          </span>
        </div>
      </div>

      {/* 4 Floating Operational Data Cards */}
      <RevenueWidget />
      <RoomWidget />
      <StaffWidget />
      <BookingWidget />
    </div>
  );
};


