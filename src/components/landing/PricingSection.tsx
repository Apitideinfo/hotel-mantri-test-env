import React, { useEffect, useRef, useState } from 'react';
import { Check, Star, ArrowRight } from 'lucide-react';
import { PRICING_PLANS } from '../../data/landingData';
import { RazorpayPayButton } from '../common/RazorpayPayButton';


interface PricingSectionProps {
  onSelectPlan: (planId: string) => void;
}

interface CardMousePosition {
  x: number;
  y: number;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [mousePositions, setMousePositions] = useState<Record<string, CardMousePosition>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.12 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleMouseMove = (planId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (window.innerWidth < 768) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePositions((prev) => ({ ...prev, [planId]: { x, y } }));
  };

  // Price Counter Hook
  const usePriceCounter = (targetPrice: number, duration: number = 1200) => {
    const [price, setPrice] = useState(0);
    useEffect(() => {
      if (!isVisible) return;
      let startTime: number | null = null;
      const animate = (now: number) => {
        if (!startTime) startTime = now;
        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setPrice(Math.floor(eased * targetPrice));
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setPrice(targetPrice);
        }
      };
      requestAnimationFrame(animate);
    }, [targetPrice, duration]);
    return price;
  };

  const basicPrice = usePriceCounter(999);
  const proPrice = usePriceCounter(1999);
  const premiumPrice = usePriceCounter(3999);

  const getAnimatedPrice = (id: string) => {
    if (id === 'basic') return basicPrice;
    if (id === 'pro') return proPrice;
    if (id === 'premium') return premiumPrice;
    return 0;
  };

  return (
    <section
      id="pricing"
      ref={sectionRef}
      className="py-24 lg:py-32 bg-[#06152F] relative overflow-hidden select-none border-t border-white/5"
    >
      {/* Background Lighting System */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-blue-600/10 rounded-full blur-[180px]" />
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[400px] bg-cyan-500/10 rounded-full blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-20">
          {/* Badge */}
          <div
            className={`inline-flex items-center gap-2.5 bg-slate-900/90 border border-cyan-400/30 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-bold tracking-widest text-cyan-300 shadow-xl transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span>TRANSPARENT PRICING</span>
          </div>

          {/* Heading */}
          <h2
            className={`text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15] mt-6 mb-6 transition-all duration-700 ease-out delay-100 ${
              isVisible
                ? 'opacity-100 translate-y-0 blur-0'
                : 'opacity-0 translate-y-6 blur-sm'
            }`}
          >
            Simple pricing for{' '}
            <span className="bg-gradient-to-r from-white via-cyan-200 to-blue-400 bg-clip-text text-transparent">
              every stage of your hotel
            </span>
          </h2>

          {/* Description */}
          <p
            className={`text-slate-300/90 text-base sm:text-lg leading-relaxed font-normal max-w-2xl mx-auto transition-all duration-700 ease-out delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            Start small, scale as your operations grow. No hidden setup fees.
          </p>
        </div>

        {/* 3 Pricing Cards Container */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto relative pt-6">
          {/* Subtle horizontal value progression line */}
          <div className="hidden lg:block absolute top-1/2 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-cyan-500/0 via-blue-500/20 to-indigo-500/0 pointer-events-none z-0" />

          {PRICING_PLANS.map((plan, idx) => {
            const isPro = plan.popular;
            const pos = mousePositions[plan.id];
            const displayPrice = getAnimatedPrice(plan.id);

            // Responsive order: Pro first on mobile
            const orderClass = isPro ? 'order-1 md:order-2' : plan.id === 'basic' ? 'order-2 md:order-1' : 'order-3';

            return (
              <div
                key={plan.id}
                onMouseMove={(e) => handleMouseMove(plan.id, e)}
                style={{
                  transitionDelay: isVisible ? `${idx * 120}ms` : '0ms',
                }}
                className={`relative rounded-[28px] p-7 sm:p-8 flex flex-col justify-between transition-all duration-500 transform cursor-pointer ${orderClass} ${
                  isPro
                    ? 'bg-gradient-to-b from-[#0e2752] via-[#081a3d] to-[#040f26] border-2 border-blue-500/80 shadow-[0_0_50px_rgba(59,130,246,0.3)] md:-translate-y-3.5 hover:-translate-y-5'
                    : 'bg-slate-900/85 backdrop-blur-xl border border-white/10 hover:border-cyan-400/40 hover:-translate-y-2 shadow-2xl'
                } ${
                  isVisible
                    ? 'opacity-100 translate-y-0 scale-100'
                    : 'opacity-0 translate-y-8 scale-[0.97]'
                }`}
              >
                {/* Spotlight Cursor Follower */}
                {pos && (
                  <div
                    className="pointer-events-none absolute inset-0 rounded-[28px] overflow-hidden transition-opacity duration-300 opacity-100"
                    style={{
                      background: `radial-gradient(350px circle at ${pos.x}px ${pos.y}px, ${
                        isPro ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 211, 238, 0.1)'
                      }, transparent 80%)`,
                    }}
                  />
                )}

                {/* Popular Badge */}
                {isPro && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 via-cyan-400 to-blue-500 text-white text-[11px] font-black px-4 py-1.5 rounded-full uppercase tracking-wider shadow-xl shadow-blue-500/40 flex items-center gap-1.5 z-30 border border-white/30 whitespace-nowrap">
                    <Star className="w-3.5 h-3.5 fill-current text-white animate-pulse" />
                    <span>MOST POPULAR</span>
                  </div>
                )}


                <div className="relative z-10">
                  {/* Plan Name & Tag */}
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-2xl font-bold text-white tracking-tight">{plan.name}</h3>
                    {isPro && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 bg-cyan-500/15 border border-cyan-400/30 px-2.5 py-0.5 rounded-full">
                        Best Value
                      </span>
                    )}
                  </div>

                  <p className="text-slate-400 text-xs sm:text-sm leading-relaxed mb-6 min-h-[40px]">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 mb-7 pb-6 border-b border-white/10">
                    <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                      ₹{displayPrice.toLocaleString('en-IN')}
                    </span>
                    <span className="text-sm font-semibold text-slate-400">{plan.period}</span>
                  </div>

                  {/* Feature Checklist */}
                  <div className="space-y-3.5 mb-8">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-slate-300 mb-3">
                      Included Features:
                    </p>
                    {plan.features.map((feat) => (
                      <div key={feat} className="group/item flex items-center gap-3 text-xs sm:text-sm text-slate-300 hover:text-white transition-colors">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover/item:scale-110 ${
                          isPro ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/30' : 'bg-white/10 text-slate-200 border border-white/10'
                        }`}>
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Select Plan Button -> Redirects to Signup */}
                <button
                  type="button"
                  onClick={() => onSelectPlan(plan.id)}
                  className={`group relative z-10 w-full py-4 rounded-2xl font-extrabold text-sm transition-all duration-300 flex items-center justify-center gap-2.5 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 ${
                    isPro
                      ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white shadow-xl shadow-blue-500/40 border border-white/20'
                      : 'bg-slate-800/80 hover:bg-slate-800 text-white border border-white/15 hover:border-cyan-400/40 shadow-lg'
                  }`}
                >
                  <span>{plan.cta}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};



