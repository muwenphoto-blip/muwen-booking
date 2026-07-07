-- 優惠活動日期區間檢查（結束日不可早於開始日）
alter table public.promotions
  drop constraint if exists promotions_date_range_check;

alter table public.promotions
  add constraint promotions_date_range_check
  check (
    starts_at is null
    or ends_at is null
    or starts_at <= ends_at
  );
