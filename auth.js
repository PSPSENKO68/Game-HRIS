/**
 * Authentication — Game HRIS
 * Xử lý đăng nhập, kiểm tra Chủ Nhật, và tự động seed database lần đầu.
 */

import { db, bootstrapDatabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  let pendingFirstLoginUser = null;

  // DOM Elements
  const loginCardContainer = document.getElementById('login_card_container');
  const loginForm = document.getElementById('login_form');
  const employeeCodeInput = document.getElementById('employee_code');
  const pinInput = document.getElementById('pin');
  const errorAlert = document.getElementById('error_alert');
  const btnSubmit = document.getElementById('btn_submit');

  const forcePwdCard = document.getElementById('force_pwd_card');
  const forcePwdForm = document.getElementById('force_pwd_form');
  const fpUserName = document.getElementById('fp_user_name');
  const fpNewPin = document.getElementById('fp_new_pin');
  const fpConfirmPin = document.getElementById('fp_confirm_pin');
  const fpShowPwd = document.getElementById('fp_show_pwd');
  const fpErrorAlert = document.getElementById('fp_error_alert');
  const btnFpSubmit = document.getElementById('btn_fp_submit');
  const btnFpCancel = document.getElementById('btn_fp_cancel');

  function showForcePwdScreen(userObj) {
    pendingFirstLoginUser = userObj;
    if (fpUserName) fpUserName.textContent = userObj.full_name || userObj.employee_code;
    if (fpNewPin) fpNewPin.value = '';
    if (fpConfirmPin) fpConfirmPin.value = '';
    if (fpShowPwd) fpShowPwd.checked = false;
    if (fpNewPin) fpNewPin.type = 'password';
    if (fpConfirmPin) fpConfirmPin.type = 'password';
    if (fpErrorAlert) fpErrorAlert.classList.add('hidden');

    if (loginCardContainer) loginCardContainer.classList.add('hidden');
    if (forcePwdCard) forcePwdCard.classList.remove('hidden');
    if (fpNewPin) fpNewPin.focus();
  }

  // Kiểm tra session hiện tại → nếu đã đăng nhập & hợp lệ mới chuyển vào app
  const existingSession = sessionStorage.getItem('current_user');
  if (existingSession) {
    try {
      const parsed = JSON.parse(existingSession);
      const freshUser = await db.getUserById(parsed.id);
      if (freshUser && freshUser.is_active && parsed.pin === freshUser.pin) {
        const mustChange = await db.checkMustChangePassword(freshUser);
        if (!mustChange) {
          sessionStorage.setItem('current_user', JSON.stringify(freshUser));
          window.location.replace('/index.html');
          return;
        }
      }
    } catch (err) {
      // Ignore malformed session
    }
    sessionStorage.removeItem('current_user');
  }

  // ── Tự động khởi tạo DB (chỉ chạy khi bảng rỗng / admin chưa tồn tại) ────
  const bootstrapResult = await bootstrapDatabase();
  if (!bootstrapResult.success && bootstrapResult.reason === 'table_missing') {
    // Bảng chưa tạo → hiển thị hướng dẫn
    showError('⚠️ Cơ sở dữ liệu chưa được khởi tạo. Vui lòng chạy SQL Schema trong Supabase Dashboard trước.');
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      errorAlert.classList.add('hidden');
      errorAlert.textContent = '';

      const employeeCode = employeeCodeInput.value.trim();
      const pin = pinInput.value.trim();

      if (!employeeCode || !pin) {
        showError('Vui lòng nhập đầy đủ Họ và tên và mã PIN.');
        return;
      }

      btnSubmit.disabled = true;
      const initialBtnHTML = btnSubmit.innerHTML;
      btnSubmit.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>ĐANG XÁC THỰC...</span>
      `;

      try {
        const result = await db.login(employeeCode, pin);

        if (result.success) {
          if (result.mustChangePassword) {
            // Đăng nhập lần đầu (không phải Admin) → bắt buộc đổi mật khẩu mới trước khi vào hệ thống
            showForcePwdScreen(result.user);
          } else {
            sessionStorage.setItem('current_user', JSON.stringify(result.user));
            window.location.replace('/index.html');
          }
        } else {
          showError(result.message);
          // Shake the card
          const card = loginForm.closest('.brand-card');
          if (card) {
            card.classList.add('animate-shake');
            setTimeout(() => card.classList.remove('animate-shake'), 350);
          }
        }
      } catch (err) {
        console.error(err);
        showError('Lỗi kết nối đến cơ sở dữ liệu. Vui lòng thử lại.');
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = initialBtnHTML;
      }
    });
  }

  // Toggle hiện mật khẩu ở form đổi mật khẩu lần đầu
  if (fpShowPwd) {
    fpShowPwd.addEventListener('change', () => {
      const inputType = fpShowPwd.checked ? 'text' : 'password';
      if (fpNewPin) fpNewPin.type = inputType;
      if (fpConfirmPin) fpConfirmPin.type = inputType;
    });
  }

  // Quay lại màn hình đăng nhập
  if (btnFpCancel) {
    btnFpCancel.addEventListener('click', () => {
      pendingFirstLoginUser = null;
      if (forcePwdCard) forcePwdCard.classList.add('hidden');
      if (loginCardContainer) loginCardContainer.classList.remove('hidden');
      if (pinInput) pinInput.value = '';
      if (employeeCodeInput) employeeCodeInput.focus();
    });
  }

  // Xử lý submit đổi mật khẩu lần đầu
  if (forcePwdForm) {
    forcePwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingFirstLoginUser) return;

      if (fpErrorAlert) {
        fpErrorAlert.classList.add('hidden');
        fpErrorAlert.textContent = '';
      }

      const newPin = fpNewPin.value.trim();
      const confirmPin = fpConfirmPin.value.trim();

      if (newPin.length < 4) {
        showFpError('Mật khẩu / Mã PIN mới phải có ít nhất 4 ký tự.');
        return;
      }

      if (newPin === pendingFirstLoginUser.pin) {
        showFpError('Mật khẩu mới không được trùng với mật khẩu hiện tại. Vui lòng chọn mật khẩu khác!');
        return;
      }

      if (newPin !== confirmPin) {
        showFpError('Xác nhận mật khẩu mới không khớp. Vui lòng kiểm tra lại.');
        return;
      }

      btnFpSubmit.disabled = true;
      const initHTML = btnFpSubmit.innerHTML;
      btnFpSubmit.innerHTML = `
        <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>ĐANG LƯU MẬT KHẨU...</span>
      `;

      try {
        const res = await db.completeFirstLoginPasswordChange(pendingFirstLoginUser.id, newPin);
        if (res.success) {
          sessionStorage.setItem('current_user', JSON.stringify(res.user));
          window.location.replace('/index.html');
        } else {
          showFpError(res.message || 'Không thể đổi mật khẩu. Vui lòng thử lại.');
        }
      } catch (err) {
        console.error(err);
        showFpError('Lỗi kết nối đến cơ sở dữ liệu. Vui lòng thử lại.');
      } finally {
        btnFpSubmit.disabled = false;
        btnFpSubmit.innerHTML = initHTML;
      }
    });
  }

  function showError(msg) {
    if (errorAlert) {
      errorAlert.textContent = msg;
      errorAlert.classList.remove('hidden');
    }
  }

  function showFpError(msg) {
    if (fpErrorAlert) {
      fpErrorAlert.textContent = msg;
      fpErrorAlert.classList.remove('hidden');
    }
  }
});
