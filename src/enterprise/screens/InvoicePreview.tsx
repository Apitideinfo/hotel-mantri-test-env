import { forwardRef } from 'react';
import type { Invoice, InvoiceItem, BillingSettings } from '../types';

interface Props {
  invoice: Invoice | null;
  items: InvoiceItem[];
  settings: BillingSettings;
  hotelName?: string;
  hotelAddress?: string;
  hotelCity?: string;
  hotelState?: string;
  hotelPropertyCode?: string;
  hotelAdminEmail?: string;
  hotelMobile?: string;
  hotelOwnerName?: string;
  planName?: string;
  preview?: boolean;
  scale?: number;
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  daily_entry: 'Daily Entry',
  room_chart: 'Room Chart',
  finance: 'Finance',
  gst: 'GST',
  reports: 'Reports',
  mtd_ytd: 'MTD / YTD',
  whatsapp_reports: 'WhatsApp Reports',
  multi_user: 'Multi User',
  multi_hotel: 'Multi Hotel',
  support: 'Support',
};

const numberToWords = (n: number): string => {
  if (n === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const helper = (num: number): string => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + helper(num % 100) : '');
    if (num < 100000) return helper(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + helper(num % 1000) : '');
    if (num < 10000000) return helper(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + helper(num % 100000) : '');
    return helper(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + helper(num % 10000000) : '');
  };
  const rupees = Math.floor(n);
  const paise = Math.round((n - rupees) * 100);
  let result = helper(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + helper(paise) + ' Paise';
  return result + ' Only';
};

