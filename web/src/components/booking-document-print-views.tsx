'use client';

import type { ReactNode } from 'react';
import type { BookingDocumentState } from '@/lib/admin/booking-documents';
import {
  calcItemRowTotal,
  summarizeItemRows,
  getDocumentGrandTotal,
  getBalanceDue,
  patchDocumentState,
  updateItemRowWithCalc,
  updateLineItem,
  updatePayment,
} from '@/components/booking-document-shared';
import { PaperCheckField, PaperDateField, PaperField } from '@/components/booking-document-paper-fields';

export type BookingDocumentPrintProps = {
  state: BookingDocumentState;
  shopName: string;
  shopFullName: string;
  shopAddress: string;
  shopPhone: string;
  studio?: boolean;
  onChange?: (next: BookingDocumentState) => void;
};

function PV({ children }: { children: ReactNode }) {
  const text = children === null || children === undefined || children === '' ? '\u00A0' : children;
  return <span className="booking-doc-pv">{text}</span>;
}

function PrintSignatureDate({ prefix = '日期：' }: { prefix?: string }) {
  return (
    <span className="booking-doc-signature-date">
      {prefix}
      <span className="booking-doc-signature-roc booking-doc-signature-roc--spaced" aria-label="中華民國">
        中 華 民 國
      </span>
      <span className="booking-doc-signature-line booking-doc-signature-line--year" aria-hidden />
      <span className="booking-doc-signature-unit">年</span>
      <span className="booking-doc-signature-line booking-doc-signature-line--month" aria-hidden />
      <span className="booking-doc-signature-unit">月</span>
      <span className="booking-doc-signature-line booking-doc-signature-line--day" aria-hidden />
      <span className="booking-doc-signature-unit">日</span>
    </span>
  );
}

function SheetBottomSignature() {
  return (
    <div className="booking-doc-bottom-sign" aria-label="簽名與日期">
      <p className="booking-doc-bottom-sign-row">
        <span className="booking-doc-bottom-sign-label">簽名</span>
        <span className="booking-doc-signature-line booking-doc-signature-line--sign" aria-hidden />
      </p>
      <p className="booking-doc-bottom-sign-row">
        <PrintSignatureDate />
      </p>
    </div>
  );
}

