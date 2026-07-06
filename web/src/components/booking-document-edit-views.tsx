'use client';

import { useEffect, useState } from 'react';
import type { DateParts } from '@/lib/admin/booking-documents';
import {
  serviceOptionsFor,
  serviceOptionPlaceholder,
  syncServiceChange,
  syncServiceOptionChange,
} from '@/lib/admin/booking-documents';
import {
  EditSection,
  type BookingDocumentSharedProps,
  summarizeItemRows,
  getDocumentGrandTotal,
  getBalanceDue,
  patchDocumentState,
} from '@/components/booking-document-shared';
import { ItemRowList, PaymentRowList, QuoteLineList } from '@/components/booking-document-line-list';
import { FormField } from '@/components/form-field';

function DateFieldEdit({
  label,
  value,
  onChange,
}: {
  label: string;
  value: DateParts;
  onChange: (next: DateParts) => void;
}) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <div className="booking-doc-edit-date-row">
        <input
          type="text"
          inputMode="numeric"
          placeholder="年"
          value={value.year}
          onChange={(e) => onChange({ ...value, year: e.target.value })}
        />
        <span>年</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="月"
          value={value.month}
          onChange={(e) => onChange({ ...value, month: e.target.value })}
        />
        <span>月</span>
        <input
          type="text"
          inputMode="numeric"
          placeholder="日"
          value={value.day}
          onChange={(e) => onChange({ ...value, day: e.target.value })}
        />
        <span>日</span>
      </div>
    </label>
  );
}

function ServiceFields({
  state,
  services,
  onChange,
  fieldErrors,
  onFieldTouch,
  onFieldBlur,
}: BookingDocumentSharedProps) {
  const options = serviceOptionsFor(state.service, services);
  return (
    <div className="admin-grid-2">
      <FormField
        fieldId="doc-service"
        label="服務項目"
        required
        hint="選擇後會帶入明細與三份輸出文件"
        error={fieldErrors?.['doc-service']}
      >
        <select
          value={state.service}
          onChange={(e) => {
            onFieldTouch?.('doc-service');
            onChange(syncServiceChange(state, e.target.value, services));
          }}
          onBlur={() => onFieldBlur?.('doc-service')}
        >
          <option value="">請選擇</option>
          {services.map((item) => (
            <option key={item.name} value={item.name}>
              {item.label}
            </option>
          ))}
          {state.service && !services.some((item) => item.name === state.service) ? (
            <option value={state.service}>{state.service}</option>
          ) : null}
        </select>
      </FormField>
      <FormField
        fieldId="doc-service-option"
        label="方案／功能"
        required={options.length > 0}
        optional={options.length === 0}
        hint={options.length > 0 ? '此服務需選擇方案' : '此服務無子方案'}
        error={fieldErrors?.['doc-service-option']}
      >
        <select
          value={state.serviceOption}
          disabled={!state.service || options.length === 0}
          onChange={(e) => {
            onFieldTouch?.('doc-service-option');
            onChange(syncServiceOptionChange(state, e.target.value));
          }}
          onBlur={() => onFieldBlur?.('doc-service-option')}
        >
          <option value="">{serviceOptionPlaceholder(options.length)}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  );
}

function CustomerFields({ state, onChange }: BookingDocumentSharedProps) {
  return (
    <div className="admin-grid-2">
      <label className="admin-field">
        <span>姓名</span>
        <input
          value={state.customerName}
          onChange={(e) => onChange({ ...state, customerName: e.target.value })}
        />
      </label>
      <label className="admin-field">
        <span>電話</span>
        <input
          value={state.phone}
          onChange={(e) => onChange({ ...state, phone: e.target.value })}
        />
      </label>
      <label className="admin-field">
        <span>Email</span>
        <input
          type="email"
          value={state.email}
          onChange={(e) => onChange({ ...state, email: e.target.value })}
        />
      </label>
      <label className="admin-field">
        <span>攝影師</span>
        <input
          value={state.photographer}
          onChange={(e) => onChange({ ...state, photographer: e.target.value })}
        />
      </label>
    </div>
  );
}

