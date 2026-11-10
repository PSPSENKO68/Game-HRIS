/**
 * Authentication — Game HRIS
 * Xử lý đăng nhập, kiểm tra Chủ Nhật, và tự động seed database lần đầu.
 */

import { db, bootstrapDatabase } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Đã đăng nhập → chuyển thẳng vào app
  if (sessionStorage.getItem('current_user')) {
    window.location.replace('/index.html');
    return;
  }

  // ── Tự động khởi tạo DB (chỉ chạy khi bảng rỗng / admin chưa tồn tại) ────
  const bootstrapResult = await bootstrapDatabase();
  if (!bootstrapResult.success && bootstrapResult.reason === 'table_missing') {
    // Bảng chưa tạo → hiển thị hướng dẫn
    showError('⚠️ Cơ sở dữ liệu chưa được khởi tạo. Vui lòng chạy SQL Schema trong Supabase Dashboard trước.');
  }

  // DOM Elements
  const loginForm = document.getElementById('login_form');
  const employeeCodeInput = document.getElementById('employee_code');
  const pinInput = document.getElementById('pin');
  const errorAlert = document.getElementById('error_alert');
  const btnSubmit = document.getElementById('btn_submit');

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
          sessionStorage.setItem('current_user', JSON.stringify(result.user));
          window.location.replace('/index.html');
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

  function showError(msg) {
    if (errorAlert) {
      errorAlert.textContent = msg;
      errorAlert.classList.remove('hidden');
    }
  }
});
