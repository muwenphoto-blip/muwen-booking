export type GenderOption = { value: string; label: string };
export type SelectOption = { value: string; label: string };
export type ServiceOption = { value: string; label: string };
export type ServiceItem = {
  name: string;
  label: string;
  options: ServiceOption[];
};

export type BookingConfig = {
  shopName: string;
  shopEmail: string;
  staff: SelectOption[];
  services: ServiceItem[];
  headcountOptions: SelectOption[];
  genderOptions: GenderOption[];
  openDays: number[];
  minDaysAhead: number;
  maxDaysAhead: number;
  slotMinutes: number;
  openTime: string;
  closeTime: string;
  maxPerSlot: number;
};

export type BookingSlot = {
  time: string;
  available: boolean;
  offHours: boolean;
};

export type BookingPayload = {
  date: string;
  time: string;
  staff: string;
  service: string;
  headcount: string;
  name: string;
  gender: string;
  phone: string;
  phoneCountry?: string;
  email: string;
  note?: string;
};
