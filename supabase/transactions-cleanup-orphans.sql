-- 清除已刪除預約留下的孤兒收支（可重複執行）
delete from public.transactions
where booking_id is null
  and source = 'document_payment';
