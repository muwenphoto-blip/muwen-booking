'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminShell } from '@/components/admin-shell';
import {
  buildScheduleExportData,
  exportSchedule,
  SCHEDULE_EXPORT_FORMATS,
  type ScheduleExportFormat,
} from '@/lib/admin/schedule-export';
import { buildMonthKey, currentMonthKey, getDayOfWeek, todayDateKey } from '@/lib/booking/time';

const DAYS_PER_VIEW = 7;
const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六'];

type MonthDay = {
  date: string;
  label: string;
  shopOpen: boolean;
  active: boolean;
  dayOff: boolean;
  offSlots: string[];
  slots: string[];
  hasOverride: boolean;
  usesDefault: boolean;
};

type PanelData = {
  staffName: string;
  staffOptions: string[];
  allSlots: string[];
  openDays: number[];
  month: string;
  monthLabel: string;
  monthDays: MonthDay[];
  usesCalendar: boolean;
  isAllSlots: boolean;
  timeRangeLabel: string;
  availabilityLabel: string;
  schedulePending?: boolean;
  canApprove?: boolean;
  canEdit?: boolean;
  mustSubmitForApproval?: boolean;
  isOwnSchedule?: boolean;
  requiresMasterApproval?: boolean;
  pendingApproverLabel?: string;
  draftLabel?: string;
  viewerRole?: string;
};

type DayState = {
  active: boolean;
  expanded: boolean;
  dayOff: boolean;
  offSlots: Record<string, boolean>;
  slots: Record<string, boolean>;
};

function emptySlotMap(allSlots: string[]): Record<string, boolean> {
  return Object.fromEntries(allSlots.map((time) => [time, false]));
}

function buildDayStateFromMonthDay(day: MonthDay, allSlots: string[]): DayState {
  const slots = emptySlotMap(allSlots);
  const offSlots = emptySlotMap(allSlots);
  allSlots.forEach((time) => {
    slots[time] = day.slots.includes(time);
    offSlots[time] = day.offSlots.includes(time);
  });
  const hasWork = day.slots.length > 0;
  return {
    active: day.dayOff ? false : hasWork,
    expanded: day.dayOff || hasWork || day.offSlots.length > 0,
    dayOff: Boolean(day.dayOff),
    offSlots,
    slots,
  };
}

type SessionInfo = {
  role: string;
  roleLabel: string;
  photographerName: string;
};

function pageIndexForDate(monthDays: MonthDay[], date: string): number {
  const index = monthDays.findIndex((day) => day.date === date);
  if (index < 0) return 0;
  return Math.floor(index / DAYS_PER_VIEW);
}

function visibleDaysForPage(monthDays: MonthDay[], pageIndex: number): MonthDay[] {
  const start = pageIndex * DAYS_PER_VIEW;
  return monthDays.slice(start, start + DAYS_PER_VIEW);
}

