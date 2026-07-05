import { Suspense } from 'react';
import { AdminSchedulePanel } from '@/components/admin-schedule-panel';

export default function AdminSchedulePage() {
  return (
    <div className="admin-page">
      <Suspense fallback={<div className="admin-card">載入中…</div>}>
        <AdminSchedulePanel />
      </Suspense>
    </div>
  );
}
