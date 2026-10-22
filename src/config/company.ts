/**
 * Official Company & Branch Office Configuration for Hotel Mantri.
 * Centralized, maintainable structure for corporate contact details, support helplines,
 * and confirmed regional branch locations.
 */

export interface BranchLocation {
  id: string;
  city: string;
  region: string;
  label: string;
  country: string;
}

export const COMPANY_CONTACT = {
  name: 'Hotel Mantri',
  legalName: 'Hotel Mantri PMS',
  phone: '+919925958831',
  phoneDisplay: '+91 99259 58831',
  whatsappUrl: 'https://wa.me/919925958831',
  email: 'booking@hotelmantri.com',
  website: 'https://hotelmantri.com',
} as const;

/**
 * Official verified branch office locations for Hotel Mantri.
 * Only confirmed city/state details are listed; no fabricated street addresses.
 */
export const OFFICIAL_BRANCHES: BranchLocation[] = [
  {
    id: 'ahmedabad',
    city: 'Ahmedabad',
    region: 'Gujarat',
    label: 'Ahmedabad, Gujarat',
    country: 'India',
  },
  {
    id: 'rajkot',
    city: 'Rajkot',
    region: 'Gujarat',
    label: 'Rajkot, Gujarat',
    country: 'India',
  },
  {
    id: 'delhi',
    city: 'Delhi',
    region: 'Delhi',
    label: 'Delhi, India',
    country: 'India',
  },
];