export function BookingDocumentFeeFooter(props: BookingDocumentSharedProps) {
  const { state, onChange } = props;
  const { subtotalQty, subtotalAmount, grandTotal } = summarizeItemRows(state.itemRows);
  const documentTotal = getDocumentGrandTotal(state);
  const balanceDue = getBalanceDue(state);
  const hasFeeDetails = Boolean(
    state.additionalAmount.trim() || state.deposit.trim() || state.additionalItems.trim(),
  );
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (hasFeeDetails) setExpanded(true);
  }, [hasFeeDetails]);

  const detailFields = (
    <div className="booking-doc-fee-footer__fields admin-grid-2">
      <label className="admin-field">
        <span>追加金額</span>
        <input
          value={state.additionalAmount}
          onChange={(e) =>
            onChange(patchDocumentState(state, { ...state, additionalAmount: e.target.value }))
          }
        />
      </label>
      <label className="admin-field">
        <span>訂金</span>
        <input
          value={state.deposit}
          onChange={(e) => onChange(patchDocumentState(state, { ...state, deposit: e.target.value }))}
        />
      </label>
      <label className="admin-field">
        <span>尾款</span>
        <input
          className="booking-doc-readonly-field"
          readOnly
          tabIndex={-1}
          value={balanceDue ? String(balanceDue) : ''}
          placeholder="自動計算"
        />
      </label>
      <label className="admin-field admin-field--full">
        <span>追加商品細項</span>
        <textarea
          rows={2}
          value={state.additionalItems}
          onChange={(e) => onChange({ ...state, additionalItems: e.target.value })}
        />
      </label>
    </div>
  );

  return (
    <div
      className={`booking-doc-fee-footer is-collapsible ${expanded ? 'is-expanded' : 'is-collapsed'}`}
    >
      <button
        type="button"
        className="booking-doc-fee-footer__toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="booking-doc-fee-footer__toggle-main">
          <div className="booking-doc-fee-footer__head">
            <h4>費用</h4>
            <p>
              {expanded
                ? '金額由服務明細自動計算；尾款 = 應收總額 − 訂金'
                : '點擊展開可編輯訂金、追加金額與細項'}
            </p>
          </div>
          <div className="booking-doc-edit-summary booking-doc-edit-summary--footer">
            <div>
              <span>小計數量</span>
              <strong>{subtotalQty || '—'}</strong>
            </div>
            <div>
              <span>小計金額</span>
              <strong>{subtotalAmount || '—'}</strong>
            </div>
            <div>
              <span>應收總額</span>
              <strong>{documentTotal || grandTotal || '—'}</strong>
            </div>
          </div>
        </div>
        <span className="booking-doc-fee-footer__chevron" aria-hidden>
          {expanded ? '收合' : '展開'}
        </span>
      </button>
      {expanded ? detailFields : null}
    </div>
  );
}

