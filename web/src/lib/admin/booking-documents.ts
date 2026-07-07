import type { ServiceItem } from '@/lib/booking/types';

export const SHOP_ADDRESS = '台中市潭子區仁愛路二段18之1號';
export const SHOP_PHONE = '0905-620-431';
export const SHOP_FULL_NAME = '沐紋映像攝影工作室';

export type DateParts = { year: string; month: string; day: string };

export type DocumentLineItem = {
  serviceContent: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  remarks: string;
};

export type DocumentItemRow = {
  serviceContent: string;
  packageChoice: string;
  price: string;
  discount: string;
  itemTotal: string;
  quantity: string;
};

export type DocumentPaymentRow = {
  date: string;
  amount: string;
  customerSignature: string;
  receiver: string;
};

export type BookingDocumentState = {
  caseNumber: string;
  customerName: string;
  phone: string;
  email: string;
  emergencyContact: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  lineId: string;
  address: string;
  notes: string;
  service: string;
  serviceOption: string;
  photographer: string;
  assistant: string;
  appointmentDate: DateParts;
  shootingDate: DateParts;
  shootingTime: string;
  selectionDate: DateParts;
  selectionTime: string;
  deliveryDate: DateParts;
  deliveryTime: string;
  shootingOutdoor: boolean;
  shootingIndoor: boolean;
  formalOutfits: string;
  casualOutfits: string;
  outdoorLocation: string;
  outdoorClothing: string;
  appointmentContent: string;
  remarks: string;
  amount: string;
  additionalAmount: string;
  additionalItems: string;
  deposit: string;
  total: string;
  handler: string;
  lineItems: DocumentLineItem[];
  itemRows: DocumentItemRow[];
  payments: DocumentPaymentRow[];
};

export type BookingDocumentPayload = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  services: ServiceItem[];
  initial: BookingDocumentState;
};

const EMPTY_DATE: DateParts = { year: '', month: '', day: '' };
const QUOTE_LINE_COUNT = 10;
const ITEM_ROW_COUNT = 10;
const PAYMENT_ROW_COUNT = 3;

export function emptyDateParts(): DateParts {
  return { ...EMPTY_DATE };
}

export function parseDateParts(isoDate: string | null | undefined): DateParts {
  if (!isoDate) return emptyDateParts();
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return emptyDateParts();
  return { year: match[1], month: match[2], day: match[3] };
}

