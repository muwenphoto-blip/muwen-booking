import { AdminDeliveryPanel } from '@/components/admin-delivery-panel';

type PageProps = { params: Promise<{ bookingId: string }> };

export default async function AdminDeliveryPage({ params }: PageProps) {
  const { bookingId } = await params;
  return <AdminDeliveryPanel bookingId={bookingId} />;
}
