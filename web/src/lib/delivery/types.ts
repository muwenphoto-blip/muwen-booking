export type DeliveryPhase = 'selecting' | 'delivering' | 'expired';
export type PhotoKind = 'preview' | 'final';
export type PhotoSelection = 'pending' | 'keep' | 'reject';

export type DeliveryRecord = {
  id: string;
  booking_id: string;
  url_slug: string;
  password_hash: string;
  password_changed: boolean;
  phase: DeliveryPhase;
  selection_locked_at: string | null;
  selection_reopened: boolean;
  finals_started_at: string | null;
  final_expires_at: string | null;
  completed_at?: string | null;
  created_at: string;
};

export type DeliveryPhotoRecord = {
  id: string;
  delivery_id: string;
  kind: PhotoKind;
  storage_path: string;
  file_name: string;
  selection: PhotoSelection;
  selection_note?: string;
  sort_order: number;
  created_at: string;
};
