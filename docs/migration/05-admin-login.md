# 遷移教學｜第 5 步：後台登入

> 目標：在新站建立 `/admin` 後台登入（主控 / 副主控 / 攝影師）。

## 第 5 步 A：加 Secret key 到 `.env.local`

1. Supabase → **Project Settings → API Keys**
2. 複製 **Secret key**（`sb_secret_...`，**不要**貼到聊天）
3. 在 `web/.env.local` **多加兩行**（值自己填）：

```env
SUPABASE_SERVICE_ROLE_KEY=你的_secret_key
ADMIN_SESSION_SECRET=自己打一串至少32字的亂碼
```

⚠️ `SUPABASE_SERVICE_ROLE_KEY` 只能在伺服器用，絕不要加 `NEXT_PUBLIC_` 前綴。

4. **Save** 後重啟 `npm run dev`

## 第 5 步 B：首次建立主控帳號

1. 瀏覽器開：`http://localhost:3000/admin`
2. 若還沒有帳號，會看到 **「首次設定主控帳號」**
3. 填：
   - 登入帳號（例如 `jia`）
   - 密碼（至少 8 字）
   - 連結攝影師：選 `鴨鴨`
4. 建立成功後，用同一組帳密登入

## 第 5 步 C：登入後

- 網址：`http://localhost:3000/admin/dashboard`
- 可看到預約列表（含你剛才測試送出的那一筆）
- 攝影師帳號（第 6 步）只能看自己的預約

## 舊 GAS 後台

**照常使用**，不受影響。新舊後台資料尚未同步。

---

做完回 **「第 5 步好了」** 或貼錯誤截圖。
