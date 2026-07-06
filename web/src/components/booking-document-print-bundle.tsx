import {
  BookingDocumentContractPrint,
  BookingDocumentItemsPrint,
  BookingDocumentQuotePrint,
  type BookingDocumentPrintProps,
} from '@/components/booking-document-print-views';

export function BookingDocumentPrintBundle(props: BookingDocumentPrintProps) {
  return (
    <>
      <BookingDocumentItemsPrint {...props} />
      <BookingDocumentContractPrint {...props} />
      <BookingDocumentQuotePrint {...props} />
    </>
  );
}