export function formatDatePartsToIso(parts: DateParts): string {
  const year = String(parts.year || '').trim();
  const month = String(parts.month || '').trim();
  const day = String(parts.day || '').trim();
  if (!year || !month || !day) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function stripTimeFromAppointmentContent(content: string, time?: string): string {
  let text = String(content || '').trim();
  if (!text) return '';
  if (time) {
    const suffix = `｜${time}`;
    if (text.endsWith(suffix)) return text.slice(0, -suffix.length).trim();
  }
  return text.replace(/｜\d{1,2}:\d{2}$/, '').trim();
}

export function migrateEmergencyContactFields(state: BookingDocumentState): BookingDocumentState {
  const name = String(state.emergencyContactName || '').trim();
  const phone = String(state.emergencyContactPhone || '').trim();
  const legacy = String(state.emergencyContact || '').trim();

  if (name || phone) {
    return {
      ...state,
      emergencyContactName: name,
      emergencyContactPhone: phone,
      emergencyContact: legacy || [name, phone].filter(Boolean).join(' '),
    };
  }

  if (!legacy) {
    return { ...state, emergencyContactName: '', emergencyContactPhone: '', emergencyContact: '' };
  }

  const phoneMatch = legacy.match(/(\+?\d[\d\s-]{7,}\d)/);
  if (phoneMatch) {
    const parsedPhone = phoneMatch[1].trim();
    const parsedName = legacy.replace(phoneMatch[0], '').replace(/[｜|,/]/g, ' ').trim();
    return {
      ...state,
      emergencyContactName: parsedName,
      emergencyContactPhone: parsedPhone,
      emergencyContact: legacy,
    };
  }

  return {
    ...state,
    emergencyContactName: legacy,
    emergencyContactPhone: '',
    emergencyContact: legacy,
  };
}

export function parseBookingService(
  raw: string,
  services: ServiceItem[],
): { service: string; option: string } {
  const text = String(raw || '').trim();
  if (!text) return { service: '', option: '' };

  const slashParts = text
    .split(/[／/]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (slashParts.length >= 2) {
    const base = slashParts[0];
    const optionPart = slashParts.slice(1).join('／');
    const item = services.find((entry) => entry.name === base || entry.label === base);
    if (item) {
      const matched = item.options.find(
        (opt) => opt.value === optionPart || opt.label === optionPart,
      );
      return { service: item.name, option: matched?.value || optionPart };
    }
    return { service: base, option: optionPart };
  }

  for (const item of services) {
    if (text === item.name || text.startsWith(`${item.name} `)) {
      const rest = text.slice(item.name.length).trim();
      if (!rest) return { service: item.name, option: '' };
      const matched = item.options.find(
        (opt) => rest === opt.value || rest.startsWith(`${opt.value} `),
      );
      return { service: item.name, option: matched?.value || rest };
    }
  }

  const byName = services.find((item) => item.name === text || item.label === text);
  if (byName) return { service: byName.name, option: '' };
  return { service: text, option: '' };
}

function emptyLineItems(): DocumentLineItem[] {
  return Array.from({ length: QUOTE_LINE_COUNT }, () => ({
    serviceContent: '',
    quantity: '',
    unitPrice: '',
    amount: '',
    remarks: '',
  }));
}

function emptyItemRows(): DocumentItemRow[] {
  return Array.from({ length: ITEM_ROW_COUNT }, () => ({
    serviceContent: '',
    packageChoice: '',
    price: '',
    discount: '',
    itemTotal: '',
    quantity: '',
  }));
}

function emptyPayments(): DocumentPaymentRow[] {
  return Array.from({ length: PAYMENT_ROW_COUNT }, () => ({
    date: '',
    amount: '',
    customerSignature: '',
    receiver: '',
  }));
}

export function buildInitialDocumentState(input: {
  caseNumber: string;
  customerName: string;
  phone: string;
  email: string;
  note: string;
  service: string;
  staffName: string;
  bookingDate: string;
  services: ServiceItem[];
  handlerName?: string;
}): BookingDocumentState {
  const { service, option } = parseBookingService(input.service, input.services);
  const appointmentDate = parseDateParts(input.bookingDate);
  const lineItems = emptyLineItems();
  const itemRows = emptyItemRows();

  if (service) {
    lineItems[0] = {
      serviceContent: option ? `${service}｜${option}` : service,
      quantity: '1',
      unitPrice: '',
      amount: '',
      remarks: '',
    };
    itemRows[0] = {
      serviceContent: service,
      packageChoice: option,
      price: '',
      discount: '',
      itemTotal: '',
      quantity: '1',
    };
  }

  return {
    caseNumber: input.caseNumber || '',
    customerName: input.customerName || '',
    phone: input.phone || '',
    email: input.email || '',
    emergencyContact: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    notes: input.note || '',
    lineId: '',
    address: '',
    service,
    serviceOption: option,
    photographer: input.staffName === '不指定' ? '' : input.staffName,
    assistant: '',
    appointmentDate,
    shootingDate: { ...appointmentDate },
    shootingTime: '',
    selectionDate: emptyDateParts(),
    selectionTime: '',
    deliveryDate: emptyDateParts(),
    deliveryTime: '',
    shootingOutdoor: false,
    shootingIndoor: true,
    formalOutfits: '',
    casualOutfits: '',
    outdoorLocation: '',
    outdoorClothing: '',
    appointmentContent: option ? `${service}｜${option}` : service,
    remarks: input.note || '',
    amount: '',
    additionalAmount: '',
    additionalItems: '',
    deposit: '',
    total: '',
    handler: input.handlerName || (input.staffName === '不指定' ? '' : input.staffName),
    lineItems,
    itemRows,
    payments: emptyPayments(),
  };
}

export function serviceOptionsFor(
  serviceName: string,
  services: ServiceItem[],
): { value: string; label: string }[] {
  const item = services.find((s) => s.name === serviceName);
  if (!item?.options.length) return [];
  return item.options;
}

export function serviceOptionPlaceholder(optionCount: number): string {
  return optionCount > 0 ? '請選擇' : '';
}

export function resolveServiceItemPrice(
  services: ServiceItem[],
  serviceName: string,
  serviceOption: string,
): string {
  const item = services.find((s) => s.name === serviceName);
  if (!item) return '';
  if (serviceOption) {
    const opt = item.options.find((o) => o.value === serviceOption);
    if (opt?.price && opt.price > 0) return String(opt.price);
  }
  if (item.basePrice && item.basePrice > 0) return String(item.basePrice);
  return '';
}

function applyCatalogPriceToDocument(
  state: BookingDocumentState,
  services: ServiceItem[],
): BookingDocumentState {
  const price = resolveServiceItemPrice(services, state.service, state.serviceOption);
  if (!price) return state;

  const itemRows = [...state.itemRows];
  if (itemRows[0]) {
    const quantity = itemRows[0].quantity?.trim() || '1';
    const unit = Number(price) || 0;
    const qtyNum = Number(quantity) || 1;
    const discount = Number(String(itemRows[0].discount || '').replace(/,/g, '')) || 0;
    const total = Math.max(0, unit * qtyNum - discount);
    const itemTotal = total > 0 ? String(Math.round(total)) : '';
    itemRows[0] = {
      ...itemRows[0],
      price,
      quantity,
      itemTotal,
    };
  }

  const lineItems = [...state.lineItems];
  if (lineItems[0] && itemRows[0]) {
    lineItems[0] = {
      ...lineItems[0],
      unitPrice: price,
      quantity: itemRows[0].quantity || '1',
      amount: itemRows[0].itemTotal,
    };
  }

  return { ...state, itemRows, lineItems };
}

export function syncServiceChange(
  state: BookingDocumentState,
  serviceName: string,
  services: ServiceItem[],
): BookingDocumentState {
  const serviceOption = '';
  const label = serviceName;

  const lineItems = [...state.lineItems];
  if (lineItems[0]) {
    lineItems[0] = {
      ...lineItems[0],
      serviceContent: label,
    };
  }

  const itemRows = [...state.itemRows];
  if (itemRows[0]) {
    itemRows[0] = {
      ...itemRows[0],
      serviceContent: serviceName,
      packageChoice: serviceOption,
    };
  }

  return applyCatalogPriceToDocument(
    {
      ...state,
      service: serviceName,
      serviceOption,
      appointmentContent: label,
      lineItems,
      itemRows,
    },
    services,
  );
}

export function syncServiceOptionChange(
  state: BookingDocumentState,
  serviceOption: string,
  services: ServiceItem[],
): BookingDocumentState {
  const label = serviceOption
    ? `${state.service}｜${serviceOption}`
    : state.service;

  const lineItems = [...state.lineItems];
  if (lineItems[0]) {
    lineItems[0] = { ...lineItems[0], serviceContent: label };
  }

  const itemRows = [...state.itemRows];
  if (itemRows[0]) {
    itemRows[0] = { ...itemRows[0], packageChoice: serviceOption };
  }

  return applyCatalogPriceToDocument(
    {
      ...state,
      serviceOption,
      appointmentContent: label,
      lineItems,
      itemRows,
    },
    services,
  );
}

export type DocumentTab = 'items' | 'contract' | 'quote';

export const DOCUMENT_TAB_LABELS: Record<DocumentTab, string> = {
  items: '項目表',
  contract: '合約表',
  quote: '估價單',
};

export const DOCUMENT_TAB_HINTS: Record<DocumentTab, string> = {
  items: '服務項目與價格明細',
  contract: '客戶合約與付款紀錄',
  quote: '估價單與經手人簽核',
};
