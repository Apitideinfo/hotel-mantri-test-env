import type { DerivedReport } from './types';
import { toNum, calcTotalRevenue, calcTotalExpenses, calcArr, calcOcc } from './calc';

export interface Insight {
  id: string;
  type: 'positive' | 'warning' | 'negative' | 'info';
  icon: string;
  title: string;
  detail: string;
  action?: string;
}

export const generateInsights = (
  today: DerivedReport | null,
  yesterday: DerivedReport | null,
  mtdReports: DerivedReport[],
  totalRooms: number,
): Insight[] => {
  const insights: Insight[] = [];

  if (!today) {
    insights.push({
      id: 'no-data',
      type: 'warning',
      icon: 'alert',
      title: 'No data entered for today',
      detail: 'Room chart has not been filled in for today\'s business date.',
      action: 'Enter today\'s room chart to see live insights.',
    });
    return insights;
  }

  const todayOcc = calcOcc(today.rooms_occupied, totalRooms);
  const todayRev = calcTotalRevenue(today);
  const todayArr = calcArr(today.room_sale_amount, today.rooms_occupied);
  const todayExp = calcTotalExpenses(today);
  const todayCash = toNum(today.pay_cash);
  const todayPending = toNum(today.pay_balance);

  // ── Occupancy comparison ──
  if (yesterday) {
    const yOcc = calcOcc(yesterday.rooms_occupied, totalRooms);
    const diff = todayOcc - yOcc;
    if (Math.abs(diff) > 0.5) {
      if (diff < 0) {
        insights.push({
          id: 'occ-down',
          type: 'negative',
          icon: 'trending-down',
          title: `Occupancy dropped ${Math.abs(diff).toFixed(0)}% vs yesterday`,
          detail: `Today ${todayOcc.toFixed(0)}% vs yesterday ${yOcc.toFixed(0)}% — ${today.rooms_occupied} of ${totalRooms} rooms occupied.`,
          action: diff < -10 ? 'Consider promotional rates or OTA push to boost occupancy.' : undefined,
        });
      } else {
        insights.push({
          id: 'occ-up',
          type: 'positive',
          icon: 'trending-up',
          title: `Occupancy improved ${diff.toFixed(0)}% vs yesterday`,
          detail: `Today ${todayOcc.toFixed(0)}% vs yesterday ${yOcc.toFixed(0)}% — strong demand.`,
        });
      }
    }
  }

  // ── ARR comparison ──
  if (yesterday && today.rooms_occupied > 0 && yesterday.rooms_occupied > 0) {
    const yArr = calcArr(yesterday.room_sale_amount, yesterday.rooms_occupied);
    const diff = todayArr - yArr;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        insights.push({
          id: 'arr-up',
          type: 'positive',
          icon: 'trending-up',
          title: `ARR improved by ₹${diff.toFixed(0)}`,
          detail: `Today ₹${todayArr.toFixed(0)} vs yesterday ₹${yArr.toFixed(0)} — higher average room rate.`,
        });
      } else {
        insights.push({
          id: 'arr-down',
          type: 'warning',
          icon: 'trending-down',
          title: `ARR declined by ₹${Math.abs(diff).toFixed(0)}`,
          detail: `Today ₹${todayArr.toFixed(0)} vs yesterday ₹${yArr.toFixed(0)} — review discounting.`,
          action: 'Check if discounts or lower-category rooms are driving bookings.',
        });
      }
    }
  }

  // ── Booking source shift ──
  if (yesterday && today.direct_walking + today.ota + today.corporate_agent + today.phonebook > 0) {
    const todayDirect = toNum(today.direct_walking);
    const yDirect = toNum(yesterday.direct_walking);
    if (yDirect > 0) {
      const pct = ((todayDirect - yDirect) / yDirect) * 100;
      if (Math.abs(pct) > 15) {
        insights.push({
          id: pct > 0 ? 'direct-up' : 'direct-down',
          type: pct > 0 ? 'positive' : 'info',
          icon: pct > 0 ? 'trending-up' : 'trending-down',
          title: `Direct bookings ${pct > 0 ? 'increased' : 'decreased'} ${Math.abs(pct).toFixed(0)}%`,
          detail: `Direct/Walk-in revenue: today ₹${todayDirect.toFixed(0)} vs yesterday ₹${yDirect.toFixed(0)}.`,
        });
      }
    }
    const todayOta = toNum(today.ota);
    const yOta = toNum(yesterday.ota);
    if (yOta > 0) {
      const pct = ((todayOta - yOta) / yOta) * 100;
      if (Math.abs(pct) > 15) {
        insights.push({
          id: pct > 0 ? 'ota-up' : 'ota-down',
          type: pct > 0 ? 'info' : 'positive',
          icon: pct > 0 ? 'trending-up' : 'trending-down',
          title: `OTA bookings ${pct > 0 ? 'increased' : 'decreased'} ${Math.abs(pct).toFixed(0)}%`,
          detail: `OTA revenue: today ₹${todayOta.toFixed(0)} vs yesterday ₹${yOta.toFixed(0)}.`,
          action: pct > 20 ? 'High OTA share means higher commission — push direct bookings.' : undefined,
        });
      }
    }
  }

  // ── Cash collection vs average ──
  if (mtdReports.length > 3) {
    const avgCash = mtdReports.reduce((s, r) => s + toNum(r.pay_cash), 0) / mtdReports.length;
    if (avgCash > 0) {
      const pct = ((todayCash - avgCash) / avgCash) * 100;
      if (pct < -20) {
        insights.push({
          id: 'cash-below-avg',
          type: 'warning',
          icon: 'wallet',
          title: 'Cash collection is below average',
          detail: `Today ₹${todayCash.toFixed(0)} vs MTD daily average ₹${avgCash.toFixed(0)} (${pct.toFixed(0)}%).`,
          action: 'Follow up on pending cash collections.',
        });
      }
    }
  }

  // ── Expense spike ──
  if (yesterday && todayExp > 0) {
    const yExp = calcTotalExpenses(yesterday);
    if (yExp > 0) {
      const pct = ((todayExp - yExp) / yExp) * 100;
      if (pct > 20) {
        insights.push({
          id: 'exp-spike',
          type: 'negative',
          icon: 'trending-up',
          title: `Expenses increased ${pct.toFixed(0)}% vs yesterday`,
          detail: `Today ₹${todayExp.toFixed(0)} vs yesterday ₹${yExp.toFixed(0)}.`,
          action: 'Review expense entries for unexpected costs.',
        });
      }
    }
  }

  // ── Pending payments ──
  if (todayPending > 100) {
    insights.push({
      id: 'pending-payments',
      type: 'warning',
      icon: 'alert',
      title: 'Pending payments require attention',
      detail: `₹${todayPending.toFixed(0)} in unpaid balances from today's checkouts.`,
      action: 'Follow up with guests or companies for collection.',
    });
  }

  // ── Full occupancy ──
  if (todayOcc >= 95 && totalRooms > 0) {
    insights.push({
      id: 'full-occ',
      type: 'positive',
      icon: 'check-circle',
      title: 'Near full occupancy',
      detail: `${todayOcc.toFixed(0)}% occupied — excellent utilization.`,
      action: 'Consider dynamic pricing for high-demand dates.',
    });
  }

  // ── Low occupancy ──
  if (todayOcc < 30 && totalRooms > 0) {
    insights.push({
      id: 'low-occ',
      type: 'negative',
      icon: 'alert',
      title: 'Low occupancy alert',
      detail: `Only ${todayOcc.toFixed(0)}% occupied (${today.rooms_occupied}/${totalRooms} rooms).`,
      action: 'Consider promotional rates, OTA push, or corporate outreach.',
    });
  }

  // ── Profit estimate ──
  const profit = todayRev - todayExp;
  if (todayRev > 0) {
    const margin = (profit / todayRev) * 100;
    if (margin < 0) {
      insights.push({
        id: 'loss-day',
        type: 'negative',
        icon: 'trending-down',
        title: 'Operating loss today',
        detail: `Revenue ₹${todayRev.toFixed(0)} vs expenses ₹${todayExp.toFixed(0)} = loss of ₹${Math.abs(profit).toFixed(0)}.`,
        action: 'Reduce variable costs or boost occupancy.',
      });
    } else if (margin > 50) {
      insights.push({
        id: 'high-margin',
        type: 'positive',
        icon: 'trending-up',
        title: `Strong margin at ${margin.toFixed(0)}%`,
        detail: `Revenue ₹${todayRev.toFixed(0)} vs expenses ₹${todayExp.toFixed(0)} = profit ₹${profit.toFixed(0)}.`,
      });
    }
  }

  // ── MTD trend ──
  if (mtdReports.length >= 5) {
    const recent = mtdReports.slice(-3);
    const earlier = mtdReports.slice(-6, -3);
    if (earlier.length >= 3) {
      const recentAvg = recent.reduce((s, r) => s + calcTotalRevenue(r), 0) / recent.length;
      const earlierAvg = earlier.reduce((s, r) => s + calcTotalRevenue(r), 0) / earlier.length;
      if (earlierAvg > 0) {
        const pct = ((recentAvg - earlierAvg) / earlierAvg) * 100;
        if (Math.abs(pct) > 10) {
          insights.push({
            id: pct > 0 ? 'mtd-up' : 'mtd-down',
            type: pct > 0 ? 'positive' : 'warning',
            icon: pct > 0 ? 'trending-up' : 'trending-down',
            title: `MTD revenue trend ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(0)}%`,
            detail: `Recent 3-day avg ₹${recentAvg.toFixed(0)} vs prior 3-day avg ₹${earlierAvg.toFixed(0)}.`,
          });
        }
      }
    }
  }

  if (insights.length === 0) {
    insights.push({
      id: 'stable',
      type: 'info',
      icon: 'check-circle',
      title: 'Operations are stable',
      detail: 'No significant deviations detected in today\'s performance vs recent trends.',
    });
  }

  return insights;
};
