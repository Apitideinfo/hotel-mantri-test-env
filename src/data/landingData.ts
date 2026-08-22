export interface FeatureItem {
  id: string;
  icon: string;
  title: string;
  description: string;
}

export interface PricingPlan {
  id: 'basic' | 'pro' | 'premium';
  name: string;
  price: string;
  period: string;
  popular?: boolean;
  description: string;
  features: string[];
  cta: string;
}

export interface ValueProp {
  title: string;
  description: string;
  icon: string;
}

export const LANDING_FEATURES: FeatureItem[] = [
  {
    id: 'room-mgmt',
    icon: 'Bed',
    title: '1. Room Management',
    description: 'Manage room availability, occupancy, housekeeping status, and instant room allocation from one intuitive grid.',
  },
  {
    id: 'booking-mgmt',
    icon: 'CalendarCheck',
    title: '2. Booking Management',
    description: 'Track reservations, group check-ins, check-outs, guest waitlists, and live room chart activity in real time.',
  },
  {
    id: 'finance-gst',
    icon: 'Receipt',
    title: '3. Finance & GST',
    description: 'Manage hotel revenue, GST compliance, automated tax invoices, vendor expenses, and financial ledger posting.',
  },
  {
    id: 'reports-analytics',
    icon: 'BarChart3',
    title: '4. Reports & Analytics',
    description: 'Get actionable operational insights, Occupancy ARR/RevPAR metrics, MIS reports, and owner profit dashboards.',
  },
  {
    id: 'whatsapp-billing',
    icon: 'MessageSquare',
    title: '5. WhatsApp Billing',
    description: 'Send bills, check-in confirmations, digital folios, and instant updates directly to guests via WhatsApp.',
  },
  {
    id: 'staff-mgmt',
    icon: 'Users',
    title: '6. Staff Management',
    description: 'Manage staff roles, shift attendance, salary advances, settlements, and staff duty responsibilities.',
  },
  {
    id: 'guest-mgmt',
    icon: 'UserCheck',
    title: '7. Guest Management',
    description: 'Maintain detailed guest CRM profiles, VIP preferences, corporate rate plans, and loyalty history.',
  },
  {
    id: 'revenue-mgmt',
    icon: 'TrendingUp',
    title: '8. Revenue Management',
    description: 'Monitor daily revenue trends, OTA channel rates, dynamic rate rules, and seasonal pricing opportunities.',
  },
];

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: '₹999',
    period: '/ month',
    description: 'Essential toolkit for small boutique hotels & guest houses.',
    features: [
      'Room Management',
      'Basic Booking Management',
      'Guest Management',
      'Basic Reports',
      'Email Support',
    ],
    cta: 'Get Started',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹1,999',
    period: '/ month',
    popular: true,
    description: 'Complete operational suite for growing medium-scale hotels.',
    features: [
      'Everything in Basic',
      'Finance & GST Invoicing',
      'Advanced Reports & MIS',
      'WhatsApp Billing Integration',
      'Staff & Expense Management',
      'Priority Support',
    ],
    cta: 'Start Pro',
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '₹3,999',
    period: '/ month',
    description: 'Enterprise solution for multi-property chains & luxury resorts.',
    features: [
      'Everything in Pro',
      'Advanced Revenue Analytics',
      'Channel Manager Sync',
      'Multi-property Management',
      'Dedicated Account Manager',
      '24/7 Premium Phone Support',
    ],
    cta: 'Start Premium',
  },
];

export const VALUE_PROPS: ValueProp[] = [
  {
    title: 'Smarter Operations',
    description: 'Centralize everyday hotel workflows — from front desk check-in to housekeeping updates — in one place.',
    icon: 'Zap',
  },
  {
    title: 'Better Visibility',
    description: 'Track daily revenue, Occupancy ARR/RevPAR, and expense metrics in real time with zero manual math.',
    icon: 'Eye',
  },
  {
    title: 'Happier Guests',
    description: 'Deliver faster check-ins, instant WhatsApp bills, and an organized experience that brings guests back.',
    icon: 'Smile',
  },
];

export const TRUST_STATS = [
  { label: 'Modern Platform', value: 'Built for Hotels' },
  { label: 'Cloud Architecture', value: 'Access Anywhere' },
  { label: 'Tax Compliance', value: 'GST-Ready' },
  { label: 'Data Protection', value: 'Secure Cloud' },
];