const fmtMoney = (n: number): string => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null): string => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const InvoicePreview = forwardRef<HTMLDivElement, Props>(({
  invoice, items, settings, hotelName, hotelAddress, hotelCity, hotelState,
  hotelPropertyCode, hotelAdminEmail, hotelMobile, hotelOwnerName, planName, preview, scale,
}, ref) => {
  const cd = settings.company_details;
  const br = settings.branding;
  const gst = settings.gst;
  const pay = settings.payment;
  const terms = settings.terms;

  const primary = br.primary_color || '#0f172a';
  const secondary = br.secondary_color || '#1e3a5f';
  const accent = br.accent_color || '#d4af37';

  const inv = invoice;
  const isInterstate = inv?.is_interstate ?? false;

  const statusColors: Record<string, string> = {
    Draft: '#64748b',
    Issued: '#2563eb',
    Sent: '#7c3aed',
    'Partially Paid': '#d97706',
    Paid: '#059669',
    Overdue: '#dc2626',
    Cancelled: '#991b1b',
    'Credit Note Issued': '#be185d',
  };

  return (
    <div
      ref={ref}
      className={`bg-white ${preview ? 'shadow-2xl' : ''} mx-auto`}
      style={{
        width: preview ? `${210 * (scale || 1)}mm` : '210mm',
        minHeight: preview ? `${297 * (scale || 1)}mm` : '297mm',
        maxWidth: '100%',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: `${(scale || 1) * 11}px`,
        color: '#1e293b',
        borderRadius: '8px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Watermark */}
      {br.watermark_url && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: br.watermark_opacity || 0.05, pointerEvents: 'none', zIndex: 0,
        }}>
          <img src={br.watermark_url} alt="" style={{ width: '60%', height: 'auto' }} />
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
        color: '#fff', padding: '24px 32px', position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
          {/* Logo + Company */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            {br.logo_url && (
              <img src={br.logo_url} alt="logo" style={{
                width: br.logo_size === 'large' ? '72px' : br.logo_size === 'small' ? '40px' : '56px',
                height: 'auto', borderRadius: '8px', background: '#fff', padding: '4px',
              }} />
            )}
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, lineHeight: 1.2 }}>
                {cd.brand_name || 'Hotel Mantri'}
              </h1>
              {cd.legal_name && cd.legal_name !== cd.brand_name && (
                <p style={{ fontSize: '10px', opacity: 0.8, margin: '2px 0' }}>{cd.legal_name}</p>
              )}
              {cd.tagline && (
                <p style={{ fontSize: '9px', opacity: 0.7, margin: '2px 0', fontStyle: 'italic' }}>{cd.tagline}</p>
              )}
              <div style={{ fontSize: '9px', opacity: 0.8, marginTop: '4px', lineHeight: 1.4 }}>
                {cd.address && <p style={{ margin: 0 }}>{cd.address}</p>}
                <p style={{ margin: 0 }}>
                  {[cd.city, cd.state, cd.pin_code].filter(Boolean).join(', ')}
                  {cd.country ? `, ${cd.country}` : ''}
                </p>
                {cd.gstin && <p style={{ margin: '2px 0 0' }}>GSTIN: {cd.gstin}</p>}
                <div style={{ display: 'flex', gap: '12px', marginTop: '2px' }}>
                  {cd.pan && <span>PAN: {cd.pan}</span>}
                  {cd.cin && <span>CIN: {cd.cin}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Invoice meta */}
          <div style={{ textAlign: 'right', minWidth: '180px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: accent, letterSpacing: '1px' }}>TAX INVOICE</h2>
            {inv?.invoice_number && (
              <p style={{ fontSize: '11px', margin: '6px 0 2px', fontWeight: 600 }}>
                {inv.invoice_number}
              </p>
            )}
            <div style={{ fontSize: '9px', marginTop: '4px', lineHeight: 1.6 }}>
              {inv?.invoice_date && <p style={{ margin: 0 }}>Invoice Date: {fmtDate(inv.invoice_date)}</p>}
              {inv?.due_date && <p style={{ margin: 0 }}>Due Date: {fmtDate(inv.due_date)}</p>}
              {inv?.status && (
                <span style={{
                  display: 'inline-block', marginTop: '4px', padding: '2px 10px',
                  borderRadius: '12px', fontSize: '9px', fontWeight: 700,
                  background: statusColors[inv.status] || '#64748b', color: '#fff',
                }}>
                  {inv.status}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Accent bar */}
      <div style={{ height: '3px', background: accent }} />

      {/* ── Billed To + Subscription Details ── */}
      <div style={{ display: 'flex', gap: '1px', background: '#e2e8f0' }}>
        {/* Billed To */}
        <div style={{ flex: 1, background: '#fff', padding: '16px 24px' }}>
          <h3 style={{ fontSize: '10px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Billed To</h3>
          <p style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 2px' }}>{hotelName || '—'}</p>
          {hotelAddress && <p style={{ fontSize: '10px', color: '#64748b', margin: '0' }}>{hotelAddress}</p>}
          <p style={{ fontSize: '10px', color: '#64748b', margin: '2px 0' }}>
            {[hotelCity, hotelState].filter(Boolean).join(', ')}
          </p>
          {hotelOwnerName && <p style={{ fontSize: '10px', margin: '4px 0 0' }}>Contact: {hotelOwnerName}</p>}
          {hotelMobile && <p style={{ fontSize: '10px', color: '#64748b', margin: '1px 0' }}>Mobile: {hotelMobile}</p>}
          {hotelAdminEmail && <p style={{ fontSize: '10px', color: '#64748b', margin: '1px 0' }}>Email: {hotelAdminEmail}</p>}
          {hotelPropertyCode && <p style={{ fontSize: '10px', color: '#64748b', margin: '4px 0 0' }}>Property Code: {hotelPropertyCode}</p>}
        </div>

        {/* Subscription Details */}
        <div style={{ flex: 1, background: '#f8fafc', padding: '16px 24px' }}>
          <h3 style={{ fontSize: '10px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>Subscription Details</h3>
          <div style={{ fontSize: '10px', lineHeight: 1.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Plan:</span>
              <span style={{ fontWeight: 600 }}>{planName || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Billing Period:</span>
              <span style={{ fontWeight: 600 }}>{inv?.billing_period || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Billing Cycle:</span>
              <span style={{ fontWeight: 600 }}>{inv?.billing_cycle || '—'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Rooms:</span>
              <span style={{ fontWeight: 600 }}>{inv?.number_of_rooms ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Users:</span>
              <span style={{ fontWeight: 600 }}>{inv?.number_of_users ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Start:</span>
              <span style={{ fontWeight: 600 }}>{fmtDate(inv?.subscription_start ?? null)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>End:</span>
              <span style={{ fontWeight: 600 }}>{fmtDate(inv?.subscription_end ?? null)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Enabled Modules ── */}
      {inv?.enabled_modules && inv.enabled_modules.length > 0 && (
        <div style={{ padding: '10px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
          <h4 style={{ fontSize: '9px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 4px' }}>Enabled Modules</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {inv.enabled_modules.map((mod) => (
              <span key={mod} style={{
                fontSize: '9px', padding: '2px 8px', borderRadius: '4px',
                background: `${accent}15`, color: primary, fontWeight: 600, border: `1px solid ${accent}30`,
              }}>
                {MODULE_LABELS[mod] || mod}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Item Table ── */}
      <div style={{ padding: '16px 24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ background: primary, color: '#fff' }}>
              <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, fontSize: '9px' }}>Sr.</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600, fontSize: '9px' }}>Description</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, fontSize: '9px' }}>HSN/SAC</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, fontSize: '9px' }}>Qty</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, fontSize: '9px' }}>Rate</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, fontSize: '9px' }}>Disc</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, fontSize: '9px' }}>Taxable</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, fontSize: '9px' }}>GST%</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600, fontSize: '9px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.sr_no}</td>
                <td style={{ padding: '8px 6px', fontWeight: 500 }}>{item.description}</td>
                <td style={{ padding: '8px 6px', textAlign: 'center', color: '#64748b' }}>{item.hsn_sac || '—'}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(item.rate)}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: '#64748b' }}>{item.discount ? fmtMoney(item.discount) : '—'}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtMoney(item.taxable_value)}</td>
                <td style={{ padding: '8px 6px', textAlign: 'center' }}>{item.gst_rate}%</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtMoney(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Tax Summary + Payment ── */}
      <div style={{ display: 'flex', gap: '1px', background: '#e2e8f0', padding: '0 24px' }}>
        {/* Tax Summary */}
        <div style={{ flex: 1, background: '#fff', padding: '12px 0' }}>
          <h4 style={{ fontSize: '9px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>Tax Summary</h4>
          <table style={{ width: '100%', fontSize: '10px' }}>
            <tbody>
              <tr><td style={{ padding: '2px 0', color: '#64748b' }}>Subtotal</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(inv?.subtotal ?? 0)}</td></tr>
              {inv?.discount_amount ? <tr><td style={{ padding: '2px 0', color: '#64748b' }}>Discount</td><td style={{ textAlign: 'right', fontWeight: 600 }}>-{fmtMoney(inv.discount_amount)}</td></tr> : null}
              <tr style={{ borderTop: '1px solid #f1f5f9' }}><td style={{ padding: '4px 0', color: '#64748b', fontWeight: 600 }}>Taxable Amount</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(inv?.taxable_amount ?? 0)}</td></tr>
              {!isInterstate && (
                <>
                  <tr><td style={{ padding: '2px 0', color: '#64748b' }}>CGST ({gst.cgst_rate}%)</td><td style={{ textAlign: 'right' }}>{fmtMoney(inv?.cgst_amount ?? 0)}</td></tr>
                  <tr><td style={{ padding: '2px 0', color: '#64748b' }}>SGST ({gst.sgst_rate}%)</td><td style={{ textAlign: 'right' }}>{fmtMoney(inv?.sgst_amount ?? 0)}</td></tr>
                </>
              )}
              {isInterstate && (
                <tr><td style={{ padding: '2px 0', color: '#64748b' }}>IGST ({gst.igst_rate}%)</td><td style={{ textAlign: 'right' }}>{fmtMoney(inv?.igst_amount ?? 0)}</td></tr>
              )}
              {inv?.round_off ? <tr><td style={{ padding: '2px 0', color: '#64748b' }}>Round Off</td><td style={{ textAlign: 'right' }}>{fmtMoney(inv.round_off)}</td></tr> : null}
              <tr style={{ borderTop: '2px solid ' + primary }}>
                <td style={{ padding: '6px 0', fontWeight: 800, fontSize: '12px', color: primary }}>Total Payable</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '14px', color: primary }}>{fmtMoney(inv?.total_amount ?? 0)}</td>
              </tr>
              <tr><td style={{ padding: '4px 0', color: '#64748b', fontSize: '9px' }} colSpan={2}>
                <em>Amount in Words: </em>{numberToWords(inv?.total_amount ?? 0)}
              </td></tr>
              {inv?.amount_paid ? (
                <>
                  <tr><td style={{ padding: '2px 0', color: '#059669', fontSize: '9px' }}>Amount Paid</td><td style={{ textAlign: 'right', color: '#059669' }}>{fmtMoney(inv.amount_paid)}</td></tr>
                  <tr><td style={{ padding: '2px 0', color: '#dc2626', fontSize: '9px', fontWeight: 600 }}>Balance Due</td><td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 600 }}>{fmtMoney(inv?.balance_due ?? 0)}</td></tr>
                </>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Payment Section */}
        <div style={{ flex: 1, background: '#f8fafc', padding: '12px 16px' }}>
          <h4 style={{ fontSize: '9px', fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>Payment Details</h4>
          <div style={{ display: 'flex', gap: '12px' }}>
            {pay.qr_code_url && (
              <div style={{ textAlign: 'center' }}>
                <img src={pay.qr_code_url} alt="QR" style={{ width: '80px', height: '80px', borderRadius: '6px' }} />
                <p style={{ fontSize: '8px', color: '#64748b', margin: '4px 0 0' }}>Scan to Pay</p>
                {pay.upi_id && <p style={{ fontSize: '8px', fontWeight: 600, margin: '2px 0 0' }}>{pay.upi_id}</p>}
              </div>
            )}
            <div style={{ flex: 1, fontSize: '9px', lineHeight: 1.6 }}>
              {pay.bank_name && <p style={{ margin: '0 0 2px' }}><strong>Bank:</strong> {pay.bank_name}</p>}
              {pay.account_holder && <p style={{ margin: '0 0 2px' }}><strong>A/C:</strong> {pay.account_holder}</p>}
              {pay.account_number && <p style={{ margin: '0 0 2px' }}><strong>AC No:</strong> {pay.account_number}</p>}
              {pay.ifsc && <p style={{ margin: '0 0 2px' }}><strong>IFSC:</strong> {pay.ifsc}</p>}
              {pay.branch && <p style={{ margin: '0 0 2px' }}><strong>Branch:</strong> {pay.branch}</p>}
              {pay.payment_link && <p style={{ margin: '4px 0 0' }}><strong>Pay Online:</strong> <span style={{ color: '#2563eb' }}>{pay.payment_link}</span></p>}
            </div>
          </div>
          {pay.payment_instructions && (
            <p style={{ fontSize: '8px', color: '#64748b', marginTop: '6px', fontStyle: 'italic' }}>{pay.payment_instructions}</p>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '16px 24px', borderTop: '3px solid ' + accent, marginTop: '8px' }}>
        {/* Terms */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {terms.terms_conditions && (
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h5 style={{ fontSize: '8px', fontWeight: 700, color: primary, textTransform: 'uppercase', margin: '0 0 4px' }}>Terms & Conditions</h5>
              <p style={{ fontSize: '8px', color: '#64748b', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>{terms.terms_conditions}</p>
            </div>
          )}
          {terms.late_payment_terms && (
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h5 style={{ fontSize: '8px', fontWeight: 700, color: primary, textTransform: 'uppercase', margin: '0 0 4px' }}>Late Payment</h5>
              <p style={{ fontSize: '8px', color: '#64748b', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>{terms.late_payment_terms}</p>
            </div>
          )}
          {terms.refund_policy && (
            <div style={{ flex: 1, minWidth: '200px' }}>
              <h5 style={{ fontSize: '8px', fontWeight: 700, color: primary, textTransform: 'uppercase', margin: '0 0 4px' }}>Refund Policy</h5>
              <p style={{ fontSize: '8px', color: '#64748b', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-line' }}>{terms.refund_policy}</p>
            </div>
          )}
        </div>

        {terms.jurisdiction && (
          <p style={{ fontSize: '8px', color: '#94a3b8', margin: '0 0 8px' }}>Jurisdiction: {terms.jurisdiction}</p>
        )}

        {/* Signature + Seal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
          <div>
            {terms.footer_message && <p style={{ fontSize: '9px', color: '#64748b', fontStyle: 'italic', margin: '0 0 4px' }}>{terms.footer_message}</p>}
            {terms.thank_you_message && <p style={{ fontSize: '10px', fontWeight: 600, color: primary, margin: '0' }}>{terms.thank_you_message}</p>}
            <div style={{ marginTop: '6px', fontSize: '8px', color: '#94a3b8' }}>
              {cd.support_email && <span>{cd.support_email}</span>}
              {cd.support_phone && <span> · {cd.support_phone}</span>}
              {cd.website && <span> · {cd.website}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center', position: 'relative' }}>
            {br.seal_url && (
              <img src={br.seal_url} alt="seal" style={{ width: '60px', height: '60px', position: 'absolute', right: '0', bottom: '0', opacity: 0.8 }} />
            )}
            {br.signature_url && (
              <img src={br.signature_url} alt="signature" style={{ width: '80px', height: 'auto', marginBottom: '2px' }} />
            )}
            <div style={{ borderTop: '1px solid #cbd5e1', paddingTop: '2px', marginTop: '4px', minWidth: '120px' }}>
              <p style={{ fontSize: '8px', color: '#64748b', margin: 0 }}>Authorized Signatory</p>
              <p style={{ fontSize: '8px', fontWeight: 600, margin: '1px 0 0' }}>{cd.brand_name || 'Hotel Mantri'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

InvoicePreview.displayName = 'InvoicePreview';
