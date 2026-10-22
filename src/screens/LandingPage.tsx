import React, { useState } from 'react';
import { Header } from '../components/landing/Header';
import { HeroSection } from '../components/landing/HeroSection';
import { CredibilityStrip } from '../components/landing/CredibilityStrip';
import { ConnectedArchitectureSection } from '../components/landing/ConnectedArchitectureSection';
import { ProductModulesSection } from '../components/landing/ProductModulesSection';
import { WhatsAppSection } from '../components/landing/WhatsAppSection';
import { ChannelManagerShowcaseSection } from '../components/landing/ChannelManagerShowcaseSection';
import { WhoIsItForSection } from '../components/landing/WhoIsItForSection';
import { TestimonialsSection } from '../components/landing/TestimonialsSection';
import { HowItWorks } from '../components/landing/HowItWorks';
import { FinalCTA } from '../components/landing/FinalCTA';
import { Footer } from '../components/landing/Footer';
import { BookDemoModal } from '../components/landing/BookDemoModal';

interface LandingPageProps {
  onNavigateLogin: () => void;
  onNavigateSignup?: (planId?: string) => void;
  onNavigatePrivacy?: () => void;
  onNavigateDeletion?: () => void;
  onNavigateTerms?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigateLogin,
  onNavigateSignup,
  onNavigatePrivacy,
  onNavigateDeletion,
  onNavigateTerms,
}) => {
  const [isBookDemoOpen, setIsBookDemoOpen] = useState(false);

  const handleScrollToFeatures = () => {
    const el = document.getElementById('modules');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleOpenDemo = () => {
    setIsBookDemoOpen(true);
  };

  return (
    <div className="min-h-screen bg-white font-sans antialiased text-slate-900 selection:bg-amber-400 selection:text-slate-950 overflow-x-hidden">
      {/* 0. Interactive Book Demo Modal (WhatsApp dispatch) */}
      <BookDemoModal
        isOpen={isBookDemoOpen}
        onClose={() => setIsBookDemoOpen(false)}
        onNavigateLogin={onNavigateLogin}
      />

      {/* 1. Sticky Modern SaaS Header */}
      <Header
        onNavigateLogin={onNavigateLogin}
        onOpenBookDemo={handleOpenDemo}
      />

      {/* 2. Hero Section — Hotel OS with Live Product UI & KPIs */}
      <HeroSection
        onLogin={onNavigateLogin}
        onOpenBookDemo={handleOpenDemo}
        onExploreFeatures={handleScrollToFeatures}
      />

      {/* 3. Credibility Strip — Built for Independent Hotels, Resorts & Boutique Properties */}
      <CredibilityStrip />

      {/* 4. Connected Architecture — One Hotel. One System. No Double Entry. */}
      <ConnectedArchitectureSection onOpenBookDemo={handleOpenDemo} />

      {/* 5. Powerful Modules for Complete Hotel Management (8 Product Cards) */}
      <ProductModulesSection onOpenBookDemo={handleOpenDemo} />

      {/* 6. WhatsApp Updates — Daily Reports, Occupancy & Alerts */}
      <WhatsAppSection onOpenBookDemo={handleOpenDemo} />

      {/* 7. Channel Manager Showcase — Rates & Inventory Synced Everywhere */}
      <ChannelManagerShowcaseSection onOpenBookDemo={handleOpenDemo} />

      {/* 8. Who is HotelMantri For? — 6 Property Archetypes */}
      <WhoIsItForSection />

      {/* 9. Testimonials — Simpler Operations. Happier Guests. Stronger Business. */}
      <TestimonialsSection />

      {/* 10. How HotelMantri Works — 5 Simple Steps */}
      <HowItWorks />

      {/* 11. Final Dark Call-to-Action */}
      <FinalCTA
        onLogin={onNavigateLogin}
        onOpenBookDemo={handleOpenDemo}
      />

      {/* 12. Clean Structured Footer */}
      <Footer
        onNavigateLogin={onNavigateLogin}
        onOpenBookDemo={handleOpenDemo}
        onNavigatePrivacy={onNavigatePrivacy}
        onNavigateDeletion={onNavigateDeletion}
        onNavigateTerms={onNavigateTerms}
      />
    </div>
  );
};