function DocumentLetterhead({
  shopName,
  title,
  caseNumber,
  variant = 'default',
  children,
  studio,
  onCaseChange,
}: {
  shopName: string;
  title: string;
  caseNumber: string;
  variant?: 'default' | 'contract' | 'quote';
  children?: ReactNode;
  studio?: boolean;
  onCaseChange?: (value: string) => void;
}) {
  return (
    <header className={`booking-doc-header booking-doc-header--${variant}`}>
      <div className="booking-doc-header-main">
        <div className="booking-doc-logo-mark" aria-hidden="true">
          沐
        </div>
        <div>
          <p className={`booking-doc-brand${variant === 'quote' ? ' booking-doc-brand--gold' : ''}`}>
            {shopName}
          </p>
          <h2>{title}</h2>
          {children}
        </div>
      </div>
      <div className="booking-doc-case-wrap">
        <span className="booking-doc-case-line">
          <span className="booking-doc-case-label">NO.</span>
          {studio && onCaseChange ? (
            <input
              type="text"
              className="booking-doc-paper-field booking-doc-paper-field--case"
              value={caseNumber}
              onChange={(event) => onCaseChange(event.target.value)}
            />
          ) : (
            <span className="booking-doc-case-no">{caseNumber || '—'}</span>
          )}
        </span>
      </div>
    </header>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="booking-doc-section-title">{children}</h3>;
}

function patch(
  props: BookingDocumentPrintProps,
  updater: (state: BookingDocumentState) => BookingDocumentState,
) {
  if (!props.onChange) return;
  props.onChange(patchDocumentState(props.state, updater));
}

export function BookingDocumentItemsPrint({
  state,
  shopName,
  studio,
  onChange,
}: BookingDocumentPrintProps) {
  const editable = Boolean(studio && onChange);
  const base = { state, shopName, shopFullName: '', shopAddress: '', shopPhone: '', studio, onChange };
  const { subtotalQty, subtotalAmount, grandTotal } = summarizeItemRows(state.itemRows);
  const documentTotal = getDocumentGrandTotal(state);

  return (
    <div className="booking-doc-sheet booking-doc-sheet--items">
      <DocumentLetterhead
        shopName={shopName}
        title="攝影項目表"
        caseNumber={state.caseNumber}
        studio={editable}
        onCaseChange={(value) => patch(base, (s) => ({ ...s, caseNumber: value }))}
      />

      <SectionTitle>客戶資料</SectionTitle>
      <table className="booking-doc-table booking-doc-table--compact">
        <tbody>
          <tr>
            <th>姓名</th>
            <td>
              <PaperField value={state.customerName} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, customerName: value }))} />
            </td>
            <th>電話</th>
            <td>
              <PaperField value={state.phone} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, phone: value }))} />
            </td>
            <th>電子郵件</th>
            <td>
              <PaperField value={state.email} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, email: value }))} />
            </td>
          </tr>
          <tr>
            <th>緊急聯絡人</th>
            <td>
              <PaperField value={state.emergencyContactName} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, emergencyContactName: value }))} />
            </td>
            <th>緊急聯絡電話</th>
            <td>
              <PaperField value={state.emergencyContactPhone} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, emergencyContactPhone: value }))} />
            </td>
          </tr>
          <tr>
            <th colSpan={2}>備註</th>
            <td colSpan={2}>
              <PaperField value={state.notes} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, notes: value }))} />
            </td>
          </tr>
        </tbody>
      </table>

      <SectionTitle>服務明細</SectionTitle>
      <table className="booking-doc-table booking-doc-table--zebra">
        <thead>
          <tr>
            <th>服務內容</th>
            <th>方案選擇</th>
            <th>價格</th>
            <th>優惠折扣</th>
            <th>單項總額</th>
            <th>購買數量</th>
          </tr>
        </thead>
        <tbody>
          {state.itemRows.map((row, index) => (
            <tr key={index}>
              <td>
                <PaperField value={row.serviceContent} editable={editable} onChange={(value) => patch(base, (s) => updateItemRowWithCalc(s, index, { serviceContent: value }))} />
              </td>
              <td>
                <PaperField value={row.packageChoice} editable={editable} onChange={(value) => patch(base, (s) => updateItemRowWithCalc(s, index, { packageChoice: value }))} />
              </td>
              <td>
                <PaperField value={row.price} editable={editable} onChange={(value) => patch(base, (s) => updateItemRowWithCalc(s, index, { price: value }))} />
              </td>
              <td>
                <PaperField value={row.discount} editable={editable} onChange={(value) => patch(base, (s) => updateItemRowWithCalc(s, index, { discount: value }))} />
              </td>
              <td>
                <PV>{calcItemRowTotal(row.price, row.discount, row.quantity) || row.itemTotal}</PV>
              </td>
              <td>
                <PaperField value={row.quantity} editable={editable} onChange={(value) => patch(base, (s) => updateItemRowWithCalc(s, index, { quantity: value }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="booking-doc-notes-block">
        <strong className="booking-doc-notes-title">注意事項</strong>
        <ol>
          <li>預約需付訂金，餘款於交件時結清。</li>
          <li>交件時間約 15–20 個工作天（不含例假日）。</li>
          <li>取消或改期請提前通知，依工作室規定辦理。</li>
          <li>成品檔案保留 30 天，請於期限內下載備份。</li>
          <li>著作權歸工作室所有，客戶享有個人使用權。</li>
        </ol>
      </div>

      <div className="booking-doc-summary-row">
        <table className="booking-doc-table booking-doc-table--summary">
          <tbody>
            <tr>
              <th>小計數量</th>
              <td>{subtotalQty || '—'}</td>
              <th>小計金額</th>
              <td>{subtotalAmount || '—'}</td>
              <th>應收總額</th>
              <td>{documentTotal || grandTotal || '—'}</td>
            </tr>
          </tbody>
        </table>
        <SheetBottomSignature />
      </div>
    </div>
  );
}

export function BookingDocumentContractPrint({
  state,
  shopFullName,
  shopAddress,
  shopPhone,
  studio,
  onChange,
}: BookingDocumentPrintProps) {
  const editable = Boolean(studio && onChange);
  const base = { state, shopName: '', shopFullName, shopAddress, shopPhone, studio, onChange };
  const { grandTotal } = summarizeItemRows(state.itemRows);
  const documentTotal = getDocumentGrandTotal(state);
  const balanceDue = getBalanceDue(state);

  return (
    <div className="booking-doc-sheet booking-doc-sheet--contract">
      <DocumentLetterhead
        shopName={shopFullName}
        title="報價單"
        caseNumber={state.caseNumber}
        variant="contract"
        studio={editable}
        onCaseChange={(value) => patch(base, (s) => ({ ...s, caseNumber: value }))}
      >
        <p className="booking-doc-shop-line">{shopAddress}</p>
        <p className="booking-doc-shop-line">電話：{shopPhone}</p>
      </DocumentLetterhead>

      <SectionTitle>客戶資料</SectionTitle>
      <table className="booking-doc-table booking-doc-table--contract">
        <tbody>
          <tr>
            <th>客戶名稱</th>
            <td><PaperField value={state.customerName} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, customerName: value }))} /></td>
            <th>聯絡電話</th>
            <td><PaperField value={state.phone} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, phone: value }))} /></td>
          </tr>
          <tr>
            <th>Line ID</th>
            <td><PaperField value={state.lineId} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, lineId: value }))} /></td>
            <th>Email</th>
            <td><PaperField value={state.email} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, email: value }))} /></td>
          </tr>
          <tr>
            <th>地址</th>
            <td colSpan={3}><PaperField value={state.address} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, address: value }))} /></td>
          </tr>
        </tbody>
      </table>

      <SectionTitle>預約與拍攝</SectionTitle>
      <table className="booking-doc-table booking-doc-table--compact">
        <tbody>
          <tr>
            <th>預約內容</th>
            <td colSpan={3}><PaperField value={state.appointmentContent} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, appointmentContent: value }))} /></td>
          </tr>
          <tr>
            <th>備註</th>
            <td colSpan={3}><PaperField value={state.remarks} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, remarks: value }))} /></td>
          </tr>
          <tr>
            <th>拍攝日期</th>
            <td><PaperDateField value={state.shootingDate} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, shootingDate: value, appointmentDate: value }))} /></td>
            <th>拍攝時間</th>
            <td><PaperField value={state.shootingTime} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, shootingTime: value }))} /></td>
          </tr>
          <tr>
            <th>看稿日期</th>
            <td><PaperDateField value={state.selectionDate} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, selectionDate: value }))} /></td>
            <th>看稿時間</th>
            <td><PaperField value={state.selectionTime} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, selectionTime: value }))} /></td>
          </tr>
          <tr>
            <th>交付日期</th>
            <td><PaperDateField value={state.deliveryDate} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, deliveryDate: value }))} /></td>
            <th>交付時間</th>
            <td><PaperField value={state.deliveryTime} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, deliveryTime: value }))} /></td>
          </tr>
          <tr>
            <th>拍攝服務</th>
            <td colSpan={3}>
              {editable ? (
                <span className="booking-doc-paper-checks">
                  <PaperCheckField label="外景拍攝" checked={state.shootingOutdoor} editable onChange={(checked) => patch(base, (s) => ({ ...s, shootingOutdoor: checked }))} />
                  <PaperCheckField label="棚內拍攝" checked={state.shootingIndoor} editable onChange={(checked) => patch(base, (s) => ({ ...s, shootingIndoor: checked }))} />
                </span>
              ) : (
                <PV>
                  {[state.shootingOutdoor ? '外景拍攝' : '', state.shootingIndoor ? '棚內拍攝' : ''].filter(Boolean).join('、')}
                </PV>
              )}
            </td>
          </tr>
          <tr>
            <th>攝影師</th>
            <td><PaperField value={state.photographer} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, photographer: value }))} /></td>
            <th>助理</th>
            <td><PaperField value={state.assistant} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, assistant: value }))} /></td>
          </tr>
          <tr>
            <th>禮服套數</th>
            <td><PaperField value={state.formalOutfits} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, formalOutfits: value }))} /></td>
            <th>便服套數</th>
            <td><PaperField value={state.casualOutfits} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, casualOutfits: value }))} /></td>
          </tr>
          <tr>
            <th>外景地點</th>
            <td><PaperField value={state.outdoorLocation} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, outdoorLocation: value }))} /></td>
            <th>外景服裝</th>
            <td><PaperField value={state.outdoorClothing} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, outdoorClothing: value }))} /></td>
          </tr>
          <tr>
            <th>金額</th>
            <td><PV>{grandTotal || state.amount}</PV></td>
            <th>追加金額</th>
            <td><PaperField value={state.additionalAmount} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, additionalAmount: value }))} /></td>
          </tr>
          <tr>
            <th>訂金</th>
            <td><PaperField value={state.deposit} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, deposit: value }))} /></td>
            <th>尾款</th>
            <td><PV>{balanceDue ? String(balanceDue) : state.total}</PV></td>
          </tr>
          <tr>
            <th>應收總額</th>
            <td colSpan={3}><PV>{documentTotal ? String(documentTotal) : state.total}</PV></td>
          </tr>
          <tr>
            <th>追加商品</th>
            <td colSpan={3}><PaperField value={state.additionalItems} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, additionalItems: value }))} /></td>
          </tr>
        </tbody>
      </table>

      <SectionTitle>付款紀錄</SectionTitle>
      <table className="booking-doc-table booking-doc-table--zebra">
        <thead>
          <tr>
            <th>付款日期</th>
            <th>付款金額</th>
            <th>客戶簽名</th>
            <th>收款人</th>
          </tr>
        </thead>
        <tbody>
          {state.payments.map((row, index) => (
            <tr key={index}>
              <td><PaperField value={row.date} editable={editable} onChange={(value) => patch(base, (s) => updatePayment(s, index, { date: value }))} /></td>
              <td><PaperField value={row.amount} editable={editable} onChange={(value) => patch(base, (s) => updatePayment(s, index, { amount: value }))} /></td>
              <td><PaperField value={row.customerSignature} editable={editable} onChange={(value) => patch(base, (s) => updatePayment(s, index, { customerSignature: value }))} /></td>
              <td><PaperField value={row.receiver} editable={editable} onChange={(value) => patch(base, (s) => updatePayment(s, index, { receiver: value }))} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="booking-doc-notes-block">
        <strong className="booking-doc-notes-title">注意事項</strong>
        <ol>
          <li>成品檔案保留 30 天，請於期限內下載。</li>
          <li>精修張數依方案為準，加修另計。</li>
          <li>著作權歸工作室所有，客戶享有個人使用權。</li>
          <li>交件時間約 15–20 個工作天。</li>
          <li>取消或改期請提前通知，依工作室規定辦理。</li>
        </ol>
      </div>
      <SheetBottomSignature />
    </div>
  );
}

export function BookingDocumentQuotePrint({
  state,
  shopName,
  studio,
  onChange,
}: BookingDocumentPrintProps) {
  const editable = Boolean(studio && onChange);
  const base = { state, shopName, shopFullName: '', shopAddress: '', shopPhone: '', studio, onChange };
  const documentTotal = getDocumentGrandTotal(state);
  const serviceLabel = state.serviceOption ? `${state.service}｜${state.serviceOption}` : state.service;

  return (
    <div className="booking-doc-sheet booking-doc-sheet--quote">
      <DocumentLetterhead
        shopName={shopName}
        title="攝影估價單"
        caseNumber={state.caseNumber}
        variant="quote"
        studio={editable}
        onCaseChange={(value) => patch(base, (s) => ({ ...s, caseNumber: value }))}
      />

      <SectionTitle>基本資料</SectionTitle>
      <table className="booking-doc-table booking-doc-table--compact">
        <tbody>
          <tr>
            <th>姓名</th>
            <td><PaperField value={state.customerName} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, customerName: value }))} /></td>
            <th>電話</th>
            <td><PaperField value={state.phone} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, phone: value }))} /></td>
            <th>Email</th>
            <td><PaperField value={state.email} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, email: value }))} /></td>
          </tr>
          <tr>
            <th>攝影師</th>
            <td colSpan={5}><PaperField value={state.photographer} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, photographer: value }))} /></td>
          </tr>
          <tr>
            <th>服務項目</th>
            <td colSpan={5}>
              <PaperField
                value={serviceLabel}
                editable={editable}
                onChange={(value) => {
                  const parts = value.split('｜');
                  patch(base, (s) => ({
                    ...s,
                    service: parts[0]?.trim() || '',
                    serviceOption: parts[1]?.trim() || '',
                    appointmentContent: value,
                  }));
                }}
              />
            </td>
          </tr>
        </tbody>
      </table>

      <SectionTitle>估價明細</SectionTitle>
      <table className="booking-doc-table booking-doc-table--zebra">
        <thead>
          <tr>
            <th className="booking-doc-col-no">品名</th>
            <th>服務內容</th>
            <th>數量</th>
            <th>單價</th>
            <th>金額</th>
            <th>備註</th>
          </tr>
        </thead>
        <tbody>
          {state.lineItems.map((row, index) => (
            <tr key={index}>
              <td className="booking-doc-col-no">{String(index + 1).padStart(2, '0')}</td>
              <td><PaperField value={row.serviceContent} editable={editable} onChange={(value) => patch(base, (s) => updateLineItem(s, index, { serviceContent: value }))} /></td>
              <td><PaperField value={row.quantity} editable={editable} onChange={(value) => patch(base, (s) => updateLineItem(s, index, { quantity: value }))} /></td>
              <td><PaperField value={row.unitPrice} editable={editable} onChange={(value) => patch(base, (s) => updateLineItem(s, index, { unitPrice: value }))} /></td>
              <td><PaperField value={row.amount} editable={editable} onChange={(value) => patch(base, (s) => updateLineItem(s, index, { amount: value }))} /></td>
              <td><PaperField value={row.remarks} editable={editable} onChange={(value) => patch(base, (s) => updateLineItem(s, index, { remarks: value }))} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="booking-doc-quote-footer">
        <div className="booking-doc-quote-totals">
          <div>
            <span>定金</span>
            <strong><PaperField value={state.deposit} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, deposit: value }))} /></strong>
          </div>
          <div>
            <span>總額</span>
            <strong><PV>{documentTotal ? String(documentTotal) : state.total}</PV></strong>
          </div>
        </div>
        <p className="booking-doc-signature booking-doc-signature--quote">
          <span className="booking-doc-signature-handler">
            經手人：<PaperField value={state.handler} editable={editable} onChange={(value) => patch(base, (s) => ({ ...s, handler: value }))} />
          </span>
        </p>
      </div>
      <SheetBottomSignature />
    </div>
  );
}
