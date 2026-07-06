type UploadProgress = {
  kind: 'preview' | 'final';
  done: number;
  total: number;
  failed: number;
};

export function DeliveryUploadProgress({ progress }: { progress: UploadProgress }) {
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const label = progress.kind === 'preview' ? '預覽' : '成品';

  return (
    <div className="delivery-upload-progress-wrap" role="status" aria-live="polite">
      <div className="delivery-upload-progress-track" aria-hidden>
        <div className="delivery-upload-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="delivery-upload-progress-label">
        上傳{label}中 {progress.done}/{progress.total}（{percent}%）
        {progress.failed ? ` · ${progress.failed} 失敗` : ''}
      </p>
    </div>
  );
}
