import type { DailyReport, DerivedReport } from './types';
import { fmtMoney, fmtInt, calcArr, calcOcc, calcTotalRevenue, calcTotalExpenses, calcClosingRooms, toNum } from './calc';

export const generateWhatsAppReport = (
  r: DailyReport,
  totalRooms: number,
  mtd: { revenue: number; occupancy: number },
  hotelName?: string,
): string => {
  const arr = calcArr(r.room_sale_amount, r.rooms_occupied);
  const occ = calcOcc(r.rooms_occupied, totalRooms);
  const totalRevenue = calcTotalRevenue(r);
  const totalExpenses = calcTotalExpenses(r);
  const closingRooms = calcClosingRooms(r.rooms_occupied, totalRooms);
  const dr = r as DailyReport & Partial<DerivedReport>;
  const invoiceTotal = toNum(dr.invoice_total) || toNum(r.room_sale_amount);
  const taxableRevenue = toNum(dr.taxable_revenue) || toNum(r.room_sale_amount);
  const gstCollected = toNum(dr.gst_collected);
  const roomRevCat = toNum(dr.room_revenue) || toNum(r.room_sale_amount);
  const fbRevCat = toNum(dr.fb_revenue) || toNum(r.kitchen);
  const miscRevCat = toNum(dr.misc_revenue) || toNum(r.other_income);

  const [y, m, d] = r.report_date.split('-');
  const dateStr = `${d}/${m}/${y}`;

  const lines = [
    '*Jay Dwarkadhish* 🙏🏻',
    '',
    `*${hotelName ?? 'Hotel'}* 🏨`,
    '',
    '*Kindly find the below last night report*',
    '',
    `Date :- ${dateStr}`,
    '',
    '*Room Occupancy And Revenue Summary*',
    '',
    `Total Rooms:-${fmtInt(totalRooms)}`,
    `Rooms Occupied:-${fmtInt(r.rooms_occupied)}`,
    `Complementary Room:-${fmtInt(r.complimentary_room)}`,
    `ARR (Average Room Rate):-${fmtMoney(arr)}`,
    `OCC (Occupancy Percentage):-${occ.toFixed(0)}%`,
    `Room Sale Amount:-${fmtMoney(r.room_sale_amount)}`,
    `Invoice Total (incl. GST):-${fmtMoney(invoiceTotal)}`,
    '',
    '*GST Summary*',
    '',
    `Taxable Revenue:-${fmtMoney(taxableRevenue)}`,
    `GST Collected:-${fmtMoney(gstCollected)}`,
    `Net Revenue (excl. GST):-${fmtMoney(toNum((r as any).net_revenue) || taxableRevenue)}`,
    '',
    '*Revenue Breakup*',
    '',
    `Room Revenue:-${fmtMoney(roomRevCat)}`,
    `F&B Revenue:-${fmtMoney(fbRevCat)}`,
    `Misc Revenue:-${fmtMoney(miscRevCat)}`,
    '',
    '*Room Revenue Details Summary*',
    '',
    `OTA:-${fmtMoney(r.ota)}`,
    `Direct/Walking:-${fmtMoney(r.direct_walking)}`,
    `Corporate/Agent:-${fmtMoney(r.corporate_agent)}`,
    `Phonebook:-${fmtMoney(r.phonebook)}`,
    '',
    '*Other Revenue*',
    '',
    `Kitchen:-${fmtMoney(r.kitchen)}`,
    `Other:-${fmtMoney(r.other_income)}`,
    ...(((r as any).other_revenue_by_category ?? []) as Array<{ category: string; amount: number }>).map((c) => `${c.category}:-${fmtMoney(c.amount)}`),
    `Total Revenue:-${fmtMoney(totalRevenue)}`,
    '',
    '*MTD Summary*',
    '',
    `MTD Revenue:-${fmtMoney(mtd.revenue)}`,
    `MTD Occupancy:-${fmtInt(mtd.occupancy)} Rooms`,
    '',
    '*Expenses Summary*',
    '',
    `Housekeeping Supply:-${fmtMoney(r.housekeeping_supply)}`,
    `Maintenance Bill:-${fmtMoney(r.maintenance_bill)}`,
    `Other:-${fmtMoney(r.other_expense)}`,
    ...(((r as any).finance_expense_by_category ?? []) as Array<{ category: string; amount: number }>).map((c) => `${c.category}:-${fmtMoney(c.amount)}`),
    `Total Expenses:-${fmtMoney(totalExpenses)}`,
    '',
    '*Cash Summary*',
    '',
    `Cash:-${fmtMoney(r.cash)}`,
    `Bank:-${fmtMoney(r.bank)}`,
    `Salary Advance:-${fmtMoney(r.salary_advance)}`,
    `Cash Handover MD Sir:-${fmtMoney(r.cash_handover_md)}`,
    `Bank Cash Deposit:-${fmtMoney(r.bank_cash_deposit)}`,
    `Cash Closing:-${fmtMoney(toNum(r.cash_closing))}`,
    '',
    '*Tomorrow Status*',
    '',
    `Departure:-${fmtInt(r.departure)}`,
    `Expected Arrival:-${fmtInt(r.expected_arrival)}`,
    `Closing Rooms:-${fmtInt(closingRooms)}`,
    `Expected ARR:-${fmtMoney(r.expected_arr)}`,
  ];

  return lines.join('\n');
};
