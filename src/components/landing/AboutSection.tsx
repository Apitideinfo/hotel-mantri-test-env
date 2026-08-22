import React, { useEffect, useRef, useState } from 'react';
import { Zap, Eye, Smile, ArrowRight } from 'lucide-react';

interface CardMousePosition {
  x: number;
  y: number;
}

export const AboutSection: React.FC = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mousePositions, setMousePositions] = useState<Record<number, CardMousePosition>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (index: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePositions((prev) => ({ ...prev, [index]: { x, y } }));
  };

  const cardsData = [
    {
      id: 'operations',
      icon: Zap,
      title: 'Smarter Operations',
      benefit: 'Less manual work',
      description: 'Centralize everyday hotel workflows — from front desk check-in to housekeeping updates — in one place.',
      accentColor: 'from-cyan-500/15 via-cyan-500/5 to-transparent',
      borderColor: 'group-hover:border-cyan-400/50',
      glowColor: 'bg-cyan-500/25',
      badgeBg: 'bg-cyan-500/10 text-cyan-300 border-cyan-400/30',
      iconColor: 'text-cyan-400',
      delayMs: 0,
    },
    {
      id: 'visibility',
      icon: Eye,
      title: 'Better Visibility',
      benefit: 'Better decisions',
      description: 'Track daily revenue, Occupancy, ARR/RevPAR, and expense metrics in real time with zero manual math.',
      accentColor: 'from-blue-500/15 via-blue-500/5 to-transparent',
      borderColor: 'group-hover:border-blue-400/50',
      glowColor: 'bg-blue-500/25',
      badgeBg: 'bg-blue-500/10 text-blue-300 border-blue-400/30',
      iconColor: 'text-blue-400',
      delayMs: 120,
    },
    {
      id: 'guests',
      icon: Smile,
      title: 'Happier Guests',
      benefit: 'Better guest experience',
      description: 'Deliver faster check-ins, instant WhatsApp bills, and an organized experience that brings guests back.',
      accentColor: 'from-emerald-500/15 via-emerald-500/5 to-transparent',
      borderColor: 'group-hover:border-emerald-400/50',
      glowColor: 'bg-emerald-500/25',
      badgeBg: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30',
      iconColor: 'text-emerald-400',
      delayMs: 240,
    },
  ];

  return (
    <section
      id="about"
      ref={sectionRef}
      className="py-24 lg:py-32 bg-[#06152F] relative overflow-hidden select-none"
    >
      {/* 8. Ambient Lighting System & Soft Texture Grid */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-cyan-500/10 rounded-full blur-[160px]" />
        <div className="absolute bottom-10 right-1/4 w-[600px] h-[450px] bg-blue-600/10 rounded-full blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          {/* 1. TOP LABEL: Badge with pulsing dot */}
          <div
            className={`inline-flex items-center gap-2.5 bg-slate-900/90 border border-cyan-500/30 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold tracking-widest text-cyan-300 shadow-xl transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span>ABOUT HOTELMANTRI</span>
          </div>

          {/* 2. MAIN HEADING */}
          <h2
            className={`text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] mt-6 mb-6 transition-all duration-700 ease-out delay-100 ${
              isVisible
                ? 'opacity-100 translate-y-0 blur-0'
                : 'opacity-0 translate-y-6 blur-sm'
            }`}
          >
            Everything your hotel needs.<br />
            <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-indigo-300 bg-clip-text text-transparent">
              In one place.
            </span>
          </h2>

          {/* 3. DESCRIPTION */}
          <p
            className={`text-slate-300/90 text-base sm:text-lg leading-relaxed font-normal max-w-2xl mx-auto transition-all duration-700 ease-out delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            HotelMantri helps hotels simplify everyday operations by bringing rooms, bookings, finance, staff, reports, and guest communication into one connected platform. The goal is to reduce manual work, improve visibility, and help hotel teams make faster operational decisions.
          </p>
        </div>

        {/* 9. CARD CONNECTION EFFECT (Subtle glowing line connecting the 3 cards on desktop) */}
        <div className="relative">
          <div className="hidden lg:block absolute top-1/2 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-cyan-500/0 via-cyan-400/20 to-emerald-500/0 -translate-y-1/2 pointer-events-none z-0" />

          {/* 4. FEATURE CARDS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
            {cardsData.map((card, index) => {
              const IconComp = card.icon;
              const pos = mousePositions[index];

              return (
                <div
                  key={card.id}
                  onMouseMove={(e) => handleMouseMove(index, e)}
                  style={{
                    transitionDelay: isVisible ? `${card.delayMs}ms` : '0ms',
                  }}
                  className={`group relative bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-[28px] p-8 transition-all duration-500 transform hover:-translate-y-2 shadow-2xl hover:shadow-cyan-500/10 cursor-pointer overflow-hidden ${
                    card.borderColor
                  } ${
                    isVisible
                      ? 'opacity-100 translate-y-0 scale-100'
                      : 'opacity-0 translate-y-8 scale-[0.97]'
                  }`}
                >
                  {/* Spotlight Radial Glow following cursor */}
                  {pos && (
                    <div
                      className="pointer-events-none absolute -inset-px transition-opacity duration-300 opacity-0 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(350px circle at ${pos.x}px ${pos.y}px, rgba(56, 189, 248, 0.12), transparent 80%)`,
                      }}
                    />
                  )}

                  {/* Ambient Interior Surface Gradient */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-b ${card.accentColor} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                  />

                  {/* 6. ICON CONTAINER */}
                  <div className="relative z-10 flex items-center justify-between mb-8">
                    <div className="relative">
                      {/* Glow behind Icon */}
                      <div
                        className={`absolute -inset-2 ${card.glowColor} rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                      />
                      <div className="relative w-14 h-14 rounded-2xl bg-slate-800/80 border border-white/15 backdrop-blur-md flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                        <IconComp className={`w-6 h-6 ${card.iconColor} transition-colors`} />
                      </div>
                    </div>

                    {/* 13. UX Benefit Pill */}
                    <span
                      className={`text-[11px] font-bold px-3 py-1 rounded-full border backdrop-blur-md transition-all duration-300 ${card.badgeBg}`}
                    >
                      → {card.benefit}
                    </span>
                  </div>

                  {/* 4. CARD CONTENT */}
                  <div className="relative z-10">
                    <h3 className="text-2xl font-bold text-white mb-3 tracking-tight group-hover:text-cyan-200 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-slate-400 text-sm sm:text-base leading-relaxed group-hover:text-slate-200 transition-colors">
                      {card.description}
                    </p>
                  </div>

                  {/* Card Footer Micro Details */}
                  <div className="relative z-10 mt-8 pt-6 border-t border-white/5 flex items-center justify-between text-xs font-semibold text-slate-500 group-hover:text-cyan-300 transition-colors">
                    <span>Capability details</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