export function BookingDocumentUnifiedEdit(props: BookingDocumentSharedProps) {
  const { state, onChange, fieldErrors, onFieldTouch, onFieldBlur, handlerOptions } = props;

  return (
    <div className="booking-doc-edit-form">
      <EditSection title="服務項目" hint="選擇後會帶入明細與三份輸出文件">
        <ServiceFields {...props} />
      </EditSection>

      <EditSection title="客戶資料" hint="除客戶備註外皆為必填">
        <div className="admin-grid-2">
          <FormField
            fieldId="doc-customer-name"
            label="姓名"
            required
            hint="用於案號與合約文件"
            error={fieldErrors?.['doc-customer-name']}
          >
            <input
              value={state.customerName}
              onChange={(e) => {
                onFieldTouch?.('doc-customer-name');
                onChange({ ...state, customerName: e.target.value });
              }}
              onBlur={() => onFieldBlur?.('doc-customer-name')}
            />
          </FormField>
          <FormField
            fieldId="doc-phone"
            label="電話"
            required
            hint="聯絡與通知用"
            error={fieldErrors?.['doc-phone']}
          >
            <input
              value={state.phone}
              onChange={(e) => {
                onFieldTouch?.('doc-phone');
                onChange({ ...state, phone: e.target.value });
              }}
              onBlur={() => onFieldBlur?.('doc-phone')}
            />
          </FormField>
          <FormField
            fieldId="doc-email"
            label="Email"
            required
            hint="用於寄送通知或文件"
            error={fieldErrors?.['doc-email']}
          >
            <input
              type="email"
              value={state.email}
              onChange={(e) => {
                onFieldTouch?.('doc-email');
                onChange({ ...state, email: e.target.value });
              }}
              onBlur={() => onFieldBlur?.('doc-email')}
            />
          </FormField>
          <FormField
            fieldId="doc-line-id"
            label="Line ID"
            required
            hint="方便聯絡客戶"
            error={fieldErrors?.['doc-line-id']}
          >
            <input
              value={state.lineId}
              onChange={(e) => {
                onFieldTouch?.('doc-line-id');
                onChange({ ...state, lineId: e.target.value });
              }}
              onBlur={() => onFieldBlur?.('doc-line-id')}
            />
          </FormField>
          <FormField
            fieldId="doc-address"
            label="地址"
            required
            className="admin-field--full"
            hint="合約與聯絡用"
            error={fieldErrors?.['doc-address']}
          >
            <input
              value={state.address}
              onChange={(e) => {
                onFieldTouch?.('doc-address');
                onChange({ ...state, address: e.target.value });
              }}
              onBlur={() => onFieldBlur?.('doc-address')}
            />
          </FormField>
          <FormField
            fieldId="doc-emergency"
            label="緊急聯絡人"
            required
            hint="姓名與電話皆可填寫"
            error={fieldErrors?.['doc-emergency']}
          >
            <input
              value={state.emergencyContact}
              onChange={(e) => {
                onFieldTouch?.('doc-emergency');
                onChange({ ...state, emergencyContact: e.target.value });
              }}
              onBlur={() => onFieldBlur?.('doc-emergency')}
            />
          </FormField>
          <FormField
            fieldId="doc-handler"
            label="經手人"
            required
            hint="選擇當班登記人員"
            error={fieldErrors?.['doc-handler']}
          >
            {handlerOptions?.length ? (
              <select
                value={state.handler}
                onChange={(e) => {
                  onFieldTouch?.('doc-handler');
                  onChange({ ...state, handler: e.target.value });
                }}
                onBlur={() => onFieldBlur?.('doc-handler')}
              >
                <option value="">請選擇</option>
                {handlerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={state.handler}
                onChange={(e) => {
                  onFieldTouch?.('doc-handler');
                  onChange({ ...state, handler: e.target.value });
                }}
                onBlur={() => onFieldBlur?.('doc-handler')}
              />
            )}
          </FormField>
          <FormField fieldId="doc-notes" label="客戶備註" optional className="admin-field--full" hint="選填">
            <input
              value={state.notes}
              onChange={(e) => onChange({ ...state, notes: e.target.value })}
            />
          </FormField>
        </div>
      </EditSection>

      <EditSection title="服務明細" hint="預設一筆，完成後顯示摘要卡片；估價單明細會自動同步">
        {fieldErrors?.['doc-item-rows'] ? (
          <p id="doc-item-rows" className="booking-doc-section-error" role="alert">
            {fieldErrors['doc-item-rows']}
          </p>
        ) : null}
        <ItemRowList
          {...props}
          onChange={(next) => {
            onFieldTouch?.('doc-item-rows');
            onChange(next);
          }}
        />
      </EditSection>

      <EditSection title="預約與時程">
        <div className="admin-grid-2">
          <label className="admin-field admin-field--full">
            <span>預約內容</span>
            <textarea
              rows={2}
              value={state.appointmentContent}
              onChange={(e) => onChange({ ...state, appointmentContent: e.target.value })}
            />
          </label>
          <label className="admin-field admin-field--full">
            <span>合約備註</span>
            <textarea
              rows={2}
              value={state.remarks}
              onChange={(e) => onChange({ ...state, remarks: e.target.value })}
            />
          </label>
          <DateFieldEdit
            label="預約日期"
            value={state.appointmentDate}
            onChange={(appointmentDate) => onChange({ ...state, appointmentDate })}
          />
          <DateFieldEdit
            label="拍攝日期"
            value={state.shootingDate}
            onChange={(shootingDate) => onChange({ ...state, shootingDate })}
          />
          <DateFieldEdit
            label="看稿日期"
            value={state.selectionDate}
            onChange={(selectionDate) => onChange({ ...state, selectionDate })}
          />
          <DateFieldEdit
            label="交付日期"
            value={state.deliveryDate}
            onChange={(deliveryDate) => onChange({ ...state, deliveryDate })}
          />
        </div>
      </EditSection>

      <EditSection title="拍攝安排">
        <div className="booking-doc-edit-checks">
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={state.shootingOutdoor}
              onChange={(e) => onChange({ ...state, shootingOutdoor: e.target.checked })}
            />
            外景拍攝
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={state.shootingIndoor}
              onChange={(e) => onChange({ ...state, shootingIndoor: e.target.checked })}
            />
            棚內拍攝
          </label>
        </div>
        <div className="admin-grid-2 booking-doc-edit-section-gap">
          <label className="admin-field">
            <span>攝影師</span>
            <input
              value={state.photographer}
              onChange={(e) => onChange({ ...state, photographer: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>助理</span>
            <input
              value={state.assistant}
              onChange={(e) => onChange({ ...state, assistant: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>禮服套數</span>
            <input
              value={state.formalOutfits}
              onChange={(e) => onChange({ ...state, formalOutfits: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>便服套數</span>
            <input
              value={state.casualOutfits}
              onChange={(e) => onChange({ ...state, casualOutfits: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>外景地點</span>
            <input
              value={state.outdoorLocation}
              onChange={(e) => onChange({ ...state, outdoorLocation: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>外景服裝</span>
            <input
              value={state.outdoorClothing}
              onChange={(e) => onChange({ ...state, outdoorClothing: e.target.value })}
            />
          </label>
        </div>
      </EditSection>

      <EditSection title="付款紀錄" hint="需要時再新增">
        <PaymentRowList {...props} />
      </EditSection>
    </div>
  );
}

export function BookingDocumentQuoteEdit(props: BookingDocumentSharedProps) {
  const { state, onChange } = props;
  const grandTotal = getDocumentGrandTotal(state);

  return (
    <div className="booking-doc-edit-form">
      <EditSection title="服務項目" hint="變更後會同步更新三份文件">
        <ServiceFields {...props} />
      </EditSection>

      <EditSection title="客戶資料">
        <CustomerFields {...props} />
      </EditSection>

      <EditSection title="估價明細" hint="預設一筆，按＋新增更多明細">
        <QuoteLineList {...props} />
      </EditSection>

      <EditSection title="合計與經手" hint="總額與項目表連動，依服務明細自動計算">
        <div className="admin-grid-2">
          <label className="admin-field">
            <span>定金</span>
            <input
              value={state.deposit}
              onChange={(e) => onChange(patchDocumentState(state, { ...state, deposit: e.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>總額</span>
            <input
              className="booking-doc-readonly-field"
              readOnly
              tabIndex={-1}
              value={grandTotal ? String(grandTotal) : ''}
              placeholder="自動計算"
            />
          </label>
          <label className="admin-field">
            <span>經手人</span>
            <input
              value={state.handler}
              onChange={(e) => onChange({ ...state, handler: e.target.value })}
            />
          </label>
        </div>
      </EditSection>
    </div>
  );
}

export function BookingDocumentItemsEdit(props: BookingDocumentSharedProps) {
  const { state, onChange } = props;
  const { subtotalQty, subtotalAmount, grandTotal } = summarizeItemRows(state.itemRows);
  const documentTotal = getDocumentGrandTotal(state);

  return (
    <div className="booking-doc-edit-form">
      <EditSection title="服務項目" hint="變更後會同步更新三份文件">
        <ServiceFields {...props} />
      </EditSection>

      <EditSection title="客戶資料">
        <div className="admin-grid-2">
          <label className="admin-field">
            <span>姓名</span>
            <input
              value={state.customerName}
              onChange={(e) => onChange({ ...state, customerName: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>電話</span>
            <input
              value={state.phone}
              onChange={(e) => onChange({ ...state, phone: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Email</span>
            <input
              type="email"
              value={state.email}
              onChange={(e) => onChange({ ...state, email: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>緊急聯絡人</span>
            <input
              value={state.emergencyContact}
              onChange={(e) => onChange({ ...state, emergencyContact: e.target.value })}
            />
          </label>
          <label className="admin-field admin-field--full">
            <span>備註</span>
            <input
              value={state.notes}
              onChange={(e) => onChange({ ...state, notes: e.target.value })}
            />
          </label>
        </div>
      </EditSection>

      <EditSection title="服務明細" hint="預設一筆，完成後會顯示為摘要卡片">
        <ItemRowList {...props} />
      </EditSection>

      <EditSection title="金額摘要" hint="與估價單、合約金額連動">
        <div className="booking-doc-edit-summary">
          <div>
            <span>小計數量</span>
            <strong>{subtotalQty || '—'}</strong>
          </div>
          <div>
            <span>小計金額</span>
            <strong>{subtotalAmount || '—'}</strong>
          </div>
          <div>
            <span>應收總額</span>
            <strong>{documentTotal || grandTotal || '—'}</strong>
          </div>
        </div>
      </EditSection>
    </div>
  );
}

export function BookingDocumentContractEdit(props: BookingDocumentSharedProps) {
  const { state, onChange } = props;
  const { grandTotal } = summarizeItemRows(state.itemRows);
  const documentTotal = getDocumentGrandTotal(state);
  const balanceDue = getBalanceDue(state);

  return (
    <div className="booking-doc-edit-form">
      <EditSection title="服務項目" hint="變更後會同步更新三份文件">
        <ServiceFields {...props} />
      </EditSection>

      <EditSection title="客戶資料">
        <div className="admin-grid-2">
          <label className="admin-field">
            <span>客戶名稱</span>
            <input
              value={state.customerName}
              onChange={(e) => onChange({ ...state, customerName: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>聯絡電話</span>
            <input
              value={state.phone}
              onChange={(e) => onChange({ ...state, phone: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Line ID</span>
            <input
              value={state.lineId}
              onChange={(e) => onChange({ ...state, lineId: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>Email</span>
            <input
              type="email"
              value={state.email}
              onChange={(e) => onChange({ ...state, email: e.target.value })}
            />
          </label>
          <label className="admin-field admin-field--full">
            <span>地址</span>
            <input
              value={state.address}
              onChange={(e) => onChange({ ...state, address: e.target.value })}
            />
          </label>
        </div>
      </EditSection>

      <EditSection title="預約內容">
        <div className="admin-grid-2">
          <label className="admin-field">
            <span>預約內容</span>
            <textarea
              rows={3}
              value={state.appointmentContent}
              onChange={(e) => onChange({ ...state, appointmentContent: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>備註</span>
            <textarea
              rows={3}
              value={state.remarks}
              onChange={(e) => onChange({ ...state, remarks: e.target.value })}
            />
          </label>
        </div>
      </EditSection>

      <EditSection title="時程安排">
        <div className="admin-grid-2">
          <DateFieldEdit
            label="預約日期"
            value={state.appointmentDate}
            onChange={(appointmentDate) => onChange({ ...state, appointmentDate })}
          />
          <DateFieldEdit
            label="拍攝日期"
            value={state.shootingDate}
            onChange={(shootingDate) => onChange({ ...state, shootingDate })}
          />
          <DateFieldEdit
            label="看稿日期"
            value={state.selectionDate}
            onChange={(selectionDate) => onChange({ ...state, selectionDate })}
          />
          <DateFieldEdit
            label="交付日期"
            value={state.deliveryDate}
            onChange={(deliveryDate) => onChange({ ...state, deliveryDate })}
          />
        </div>
      </EditSection>

      <EditSection title="拍攝安排">
        <div className="booking-doc-edit-checks">
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={state.shootingOutdoor}
              onChange={(e) => onChange({ ...state, shootingOutdoor: e.target.checked })}
            />
            外景拍攝
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={state.shootingIndoor}
              onChange={(e) => onChange({ ...state, shootingIndoor: e.target.checked })}
            />
            棚內拍攝
          </label>
        </div>
        <div className="admin-grid-2 booking-doc-edit-section-gap">
          <label className="admin-field">
            <span>攝影師</span>
            <input
              value={state.photographer}
              onChange={(e) => onChange({ ...state, photographer: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>助理</span>
            <input
              value={state.assistant}
              onChange={(e) => onChange({ ...state, assistant: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>禮服套數</span>
            <input
              value={state.formalOutfits}
              onChange={(e) => onChange({ ...state, formalOutfits: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>便服套數</span>
            <input
              value={state.casualOutfits}
              onChange={(e) => onChange({ ...state, casualOutfits: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>外景地點</span>
            <input
              value={state.outdoorLocation}
              onChange={(e) => onChange({ ...state, outdoorLocation: e.target.value })}
            />
          </label>
          <label className="admin-field">
            <span>外景服裝</span>
            <input
              value={state.outdoorClothing}
              onChange={(e) => onChange({ ...state, outdoorClothing: e.target.value })}
            />
          </label>
        </div>
      </EditSection>

      <EditSection title="費用" hint="金額與項目表連動；尾款 = 應收總額 − 訂金">
        <div className="admin-grid-2">
          <label className="admin-field">
            <span>金額</span>
            <input
              className="booking-doc-readonly-field"
              readOnly
              tabIndex={-1}
              value={grandTotal ? String(grandTotal) : ''}
              placeholder="自動計算"
            />
          </label>
          <label className="admin-field">
            <span>追加金額</span>
            <input
              value={state.additionalAmount}
              onChange={(e) =>
                onChange(patchDocumentState(state, { ...state, additionalAmount: e.target.value }))
              }
            />
          </label>
          <label className="admin-field">
            <span>訂金</span>
            <input
              value={state.deposit}
              onChange={(e) => onChange(patchDocumentState(state, { ...state, deposit: e.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>尾款</span>
            <input
              className="booking-doc-readonly-field"
              readOnly
              tabIndex={-1}
              value={balanceDue ? String(balanceDue) : ''}
              placeholder="自動計算"
            />
          </label>
          <label className="admin-field admin-field--full">
            <span>應收總額</span>
            <input
              className="booking-doc-readonly-field"
              readOnly
              tabIndex={-1}
              value={documentTotal ? String(documentTotal) : ''}
              placeholder="自動計算"
            />
          </label>
          <label className="admin-field admin-field--full">
            <span>追加商品細項</span>
            <textarea
              rows={2}
              value={state.additionalItems}
              onChange={(e) => onChange({ ...state, additionalItems: e.target.value })}
            />
          </label>
        </div>
      </EditSection>

      <EditSection title="付款紀錄" hint="需要時再新增付款紀錄">
        <PaymentRowList {...props} />
      </EditSection>
    </div>
  );
}
