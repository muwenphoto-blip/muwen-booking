'use client';

import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import type { AssetOption } from '@/lib/admin/assets';

type DocumentEquipmentPickerProps = {
  state: BookingDocumentState;
  assetOptions: AssetOption[];
  onChange: (next: BookingDocumentState) => void;
};

export function DocumentEquipmentPicker({
  state,
  assetOptions,
  onChange,
}: DocumentEquipmentPickerProps) {
  const selected = new Set(state.usedAssetIds || []);

  function toggleAsset(assetId: string) {
    const next = new Set(selected);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    onChange({
      ...state,
      usedAssetIds: assetOptions.filter((item) => next.has(item.id)).map((item) => item.id),
    });
  }

  if (!assetOptions.length) {
    return (
      <p className="admin-muted booking-doc-equipment-empty">
        尚無啟用中的器材。請至財務營運 → 器材管理新增。
      </p>
    );
  }

  return (
    <div className="booking-doc-equipment-grid" role="group" aria-label="使用器材">
      {assetOptions.map((asset) => {
        const checked = selected.has(asset.id);
        return (
          <label
            key={asset.id}
            className={['booking-doc-equipment-chip', checked ? 'selected' : ''].join(' ')}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleAsset(asset.id)}
            />
            <span>{asset.name}</span>
          </label>
        );
      })}
    </div>
  );
}
