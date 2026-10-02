import React from 'react';

// Generic system alert dialog (replaces the original custom alert box).
export function AlertModal({ open, title, message, onClose, confirmLabel, onConfirm }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="mol-card mol-fade-up max-w-md w-full p-7 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold mb-3" style={{ color: 'var(--mol-red)' }}>
          {title || 'تنبيه النظام'}
        </h3>
        <p className="font-bold text-base leading-relaxed" style={{ color: 'var(--mol-text)' }}>
          {message}
        </p>
        <div className="flex gap-3 justify-center mt-6">
          {onConfirm && (
            <button
              className="mol-btn mol-btn-primary px-7 py-2.5"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel || 'تأكيد'}
            </button>
          )}
          <button className="mol-btn mol-btn-ghost px-7 py-2.5" onClick={onClose}>
            {onConfirm ? 'إلغاء' : 'موافق'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Teacher override prompt (shown when a student id already has an attempt).
export function TeacherCodeModal({ open, onClose, onSubmit }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="mol-card mol-fade-up max-w-md w-full p-7 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-extrabold mb-2" style={{ color: 'var(--mol-red)' }}>
          محاولة سابقة مسجلة
        </h3>
        <p className="font-bold text-sm leading-relaxed mb-4" style={{ color: 'var(--mol-muted)' }}>
          لقد استنفدت محاولتك المسموحة. يمكن للمعلم المسجّل دخوله والمصرّح به السماح بمحاولة إضافية.
        </p>
        <div className="flex gap-3 justify-center mt-5">
          <button className="mol-btn mol-btn-primary px-6 py-2.5" onClick={onSubmit}>
            تحقق من حساب المعلم
          </button>
          <button className="mol-btn mol-btn-ghost px-6 py-2.5" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
