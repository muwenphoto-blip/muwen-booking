-- 服務項目金額（SQL Editor 貼上執行一次）
-- base_price：無子方案時的預設金額（新台幣，整數）
-- options_json 內可含 price 欄位（子方案金額）

alter table public.services
  add column if not exists base_price integer;

comment on column public.services.base_price is '服務預設金額（新台幣）；有子方案時以 options_json.price 為準';