function buildCalendarRows(monthDays: MonthDay[]): (MonthDay | null)[][] {
  if (!monthDays.length) return [];
  const leading = getDayOfWeek(monthDays[0].date);
  const cells: (MonthDay | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...monthDays,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (MonthDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function dayHasSchedule(
  state: DayState,
  allSlotsMode: boolean,
  day: MonthDay,
  showDayOff: boolean,
): boolean {
  if (!day.shopOpen) return false;
  if (showDayOff && state.dayOff) return false;
  if (!state.active) return false;
  if (allSlotsMode) return true;
  return Object.values(state.slots || {}).some(Boolean);
}

function calendarDayClass(
  day: MonthDay,
  state: DayState,
  useAllSlots: boolean,
  selected: boolean,
  isToday: boolean,
  showDayOffOption: boolean,
): string {
  const classes = ['schedule-calendar__day'];
  if (!day.shopOpen) classes.push('is-closed');
  if (selected) classes.push('is-selected');
  if (isToday) classes.push('is-today');
  if (useAllSlots && day.shopOpen) classes.push('is-all-slots');
  else if (showDayOffOption && state.dayOff) classes.push('is-day-off');
  else if (showDayOffOption && Object.values(state.offSlots || {}).some(Boolean))
    classes.push('is-partial-off');
  else if (state.active) classes.push('is-on');
  else if (day.shopOpen) classes.push('is-off');
  if (day.hasOverride && !useAllSlots) classes.push('is-custom');
  return classes.join(' ');
}

function pickDefaultDate(monthDays: MonthDay[], monthKey: string): string {
  const today = todayDateKey();
  if (today.startsWith(`${monthKey}-`) && monthDays.some((day) => day.date === today)) {
    return today;
  }
  return monthDays.find((day) => day.shopOpen)?.date ?? monthDays[0]?.date ?? '';
}

function buildDateState(data: PanelData): Record<string, DayState> {
  const next: Record<string, DayState> = {};
  data.monthDays.forEach((day) => {
    next[day.date] = buildDayStateFromMonthDay(day, data.allSlots);
  });
  return next;
}

export function AdminSchedulePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [viewMonth, setViewMonth] = useState(currentMonthKey());
  const [dateStates, setDateStates] = useState<Record<string, DayState>>({});
  const [useAllSlots, setUseAllSlots] = useState(true);
  const [staffName, setStaffName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [exportFormat, setExportFormat] = useState<ScheduleExportFormat>('xlsx');
  const [exporting, setExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [dayPageIndex, setDayPageIndex] = useState(0);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [slotOffModeDates, setSlotOffModeDates] = useState<Record<string, boolean>>({});
  const [submittedOffDates, setSubmittedOffDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const viewYear = Number(viewMonth.split('-')[0] || currentMonthKey().split('-')[0]);
  const viewMonthNum = Number(viewMonth.split('-')[1] || '1');

  const loadPanel = useCallback(
    async (name?: string, month?: string) => {
      const params = new URLSearchParams();
      if (name) params.set('staff', name);
      params.set('month', month || currentMonthKey());
      const res = await fetch(`/api/admin/availability?${params.toString()}`);
      const data = await res.json();
      if (res.status === 401) {
        router.replace('/admin');
        return;
      }
      if (!res.ok) throw new Error(data.error || '無法載入排班表');
      setPanel(data);
      setStaffName(data.staffName);
      setViewMonth(data.month);
      setUseAllSlots(data.viewerRole === '副' ? false : Boolean(data.isAllSlots));
      setDateStates(buildDateState(data));
      if (data.schedulePending) {
        setSubmittedOffDates(
          new Set(
            data.monthDays.filter((day: MonthDay) => day.dayOff || day.offSlots?.length).map((day: MonthDay) => day.date),
          ),
        );
      } else {
        setSubmittedOffDates(new Set());
      }
      const defaultDate = pickDefaultDate(data.monthDays, data.month);
      setSelectedDate(defaultDate);
      setDayPageIndex(pageIndexForDate(data.monthDays, defaultDate));
      setError('');
    },
    [router],
  );

  useEffect(() => {
    fetch('/api/admin/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.session) setSessionInfo(data.session);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const initialStaff = searchParams.get('staff') || undefined;
    const initialMonth = searchParams.get('month') || currentMonthKey();
    setViewMonth(initialMonth);
    loadPanel(initialStaff, initialMonth)
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false));
  }, [loadPanel, searchParams]);

  function goToMonth(nextMonth: string) {
    setViewMonth(nextMonth);
    setLoading(true);
    loadPanel(staffName, nextMonth)
      .catch((err) => setError(err instanceof Error ? err.message : '載入失敗'))
      .finally(() => setLoading(false));
  }

  function selectYear(year: number) {
    goToMonth(buildMonthKey(year, viewMonthNum));
  }

  function selectMonth(month: number) {
    goToMonth(buildMonthKey(viewYear, month));
  }

  function toggleDayActive(date: string, active: boolean) {
    if (active) {
      selectAllSlotsForDay(date);
      return;
    }
    setUseAllSlots(false);
    setSlotOffModeDates((prev) => ({ ...prev, [date]: false }));
    setDateStates((prev) => ({
      ...prev,
      [date]: {
        active: false,
        expanded: false,
        dayOff: false,
        offSlots: emptySlotMap(panel?.allSlots ?? []),
        slots: emptySlotMap(panel?.allSlots ?? []),
      },
    }));
  }

  async function markDayOff(date: string, off: boolean) {
    const allSlots = panel?.allSlots ?? [];
    const nextDayState: DayState = {
      active: false,
      expanded: off,
      dayOff: off,
      offSlots: emptySlotMap(allSlots),
      slots: emptySlotMap(allSlots),
    };
    const nextStates = { ...dateStates, [date]: nextDayState };

    setUseAllSlots(false);
    setSlotOffModeDates((prev) => ({ ...prev, [date]: false }));
    setDateStates(nextStates);

    if (!off) {
      const wasSubmitted = submittedOffDates.has(date);
      setSubmittedOffDates((prev) => {
        const next = new Set(prev);
        next.delete(date);
        return next;
      });
      if (panel?.mustSubmitForApproval && panel.canEdit !== false && wasSubmitted) {
        await saveSchedule(true, nextStates);
      }
      return;
    }

    if (panel?.mustSubmitForApproval && panel.canEdit !== false) {
      await saveSchedule(true, nextStates);
    }
  }

  function toggleSlotOffMode(date: string) {
    setUseAllSlots(false);
    setSlotOffModeDates((prev) => ({ ...prev, [date]: !prev[date] }));
    setDateStates((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        expanded: true,
        dayOff: false,
      },
    }));
  }

  function toggleOffSlot(date: string, time: string) {
    setUseAllSlots(false);
    setDateStates((prev) => {
      const nextOff = { ...prev[date]?.offSlots, [time]: !prev[date]?.offSlots?.[time] };
      if (nextOff[time]) {
        nextOff[time] = true;
      }
      const nextSlots = { ...prev[date]?.slots, [time]: false };
      const hasWork = Object.values(nextSlots).some(Boolean);
      return {
        ...prev,
        [date]: {
          ...prev[date],
          active: hasWork,
          expanded: true,
          dayOff: false,
          offSlots: nextOff,
          slots: nextSlots,
        },
      };
    });
  }

  function selectDay(date: string) {
    setSelectedDate(date);
    setDayPageIndex(pageIndexForDate(panel?.monthDays ?? [], date));
    window.requestAnimationFrame(() => {
      document
        .getElementById(`schedule-day-${date}`)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    });
  }

  function shiftDayPage(delta: number) {
    if (!panel) return;
    const maxPage = Math.max(0, Math.ceil(panel.monthDays.length / DAYS_PER_VIEW) - 1);
    setDayPageIndex((prev) => Math.min(maxPage, Math.max(0, prev + delta)));
  }

  function toggleSlot(date: string, time: string) {
    if (slotOffModeDates[date]) {
      toggleOffSlot(date, time);
      return;
    }
    setUseAllSlots(false);
    setDateStates((prev) => {
      const nextSlots = { ...prev[date]?.slots, [time]: !prev[date]?.slots?.[time] };
      const nextOff = { ...prev[date]?.offSlots, [time]: false };
      const hasWork = Object.values(nextSlots).some(Boolean);
      return {
        ...prev,
        [date]: {
          ...prev[date],
          active: hasWork,
          expanded: true,
          dayOff: false,
          offSlots: nextOff,
          slots: nextSlots,
        },
      };
    });
  }

  function selectAllSlotsForDay(date: string) {
    setUseAllSlots(false);
    setDateStates((prev) => ({
      ...prev,
      [date]: {
        active: true,
        expanded: true,
        dayOff: false,
        offSlots: emptySlotMap(panel?.allSlots ?? []),
        slots: Object.fromEntries((panel?.allSlots ?? []).map((time) => [time, true])),
      },
    }));
  }

  function clearAllSlotsForDay(date: string) {
    setUseAllSlots(false);
    setDateStates((prev) => ({
      ...prev,
      [date]: {
        active: false,
        expanded: false,
        dayOff: false,
        offSlots: emptySlotMap(panel?.allSlots ?? []),
        slots: emptySlotMap(panel?.allSlots ?? []),
      },
    }));
  }

  function buildDatesPayload(states: Record<string, DayState> = dateStates) {
    const dates: Record<string, string[]> = {};
    const dayOffDates: string[] = [];
    const offSlotsDates: Record<string, string[]> = {};
    panel?.monthDays.forEach((day) => {
      if (!day.shopOpen) return;
      const state = states[day.date];
      if (state?.dayOff && showDayOffOption) {
        dayOffDates.push(day.date);
        dates[day.date] = [];
        return;
      }
      const offTimes = Object.entries(state?.offSlots || {})
        .filter(([, picked]) => picked)
        .map(([time]) => time);
      if (offTimes.length) {
        offSlotsDates[day.date] = offTimes;
      }
      if (!state?.active) {
        dates[day.date] = [];
        return;
      }
      dates[day.date] = Object.entries(state.slots)
        .filter(([, picked]) => picked)
        .map(([time]) => time);
    });
    return { dates, dayOffDates, offSlotsDates };
  }

  function exportScheduleFile() {
    if (!panel) return;
    setExporting(true);
    setError('');
    try {
      const payload = buildScheduleExportData({
        staffName,
        monthLabel: panel.monthLabel,
        timeRangeLabel: panel.timeRangeLabel,
        availabilityLabel: panel.availabilityLabel,
        monthDays: panel.monthDays,
        allSlots: panel.allSlots,
        useAllSlots,
        dateStates,
      });
      exportSchedule(payload, exportFormat);
      setMessage(
        `已匯出 ${panel.monthLabel} ${SCHEDULE_EXPORT_FORMATS.find((item) => item.value === exportFormat)?.label ?? '排班表'}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯出失敗');
    } finally {
      setExporting(false);
    }
  }

  async function saveSchedule(
    submitForApproval = false,
    statesOverride?: Record<string, DayState>,
  ) {
    if (!panel || panel.canEdit === false) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const { dates, dayOffDates, offSlotsDates } = buildDatesPayload(statesOverride ?? dateStates);
      const payload = useAllSlots
        ? {
            staffName,
            month: viewMonth,
            mode: 'all',
            submitForApproval: submitForApproval || panel.mustSubmitForApproval,
          }
        : {
            staffName,
            month: viewMonth,
            mode: 'calendar',
            dates,
            dayOffDates,
            offSlotsDates,
            submitForApproval: submitForApproval || panel.mustSubmitForApproval,
          };

      const res = await fetch('/api/admin/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      setMessage(data.message || '已儲存');
      if (submitForApproval || panel.mustSubmitForApproval) {
        setSubmittedOffDates(
          (prev) =>
            new Set([...prev, ...dayOffDates, ...Object.keys(offSlotsDates)]),
        );
        setPanel((prev) => (prev ? { ...prev, schedulePending: true } : prev));
      }
      await loadPanel(staffName, viewMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLastWeek() {
    if (!panel || panel.canEdit === false) return;
    const visible = visibleDaysForPage(panel.monthDays, dayPageIndex).filter((day) => day.shopOpen);
    if (!visible.length) return;
    const targetDates = visible.map((day) => day.date);
    const sourceDates = targetDates.map((date) => {
      const [y, m, d] = date.split('-').map(Number);
      const prev = new Date(y, m - 1, d - 7);
      return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
    });

    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffName,
          month: viewMonth,
          mode: 'copy-week',
          targetDates,
          sourceDates,
          submitForApproval: panel.mustSubmitForApproval,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '複製失敗');
      setMessage(data.message || '已複製上一週排班');
      await loadPanel(staffName, viewMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : '複製失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function reviewSchedule(action: 'approve' | 'reject') {
    if (!panel?.canApprove) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffName, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失敗');
      setMessage(data.message || '已完成');
      await loadPanel(staffName, viewMonth);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失敗');
    } finally {
      setSubmitting(false);
    }
  }

  function downloadIcs() {
    if (!panel) return;
    const params = new URLSearchParams({ staff: staffName, month: viewMonth });
    window.open(`/api/admin/availability/ics?${params.toString()}`, '_blank');
    setMessage(`已下載 ${panel.monthLabel} 行事曆（.ics），可匯入 Google／Apple 日曆`);
  }

  if (loading && !panel) {
    return (
      <AdminShell>
        <div className="admin-card">載入中…</div>
      </AdminShell>
    );
  }

  if (!panel) {
    return (
      <AdminShell>
        <div className="admin-card">{error || '無法載入排班表'}</div>
      </AdminShell>
    );
  }

  const visibleDays = panel.monthDays;
  const calendarRows = buildCalendarRows(panel.monthDays);
  const today = todayDateKey();
  const canEdit = panel.canEdit !== false;
  const isStoreViewer = sessionInfo?.role === '現場' || panel.viewerRole === '現場';
  const isPhotographer = sessionInfo?.role === '副' || panel.viewerRole === '副';
  const showDayOffOption = sessionInfo?.role !== '主' && !isStoreViewer;
  const isOwnSchedule = sessionInfo?.photographerName === staffName;
  const pageTitle = isStoreViewer
    ? panel.staffOptions.length > 1
      ? `「${staffName}」班表查詢`
      : '班表查詢'
    : isPhotographer
    ? '我的工作時間'
    : panel.staffOptions.length > 1
      ? `「${staffName}」排班表`
      : isOwnSchedule
        ? '我的排班表'
        : `「${staffName}」排班表`;
  const primaryActionLabel = panel.mustSubmitForApproval ? '送審排班' : '儲存並核定';
  const handlePrimarySave = () =>
    saveSchedule(Boolean(panel.mustSubmitForApproval));
  const canReview = Boolean(panel.canApprove && panel.schedulePending);
  const hidePrimarySave = canReview;
  const reviewToolbar = canReview ? (
    <div className="admin-schedule-toolbar admin-schedule-review-toolbar">
      <button
        type="button"
        className="admin-button admin-schedule-approve-btn"
        disabled={submitting}
        onClick={() => reviewSchedule('approve')}
      >
        核定通過
      </button>
      <button
        type="button"
        className="admin-button secondary"
        disabled={submitting}
        onClick={() => reviewSchedule('reject')}
      >
        退回
      </button>
    </div>
  ) : null;

  return (
    <AdminShell onRefresh={() => loadPanel(staffName, viewMonth).catch((err) => setError(err.message))}>
      {error ? <p className="admin-error">{error}</p> : null}
      {message ? <p className="admin-success">{message}</p> : null}

      {panel.schedulePending ? (
        <div className="admin-schedule-pending">
          {panel.canApprove ? (
            <>
              <strong>待核定：</strong>
              {staffName} 已送審排班
              {panel.draftLabel ? `（${panel.draftLabel}）` : ''}。核定後客人才會看到新版本。
              {reviewToolbar}
            </>
          ) : (
            <>
              <strong>送審中：</strong>
              {panel.isOwnSchedule
                ? `您的排班已送出，待${panel.pendingApproverLabel || '主控／副店長'}核定後才會套用到客人預約。`
                : `${staffName} 的排班待${panel.pendingApproverLabel || '主控／副店長'}核定。`}
            </>
          )}
        </div>
      ) : null}

      <div className="admin-card">
        <div className="admin-section-head">
          <div>
            <h2>{pageTitle}</h2>
            <p className="admin-muted">
              {isStoreViewer
                ? `營業時段 ${panel.timeRangeLabel} · 唯讀檢視（不含主控排班）`
                : isPhotographer
                ? `營業時段 ${panel.timeRangeLabel} · 設定可接案時間與排休`
                : `營業時段 ${panel.timeRangeLabel} · 已核定：${panel.availabilityLabel}${
                    sessionInfo?.roleLabel && sessionInfo.role !== '副'
                      ? ` · ${sessionInfo.roleLabel}`
                      : ''
                  }`}
            </p>
          </div>
        </div>

        {panel.staffOptions.length > 1 ? (
          <div
            className="admin-form admin-form-inline admin-form-box"
            style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}
          >
            <label className="admin-field">
              <span>排班對象</span>
              <select
                value={staffName}
                onChange={(e) => {
                  const next = e.target.value;
                  setStaffName(next);
                  loadPanel(next, viewMonth).catch((err) => setError(err.message));
                }}
              >
                {panel.staffOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <p className="admin-muted">
          {isPhotographer
            ? '先選月份與日期，勾選可接案時段；紅色為整日或時段排休。完成後請按底部「送審排班」。'
            : (
              <>
                先選年份與月份，月曆選日期
                {showDayOffOption ? '；紅點為排休' : ''}。藍點為今日、橘點為有排班。下方日期可左右拖曳，時段可上下捲動選取。
                {panel.mustSubmitForApproval
                  ? panel.requiresMasterApproval
                    ? ' 您的排班需送審，僅主控可核定。'
                    : ' 您的排班需送審，主控／副店長可核定。'
                  : sessionInfo?.role === '主'
                    ? ' 主控儲存後直接生效。'
                    : sessionInfo?.role === '副主'
                      ? ' 您可替攝影師儲存並直接核定。'
                      : ''}
              </>
            )}
        </p>

        <div className="admin-schedule-picker">
          <div className="admin-schedule-picker-level">
            <span className="admin-schedule-picker-label">年份</span>
            <div className="admin-schedule-year-nav">
              <button
                type="button"
                className="admin-button secondary"
                disabled={submitting || exporting || loading}
                onClick={() => selectYear(viewYear - 1)}
              >
                ←
              </button>
              <strong>{viewYear} 年</strong>
              <button
                type="button"
                className="admin-button secondary"
                disabled={submitting || exporting || loading}
                onClick={() => selectYear(viewYear + 1)}
              >
                →
              </button>
            </div>
          </div>

          <div className="admin-schedule-picker-level">
            <span className="admin-schedule-picker-label">月份</span>
            <div className="admin-schedule-month-tabs">
              {Array.from({ length: 12 }, (_, index) => {
                const month = index + 1;
                const active = month === viewMonthNum;
                return (
                  <button
                    key={month}
                    type="button"
                    className={`admin-schedule-month-tab ${active ? 'active' : ''}`}
                    disabled={submitting || exporting || loading}
                    onClick={() => selectMonth(month)}
                  >
                    {month}月
                  </button>
                );
              })}
            </div>
          </div>

          <div className="admin-schedule-picker-level">
            <div className="admin-schedule-picker-head">
              <span className="admin-schedule-picker-label">日期</span>
              <span className="admin-schedule-picker-hint">
                {isMobile
                  ? '點月曆日期可快速定位 · 下方排班卡可左右滑動'
                  : '點日期切換下方編輯區 · 排班卡可左右拖曳瀏覽'}
              </span>
            </div>
            <div className="admin-schedule-picker-hint">
              <span className="schedule-legend">
                <span className="schedule-legend__item">
                  <span className="schedule-legend__today-frame" aria-hidden />
                  今日
                </span>
                <span className="schedule-legend__item">
                  <span className="schedule-legend__dot is-orange" />
                  有排班
                </span>
                {showDayOffOption ? (
                  <span className="schedule-legend__item">
                    <span className="schedule-legend__dot is-red" />
                    排休
                  </span>
                ) : null}
              </span>
            </div>
            <div className="schedule-calendar">
              <div className="schedule-calendar__weekdays">
                {WEEKDAY_HEADERS.map((label) => (
                  <span key={label} className="schedule-calendar__weekday">
                    {label}
                  </span>
                ))}
              </div>
              {calendarRows.map((row, rowIndex) => (
                <div key={rowIndex} className="schedule-calendar__row">
                  {row.map((day, cellIndex) => {
                    if (!day) {
                      return <span key={`pad-${rowIndex}-${cellIndex}`} className="schedule-calendar__pad" />;
                    }
                    const state = dateStates[day.date] ?? {
                      active: false,
                      expanded: false,
                      dayOff: false,
                      slots: {},
                    };
                    const dayNum = Number(day.date.slice(-2));
                    const weekday = WEEKDAY_HEADERS[getDayOfWeek(day.date)];
                    const isToday = day.date === today;
                    const scheduled = dayHasSchedule(state, useAllSlots, day, showDayOffOption);
                    return (
                      <button
                        key={day.date}
                        type="button"
                        className={calendarDayClass(
                          day,
                          state,
                          useAllSlots,
                          day.date === selectedDate,
                          isToday,
                          showDayOffOption,
                        )}
                        disabled={!day.shopOpen || submitting || exporting || loading}
                        onClick={() => selectDay(day.date)}
                      >
                        <span className="schedule-calendar__day-num">{dayNum}</span>
                        <span className="schedule-calendar__day-week">週{weekday}</span>
                        {day.shopOpen && showDayOffOption && state.dayOff ? (
                          <span className="schedule-calendar__day-dot is-red" aria-hidden />
                        ) : scheduled ? (
                          <span className="schedule-calendar__day-dot is-orange" aria-hidden />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="admin-muted admin-schedule-scroll-hint">
              下方日期列可左右拖曳；各日時段區可上下捲動選取。
            </p>
          </div>
        </div>

        {!isPhotographer ? (
        <div className="admin-schedule-actions">
          <button
            type="button"
            className={`admin-button secondary ${useAllSlots ? 'active-mode' : ''}`}
            disabled={!canEdit || submitting || exporting}
            onClick={() => {
              setUseAllSlots(true);
              setDateStates(buildDateState({ ...panel, isAllSlots: true, usesCalendar: false }));
            }}
          >
            本月全部時段
          </button>
          <button
            type="button"
            className={`admin-button secondary ${!useAllSlots ? 'active-mode' : ''}`}
            disabled={!canEdit || submitting || exporting}
            onClick={() => {
              setUseAllSlots(false);
              setDateStates(buildDateState(panel));
            }}
          >
            自訂每日排班
          </button>
          <button
            type="button"
            className="admin-button secondary"
            disabled={!canEdit || submitting || exporting || useAllSlots}
            onClick={copyLastWeek}
          >
            複製上週（本 7 日）
          </button>
          <button
            type="button"
            className="admin-button secondary"
            disabled={submitting || exporting}
            onClick={downloadIcs}
          >
            下載行事曆 (.ics)
          </button>
          {hidePrimarySave ? null : panel.mustSubmitForApproval ? (
            <button
              type="button"
              className="admin-button admin-schedule-primary-action"
              disabled={!canEdit || submitting || exporting}
              onClick={() => saveSchedule(true)}
            >
              送審排班
            </button>
          ) : (
            <button
              type="button"
              className="admin-button admin-schedule-primary-action"
              disabled={!canEdit || submitting || exporting}
              onClick={() => saveSchedule(false)}
            >
              儲存並核定
            </button>
          )}
        </div>
        ) : null}

        {canReview ? (
          <div className="admin-schedule-review">
            <div>
              <strong>待您核定「{staffName}」的送審內容</strong>
              <p className="admin-muted">
                含排班時段與排休。確認無誤後請按核定通過，客人預約才會套用新版本。
              </p>
            </div>
            {reviewToolbar}
          </div>
        ) : null}

        <div
          className={`admin-schedule-mobile-bar ${isPhotographer ? 'is-always-visible' : ''}`}
          aria-hidden={!isMobile && !isPhotographer}
        >
          {canReview ? (
            <div className="admin-schedule-mobile-bar__review">
              <button
                type="button"
                className="admin-button admin-schedule-approve-btn admin-schedule-mobile-bar__btn"
                disabled={submitting}
                onClick={() => reviewSchedule('approve')}
              >
                {submitting ? '處理中…' : '核定通過'}
              </button>
              <button
                type="button"
                className="admin-button secondary admin-schedule-mobile-bar__btn"
                disabled={submitting}
                onClick={() => reviewSchedule('reject')}
              >
                退回
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="admin-button admin-schedule-mobile-bar__btn"
              disabled={!canEdit || submitting || exporting}
              onClick={handlePrimarySave}
            >
              {submitting ? '處理中…' : primaryActionLabel}
            </button>
          )}
        </div>

        {!isPhotographer ? (
        <div className="admin-schedule-export">
          <label className="admin-field admin-schedule-export-field">
            <span>匯出格式</span>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as ScheduleExportFormat)}
              disabled={submitting || exporting}
            >
              {SCHEDULE_EXPORT_FORMATS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="admin-button secondary"
            disabled={submitting || exporting}
            onClick={exportScheduleFile}
          >
            {exporting ? '匯出中…' : `匯出${panel.monthLabel}`}
          </button>
          <p className="admin-muted admin-schedule-export-hint">
            支援 CSV、Excel、PDF、PNG、JPEG；匯出整月排班（含畫面上已儲存與尚未儲存的修改）。
          </p>
        </div>
        ) : null}

        {!isPhotographer && useAllSlots ? (
          <p className="admin-success">本月營業日全部時段開放預約。</p>
        ) : null}

        {!panel.allSlots.length ? (
          <p className="admin-error">請先在系統設定中設定營業時間</p>
        ) : (
          <>
          {isMobile ? (
            <p className="admin-muted admin-schedule-week-scroll-hint">
              ← 左右滑動瀏覽各日排班 · 點月曆可快速跳轉 →
            </p>
          ) : null}
          <div className="admin-schedule-week-scroll-wrap">
          <div id="schedule-day-editor" className="admin-schedule-week-grid">
            {visibleDays.map((day) => {
              const state = dateStates[day.date] ?? {
                active: false,
                expanded: false,
                dayOff: false,
                offSlots: emptySlotMap(panel.allSlots),
                slots: emptySlotMap(panel.allSlots),
              };
              const pickedCount = Object.values(state.slots).filter(Boolean).length;
              const offCount = Object.values(state.offSlots || {}).filter(Boolean).length;
              const totalSlots = panel.allSlots.length;
              const progress =
                totalSlots > 0 ? Math.round((pickedCount / totalSlots) * 100) : 0;
              const isDayOff = showDayOffOption && !useAllSlots && state.dayOff;
              const isPartialOff =
                showDayOffOption && !useAllSlots && !isDayOff && offCount > 0;
              const isOffSubmitted =
                isDayOff &&
                (submittedOffDates.has(day.date) || Boolean(panel.schedulePending));
              const slotOffMode = Boolean(slotOffModeDates[day.date]);
              const showSlotGrid =
                !useAllSlots &&
                !isDayOff &&
                (state.active || isPartialOff || slotOffMode);

              return (
                <div
                  key={day.date}
                  id={`schedule-day-${day.date}`}
                  className={[
                    'schedule-day-card',
                    day.shopOpen ? '' : 'is-closed',
                    day.date === selectedDate ? 'is-selected' : '',
                    useAllSlots && day.shopOpen ? 'is-all-slots' : '',
                    isDayOff ? 'is-day-off' : '',
                    isPartialOff ? 'is-partial-off' : '',
                    showSlotGrid ? 'is-editing' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="schedule-day-card__header">
                    <div className="schedule-day-card__top">
                      <button
                        type="button"
                        className="schedule-day-card__date"
                        onClick={() => selectDay(day.date)}
                      >
                        {day.label}
                      </button>
                      <span
                        className={`schedule-day-card__status ${
                          !day.shopOpen
                            ? 'is-shop-closed'
                            : isDayOff
                              ? 'is-day-off'
                              : isPartialOff
                                ? 'is-partial-off'
                                : useAllSlots
                                  ? 'is-open'
                                  : state.active
                                    ? 'is-open'
                                    : 'is-off'
                        }`}
                      >
                        {!day.shopOpen
                          ? '全店店休'
                          : isDayOff
                            ? '排休'
                            : isPartialOff
                              ? `排休 ${offCount} 段`
                              : useAllSlots
                                ? '全部可接'
                                : state.active
                                  ? `${pickedCount}/${totalSlots} 段`
                                  : '未排班'}
                      </span>
                    </div>

                    {day.shopOpen && !useAllSlots && state.active && !isDayOff && !slotOffMode ? (
                      <div className="schedule-day-card__progress" aria-hidden>
                        <div
                          className="schedule-day-card__progress-bar"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    ) : null}

                    {day.shopOpen ? (
                      <div className="schedule-day-card__controls">
                        <label className="schedule-day-card__switch">
                          <input
                            type="checkbox"
                            checked={!useAllSlots && state.active && !isDayOff}
                            disabled={!canEdit || useAllSlots || submitting || isDayOff}
                            onChange={(e) => toggleDayActive(day.date, e.target.checked)}
                          />
                          <span className="schedule-day-card__switch-ui" aria-hidden />
                          <span>{isPhotographer ? '此日工作' : '此日可接案'}</span>
                        </label>
                        {!useAllSlots && showDayOffOption ? (
                          <>
                            <button
                              type="button"
                              className={`schedule-day-card__off-btn ${isDayOff ? 'active' : ''}`}
                              disabled={!canEdit || submitting}
                              onClick={() => markDayOff(day.date, !isDayOff)}
                            >
                              {isDayOff ? '取消排休' : '整日排休'}
                            </button>
                            <button
                              type="button"
                              className={`schedule-day-card__off-btn ${slotOffMode ? 'active' : ''}`}
                              disabled={!canEdit || submitting || isDayOff}
                              onClick={() => toggleSlotOffMode(day.date)}
                            >
                              {slotOffMode ? '完成時段排休' : '時段排休'}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <p className="schedule-day-card__closed-note">本日全店休息</p>
                    )}
                  </div>

                  {day.shopOpen && useAllSlots && !isPhotographer ? (
                    <div className="schedule-day-card__empty is-success">
                      <span className="schedule-day-card__empty-icon">✓</span>
                      <span>營業時段皆可預約</span>
                    </div>
                  ) : null}

                  {day.shopOpen && isDayOff ? (
                    <div className="schedule-day-card__empty is-day-off">
                      <span>{isOffSubmitted ? '當日已排休' : '此日排休，不接受預約'}</span>
                      {panel.mustSubmitForApproval && canEdit && !isOffSubmitted ? (
                        <button
                          type="button"
                          className="schedule-day-card__submit-off"
                          disabled={submitting}
                          onClick={() => saveSchedule(true)}
                        >
                          送審排休
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {day.shopOpen &&
                  !useAllSlots &&
                  !state.active &&
                  !isDayOff &&
                  !isPartialOff &&
                  !slotOffMode ? (
                    <div className="schedule-day-card__empty">
                      <span>
                        {showDayOffOption
                          ? '勾選「此日可接案」、標記「整日排休」或「時段排休」'
                          : '勾選「此日可接案」後設定時段'}
                      </span>
                    </div>
                  ) : null}

                  {day.shopOpen && showSlotGrid ? (
                    <div className="schedule-day-card__body">
                      <div className="schedule-slot-toolbar">
                        <div className="schedule-slot-toolbar__actions">
                          {!slotOffMode ? (
                            <>
                              <button
                                type="button"
                                className="schedule-slot-tool"
                                onClick={() => selectAllSlotsForDay(day.date)}
                              >
                                全選
                              </button>
                              <button
                                type="button"
                                className="schedule-slot-tool"
                                onClick={() => clearAllSlotsForDay(day.date)}
                              >
                                清除
                              </button>
                            </>
                          ) : (
                            <span className="schedule-slot-toolbar__hint">點選時段標記為排休（紅色）</span>
                          )}
                        </div>
                        {!slotOffMode ? (
                          <span className="schedule-slot-toolbar__count">
                            已選 {pickedCount} / {totalSlots}
                          </span>
                        ) : (
                          <span className="schedule-slot-toolbar__count">
                            排休 {offCount} / {totalSlots}
                          </span>
                        )}
                      </div>
                      <div className="schedule-slot-grid">
                        {panel.allSlots.map((time) => {
                          const isWork = Boolean(state.slots[time]);
                          const isOffSlot = Boolean(state.offSlots?.[time]);
                          const active = slotOffMode ? isOffSlot : isWork;
                          return (
                            <button
                              key={time}
                              type="button"
                              className={[
                                'schedule-slot',
                                active ? (slotOffMode ? 'is-off-slot' : 'is-active') : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              aria-pressed={active}
                              onClick={() => toggleSlot(day.date, time)}
                            >
                              <span className="schedule-slot__time">{time}</span>
                              {active ? (
                                <span className="schedule-slot__mark">{slotOffMode ? '休' : '✓'}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                      {isPartialOff &&
                      panel.mustSubmitForApproval &&
                      canEdit &&
                      !submittedOffDates.has(day.date) &&
                      !panel.schedulePending ? (
                        <button
                          type="button"
                          className="schedule-day-card__submit-off"
                          disabled={submitting}
                          onClick={() => saveSchedule(true)}
                        >
                          送審排休
                        </button>
                      ) : null}
                      {isPartialOff &&
                      (submittedOffDates.has(day.date) || panel.schedulePending) ? (
                        <p className="schedule-day-card__pending-note">時段排休待核定</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}
