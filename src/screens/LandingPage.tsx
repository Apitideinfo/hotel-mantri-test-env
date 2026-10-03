import React from 'react';
import { Header } from '../components/landing/Header';
import { HeroSection } from '../components/landing/HeroSection';
import { OverviewSuiteSection } from '../components/landing/OverviewSuiteSection';
import { CoreModulesSection } from '../components/landing/CoreModulesSection';
import { TestimonialsSection } from '../components/landing/TestimonialsSection';
import { ManagementShowcaseSection } from '../components/landing/ManagementShowcaseSection';
import { BuiltForHoteliersSection } from '../components/landing/BuiltForHoteliersSection';
import { CloudReliabilitySection } from '../components/landing/CloudReliabilitySection';
import { SeamlessIntegrationsShowcase } from '../components/landing/SeamlessIntegrationsShowcase';
import { HospitalityInsightsSection } from '../components/landing/HospitalityInsightsSection';
import { TrustedPioneersSection } from '../components/landing/TrustedPioneersSection';
import { IntegrationsSection } from '../components/landing/IntegrationsSection';
import { TalkToCeoBanner } from '../components/landing/TalkToCeoBanner';
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
    <div className="min-h-screen bg-white font-sans antialiased text-slate-900 selection:bg-blue-500 selection:text-white overflow-x-hidden">
      {/* 1. Sticky Header */}
      <Header onNavigateLogin={onNavigateLogin} />

      {/* 2. Hero — Full-screen image + overlaid copy & CTAs */}
      <HeroSection
        onLogin={onNavigateLogin}
        onExploreFeatures={handleScrollToFeatures}
      />

      {/* 3. Overview Suite Section — All in one Hospitality Suite */}
      <OverviewSuiteSection
        onLogin={onNavigateLogin}
        onBookDemo={onNavigateLogin}
      />

      {/* 4. The Platform — Core Modules Section (6 Photo Cards with View Features hover) */}
      <CoreModulesSection />

      {/* 5. Testimonials — Beyond expectations (Infinite Moving Marquee) */}
      <TestimonialsSection />

      {/* 6. Management Showcase — Premium Hotel Management with 4 Tabs, Stats (400+, 98%, 24/7, 1M+) & Performance Metrics */}
      <ManagementShowcaseSection onLogin={onNavigateLogin} />

      {/* 7. Built For Hoteliers, By Hoteliers — Narrative + Sunset Pool Panoramic Image */}
      <BuiltForHoteliersSection />

      {/* 8. Innovation — Cloud-Native Reliability (50/50 Split) */}
      <CloudReliabilitySection />

      {/* 9. Ecosystem — Seamless Integrations (50/50 Split Dark Mode) */}
      <SeamlessIntegrationsShowcase />

      {/* 10. Knowledge Base — Hospitality Insights (3 Blog/Article Cards) */}
      <HospitalityInsightsSection />

      {/* 11. Social Proof — Trusted by hospitality pioneers around the world (Moving Marquee) */}
      <TrustedPioneersSection />

      {/* 12. Connect with your tools — Integrations with Category Filter Tabs & Moving Marquee */}
      <IntegrationsSection onLogin={onNavigateLogin} />

      {/* 13. Talk directly with our CEO Banner */}
      <TalkToCeoBanner onLogin={onNavigateLogin} />

      {/* 14. Footer */}
      <Footer onNavigateLogin={onNavigateLogin} />
    </div>
  );
};
