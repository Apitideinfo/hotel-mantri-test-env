import React from 'react';
import { Header } from '../components/landing/Header';
import { HeroSection } from '../components/landing/HeroSection';
import { TrustStrip } from '../components/landing/TrustStrip';
import { AboutSection } from '../components/landing/AboutSection';
import { FeaturesSection } from '../components/landing/FeaturesSection';
import { ProductShowcase } from '../components/landing/ProductShowcase';
import { WhyHotelMantri } from '../components/landing/WhyHotelMantri';
import { FinalCTA } from '../components/landing/FinalCTA';
import { PreFooterBanner } from '../components/landing/PreFooterBanner';
import { Footer } from '../components/landing/Footer';

interface LandingPageProps {
  onNavigateLogin: () => void;
  onNavigateSignup?: (planId?: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigateLogin }) => {
  const handleScrollToFeatures = () => {
    const el = document.getElementById('features');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#06152F] font-sans antialiased text-white selection:bg-blue-500 selection:text-white overflow-x-hidden">
      {/* 1. Sticky Header */}
      <Header
        onNavigateLogin={onNavigateLogin}
      />

      {/* 2. Hero Section */}
      <HeroSection
        onLogin={onNavigateLogin}
        onExploreFeatures={handleScrollToFeatures}
      />

      {/* 3. Trust Strip */}
      <TrustStrip />

      {/* 4. About Section */}
      <AboutSection />

      {/* 5. Features Section */}
      <FeaturesSection />

      {/* 6. Product Showcase */}
      <ProductShowcase />

      {/* 7. Why HotelMantri */}
      <WhyHotelMantri />

      {/* 8. Final CTA */}
      <FinalCTA
        onLogin={onNavigateLogin}
      />

      {/* 9. Pre-Footer Banner */}
      <PreFooterBanner />

      {/* 10. Footer */}
      <Footer
        onNavigateLogin={onNavigateLogin}
      />
    </div>
  );
};


