import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import {
  BOOKING_STATUS_ACCEPTED,
  BOOKING_STATUS_CLOSED,
  BOOKING_STATUS_CONFIRMED,
} from '@/lib/admin/bookings';
import { getDocumentGrandTotal, parseAmount, summarizeItemRows } from '@/components/booking-document-shared';
import { createAdminSupabaseClient } from '@/lib/supabase/admin';

const ACTIVE_CASE_STATUSES = [BOOKING_STATUS_ACCEPTED, BOOKING_STATUS_CONFIRMED, BOOKING_STATUS_CLOSED];

export type StaffPerformanceRow = {
  memberName: string;
  caseCount: number;
  serviceAmount: number;
  addonCount: number;
  addonAmount: number;
  totalRevenue: number;
};

export type CompanyPerformanceTotals = {
  caseCount: number;
  serviceAmount: number;
  addonCount: number;
  addonAmount: number;
  totalRevenue: number;
};

export type FinancePerformanceReport = {
  from: string;
  to: string;
  monthKey: string;
  staff: StaffPerformanceRow[];
  company: CompanyPerformanceTotals;
};

type BookingPerformanceRow = {
  id: string;
  case_number: string | null;
  staff_name: string | null;
  booking_date: string;
  document_data: unknown;
};

function monthKeyFromRange(from: string): string {
  const match = String(from || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function normalizeDocument(raw: unknown): BookingDocumentState | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as BookingDocumentState;
}

function resolveMemberName(document: BookingDocumentState | null, staffName: string | null): string {
  const photographer = String(document?.photographer || '').trim();
  const staff = String(staffName || '').trim();
  return photographer || staff || '未指定';
}

function countAddonItems(document: BookingDocumentState | null): number {
  if (!document) return 0;
  const lines = String(document.additionalItems || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const addonAmount = parseAmount(document.additionalAmount);
  if (lines.length) return lines.length;
  return addonAmount > 0 ? 1 : 0;
}

function resolveBookingRevenue(document: BookingDocumentState | null) {
  if (!document) {
    return { serviceAmount: 0, addonAmount: 0, addonCount: 0, totalRevenue: 0 };
  }

  const { grandTotal } = summarizeItemRows(document.itemRows || [], []);
  const addonAmount = parseAmount(document.additionalAmount);
  const addonCount = countAddonItems(document);
  const totalFromField = parseAmount(document.total);
  const totalRevenue = totalFromField > 0 ? totalFromField : getDocumentGrandTotal(document, []);

  return {
    serviceAmount: grandTotal,
    addonAmount,
    addonCount,
    totalRevenue,
  };
}

export function buildFinancePerformanceReport(
  from: string,
  to: string,
  bookings: BookingPerformanceRow[],
): FinancePerformanceReport {
  const staffMap = new Map<string, StaffPerformanceRow>();

  bookings.forEach((booking) => {
    const document = normalizeDocument(booking.document_data);
    const memberName = resolveMemberName(document, booking.staff_name);
    const revenue = resolveBookingRevenue(document);

    const current = staffMap.get(memberName) || {
      memberName,
      caseCount: 0,
      serviceAmount: 0,
      addonCount: 0,
      addonAmount: 0,
      totalRevenue: 0,
    };

    current.caseCount += 1;
    current.serviceAmount += revenue.serviceAmount;
    current.addonCount += revenue.addonCount;
    current.addonAmount += revenue.addonAmount;
    current.totalRevenue += revenue.totalRevenue;
    staffMap.set(memberName, current);
  });

  const staff = Array.from(staffMap.values()).sort((a, b) => {
    if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
    return a.memberName.localeCompare(b.memberName, 'zh-Hant');
  });

  const company = staff.reduce<CompanyPerformanceTotals>(
    (acc, row) => ({
      caseCount: acc.caseCount + row.caseCount,
      serviceAmount: acc.serviceAmount + row.serviceAmount,
      addonCount: acc.addonCount + row.addonCount,
      addonAmount: acc.addonAmount + row.addonAmount,
      totalRevenue: acc.totalRevenue + row.totalRevenue,
    }),
    {
      caseCount: 0,
      serviceAmount: 0,
      addonCount: 0,
      addonAmount: 0,
      totalRevenue: 0,
    },
  );

  return {
    from,
    to,
    monthKey: monthKeyFromRange(from),
    staff,
    company,
  };
}

export async function loadFinancePerformance(from: string, to: string): Promise<FinancePerformanceReport> {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('id, case_number, staff_name, booking_date, document_data')
    .gte('booking_date', from)
    .lte('booking_date', to)
    .in('status', ACTIVE_CASE_STATUSES);
  if (error) {
    if (error.message.includes('document_data')) {
      return buildFinancePerformanceReport(from, to, []);
    }
    throw new Error(error.message);
  }

  return buildFinancePerformanceReport(from, to, (data ?? []) as BookingPerformanceRow[]);
}
