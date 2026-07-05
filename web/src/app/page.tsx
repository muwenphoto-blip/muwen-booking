import { BookingForm } from '@/components/booking-form';

export default function Home() {
  return (
    <div className="booking-page">
      <header className="booking-hero">
        <h1>沐紋映像｜線上預約</h1>
        <p>請選擇日期、時段與服務，填寫資料後送出。</p>
      </header>
      <BookingForm />
      <p className="booking-admin-entry">
        <a href="/admin">後台登入 Admin</a>
      </p>
    </div>
  );
}
