# 沐紋映像｜線上預約

Google Apps Script 網頁應用程式 + Google 試算表後台。

## 功能

- 自訂預約網頁（日期、時段、人員、人數、姓名、性別、電話、信箱、備註）
- 依試算表自動隱藏**已額滿時段**
- 提交後寫入試算表 + 寄確認信（客人 + `muwenphoto@gmail.com`）

## 資料流程

```
預約網頁
    ↓
Apps Script（Code.gs）
    ↓
Google 試算表「Bookings」工作表
    ↓
Gmail 寄信
```

## 第一次設定

### 1. 在 Google 建立專案（二選一）

**A. 新建（推薦）**

```bash
cd ~/Projects/muwen-booking
clasp create --title "沐纹映像预约" --type sheets
```

成功後 `.clasp.json` 會自動填入腳本 ID。

**B. 接上現有專案**

```bash
cd ~/Projects/muwen-booking
clasp clone 你的腳本ID
```

### 2. 上傳程式到 Google

```bash
cd ~/Projects/muwen-booking
clasp push
```

### 3. 初始化試算表

1. 打開 [script.google.com](https://script.google.com) → 進入「沐纹映像预约」
2. 選函式 **`setupSpreadsheet`** → 按 ▶ 執行 → 授權
3. 試算表會出現 `Bookings` 工作表與欄位標題

### 4. 測試

| 函式 | 用途 |
|------|------|
| `testSendMail` | 測試寄信 |
| `testOnFormSubmit` | 模擬一筆預約 |

**不要**手動執行 `onFormSubmit`（那是表單觸發用的，手動跑會報錯）。

### 5. 發布成預約網頁

1. **部署 → 新增部署**
2. 類型：**網頁應用程式**
3. 執行身分：**我**
4. 存取權限：**任何人**
5. 部署 → 複製網址，貼到 LINE、IG 等

## 修改設定

在 `apps-script/Code.gs` 的 `CONFIG`：

| 欄位 | 說明 |
|------|------|
| `openDays` | 可預約星期（0=日 … 6=六） |
| `openTime` / `closeTime` | 營業時段 |
| `slotMinutes` | 每格分鐘（30 = 10:00, 10:30…） |
| `maxPerSlot` | 同一時段最多幾組 |
| `staff` | 服務人員名單 |

改完後：

```bash
clasp push
```

再在 Google 後台 **部署 → 管理部署 → 編輯 → 新版本**，客人才會用到最新版。

## 日常流程

1. 你在 Cursor 跟我說需求（例如「週日也開放」「同一時段最多 2 人」）
2. 我改 `apps-script/` 裡的程式
3. 你執行 `clasp push` 上傳到 Google
4. 需要時再發布新版本
