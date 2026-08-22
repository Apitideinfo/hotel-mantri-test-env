import React from 'react';
import { Header } from '../components/landing/Header';
import { HeroSection } from '../components/landing/HeroSection';
import { TrustStrip } from '../components/landing/TrustStrip';
import { AboutSection } from '../components/landing/AboutSection';
import { FeaturesSection } from '../components/landing/FeaturesSection';
import { JanmashtamiBanner } from '../components/landing/JanmashtamiBanner';
import { ProductShowcase } from '../components/landing/ProductShowcase';
import { WhyHotelMantri } from '../components/landing/WhyHotelMantri';
import { PricingSection } from '../components/landing/PricingSection';
import { FinalCTA } from '../components/landing/FinalCTA';
import { PreFooterBanner } from '../components/landing/PreFooterBanner';
import { Footer } from '../components/landing/Footer';

interface LandingPageProps {
  onNavigateLogin: () => void;
  onNavigateSignup: (planId?: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigateLogin, onNavigateSignup }) => {
  const handleScrollToPricing = () => {
    const el = document.getElementById('pricing');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      onNavigateSignup('pro');
    }
  };

  const handleScrollToFeatures = () => {
    const el = document.getElementById('features');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#06152F] font-sans antialiased text-white selection:bg-blue-500 selection:text-white overflow-x-hidden">
      {/* 1. Sticky Header */}
      <Header
        onNavigateLogin={onNavigateLogin}
        onNavigateSignup={handleScrollToPricing}
      />

      {/* 2. Hero Section */}
      <HeroSection
        onStartNow={handleScrollToPricing}
        onExploreFeatures={handleScrollToFeatures}
      />

      {/* 3. Trust Strip */}
      <TrustStrip />

      {/* 4. About Section */}
      <AboutSection />

      {/* 5. Features Section */}
      <FeaturesSection />

      {/* 5.5. Janmashtami Festive Offer Banner */}
      <JanmashtamiBanner onClaimOffer={() => onNavigateSignup('pro')} />

      {/* 6. Product Showcase */}
      <ProductShowcase />

      {/* 7. Why HotelMantri */}
      <WhyHotelMantri />

      {/* 8. Pricing Section */}
      <PricingSection onSelectPlan={(planId) => onNavigateSignup(planId)} />

      {/* 9. Final CTA */}
      <FinalCTA
        onStartNow={handleScrollToPricing}
        onLogin={onNavigateLogin}
      />

      {/* 9.5. Pre-Footer Banner */}
      <PreFooterBanner />

      {/* 10. Footer */}
      <Footer
        onNavigateLogin={onNavigateLogin}
        onNavigateSignup={handleScrollToPricing}
      />
    </div>
  );
};


