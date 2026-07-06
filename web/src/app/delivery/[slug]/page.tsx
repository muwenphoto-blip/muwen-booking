import { DeliveryGuestPanel } from '@/components/delivery-guest-panel';

type PageProps = { params: Promise<{ slug: string }> };

export default async function DeliveryPage({ params }: PageProps) {
  const { slug } = await params;
  return <DeliveryGuestPanel slug={slug} />;
}
