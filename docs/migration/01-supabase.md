# 遷移教學｜第 1 步：建立 Supabase 資料庫

> 目標：把現在 Google 試算表裡的資料，改存到 **Supabase（PostgreSQL）**。  
> 這一步只做「開帳號 + 建表」，還不動現有 GAS 預約系統。

## 完成後你會得到

- 一個 Supabase 專案（免費方案即可）
- 6 張資料表，對應現有試算表分頁
- 兩組金鑰（之後第 3 步才會用到）

## 操作步驟

### 1. 註冊 Supabase

1. 開啟 https://supabase.com
2. 用 Google 帳號登入（建議用 `muwenphoto@gmail.com` 或你管理試算表同一個）
3. 點 **New project**

### 2. 建立專案

| 欄位 | 建議填法 |
|------|----------|
| Name | `muwen-booking` |
| Database Password | 自己設一組強密碼，**抄在安全的地方**（只有這一次會顯示） |
| Region | **Northeast Asia (Tokyo)** — 離台灣最近 |

點 **Create new project**，等約 1～2 分鐘。

### 3. 執行建表 SQL

1. 左側選 **SQL Editor**
2. 點 **New query**
3. 打開本 repo 的 `supabase/schema.sql`，**全選複製**
4. 貼到 Supabase 編輯器 → 點 **Run**（或 Ctrl+Enter）
5. 下方應顯示 `Success`，沒有紅色錯誤

### 4. 確認表已建立

1. 左側 **Table Editor**
2. 應看到：`bookings`、`staff`、`services`、`settings`、`admin_users`、`admin_logs`

### 5. 先記下這兩個值（第 3 步才用，現在不急）

**Project Settings → API**

- **Project URL**（像 `https://xxxxx.supabase.co`）
- **anon public** key（很長一串，可公開給前端用）

⚠️ **service_role** key 絕對不要貼到前端或給客人看。

## 對照：試算表 → 資料表

| 試算表分頁 | Supabase 表 |
|-----------|-------------|
| Bookings | `bookings` |
| Staff | `staff` |
| Services | `services` |
| Settings | `settings` |
| AdminUsers | `admin_users` |
| AdminLogs | `admin_logs` |

## 常見問題

**Q：要付費嗎？**  
A：Free tier 對小型預約站通常夠用。

**Q：現有 GAS 要關嗎？**  
A：不用。這一步完全獨立，舊系統照常運作。

**Q：SQL 跑失敗？**  
A：若表已存在，刪掉專案重建，或把錯誤訊息貼給我。

---

## 下一步（等你做完再說）

第 2 步：在本機用 Next.js 建立新網站骨架（`web/` 資料夾）。

做完第 1 步後回覆：**「第 1 步好了」** 或貼 Supabase 錯誤截圖。
