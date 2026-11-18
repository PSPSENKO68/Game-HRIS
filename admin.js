/**
 * Admin Module — Game HRIS
 * Quản lý người dùng, quiz, import/export — kết nối trực tiếp Supabase.
 */

import { db, parseCSV, exportAccountsAsCSV } from './supabase.js';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import confetti from 'canvas-confetti';

document.addEventListener('DOMContentLoaded', async () => {
  // ── Kiểm tra phiên đăng nhập ────────────────────────────────────────────────
  const sessionUser = sessionStorage.getItem('current_user');
  if (!sessionUser) { window.location.replace('/login.html'); return; }

  const user = JSON.parse(sessionUser);
  if (user.role !== 'admin' && user.role !== 'owner') {
    alert('Từ chối truy cập: Bạn không có quyền quản trị viên!');
    window.location.replace('/index.html');
    return;
  }

  // ── DOM Elements ────────────────────────────────────────────────────────────
  const tabUsersBtn = document.getElementById('tab_users_btn');
  const tabQuizzesBtn = document.getElementById('tab_quizzes_btn');
  const tabHistoryBtn = document.getElementById('tab_history_btn');
  const tabImportBtn = document.getElementById('tab_import_btn');
  const tabFlashcardsBtn = document.getElementById('tab_flashcards_btn');
  const tabBusinessDayBtn = document.getElementById('tab_business_day_btn');
  const adminDbMode = document.getElementById('admin_db_mode');
  const sectionUsers = document.getElementById('section_users');
  const sectionQuizzes = document.getElementById('section_quizzes');
  const sectionHistory = document.getElementById('section_history');
  const sectionImport = document.getElementById('section_import');
  const sectionFlashcards = document.getElementById('section_flashcards');
  const sectionBusinessDay = document.getElementById('section_business_day');

  // User Modal
  const modalUser = document.getElementById('modal_user');
  const formUser = document.getElementById('form_user');
  const formUserId = document.getElementById('form_user_id');
  const formUserCode = document.getElementById('form_user_code');
  const formUserFullName = document.getElementById('form_user_fullname');
  const formUserDept = document.getElementById('form_user_dept');
  const formUserPin = document.getElementById('form_user_pin');
  const formUserMaxPlays = document.getElementById('form_user_max_plays');
  const formUserScore = document.getElementById('form_user_score');
  const formUserActive = document.getElementById('form_user_active');
  const formUserMustChangePwd = document.getElementById('form_user_must_change_pwd');
  const wrapUserMustChangePwd = document.getElementById('wrap_user_must_change_pwd');
  const formUserRoleSelect = document.getElementById('form_user_role');
  let editingUserOrigPin = null;
  const btnOpenUserModal = document.getElementById('btn_open_user_modal');
  const btnCloseUserModal = document.getElementById('btn_close_user_modal');
  const usersTableBody = document.getElementById('users_table_body');

  function syncMustChangePwdCheckboxForRole(roleVal) {
    if (!formUserMustChangePwd || !wrapUserMustChangePwd) return;
    const isPriv = roleVal === 'admin' || roleVal === 'owner';
    if (isPriv) {
      formUserMustChangePwd.checked = false;
      formUserMustChangePwd.disabled = true;
      wrapUserMustChangePwd.classList.add('opacity-50');
    } else {
      formUserMustChangePwd.disabled = false;
      wrapUserMustChangePwd.classList.remove('opacity-50');
    }
  }

  if (formUserRoleSelect) {
    formUserRoleSelect.addEventListener('change', () => {
      syncMustChangePwdCheckboxForRole(formUserRoleSelect.value);
    });
  }

  if (formUserPin && formUserMustChangePwd) {
    formUserPin.addEventListener('input', () => {
      if (formUserId.value && editingUserOrigPin !== null && !formUserMustChangePwd.disabled) {
        if (formUserPin.value.trim() !== editingUserOrigPin) {
          formUserMustChangePwd.checked = true;
        }
      }
    });
  }

  // Bulk User Actions Elements
  const chkSelectAllUsers = document.getElementById('chk_select_all_users');
  const selectedUsersBadge = document.getElementById('selected_users_badge');
  const countSelectedUsers = document.getElementById('count_selected_users');
  const btnBulkUnlockSelected = document.getElementById('btn_bulk_unlock_selected');
  const btnBulkLockSelected = document.getElementById('btn_bulk_lock_selected');
  const countUnlockSel = document.getElementById('count_unlock_sel');
  const countLockSel = document.getElementById('count_lock_sel');
  const btnClearUserSelection = document.getElementById('btn_clear_user_selection');
  const btnBulkUnlockAll = document.getElementById('btn_bulk_unlock_all');
  const btnBulkLockAll = document.getElementById('btn_bulk_lock_all');

  // Quiz Modal
  const quizzesContainer = document.getElementById('quizzes_container');
  const modalQuiz = document.getElementById('modal_quiz');
  const formQuiz = document.getElementById('form_quiz');
  const formQuizTitle = document.getElementById('form_quiz_title');
  const formQuizWeek = document.getElementById('form_quiz_week');
  const formQuizActive = document.getElementById('form_quiz_active');
  const btnOpenQuizModal = document.getElementById('btn_open_quiz_modal');
  const btnCloseQuizModal = document.getElementById('btn_close_quiz_modal');

  // Filter Bar Elements
  const filterQuizMonth = document.getElementById('filter_quiz_month');
  const filterQuizWeek = document.getElementById('filter_quiz_week');
  const btnClearFilter = document.getElementById('btn_clear_filter');

  if (filterQuizMonth) filterQuizMonth.addEventListener('input', fetchAndRenderQuizzes);
  if (filterQuizWeek) filterQuizWeek.addEventListener('input', fetchAndRenderQuizzes);
  if (btnClearFilter) {
    btnClearFilter.addEventListener('click', () => {
      if (filterQuizMonth) filterQuizMonth.value = '';
      if (filterQuizWeek) filterQuizWeek.value = '';
      fetchAndRenderQuizzes();
    });
  }

  // Quiz Questions View
  const quizQuestionsBox = document.getElementById('quiz_questions_box');
  const selectedQuizSubtitle = document.getElementById('selected_quiz_subtitle');
  const selectedQuizTitle = document.getElementById('selected_quiz_title');
  const questionsListWrapper = document.getElementById('questions_list_wrapper');
  const btnAddQuestionForm = document.getElementById('btn_add_question_form');

  // Add Question Modal
  const modalQuestion = document.getElementById('modal_question');
  const formQuestion = document.getElementById('form_question');
  const formQuestionQuizId = document.getElementById('form_question_quiz_id');
  const formQuestionText = document.getElementById('form_question_text');

  // Import Elements
  const importTypeSelect = document.getElementById('import_type_select');
  const guideUsersCsv = document.getElementById('guide_users_csv');
  const guideQuizzesCsv = document.getElementById('guide_quizzes_csv');
  const quizImportDetails = document.getElementById('quiz_import_details');
  const csvFileInput = document.getElementById('csv_file_input');
  const fileNameDisplay = document.getElementById('file_name_display');
  const csvTextareaInput = document.getElementById('csv_textarea_input');
  const btnProcessImport = document.getElementById('btn_process_import');

  // Alert Modal
  const adminAlertModal = document.getElementById('admin_alert_modal');
  const adminAlertTitle = document.getElementById('admin_alert_title');
  const adminAlertContent = document.getElementById('admin_alert_content');
  const btnCloseAdminAlert = document.getElementById('btn_close_admin_alert');

  let currentExpandedQuizId = null;
  let currentExpandedQuizMonth = null;
  let currentExpandedQuizWeek = null;
  let currentExpandedQuizTitle = null;

  // ── Connection badge ─────────────────────────────────────────────────────────
  if (adminDbMode) {
    adminDbMode.innerHTML = '<span class="text-emerald-600 font-bold">⚡ Supabase Cloud</span>';
  }

  // ── Alert helper ─────────────────────────────────────────────────────────────
  function showAdminAlert(title, content) {
    if (adminAlertModal) {
      adminAlertTitle.textContent = title;
      adminAlertContent.textContent = content;
      adminAlertModal.classList.remove('hidden');
    }
  }
  if (btnCloseAdminAlert) {
    btnCloseAdminAlert.addEventListener('click', () => adminAlertModal.classList.add('hidden'));
  }

  // ── TAB ROUTING ──────────────────────────────────────────────────────────────
  const tabConfigs = [
    { btn: tabUsersBtn, section: sectionUsers },
    { btn: tabQuizzesBtn, section: sectionQuizzes },
    { btn: tabHistoryBtn, section: sectionHistory },
    { btn: tabImportBtn, section: sectionImport },
    { btn: tabFlashcardsBtn, section: sectionFlashcards },
    { btn: tabBusinessDayBtn, section: sectionBusinessDay }
  ];

  tabConfigs.forEach(tab => {
    if (!tab.btn) return;
    tab.btn.addEventListener('click', () => {
      // If leaving business day tab, stop active camera if running
      if (typeof stopCameraScanner === 'function') {
        stopCameraScanner();
      }
      tabConfigs.forEach(t => {
        if (t.btn) t.btn.removeAttribute('style');
        t.btn.className = 'tab-btn w-full text-left px-4 py-3 rounded-2xl font-bold text-sm text-slate-600 hover:bg-slate-50 transition flex items-center gap-3 cursor-pointer';
        if (t.section) t.section.classList.add('hidden');
      });
      tab.btn.className = 'tab-btn w-full text-left px-4 py-3 rounded-2xl font-bold text-sm transition flex items-center gap-3 cursor-pointer';
      tab.btn.style.background = '#FEF0E8';
      tab.btn.style.color = '#E07242';
      if (tab.section) tab.section.classList.remove('hidden');
      if (tab.btn === tabUsersBtn) fetchAndRenderUsers();
      if (tab.btn === tabQuizzesBtn) {
        fetchAndRenderQuizzes();
        initSpeedMultiplierSetting();
      }
      if (tab.btn === tabHistoryBtn) fetchAndRenderHistory();
      if (tab.btn === tabFlashcardsBtn) fetchAndRenderFlashcardSets();
      if (tab.btn === tabBusinessDayBtn) fetchAndRenderBusinessDay();
    });
  });

  // Khởi tạo trạng thái Hệ số điểm tốc độ khi nạp Admin
  initSpeedMultiplierSetting();

  // ── 1. USERS MANAGEMENT ──────────────────────────────────────────────────────
  function updateBulkSelectionUI() {
    const chks = document.querySelectorAll('.user-select-chk:checked');
    const count = chks.length;
    if (count > 0) {
      if (selectedUsersBadge) selectedUsersBadge.classList.remove('hidden');
      if (countSelectedUsers) countSelectedUsers.textContent = count;
      if (btnBulkUnlockSelected) {
        btnBulkUnlockSelected.classList.remove('hidden');
        btnBulkUnlockSelected.classList.add('inline-flex');
        if (countUnlockSel) countUnlockSel.textContent = count;
      }
      if (btnBulkLockSelected) {
        btnBulkLockSelected.classList.remove('hidden');
        btnBulkLockSelected.classList.add('inline-flex');
        if (countLockSel) countLockSel.textContent = count;
      }
      if (btnClearUserSelection) btnClearUserSelection.classList.remove('hidden');
    } else {
      if (selectedUsersBadge) selectedUsersBadge.classList.add('hidden');
      if (btnBulkUnlockSelected) {
        btnBulkUnlockSelected.classList.add('hidden');
        btnBulkUnlockSelected.classList.remove('inline-flex');
      }
      if (btnBulkLockSelected) {
        btnBulkLockSelected.classList.add('hidden');
        btnBulkLockSelected.classList.remove('inline-flex');
      }
      if (btnClearUserSelection) btnClearUserSelection.classList.add('hidden');
      if (chkSelectAllUsers) chkSelectAllUsers.checked = false;
    }
  }

  async function fetchAndRenderUsers() {
    if (!usersTableBody) return;
    if (chkSelectAllUsers) chkSelectAllUsers.checked = false;
    updateBulkSelectionUI();

    usersTableBody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">Đang nạp danh sách...</td></tr>`;

    const [usersList, pwdChangedSet] = await Promise.all([
      db.adminGetUsers(),
      db.adminGetPasswordChangedUserIds()
    ]);
    usersTableBody.innerHTML = '';

    if (!usersList || usersList.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400 italic">Chưa có nhân viên nào. Hãy thêm mới hoặc import từ file.</td></tr>`;
      return;
    }

    usersList.forEach(u => {
      const roleBadge = u.role === 'owner'
        ? '<span class="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">👑 Owner</span>'
        : u.role === 'admin'
          ? '<span class="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">⚡ Admin</span>'
          : '<span class="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">👤 Nhân viên</span>';

      const isPriv = u.role === 'admin' || u.role === 'owner';
      const hasChangedPwd = isPriv || pwdChangedSet.has(u.id);
      const pwdStatusBadge = isPriv
        ? '<span class="block text-[9px] text-indigo-500 font-bold mt-0.5">Miễn trừ Admin</span>'
        : hasChangedPwd
          ? '<span class="block text-[9px] text-emerald-600 font-bold mt-0.5">✓ Đã đổi MK</span>'
          : '<span class="block text-[9px] text-amber-600 font-bold mt-0.5">⏳ Chờ đổi MK</span>';

      const limitDisplay = (u.max_plays !== null && u.max_plays !== undefined)
        ? `<span class="px-2 py-0.5 rounded-lg bg-orange-50 text-orange-600 border border-orange-200 font-bold text-[11px]">${u.max_plays} lượt</span>`
        : '<span class="text-slate-400 italic text-[11px]">Mặc định</span>';

      const row = document.createElement('tr');
      row.className = 'hover:bg-slate-50/55 transition border-b border-slate-100';
      row.innerHTML = `
        <td class="p-3 text-center">
          <input type="checkbox" class="user-select-chk w-4 h-4 rounded accent-indigo-600 cursor-pointer" data-id="${u.id}" ${u.role === 'owner' ? 'disabled' : ''} />
        </td>
        <td class="p-3 font-mono text-slate-700 text-xs">${u.employee_code}</td>
        <td class="p-3 font-bold text-slate-900">${u.full_name}</td>
        <td class="p-3">${roleBadge}</td>
        <td class="p-3 text-slate-500 text-xs">${u.department || '—'}</td>
        <td class="p-3 font-mono text-slate-400 text-xs">••••${pwdStatusBadge}</td>
        <td class="p-3 text-center">${limitDisplay}</td>
        <td class="p-3 text-center font-extrabold text-indigo-600 font-['Space_Grotesk']">${u.total_score || 0}đ</td>
        <td class="p-3 text-center">
          <button class="toggle-active-btn inline-flex px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer ${u.is_active
          ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
          : 'bg-rose-50 text-rose-500 border border-rose-200'
        }" data-id="${u.id}" data-active="${u.is_active}">
            ${u.is_active ? 'Hoạt động' : 'Tạm Khóa'}
          </button>
        </td>
        <td class="p-3 text-center space-x-1">
          <button class="edit-user-btn p-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition inline-flex items-center cursor-pointer" data-id="${u.id}" title="Sửa">✏️</button>
          <button class="delete-user-btn p-1.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-100 transition inline-flex items-center cursor-pointer" data-id="${u.id}" title="Xóa">🗑️</button>
        </td>
      `;
      usersTableBody.appendChild(row);
    });

    // Checkbox items change
    document.querySelectorAll('.user-select-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        updateBulkSelectionUI();
      });
    });

    // Bind toggle active
    document.querySelectorAll('.toggle-active-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uId = btn.getAttribute('data-id');
        const isAct = btn.getAttribute('data-active') === 'true';
        await db.adminUpdateUser(uId, { is_active: !isAct });
        fetchAndRenderUsers();
      });
    });
    // Bind edit
    document.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uId = btn.getAttribute('data-id');
        const targetU = await db.getUserById(uId);
        if (targetU) {
          formUserId.value = targetU.id;
          formUserCode.value = targetU.employee_code;
          formUserFullName.value = targetU.full_name;
          formUserDept.value = targetU.department || '';
          formUserPin.value = targetU.pin;
          editingUserOrigPin = targetU.pin;
          formUserMaxPlays.value = (targetU.max_plays !== null && targetU.max_plays !== undefined) ? targetU.max_plays : '';
          if (formUserScore) formUserScore.value = targetU.total_score || 0;
          formUserActive.checked = targetU.is_active;

          // Phân quyền: set dropdown role
          const roleSelect = document.getElementById('form_user_role');
          if (roleSelect) {
            if (targetU.role === 'owner') {
              // Owner: hiển thị là owner, không cho đổi
              roleSelect.value = 'owner';
              roleSelect.disabled = true;
              roleSelect.querySelector('option[value="owner"]').removeAttribute('disabled');
            } else {
              roleSelect.value = targetU.role || 'user';
              roleSelect.disabled = false;
              roleSelect.querySelector('option[value="owner"]').setAttribute('disabled', '');
            }
          }

          syncMustChangePwdCheckboxForRole(targetU.role || 'user');
          if (formUserMustChangePwd && targetU.role !== 'admin' && targetU.role !== 'owner') {
            formUserMustChangePwd.checked = !pwdChangedSet.has(targetU.id);
          }

          document.getElementById('modal_user_title').textContent = 'Chỉnh sửa nhân sự';
          modalUser.classList.remove('hidden');
        }
      });
    });

    // Bind delete
    document.querySelectorAll('.delete-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Xác nhận xóa nhân viên này khỏi hệ thống? Hành động không thể hoàn tác.')) {
          const uId = btn.getAttribute('data-id');
          const result = await db.adminDeleteUser(uId);
          if (result.success) {
            fetchAndRenderUsers();
          } else {
            showAdminAlert('Lỗi xóa', result.message || 'Không thể xóa nhân viên.');
          }
        }
      });
    });
  }

  // User Modal: Open (Add)
  if (btnOpenUserModal) {
    btnOpenUserModal.addEventListener('click', () => {
      formUserId.value = '';
      editingUserOrigPin = null;
      formUser.reset();
      if (formUserMaxPlays) formUserMaxPlays.value = '';
      if (formUserScore) formUserScore.value = '0';
      // Reset role về mặc định 'user' khi thêm mới
      const roleSelect = document.getElementById('form_user_role');
      if (roleSelect) {
        roleSelect.value = 'user';
        roleSelect.disabled = false;
        roleSelect.querySelector('option[value="owner"]').setAttribute('disabled', '');
      }
      syncMustChangePwdCheckboxForRole('user');
      if (formUserMustChangePwd) formUserMustChangePwd.checked = true;
      document.getElementById('modal_user_title').textContent = 'Thêm Nhân Viên Mới';
      modalUser.classList.remove('hidden');
    });
  }

  if (btnCloseUserModal) {
    btnCloseUserModal.addEventListener('click', () => modalUser.classList.add('hidden'));
  }

  // User Form: Submit
  if (formUser) {
    formUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const uId = formUserId.value;
      const roleSelect = document.getElementById('form_user_role');
      const selectedRole = (roleSelect && !roleSelect.disabled) ? roleSelect.value : undefined;

      const userData = {
        employee_code: formUserCode.value.trim(),
        full_name: formUserFullName.value.trim(),
        department: formUserDept.value.trim(),
        pin: formUserPin.value.trim(),
        is_active: formUserActive.checked,
        max_plays: (formUserMaxPlays && formUserMaxPlays.value.trim() !== '') ? parseInt(formUserMaxPlays.value) : null,
        total_score: (formUserScore && formUserScore.value.trim() !== '') ? parseInt(formUserScore.value) : 0,
        ...(selectedRole ? { role: selectedRole } : {})
      };

      // Cảnh báo nếu admin tự hạ quyền chính mình
      if (uId && selectedRole === 'user') {
        const sessionUser = JSON.parse(sessionStorage.getItem('current_user') || '{}');
        if (sessionUser.id === uId) {
          showAdminAlert('⚠️ Cảnh báo', 'Bạn đang tự hạ quyền chính mình xuống "Nhân viên". Hành động này sẽ mất quyền Admin ngay sau khi lưu.');
          return;
        }
      }

      let result;
      let savedUserId = uId;
      if (uId) {
        result = await db.adminUpdateUser(uId, userData);
        if (result.success) showAdminAlert('Cập nhật thành công ✅', `Đã cập nhật tài khoản "${userData.full_name}".`);
        else showAdminAlert('Lỗi', result.message || 'Không thể cập nhật.');
      } else {
        result = await db.adminCreateUser(userData);
        if (result.success) {
          savedUserId = result.user?.id;
          showAdminAlert('Thêm thành công ✅', `Đã tạo tài khoản mới cho "${userData.full_name}".`);
        } else {
          showAdminAlert('Lỗi', result.message || 'Không thể tạo tài khoản.');
        }
      }

      if (result.success) {
        const effRole = selectedRole || (roleSelect ? roleSelect.value : 'user');
        if (savedUserId && effRole !== 'admin' && effRole !== 'owner' && formUserMustChangePwd) {
          if (formUserMustChangePwd.checked) {
            await db.resetPasswordChangedFlag(savedUserId);
          } else {
            await db.markPasswordChanged(savedUserId);
          }
        }
        modalUser.classList.add('hidden');
        fetchAndRenderUsers();
      }
    });
  }

  // ── SPEED MULTIPLIER (HỆ SỐ ĐIỂM TỐC ĐỘ) ──────────────────────────────────
  const toggleSpeedMultiplier = document.getElementById('toggle_speed_multiplier');
  const speedMultiplierStatusBadge = document.getElementById('speed_multiplier_status_badge');
  const toggleSpeedStateText = document.getElementById('toggle_speed_state_text');

  async function initSpeedMultiplierSetting() {
    if (!toggleSpeedMultiplier) return;
    try {
      const isEnabled = await db.getSpeedMultiplierSetting();
      updateSpeedMultiplierUI(isEnabled);
    } catch (e) {
      console.error('Lỗi nạp cài đặt hệ số tốc độ:', e);
    }
  }

  function updateSpeedMultiplierUI(isEnabled) {
    if (toggleSpeedMultiplier) toggleSpeedMultiplier.checked = isEnabled;
    if (speedMultiplierStatusBadge) {
      if (isEnabled) {
        speedMultiplierStatusBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse';
        speedMultiplierStatusBadge.textContent = '🟢 ĐANG BẬT';
      } else {
        speedMultiplierStatusBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-600';
        speedMultiplierStatusBadge.textContent = '⚪ ĐANG TẮT';
      }
    }
    if (toggleSpeedStateText) {
      toggleSpeedStateText.textContent = isEnabled ? 'Bật' : 'Tắt';
      toggleSpeedStateText.className = isEnabled ? 'text-xs font-black text-emerald-600 min-w-[36px]' : 'text-xs font-black text-slate-400 min-w-[36px]';
    }
  }

  if (toggleSpeedMultiplier) {
    toggleSpeedMultiplier.addEventListener('change', async () => {
      const isChecked = toggleSpeedMultiplier.checked;
      updateSpeedMultiplierUI(isChecked);
      const res = await db.setSpeedMultiplierSetting(isChecked);
      if (res.success) {
        if (isChecked) {
          showAdminAlert(
            'Đã BẬT Hệ Số Điểm Tốc Độ ⚡',
            'Từ bây giờ, hệ thống sẽ áp dụng nhân hệ số điểm theo tốc độ trả lời:\n\n' +
            '• Đúng thần tốc (≤15s): +15 điểm\n' +
            '• Đúng nhanh (16-30s): +12 điểm\n' +
            '• Đúng bình thường (31-60s): +10 điểm\n' +
            '• Sai (≤60s): -10 điểm\n' +
            '• Hết giờ: 0 điểm'
          );
        } else {
          showAdminAlert(
            'Đã TẮT Hệ Số Điểm Tốc Độ ⚪',
            'Hệ thống đã chuyển về chế độ tính điểm chuẩn:\n\n' +
            '• Đúng: +10 điểm\n' +
            '• Sai: 0 điểm\n' +
            '• Hết giờ: 0 điểm'
          );
        }
      } else {
        updateSpeedMultiplierUI(!isChecked);
        showAdminAlert('Lỗi cập nhật', res.message || 'Không thể lưu trạng thái.');
      }
    });
  }

  // ── 2. QUIZZES MANAGEMENT ────────────────────────────────────────────────────
  async function fetchAndRenderQuizzes() {
    if (!quizzesContainer) return;
    quizzesContainer.innerHTML = '<p class="text-slate-400 p-4">Đang tải đề kiểm tra...</p>';

    let qList = await db.adminGetQuizzes();
    const participantCounts = await db.adminGetQuizParticipantCount();

    // Lọc theo Tháng & Tuần
    const filterMonth = document.getElementById('filter_quiz_month')?.value;
    const filterWeek = document.getElementById('filter_quiz_week')?.value;

    if (filterMonth) {
      qList = qList.filter(q => q.month_no == filterMonth);
    }
    if (filterWeek) {
      qList = qList.filter(q => q.week_no == filterWeek);
    }

    quizzesContainer.innerHTML = '';

    if (!qList || qList.length === 0) {
      quizzesContainer.innerHTML = '<p class="text-slate-400 col-span-2 p-4 italic">Chưa có đề thi nào (hoặc không khớp với bộ lọc). Import từ Excel hoặc tạo mới.</p>';
      return;
    }

    qList.forEach(q => {
      const card = document.createElement('div');
      card.className = `p-5 rounded-3xl border shadow-xs transition duration-150 flex flex-col justify-between ${q.active ? 'bg-indigo-900 border-indigo-950 text-white relative overflow-hidden' : 'bg-white border-slate-200 text-slate-800'
        }`;
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-3.5">
            <span class="inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${q.active ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500 border border-slate-200'
        }">Tháng ${q.month_no || 1} • Tuần ${q.week_no}</span>
            <div class="flex items-center space-x-1.5 text-xs font-bold">
              <input type="checkbox" class="quiz-toggle-active-chk cursor-pointer w-4 h-4 rounded" data-id="${q.id}" ${q.active ? 'checked' : ''} />
              <span>Kích hoạt</span>
            </div>
          </div>
          <h3 class="font-extrabold text-sm leading-snug font-['Space_Grotesk']">${q.title}</h3>
          <p class="text-[11px] mt-2 font-semibold opacity-80">${participantCounts[q.id] || 0} người tham gia</p>
        </div>
        <div class="flex items-center justify-between pt-4 border-t ${q.active ? 'border-white/10' : 'border-slate-100'}">
          <button class="view-q-questions-btn px-3 py-1.5 border hover:opacity-90 active:scale-95 text-[10px] font-bold rounded-xl transition cursor-pointer ${q.active ? 'bg-white/15 text-white border-white/20 hover:bg-white/25' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
        }" data-id="${q.id}" data-title="${q.title}" data-week="${q.week_no}" data-month="${q.month_no || 1}">✏️ Chỉnh sửa</button>
          <button class="delete-quiz-btn px-2 py-1.5 text-[10px] font-bold rounded-xl hover:opacity-90 active:scale-95 transition flex items-center gap-1 cursor-pointer ${q.active ? 'bg-rose-500/20 text-rose-200 border border-rose-500/30' : 'bg-rose-50 text-rose-600 border border-rose-200'
        }" data-id="${q.id}">🗑️ Xóa đề</button>
        </div>
      `;
      quizzesContainer.appendChild(card);
    });

    document.querySelectorAll('.quiz-toggle-active-chk').forEach(chk => {
      chk.addEventListener('change', async () => {
        const qId = chk.getAttribute('data-id');
        await db.adminToggleQuizActive(qId, chk.checked);
        fetchAndRenderQuizzes();
      });
    });

    document.querySelectorAll('.view-q-questions-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-id');
        const title = btn.getAttribute('data-title');
        const week = btn.getAttribute('data-week');
        const month = btn.getAttribute('data-month');
        showQuizQuestions(qId, title, week, month);
      });
    });

    document.querySelectorAll('.delete-quiz-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Xóa đề thi này? Tất cả câu hỏi và đáp án liên quan sẽ bị xóa.')) {
          const qId = btn.getAttribute('data-id');
          await db.adminDeleteQuiz(qId);
          if (quizQuestionsBox && !quizQuestionsBox.classList.contains('hidden') && currentExpandedQuizId === qId) {
            quizQuestionsBox.classList.add('hidden');
          }
          fetchAndRenderQuizzes();
        }
      });
    });
  }

  async function showQuizQuestions(quizId, title, weekLabel, monthLabel) {
    currentExpandedQuizId = quizId;
    currentExpandedQuizMonth = monthLabel;
    currentExpandedQuizWeek = weekLabel;
    currentExpandedQuizTitle = title;
    if (selectedQuizSubtitle) selectedQuizSubtitle.textContent = `Tháng ${monthLabel} • Tuần ${weekLabel}`;
    if (selectedQuizTitle) selectedQuizTitle.textContent = title;
    if (quizQuestionsBox) quizQuestionsBox.classList.remove('hidden');
    if (questionsListWrapper) questionsListWrapper.innerHTML = '<p class="text-slate-400 text-sm">Đang tải câu hỏi...</p>';

    const questions = await db.adminGetQuestions(quizId);
    if (!questionsListWrapper) return;

    if (questions.length === 0) {
      questionsListWrapper.innerHTML = '<p class="text-slate-400 italic text-sm">Chưa có câu hỏi nào. Thêm mới hoặc import từ file Excel.</p>';
      return;
    }

    questionsListWrapper.innerHTML = '';
    questions.forEach((q, idx) => {
      const div = document.createElement('div');
      div.className = 'p-4 bg-white rounded-2xl border border-slate-100 shadow-xs';
      div.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-3">
          <p class="text-xs font-bold text-slate-900 flex-1"><span class="text-indigo-600 mr-1">${idx + 1}.</span>${q.question_text}</p>
          <div class="flex items-center gap-1.5">
            <button class="edit-question-btn p-1.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-100 transition inline-flex items-center cursor-pointer text-[10px] font-bold gap-1" data-id="${q.id}" data-qtext="${encodeURIComponent(q.question_text)}" data-point="${q.point || 10}" data-time="${q.time_limit || 15}" data-answers='${JSON.stringify((q.answers || []).map(a => ({ text: a.answer_text, correct: a.is_correct })))}' title="Sửa câu hỏi">✏️ Sửa</button>
            <button class="del-question-btn p-1.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-100 transition inline-flex items-center cursor-pointer" data-id="${q.id}" title="Xóa câu hỏi">🗑️</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          ${(q.answers || []).map(a => `
            <div class="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-xl ${a.is_correct ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold' : 'bg-slate-50 border border-slate-100 text-slate-600'}">
              ${a.is_correct ? '✅' : '○'} ${a.answer_text}
            </div>`).join('')}
        </div>
      `;
      questionsListWrapper.appendChild(div);
    });

    document.querySelectorAll('.del-question-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Xóa câu hỏi này?')) {
          await db.adminDeleteQuestion(btn.getAttribute('data-id'));
          showQuizQuestions(quizId, title, weekLabel, monthLabel);
        }
      });
    });

    // Bind edit question buttons
    const modalEditQuestion = document.getElementById('modal_edit_question');
    const formEditQuestion = document.getElementById('form_edit_question');
    const editQuestionId = document.getElementById('edit_question_id');
    const editQuestionText = document.getElementById('edit_question_text');

    document.querySelectorAll('.edit-question-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const qId = btn.getAttribute('data-id');
        const qText = decodeURIComponent(btn.getAttribute('data-qtext') || '');
        const qPoint = btn.getAttribute('data-point') || '10';
        const qTime = btn.getAttribute('data-time') || '15';
        let answers = [];
        try { answers = JSON.parse(btn.getAttribute('data-answers') || '[]'); } catch (_) { }

        editQuestionId.value = qId;
        editQuestionText.value = qText;
        document.getElementById('edit_question_point').value = qPoint;
        document.getElementById('edit_question_time').value = qTime;

        // Điền đáp án vào các field
        answers.forEach((ans, i) => {
          const field = document.getElementById(`edit_ans_${i}`);
          if (field) field.value = ans.text || '';
          if (ans.correct) {
            const radio = document.querySelector(`input[name="edit_correct_radio"][value="${i}"]`);
            if (radio) radio.checked = true;
          }
        });

        if (modalEditQuestion) modalEditQuestion.classList.remove('hidden');
      });
    });
  }

  if (btnOpenQuizModal) {
    btnOpenQuizModal.addEventListener('click', () => {
      formQuiz.reset();
      modalQuiz.classList.remove('hidden');
    });
  }
  if (btnCloseQuizModal) {
    btnCloseQuizModal.addEventListener('click', () => modalQuiz.classList.add('hidden'));
  }

  // Quiz Modal: Edit
  const btnEditQuizInfo = document.getElementById('btn_edit_quiz_info');
  const modalEditQuiz = document.getElementById('modal_edit_quiz');
  const formEditQuiz = document.getElementById('form_edit_quiz');
  const btnCloseEditQuizModal = document.getElementById('btn_close_edit_quiz_modal');

  if (btnEditQuizInfo) {
    btnEditQuizInfo.addEventListener('click', () => {
      document.getElementById('form_edit_quiz_id').value = currentExpandedQuizId;
      document.getElementById('form_edit_quiz_title').value = currentExpandedQuizTitle;
      document.getElementById('form_edit_quiz_month').value = currentExpandedQuizMonth;
      document.getElementById('form_edit_quiz_week').value = currentExpandedQuizWeek;
      modalEditQuiz.classList.remove('hidden');
    });
  }

  if (btnCloseEditQuizModal) {
    btnCloseEditQuizModal.addEventListener('click', () => modalEditQuiz.classList.add('hidden'));
  }

  if (formEditQuiz) {
    formEditQuiz.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qId = document.getElementById('form_edit_quiz_id').value;
      const title = document.getElementById('form_edit_quiz_title').value.trim();
      const month = parseInt(document.getElementById('form_edit_quiz_month').value) || 1;
      const week = parseInt(document.getElementById('form_edit_quiz_week').value) || 1;

      const result = await db.adminUpdateQuiz(qId, { title, month_no: month, week_no: week });
      if (result.success) {
        modalEditQuiz.classList.add('hidden');
        fetchAndRenderQuizzes();
        showQuizQuestions(qId, title, week, month);
      } else {
        alert('Lỗi cập nhật đề thi: ' + result.message);
      }
    });
  }

  if (formQuiz) {
    formQuiz.addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await db.adminCreateQuiz({
        title: formQuizTitle.value.trim(),
        month_no: parseInt(document.getElementById('form_quiz_month')?.value || '1'),
        week_no: parseInt(formQuizWeek.value) || 1,
        active: formQuizActive.checked
      });
      if (result.success) {
        showAdminAlert('Tạo đề thành công ✅', `Đề thi "${formQuizTitle.value.trim()}" đã được tạo.`);
        modalQuiz.classList.add('hidden');
        fetchAndRenderQuizzes();
      } else {
        showAdminAlert('Lỗi', result.message || 'Không thể tạo đề thi.');
      }
    });
  }

  // Add Question Modal
  if (btnAddQuestionForm) {
    btnAddQuestionForm.addEventListener('click', () => {
      if (!currentExpandedQuizId) return;
      formQuestionQuizId.value = currentExpandedQuizId;
      formQuestion.reset();
      modalQuestion.classList.remove('hidden');
    });
  }

  if (formQuestion) {
    formQuestion.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qId = formQuestionQuizId.value;
      const qText = formQuestionText.value.trim();
      const answers = [
        document.getElementById('ans_text_0')?.value.trim() || '',
        document.getElementById('ans_text_1')?.value.trim() || '',
        document.getElementById('ans_text_2')?.value.trim() || '',
        document.getElementById('ans_text_3')?.value.trim() || '',
      ];
      const point = parseInt(document.getElementById('form_question_point').value || '10');
      const timeLimit = parseInt(document.getElementById('form_question_time').value || '15');
      const correctRadio = document.querySelector('input[name="correct_answer_radio"]:checked');
      const correctIdx = correctRadio ? parseInt(correctRadio.value) : 0;

      const result = await db.adminCreateQuestion(qId, qText, answers.filter(Boolean), correctIdx, point, timeLimit);
      if (result.success) {
        document.getElementById('modal_question').classList.add('hidden');
        const currentQ = await db.adminGetQuizzes().then(qs => qs.find(q => q.id === currentExpandedQuizId));
        showQuizQuestions(qId, currentQ?.title || '', currentQ?.week_no || '');
      } else {
        showAdminAlert('Lỗi', result.message || 'Không thể thêm câu hỏi.');
      }
    });
  }

  const btnCloseQuestion = document.getElementById('btn_close_question_modal');
  if (btnCloseQuestion) {
    btnCloseQuestion.addEventListener('click', () => document.getElementById('modal_question').classList.add('hidden'));
  }

  // Edit Question Modal: Close + Submit
  const modalEditQuestion = document.getElementById('modal_edit_question');
  const formEditQuestion = document.getElementById('form_edit_question');

  const btnCloseEditQuestion = document.getElementById('btn_close_edit_question');
  if (btnCloseEditQuestion) {
    btnCloseEditQuestion.addEventListener('click', () => {
      if (modalEditQuestion) modalEditQuestion.classList.add('hidden');
    });
  }

  if (formEditQuestion) {
    formEditQuestion.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qId = document.getElementById('edit_question_id')?.value;
      const qText = document.getElementById('edit_question_text')?.value.trim();
      const answers = [
        document.getElementById('edit_ans_0')?.value.trim() || '',
        document.getElementById('edit_ans_1')?.value.trim() || '',
        document.getElementById('edit_ans_2')?.value.trim() || '',
        document.getElementById('edit_ans_3')?.value.trim() || '',
      ];
      const point = parseInt(document.getElementById('edit_question_point')?.value || '10');
      const timeLimit = parseInt(document.getElementById('edit_question_time')?.value || '15');
      const correctRadio = document.querySelector('input[name="edit_correct_radio"]:checked');
      const correctIdx = correctRadio ? parseInt(correctRadio.value) : 0;

      const result = await db.adminUpdateQuestion(qId, qText, answers, correctIdx, point, timeLimit);
      if (result.success) {
        if (modalEditQuestion) modalEditQuestion.classList.add('hidden');
        showAdminAlert('Cập nhật thành công ✅', 'Câu hỏi và đáp án đã được lưu.');
        if (currentExpandedQuizId) {
          const currentQ = await db.adminGetQuizzes().then(qs => qs.find(q => q.id === currentExpandedQuizId));
          showQuizQuestions(currentExpandedQuizId, currentQ?.title || '', currentQ?.week_no || '');
        }
      } else {
        showAdminAlert('Lỗi cập nhật', result.message || 'Không thể lưu thay đổi.');
      }
    });
  }

  // ── 3. IMPORT ────────────────────────────────────────────────────────────────
  if (importTypeSelect) {
    importTypeSelect.addEventListener('change', () => {
      const isQuiz = importTypeSelect.value === 'quizzes';
      if (guideUsersCsv) guideUsersCsv.classList.toggle('hidden', isQuiz);
      if (guideQuizzesCsv) guideQuizzesCsv.classList.toggle('hidden', !isQuiz);
      if (quizImportDetails) quizImportDetails.classList.toggle('hidden', !isQuiz);
    });
  }

  let importedFileRows = null;

  if (csvFileInput) {
    csvFileInput.addEventListener('change', async () => {
      const file = csvFileInput.files[0];
      if (!file) return;
      fileNameDisplay.textContent = file.name;

      try {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const buf = await file.arrayBuffer();
          if (!window.XLSX) throw new Error('SheetJS chưa tải.');
          const wb = window.XLSX.read(new Uint8Array(buf), { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          importedFileRows = window.XLSX.utils.sheet_to_json(ws, { defval: '' });
        } else {
          // Đọc file CSV với xử lý encoding thông minh
          // Thử UTF-8 trước, nếu phát hiện ký tự lỗi thì thử windows-1252 (ANSI — Excel VN hay dùng)
          const buf = await file.arrayBuffer();
          let text = new TextDecoder('utf-8').decode(buf);

          // Kiểm tra nếu có ký tự thay thế (U+FFFD) hoặc ký tự lạ → thử lại với ANSI
          if (text.includes('\uFFFD') || /[\x80-\x9F]/.test(text)) {
            text = new TextDecoder('windows-1252').decode(buf);
          }

          importedFileRows = parseCSV(text);

        }
        csvTextareaInput.value = '';
        showAdminAlert('File đã sẵn sàng 📄', `Đã đọc ${importedFileRows.length} dòng từ "${file.name}". Bấm "XỬ LÝ IMPORT" để tiếp tục.`);
      } catch (err) {
        showAdminAlert('Lỗi đọc file', err.message);
        importedFileRows = null;
      }
    });
  }

  if (btnProcessImport) {
    btnProcessImport.addEventListener('click', async () => {
      const type = importTypeSelect ? importTypeSelect.value : 'users';
      btnProcessImport.disabled = true;
      btnProcessImport.textContent = '⏳ Đang xử lý...';

      let rows = importedFileRows;
      if (!rows || rows.length === 0) {
        const rawText = csvTextareaInput ? csvTextareaInput.value.trim() : '';
        if (!rawText) {
          showAdminAlert('Thiếu dữ liệu', 'Vui lòng chọn file hoặc dán dữ liệu CSV vào ô văn bản.');
          btnProcessImport.disabled = false;
          btnProcessImport.textContent = 'XỬ LÝ IMPORT DỮ LIỆU NGAY';
          return;
        }
        rows = parseCSV(rawText);
      }

      try {
        if (type === 'users') {
          // BƯỚC 1: Kiểm tra trùng lặp trước
          btnProcessImport.textContent = '⏳ Đang kiểm tra...';
          const checkResult = await db.adminImportUsersFromRows(rows, 'check');

          if (checkResult.duplicates && checkResult.duplicates.length > 0) {
            // Có trùng → hiển thị danh sách và hỏi xác nhận
            const dupList = checkResult.duplicates.map(d =>
              `• <strong>${d.employee_code}</strong> — ${d.full_name} (${d.department || '—'})`
            ).join('<br>');

            const confirmed = await showImportConfirmDialog(
              checkResult.duplicates.length,
              checkResult.newCount,
              dupList
            );

            if (confirmed === 'update') {
              // Cập nhật cả trùng + tạo mới
              const updateResult = await db.adminImportUsersFromRows(rows, 'update');
              showAdminAlert('Import hoàn tất ✅',
                `Tạo mới: ${updateResult.created} | Cập nhật: ${updateResult.updated}`);
              fetchAndRenderUsers();
            } else if (confirmed === 'new_only') {
              // Chỉ tạo mới, bỏ qua trùng
              const createResult = await db.adminImportUsersFromRows(rows, 'create');
              showAdminAlert('Import hoàn tất ✅',
                `Tạo mới: ${createResult.created} tài khoản. Đã bỏ qua ${checkResult.duplicates.length} tài khoản trùng.`);
              fetchAndRenderUsers();
            }
            // Nếu cancelled: không làm gì
          } else {
            // Không có trùng → tạo mới luôn
            const createResult = await db.adminImportUsersFromRows(rows, 'create');
            showAdminAlert('Import thành công ✅', `Đã tạo mới ${createResult.created} tài khoản.`);
            fetchAndRenderUsers();
          }
        } else {
          // Quiz import — cần title và week
          const quizTitle = document.getElementById('import_quiz_title')?.value.trim();
          const quizWeek = parseInt(document.getElementById('import_quiz_week')?.value || '1');

          if (!quizTitle) {
            showAdminAlert('Thiếu tên đề', 'Vui lòng nhập tên đề thi Quiz trước khi import.');
            btnProcessImport.disabled = false;
            btnProcessImport.textContent = 'XỬ LÝ IMPORT DỮ LIỆU NGAY';
            return;
          }

          const result = await db.adminImportQuizFromRows(rows, quizTitle, quizWeek, false);
          if (result.success) {
            showAdminAlert('Import Quiz thành công ✅', `Đã tạo đề "${quizTitle}" với ${result.importedCount} câu hỏi.`);
            fetchAndRenderQuizzes();
          } else {
            showAdminAlert('Lỗi Import Quiz', result.message || 'Không thể import.');
          }
        }
      } catch (err) {
        showAdminAlert('Lỗi hệ thống', err.message);
      } finally {
        importedFileRows = null;
        btnProcessImport.disabled = false;
        btnProcessImport.textContent = 'XỬ LÝ IMPORT DỮ LIỆU NGAY';
      }
    });
  }

  // Helper: hiển thị dialog xác nhận khi có trùng lặp
  function showImportConfirmDialog(dupCount, newCount, dupListHtml) {
    return new Promise((resolve) => {
      // Tạo modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)';

      overlay.innerHTML = `
        <div style="background:#fff;border-radius:20px;padding:24px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);max-height:80vh;display:flex;flex-direction:column;">
          <h3 style="font-size:16px;font-weight:900;color:#1e293b;margin:0 0 8px">⚠️ Phát hiện Tài Khoản Trùng</h3>
          <p style="font-size:12px;color:#64748b;margin:0 0 12px">
            Tìm thấy <strong style="color:#E07242">${dupCount} tài khoản đã tồn tại</strong> và <strong style="color:#10b981">${newCount} tài khoản mới</strong>. Hãy chọn cách xử lý:
          </p>
          <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:12px;font-size:11px;line-height:1.8;max-height:200px;overflow-y:auto;margin-bottom:16px;color:#1e293b">
            <strong style="display:block;margin-bottom:4px">Danh sách trùng:</strong>
            ${dupListHtml}
          </div>
          <div style="display:flex;gap:8px;flex-direction:column">
            <button id="import_confirm_update" style="background:linear-gradient(135deg,#E07242,#E5853F);color:#fff;font-weight:800;padding:12px;border-radius:12px;border:none;cursor:pointer;font-size:12px">
              ✅ Cập nhật TÀI KHOẢN TRÙNG + Tạo mới tài khoản còn lại
            </button>
            <button id="import_confirm_new_only" style="background:#f1f5f9;color:#334155;font-weight:700;padding:10px;border-radius:12px;border:1px solid #e2e8f0;cursor:pointer;font-size:12px">
              ➕ Chỉ tạo ${newCount} tài khoản mới, bỏ qua trùng
            </button>
            <button id="import_confirm_cancel" style="background:transparent;color:#94a3b8;font-weight:600;padding:8px;border-radius:12px;border:none;cursor:pointer;font-size:11px">
              Hủy — Không làm gì
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('#import_confirm_update').addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve('update');
      });
      overlay.querySelector('#import_confirm_new_only').addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve('new_only');
      });
      overlay.querySelector('#import_confirm_cancel').addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve('cancel');
      });
    });
  }

  // ── 4. EXPORT ────────────────────────────────────────────────────────────────
  const btnExportScores = document.getElementById('btn_export_scores');
  if (btnExportScores) {
    btnExportScores.addEventListener('click', async () => {
      btnExportScores.disabled = true;
      btnExportScores.textContent = '⏳ Đang xuất...';
      try {
        await db.adminExportScoresXLSX('total');
        showAdminAlert('Xuất thành công ✅', 'File báo cáo điểm đã được tải về máy.');
      } catch (err) {
        showAdminAlert('Lỗi', 'Không thể xuất file: ' + err.message);
      } finally {
        btnExportScores.disabled = false;
        btnExportScores.textContent = '⬇️ XUẤT BÁO CÁO (.xlsx)';
      }
    });
  }

  const btnExportAccounts = document.getElementById('btn_export_accounts');
  if (btnExportAccounts) {
    btnExportAccounts.addEventListener('click', async () => {
      btnExportAccounts.disabled = true;
      try {
        await exportAccountsAsCSV();
        showAdminAlert('Xuất thành công ✅', 'File accounts.csv đã được tải về máy.');
      } catch (err) {
        showAdminAlert('Lỗi', err.message);
      } finally {
        btnExportAccounts.disabled = false;
      }
    });
  }

  // ── 5. DAILY LIMIT ───────────────────────────────────────────────────────────
  const inputDailyLimit = document.getElementById('input_daily_limit');
  const btnSaveDailyLimit = document.getElementById('btn_save_daily_limit');

  if (inputDailyLimit) {
    db.getDailyLimit().then(limit => { inputDailyLimit.value = limit; });
  }

  if (btnSaveDailyLimit && inputDailyLimit) {
    btnSaveDailyLimit.addEventListener('click', async () => {
      const val = parseInt(inputDailyLimit.value);
      if (isNaN(val) || val < 1) {
        showAdminAlert('Giá trị không hợp lệ', 'Vui lòng nhập số lượt chơi ≥ 1.');
        return;
      }
      const result = await db.updateDailyLimit(val);
      if (result.success) showAdminAlert('Đã lưu ✅', `Giới hạn lượt chơi chung: ${val} lượt/ngày.`);
      else showAdminAlert('Lỗi', result.message || 'Không thể lưu.');
    });
  }

  // ── 5B. SECURITY RULE: BẮT ĐỔI MẬT KHẨU LẦN ĐẦU (TRỪ ADMIN) ─────────────
  const chkRuleFirstLoginPwd = document.getElementById('chk_rule_first_login_pwd');
  const ruleFirstLoginLabel = document.getElementById('rule_first_login_label');

  function updateRuleFirstLoginUI(enabled) {
    if (chkRuleFirstLoginPwd) chkRuleFirstLoginPwd.checked = enabled;
    if (ruleFirstLoginLabel) {
      ruleFirstLoginLabel.textContent = enabled ? 'Đang BẬT' : 'Đang TẮT';
      ruleFirstLoginLabel.className = enabled
        ? 'text-xs font-extrabold text-emerald-700'
        : 'text-xs font-extrabold text-slate-400';
    }
  }

  if (chkRuleFirstLoginPwd) {
    db.getFirstLoginPwdRule().then(updateRuleFirstLoginUI);
    chkRuleFirstLoginPwd.addEventListener('change', async () => {
      const enabled = chkRuleFirstLoginPwd.checked;
      const res = await db.setFirstLoginPwdRule(enabled);
      if (res.success) {
        updateRuleFirstLoginUI(enabled);
        showAdminAlert(
          'Đã cập nhật Rules ✅',
          enabled
            ? 'Đã BẬT quy tắc bắt buộc người dùng đổi mật khẩu khi đăng nhập lần đầu (trừ Admin).'
            : 'Đã TẮT quy tắc bắt buộc người dùng đổi mật khẩu khi đăng nhập lần đầu.'
        );
      } else {
        updateRuleFirstLoginUI(!enabled);
        showAdminAlert('Lỗi', res.message || 'Không thể lưu cấu hình Rules.');
      }
    });
  }

  // ── 6. LOGOUT ────────────────────────────────────────────────────────────────
  const btnLogoutAdmin = document.getElementById('btn_logout_admin');
  if (btnLogoutAdmin) {
    btnLogoutAdmin.addEventListener('click', () => {
      sessionStorage.removeItem('current_user');
      sessionStorage.removeItem('current_quiz_id');
      window.location.replace('/login.html');
    });
  }

  // ── 7. HISTORY MANAGEMENT ───────────────────────────────────────────────────
  const historyTableBody = document.getElementById('history_table_body');
  const btnRefreshHistory = document.getElementById('btn_refresh_history');
  const modalWrongAnswers = document.getElementById('modal_wrong_answers');
  const btnCloseWrongAnswers = document.getElementById('btn_close_wrong_answers');
  const wrongAnswersList = document.getElementById('wrong_answers_list');

  if (btnRefreshHistory) btnRefreshHistory.addEventListener('click', fetchAndRenderHistory);
  if (btnCloseWrongAnswers) btnCloseWrongAnswers.addEventListener('click', () => modalWrongAnswers.classList.add('hidden'));

  // History Filter Inputs
  const filterHistorySearch = document.getElementById('filter_history_search');
  const filterHistoryQuiz = document.getElementById('filter_history_quiz');
  const filterHistoryMonth = document.getElementById('filter_history_month');
  const filterHistoryWeek = document.getElementById('filter_history_week');
  const btnClearHistoryFilter = document.getElementById('btn_clear_history_filter');

  const triggerHistoryFilter = () => fetchAndRenderHistory();

  if (filterHistorySearch) filterHistorySearch.addEventListener('input', triggerHistoryFilter);
  if (filterHistoryQuiz) filterHistoryQuiz.addEventListener('change', triggerHistoryFilter);
  if (filterHistoryMonth) filterHistoryMonth.addEventListener('input', triggerHistoryFilter);
  if (filterHistoryWeek) filterHistoryWeek.addEventListener('input', triggerHistoryFilter);

  if (btnClearHistoryFilter) {
    btnClearHistoryFilter.addEventListener('click', () => {
      if (filterHistorySearch) filterHistorySearch.value = '';
      if (filterHistoryQuiz) filterHistoryQuiz.value = '';
      if (filterHistoryMonth) filterHistoryMonth.value = '';
      if (filterHistoryWeek) filterHistoryWeek.value = '';
      fetchAndRenderHistory();
    });
  }

  async function fetchAndRenderHistory() {
    if (!historyTableBody) return;
    historyTableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400 italic">Đang tải lịch sử...</td></tr>';

    // Load quiz options for filter if empty
    if (filterHistoryQuiz && filterHistoryQuiz.options.length <= 1) {
      const allQuizzes = await db.adminGetQuizzes();
      allQuizzes.forEach(q => {
        const opt = document.createElement('option');
        opt.value = q.id;
        opt.textContent = q.title;
        filterHistoryQuiz.appendChild(opt);
      });
    }

    let historyData = await db.adminGetPlayHistory();

    // Apply filters
    const searchVal = filterHistorySearch?.value.toLowerCase().trim() || '';
    const quizVal = filterHistoryQuiz?.value;
    const monthVal = filterHistoryMonth?.value;
    const weekVal = filterHistoryWeek?.value;

    if (searchVal) {
      historyData = historyData.filter(row => {
        const name = row.users?.full_name?.toLowerCase() || '';
        const code = row.users?.employee_code?.toLowerCase() || '';
        return name.includes(searchVal) || code.includes(searchVal);
      });
    }

    if (quizVal) {
      historyData = historyData.filter(row => row.quiz_id === quizVal);
    }
    if (monthVal) {
      historyData = historyData.filter(row => row.quizzes?.month_no == monthVal);
    }
    if (weekVal) {
      historyData = historyData.filter(row => row.quizzes?.week_no == weekVal);
    }

    // Hiển thị Dashboard
    const dashboardContainer = document.getElementById('dashboard_stats');
    if (dashboardContainer) {
      if (quizVal && historyData.length > 0) {
        dashboardContainer.classList.remove('hidden');
        await renderDashboard(historyData, quizVal, dashboardContainer);
      } else {
        dashboardContainer.classList.add('hidden');
        dashboardContainer.innerHTML = '';
      }
    }

    if (historyData.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400 italic">Chưa có lượt chơi nào.</td></tr>';
      return;
    }

    historyTableBody.innerHTML = '';
    historyData.forEach(row => {
      const tr = document.createElement('tr');
      const playedDate = new Date(row.played_at).toLocaleString('vi-VN');
      const userName = row.users ? row.users.full_name : 'N/A';
      const userCode = row.users ? row.users.employee_code : '';
      const quizTitle = row.quizzes ? row.quizzes.title : 'Quiz';

      tr.innerHTML = `
        <td class="py-3 px-4 font-semibold">${playedDate}</td>
        <td class="py-3 px-4">
          <p class="font-bold text-slate-900">${userName}</p>
          <p class="text-[10px] text-slate-400">${userCode}</p>
        </td>
        <td class="py-3 px-4 font-bold text-indigo-700">${quizTitle}</td>
        <td class="py-3 px-4 text-center font-black text-amber-500">${row.score}</td>
        <td class="py-3 px-4 text-center">
          <span class="text-emerald-600 font-bold">${row.correct_count || 0}</span>
          <span class="text-slate-300 mx-1">/</span>
          <span class="text-rose-500 font-bold">${row.wrong_count || 0}</span>
        </td>
        <td class="py-3 px-4 text-center text-slate-500 font-semibold">${row.time_spent || 0}s</td>
        <td class="py-3 px-4 text-center">
          <button class="btn-view-wrong px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold transition cursor-pointer" data-wrong='${JSON.stringify(row.wrong_answers || []).replace(/'/g, "&#39;")}'>Chi tiết</button>
        </td>
      `;
      historyTableBody.appendChild(tr);
    });

    document.querySelectorAll('.btn-view-wrong').forEach(btn => {
      btn.addEventListener('click', () => {
        let wrongArr = [];
        try { wrongArr = JSON.parse(btn.getAttribute('data-wrong') || '[]'); } catch (e) { }

        if (wrongArr.length === 0) {
          wrongAnswersList.innerHTML = '<p class="text-emerald-600 font-bold text-center py-4">Tuyệt vời! Người chơi không sai câu nào.</p>';
        } else {
          wrongAnswersList.innerHTML = wrongArr.map((w, idx) => `
            <div class="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p class="font-bold text-slate-800 mb-2"><span class="text-rose-500 mr-1">Q${idx + 1}.</span> ${w.question}</p>
              <div class="flex flex-col gap-1.5 text-xs">
                <p class="text-rose-600"><span class="font-bold">Đã chọn:</span> ${w.selected}</p>
                <p class="text-emerald-600"><span class="font-bold">Đáp án đúng:</span> ${w.correct}</p>
              </div>
            </div>
          `).join('');
        }
        modalWrongAnswers.classList.remove('hidden');
      });
    });
  }

  async function renderDashboard(historyData, quizId, container) {
    container.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Đang tính toán thống kê...</p>';

    const questions = await db.adminGetQuestions(quizId);
    if (!questions || questions.length === 0) {
      container.innerHTML = '<p class="text-center text-rose-500 text-xs py-4">Không tìm thấy dữ liệu câu hỏi cho đề thi này.</p>';
      return;
    }

    const totalPlays = historyData.length;
    let totalTime = 0;

    // Khởi tạo map đếm lỗi
    const wrongCountsByQuestion = {};
    questions.forEach(q => {
      wrongCountsByQuestion[q.question_text.trim()] = 0;
    });

    historyData.forEach(row => {
      totalTime += (parseInt(row.time_spent) || 0);
      const wrongs = row.wrong_answers || [];
      wrongs.forEach(w => {
        const qText = (w.question || '').trim();
        const matchedKey = Object.keys(wrongCountsByQuestion).find(k => k === qText || k.includes(qText) || qText.includes(k));
        if (matchedKey) {
          wrongCountsByQuestion[matchedKey]++;
        }
      });
    });

    const avgTime = Math.round(totalTime / totalPlays) || 0;

    let statsHtml = `
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex flex-col items-center justify-center">
          <span class="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Tổng số lượt thi</span>
          <span class="text-3xl font-black text-indigo-700 font-['Space_Grotesk']">${totalPlays}</span>
        </div>
        <div class="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex flex-col items-center justify-center">
          <span class="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">Thời gian TB / lượt</span>
          <span class="text-3xl font-black text-emerald-700 font-['Space_Grotesk']">${avgTime}s</span>
        </div>
      </div>
      <div class="bg-slate-50 border border-slate-100 rounded-2xl p-5">
        <h3 class="text-xs font-bold text-slate-700 mb-4 uppercase tracking-wide">Tỉ lệ Đúng / Sai theo từng câu</h3>
        <div class="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-200">
    `;

    questions.forEach((q, idx) => {
      const qText = q.question_text.trim();
      const wrongs = wrongCountsByQuestion[qText] || 0;
      const corrects = totalPlays - wrongs;
      const correctRatio = Math.round((corrects / totalPlays) * 100) || 0;
      const wrongRatio = 100 - correctRatio;

      statsHtml += `
        <div>
          <div class="flex justify-between items-end mb-1.5 gap-2">
            <span class="text-[11px] font-bold text-slate-700 flex-1 leading-snug" title="${qText}">Câu ${idx + 1}: ${qText}</span>
            <span class="text-[10px] font-bold ${correctRatio >= 50 ? 'text-emerald-600' : 'text-rose-500'} whitespace-nowrap">${correctRatio}% Đúng</span>
          </div>
          <div class="w-full bg-rose-200 rounded-full h-2 flex overflow-hidden">
            <div class="bg-emerald-500 h-2 transition-all duration-500" style="width: ${correctRatio}%"></div>
            <div class="bg-rose-500 h-2 transition-all duration-500" style="width: ${wrongRatio}%"></div>
          </div>
          <div class="flex justify-between mt-1 text-[9px] text-slate-400 font-semibold">
            <span>Đúng: ${corrects}</span>
            <span>Sai: ${wrongs}</span>
          </div>
        </div>
      `;
    });

    statsHtml += `
        </div>
      </div>
    `;

    container.innerHTML = statsHtml;
  }

  // ── Bulk Actions Listeners ────────────────────────────────────────────────────
  if (chkSelectAllUsers) {
    chkSelectAllUsers.addEventListener('change', () => {
      const isChecked = chkSelectAllUsers.checked;
      document.querySelectorAll('.user-select-chk:not(:disabled)').forEach(chk => {
        chk.checked = isChecked;
      });
      updateBulkSelectionUI();
    });
  }

  if (btnClearUserSelection) {
    btnClearUserSelection.addEventListener('click', () => {
      document.querySelectorAll('.user-select-chk').forEach(chk => { chk.checked = false; });
      if (chkSelectAllUsers) chkSelectAllUsers.checked = false;
      updateBulkSelectionUI();
    });
  }

  // Mở khóa các tài khoản đã chọn
  if (btnBulkUnlockSelected) {
    btnBulkUnlockSelected.addEventListener('click', async () => {
      const selectedIds = Array.from(document.querySelectorAll('.user-select-chk:checked')).map(c => c.getAttribute('data-id'));
      if (selectedIds.length === 0) return;
      if (!confirm('Bạn có chắc muốn MỞ KHÓA HOẠT ĐỘNG cho ' + selectedIds.length + ' tài khoản nhân viên đã chọn?')) return;

      const res = await db.adminBulkUpdateUserStatus(selectedIds, true);
      if (res && res.success) {
        showAdminAlert('Thành công ✅', 'Đã mở khóa hoạt động cho ' + selectedIds.length + ' tài khoản nhân viên!');
        fetchAndRenderUsers();
      } else {
        showAdminAlert('Lỗi', res?.message || 'Không thể mở khóa tài khoản.');
      }
    });
  }

  // Tạm khóa các tài khoản đã chọn
  if (btnBulkLockSelected) {
    btnBulkLockSelected.addEventListener('click', async () => {
      const selectedIds = Array.from(document.querySelectorAll('.user-select-chk:checked')).map(c => c.getAttribute('data-id'));
      if (selectedIds.length === 0) return;
      if (!confirm('Bạn có chắc muốn TẠM KHÓA ' + selectedIds.length + ' tài khoản nhân viên đã chọn?\nNhân viên bị khóa sẽ không thể tham gia thi đấu.')) return;

      const res = await db.adminBulkUpdateUserStatus(selectedIds, false);
      if (res && res.success) {
        showAdminAlert('Thành công ✅', 'Đã tạm khóa ' + selectedIds.length + ' tài khoản nhân viên!');
        fetchAndRenderUsers();
      } else {
        showAdminAlert('Lỗi', res?.message || 'Không thể tạm khóa tài khoản.');
      }
    });
  }

  // Mở khóa TOÀN BỘ nhân viên
  if (btnBulkUnlockAll) {
    btnBulkUnlockAll.addEventListener('click', async () => {
      if (!confirm('XÁC NHẬN: Bạn có chắc chắn muốn MỞ KHÓA HOẠT ĐỘNG cho TOÀN BỘ nhân viên trong hệ thống?')) return;
      const res = await db.adminSetAllUsersStatus(true);
      if (res && res.success) {
        showAdminAlert('Thành công ✅', 'Đã mở khóa hoạt động cho tất cả nhân viên trong hệ thống!');
        fetchAndRenderUsers();
      } else {
        showAdminAlert('Lỗi', res?.message || 'Không thể mở khóa toàn bộ nhân viên.');
      }
    });
  }

  // Tạm khóa TOÀN BỘ nhân viên
  if (btnBulkLockAll) {
    btnBulkLockAll.addEventListener('click', async () => {
      if (!confirm('CẢNH BÁO: Bạn có chắc chắn muốn TẠM KHÓA TOÀN BỘ nhân viên trong hệ thống?\n(Tài khoản Quản trị viên/Chủ hệ thống sẽ không bị ảnh hưởng)')) return;
      const res = await db.adminSetAllUsersStatus(false, user.id);
      if (res && res.success) {
        showAdminAlert('Thành công ✅', 'Đã tạm khóa tất cả nhân viên trong hệ thống!');
        fetchAndRenderUsers();
      } else {
        showAdminAlert('Lỗi', res?.message || 'Không thể tạm khóa toàn bộ nhân viên.');
      }
    });
  }
  // ── Initial render ───────────────────────────────────────────────────────────
  fetchAndRenderUsers();

  // ── FLASHCARD MANAGEMENT ─────────────────────────────────────────────────────
  const flashcardSetsContainer = document.getElementById('flashcard_sets_container');
  const flashcardCardsBox = document.getElementById('flashcard_cards_box');
  const selectedFcSetBadge = document.getElementById('selected_fcset_badge');
  const selectedFcSetTitle = document.getElementById('selected_fcset_title');
  const flashcardsList = document.getElementById('flashcards_list');
  const btnAddFlashcardForm = document.getElementById('btn_add_flashcard_form');
  const btnCloseFlashcardCards = document.getElementById('btn_close_flashcard_cards');
  const addFlashcardInline = document.getElementById('add_flashcard_inline');
  const fcQuestionInput = document.getElementById('fc_question_input');
  const fcAnswerInput = document.getElementById('fc_answer_input');
  const fcEditId = document.getElementById('fc_edit_id');
  const btnSaveFlashcard = document.getElementById('btn_save_flashcard');
  const btnCancelFlashcard = document.getElementById('btn_cancel_flashcard');

  const modalFcSet = document.getElementById('modal_fcset');
  const formFcSet = document.getElementById('form_fcset');
  const formFcSetId = document.getElementById('form_fcset_id');
  const formFcSetTitle = document.getElementById('form_fcset_title');
  const formFcSetCategory = document.getElementById('form_fcset_category');
  const formFcSetDesc = document.getElementById('form_fcset_desc');
  const btnOpenFcSetModal = document.getElementById('btn_open_fcset_modal');
  const btnCloseFcSetModal = document.getElementById('btn_close_fcset_modal');

  let currentFcSetId = null;
  let currentFcSetTitle = '';

  if (btnOpenFcSetModal) {
    btnOpenFcSetModal.addEventListener('click', () => {
      formFcSetId.value = '';
      formFcSetTitle.value = '';
      formFcSetCategory.value = '';
      formFcSetDesc.value = '';
      document.getElementById('modal_fcset_title').textContent = 'Tạo Bộ Flashcard Mới';
      modalFcSet.classList.remove('hidden');
    });
  }
  if (btnCloseFcSetModal) {
    btnCloseFcSetModal.addEventListener('click', () => modalFcSet.classList.add('hidden'));
  }

  if (formFcSet) {
    formFcSet.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = formFcSetTitle.value.trim();
      const category = formFcSetCategory.value.trim();
      const desc = formFcSetDesc.value.trim();
      if (!title) return;

      const id = formFcSetId.value;
      let result;
      if (id) {
        result = await db.adminUpdateFlashcardSet(id, { title, description: desc, category });
      } else {
        result = await db.adminCreateFlashcardSet(title, desc, category);
      }

      if (result.success) {
        modalFcSet.classList.add('hidden');
        fetchAndRenderFlashcardSets();
      } else {
        showAdminAlert('Lỗi', result.message || 'Không thể lưu bộ flashcard.');
      }
    });
  }

  async function fetchAndRenderFlashcardSets() {
    if (!flashcardSetsContainer) return;
    flashcardSetsContainer.innerHTML = '<div class="col-span-2 p-6 text-center text-slate-400 text-sm">Đang nạp...</div>';
    const sets = await db.adminGetFlashcardSets();

    if (!sets || sets.length === 0) {
      flashcardSetsContainer.innerHTML = '<div class="col-span-2 p-8 text-center text-slate-400 italic text-sm">Chưa có bộ flashcard nào.</div>';
      return;
    }

    flashcardSetsContainer.innerHTML = '';
    sets.forEach(set => {
      const card = document.createElement('div');
      card.className = 'bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition';
      const activeLabel = set.active
        ? '<span class="text-[10px] font-bold text-emerald-600">✅ Kích hoạt</span>'
        : '<span class="text-[10px] font-bold text-slate-400">⬜ Tắt</span>';
      const descHtml = set.description
        ? `<p class="text-[11px] text-slate-500 mt-0.5">${set.description}</p>`
        : '';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">${set.category || 'Chung'}</span>
              <label class="flex items-center gap-1.5 cursor-pointer" title="Kích hoạt / Tắt">
                <input type="checkbox" class="fcset-toggle-active w-3.5 h-3.5 accent-emerald-600 cursor-pointer" data-id="${set.id}" ${set.active ? 'checked' : ''}>
                ${activeLabel}
              </label>
            </div>
            <h3 class="font-bold text-slate-900 text-sm leading-snug">${set.title}</h3>
            ${descHtml}
          </div>
        </div>
        <div class="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button class="fcset-cards-btn flex-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl hover:bg-indigo-100 transition cursor-pointer" data-id="${set.id}" data-title="${set.title}">
            📋 Xem &amp; Sửa Thẻ
          </button>
          <button class="fcset-edit-btn px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl hover:bg-slate-100 transition cursor-pointer" data-id="${set.id}" data-title="${set.title}" data-category="${set.category || ''}" data-desc="${(set.description || '').replace(/"/g, '&quot;')}">
            ✏️ Sửa
          </button>
          <button class="fcset-delete-btn px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-600 font-bold text-xs rounded-xl hover:bg-rose-100 transition cursor-pointer" data-id="${set.id}" data-title="${set.title}">
            🗑️ Xóa
          </button>
        </div>
      `;
      flashcardSetsContainer.appendChild(card);
    });

    document.querySelectorAll('.fcset-toggle-active').forEach(chk => {
      chk.addEventListener('change', async () => {
        await db.adminToggleFlashcardSetActive(chk.dataset.id, chk.checked);
        fetchAndRenderFlashcardSets();
      });
    });

    document.querySelectorAll('.fcset-cards-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFcSetId = btn.dataset.id;
        currentFcSetTitle = btn.dataset.title;
        selectedFcSetBadge.textContent = 'BỘ FLASHCARD';
        selectedFcSetTitle.textContent = currentFcSetTitle;
        flashcardCardsBox.classList.remove('hidden');
        addFlashcardInline.classList.add('hidden');
        fetchAndRenderFlashcards(currentFcSetId);
        flashcardCardsBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    document.querySelectorAll('.fcset-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        formFcSetId.value = btn.dataset.id;
        formFcSetTitle.value = btn.dataset.title;
        formFcSetCategory.value = btn.dataset.category;
        formFcSetDesc.value = btn.dataset.desc;
        document.getElementById('modal_fcset_title').textContent = 'Chỉnh Sửa Bộ Flashcard';
        modalFcSet.classList.remove('hidden');
      });
    });

    document.querySelectorAll('.fcset-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Xóa bộ "${btn.dataset.title}"? Tất cả thẻ sẽ bị xóa.`)) return;
        const result = await db.adminDeleteFlashcardSet(btn.dataset.id);
        if (result.success) {
          flashcardCardsBox.classList.add('hidden');
          fetchAndRenderFlashcardSets();
        } else {
          showAdminAlert('Lỗi', result.message);
        }
      });
    });
  }

  if (btnCloseFlashcardCards) {
    btnCloseFlashcardCards.addEventListener('click', () => {
      flashcardCardsBox.classList.add('hidden');
      currentFcSetId = null;
    });
  }

  if (btnAddFlashcardForm) {
    btnAddFlashcardForm.addEventListener('click', () => {
      fcEditId.value = '';
      fcQuestionInput.value = '';
      fcAnswerInput.value = '';
      addFlashcardInline.classList.remove('hidden');
      fcQuestionInput.focus();
    });
  }

  if (btnCancelFlashcard) {
    btnCancelFlashcard.addEventListener('click', () => {
      addFlashcardInline.classList.add('hidden');
      fcEditId.value = '';
    });
  }

  if (btnSaveFlashcard) {
    btnSaveFlashcard.addEventListener('click', async () => {
      const question = fcQuestionInput.value.trim();
      const answer = fcAnswerInput.value.trim();
      if (!question || !answer) {
        showAdminAlert('Thiếu thông tin', 'Vui lòng nhập cả câu hỏi và câu trả lời.');
        return;
      }
      const editId = fcEditId.value;
      let result;
      if (editId) {
        result = await db.adminUpdateFlashcard(editId, question, answer);
      } else {
        result = await db.adminCreateFlashcard(currentFcSetId, question, answer);
      }
      if (result.success) {
        addFlashcardInline.classList.add('hidden');
        fcEditId.value = '';
        fetchAndRenderFlashcards(currentFcSetId);
      } else {
        showAdminAlert('Lỗi', result.message);
      }
    });
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchAndRenderFlashcards(setId) {
    if (!flashcardsList) return;
    flashcardsList.innerHTML = '<div class="p-4 text-center text-slate-400 text-sm">Đang nạp...</div>';
    const cards = await db.adminGetFlashcards(setId);

    if (!cards || cards.length === 0) {
      flashcardsList.innerHTML = '<div class="p-6 text-center text-slate-400 italic text-sm">Chưa có thẻ nào. Nhấn "Thêm Thẻ" để bắt đầu.</div>';
      return;
    }

    flashcardsList.innerHTML = '';
    cards.forEach((card, idx) => {
      const item = document.createElement('div');
      item.className = 'bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-3 hover:border-indigo-200 transition';
      item.innerHTML = `
        <span class="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 font-black text-[10px] flex-shrink-0 flex items-center justify-center mt-0.5">${idx + 1}</span>
        <div class="flex-1 min-w-0">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p class="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Câu hỏi (Mặt trước)</p>
              <p class="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap break-words" style="white-space: pre-wrap;">${escapeHTML(card.question)}</p>
            </div>
            <div>
              <p class="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Câu trả lời (Mặt sau)</p>
              <p class="text-xs font-semibold text-slate-700 leading-relaxed whitespace-pre-wrap break-words" style="white-space: pre-wrap;">${escapeHTML(card.answer)}</p>
            </div>
          </div>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button class="fc-edit-btn p-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition text-[11px] cursor-pointer" data-id="${card.id}" title="Sửa">✏️</button>
          <button class="fc-delete-btn p-1.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-100 transition text-[11px] cursor-pointer" data-id="${card.id}" title="Xóa">🗑️</button>
        </div>
      `;
      flashcardsList.appendChild(item);
    });

    document.querySelectorAll('.fc-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = cards.find(c => c.id === btn.dataset.id);
        if (!card) return;
        fcEditId.value = card.id;
        fcQuestionInput.value = card.question;
        fcAnswerInput.value = card.answer;
        addFlashcardInline.classList.remove('hidden');
        fcQuestionInput.focus();
      });
    });

    document.querySelectorAll('.fc-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Xóa thẻ này?')) return;
        const result = await db.adminDeleteFlashcard(btn.dataset.id);
        if (result.success) fetchAndRenderFlashcards(setId);
        else showAdminAlert('Lỗi', result.message);
      });
    });
  }

  // ── 6. BUSINESS DAY 2026: ĐIỂM DANH & QUAY SỐ MAY MẮN ───────────────────────
  // DOM Elements
  const btnBdOpenScanner = document.getElementById('btn_bd_open_scanner');
  const btnBdAddUser = document.getElementById('btn_bd_add_user');
  const btnBdExportExcel = document.getElementById('btn_bd_export_excel');
  const btnBdEmailTemplate = document.getElementById('btn_bd_email_template');
  const btnBdRefresh = document.getElementById('btn_bd_refresh');

  const bdStatTotal = document.getElementById('bd_stat_total');
  const bdStatAttended = document.getElementById('bd_stat_attended');
  const bdStatPercent = document.getElementById('bd_stat_percent');
  const bdStatUnattended = document.getElementById('bd_stat_unattended');
  const bdStatLuckyIssued = document.getElementById('bd_stat_lucky_issued');

  const bdSearchInput = document.getElementById('bd_search_input');
  const bdFilterStatus = document.getElementById('bd_filter_status');
  const bdFilterDivision = document.getElementById('bd_filter_division');
  const bdFilterDept = document.getElementById('bd_filter_dept');
  const bdBtnFilterReset = document.getElementById('bd_btn_filter_reset');

  const bdTableBody = document.getElementById('bd_table_body');
  const bdTableCount = document.getElementById('bd_table_count');

  // Modal View QR
  const modalViewQr = document.getElementById('modal_view_qr');
  const btnCloseViewQr = document.getElementById('btn_close_view_qr');
  const qrViewCanvas = document.getElementById('qr_view_canvas');
  const qrViewFullname = document.getElementById('qr_view_fullname');
  const qrViewCode = document.getElementById('qr_view_code');
  const qrViewPosition = document.getElementById('qr_view_position');
  const qrViewDept = document.getElementById('qr_view_dept');
  const qrViewStatusBadge = document.getElementById('qr_view_status_badge');
  const qrViewLuckyBadge = document.getElementById('qr_view_lucky_badge');
  const btnDownloadQrPng = document.getElementById('btn_download_qr_png');
  const btnViewQrOutlook = document.getElementById('btn_view_qr_outlook');

  // Modal QR Scanner
  const modalQrScanner = document.getElementById('modal_qr_scanner');
  const btnCloseQrScanner = document.getElementById('btn_close_qr_scanner');
  const scannerCameraBody = document.getElementById('scanner_camera_body');
  const qrReaderViewport = document.getElementById('qr_reader_viewport');
  const scannerCameraStatus = document.getElementById('scanner_camera_status');
  const btnScannerSwitchCam = document.getElementById('btn_scanner_switch_cam');
  const scannerManualCodeInput = document.getElementById('scanner_manual_code_input');
  const btnScannerManualSubmit = document.getElementById('btn_scanner_manual_submit');

  // Standalone Lucky Draw Rolling Overlay
  const modalLuckyRoll = document.getElementById('modal_lucky_roll');
  const luckyRollerName = document.getElementById('lucky_roller_name');
  const luckyRollerDigits = document.getElementById('lucky_roller_digits');

  // Modal Attendance User
  const modalAttendanceUser = document.getElementById('modal_attendance_user');
  const modalBdUserTitle = document.getElementById('modal_bd_user_title');
  const btnCloseBdUserModal = document.getElementById('btn_close_bd_user_modal');
  const btnCancelBdUser = document.getElementById('btn_cancel_bd_user');
  const formBdUser = document.getElementById('form_bd_user');
  const formBdUserId = document.getElementById('form_bd_user_id');
  const bdTypeEmployee = document.getElementById('bd_type_employee');
  const bdTypeGuest = document.getElementById('bd_type_guest');
  const formBdCode = document.getElementById('form_bd_code');
  const formBdCodeHint = document.getElementById('form_bd_code_hint');
  const formBdFullname = document.getElementById('form_bd_fullname');
  const formBdEmail = document.getElementById('form_bd_email');
  const formBdPosition = document.getElementById('form_bd_position');
  const formBdSubDept = document.getElementById('form_bd_sub_dept');
  const formBdDept = document.getElementById('form_bd_dept');
  const formBdDivision = document.getElementById('form_bd_division');

  // Modal Email Preview
  const modalEmailPreview = document.getElementById('modal_email_preview');
  const btnCloseEmailPreview = document.getElementById('btn_close_email_preview');
  const mailPreviewName = document.getElementById('mail_preview_name');
  const mailPreviewTo = document.getElementById('mail_preview_to');
  const mailPreviewSubject = document.getElementById('mail_preview_subject');
  const mailPreviewBody = document.getElementById('mail_preview_body');
  const btnSendOutlookMailto = document.getElementById('btn_send_outlook_mailto');
  const btnDownloadPreviewQr = document.getElementById('btn_download_preview_qr');
  const btnCopyEmailContent = document.getElementById('btn_copy_email_content');

  // Modal Email Template
  const modalEmailTemplate = document.getElementById('modal_email_template');
  const btnCloseEmailTemplate = document.getElementById('btn_close_email_template');
  const btnCancelEmailTemplate = document.getElementById('btn_cancel_email_template');
  const btnResetEmailTemplateDefault = document.getElementById('btn_reset_email_template_default');
  const formEmailTemplate = document.getElementById('form_email_template');
  const formTplSubject = document.getElementById('form_tpl_subject');
  const formTplBody = document.getElementById('form_tpl_body');

  // Modal Lucky Result (Celebration Card for Screenshot & Review)
  const modalLuckyResult = document.getElementById('modal_lucky_result');
  const btnCloseLuckyResult = document.getElementById('btn_close_lucky_result');
  const btnDismissLuckyResult = document.getElementById('btn_dismiss_lucky_result');
  const btnLuckyNextScan = document.getElementById('btn_lucky_next_scan');
  const btnDownloadLuckyCard = document.getElementById('btn_download_lucky_card');
  const popupLuckyNumber = document.getElementById('popup_lucky_number');
  const popupLuckyFullname = document.getElementById('popup_lucky_fullname');
  const popupLuckyCode = document.getElementById('popup_lucky_code');
  const popupLuckyPosition = document.getElementById('popup_lucky_position');
  const popupLuckyDept = document.getElementById('popup_lucky_dept');
  const popupLuckyTime = document.getElementById('popup_lucky_time');
  const popupLuckyQrCanvas = document.getElementById('popup_lucky_qr_canvas');

  // Format Lucky Number helper (3 digits, e.g. #001 to #131)
  function formatLuckyNumber(num) {
    if (!num && num !== 0) return '—';
    return String(num).padStart(3, '0');
  }

  // State
  let attendanceUsersCache = [];
  let html5QrScannerInstance = null;
  let isCameraScanning = false;
  let cameraFacingMode = 'environment';
  let selectedAttendee = null;
  let isProcessingCheckIn = false;
  let emailTemplateCache = null;

  // Web Audio Synth for Lucky Roll
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioCtx = new AudioCtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSlotTickSound() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600 + Math.random() * 600, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) { }
  }

  function playWinFanfare() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.1);
        osc.stop(ctx.currentTime + idx * 0.1 + 0.4);
      });
    } catch (e) { }
  }

  // 1. Fetch & Render Table + Stats
  async function fetchAndRenderBusinessDay() {
    if (!bdTableBody) return;
    bdTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-8 text-slate-400 font-bold">
          <div class="inline-flex items-center gap-2">
            <span class="animate-spin">🔄</span> Đang nạp danh sách điểm danh Business Day...
          </div>
        </td>
      </tr>
    `;

    try {
      const [users, stats] = await Promise.all([
        db.adminGetAttendanceUsers(),
        db.adminGetAttendanceStats()
      ]);

      attendanceUsersCache = users || [];

      // Update stats cards
      if (stats) {
        if (bdStatTotal) bdStatTotal.textContent = stats.total;
        if (bdStatAttended) bdStatAttended.textContent = stats.attended;
        if (bdStatPercent) bdStatPercent.textContent = 'người';
        if (bdStatUnattended) bdStatUnattended.textContent = stats.unattended;
        if (bdStatLuckyIssued) bdStatLuckyIssued.textContent = stats.luckyIssued ?? stats.attended;
      }

      populateFilterDropdowns(attendanceUsersCache);
      applyAttendanceFilters();
    } catch (err) {
      console.error('Lỗi nạp Business Day:', err);
      bdTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-6 text-rose-500 font-bold">
            Không thể tải dữ liệu: ${escapeHTML(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function populateFilterDropdowns(users) {
    if (!bdFilterDivision || !bdFilterDept) return;
    // Divisions
    const currentDiv = bdFilterDivision.value;
    const divisions = [...new Set(users.map(u => (u.division || '').trim()).filter(Boolean))].sort();
    let divOptions = '<option value="all">Tất cả Khối</option>';
    divisions.forEach(d => {
      divOptions += `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`;
    });
    bdFilterDivision.innerHTML = divOptions;
    if (divisions.includes(currentDiv)) bdFilterDivision.value = currentDiv;

    // Departments
    const currentDept = bdFilterDept.value;
    const depts = [...new Set(users.map(u => (u.department || '').trim()).filter(Boolean))].sort();
    let deptOptions = '<option value="all">Tất cả Phòng ban</option>';
    depts.forEach(d => {
      deptOptions += `<option value="${escapeHTML(d)}">${escapeHTML(d)}</option>`;
    });
    bdFilterDept.innerHTML = deptOptions;
    if (depts.includes(currentDept)) bdFilterDept.value = currentDept;
  }

  function applyAttendanceFilters() {
    if (!bdTableBody) return;
    const q = (bdSearchInput?.value || '').trim().toLowerCase();
    const statusVal = bdFilterStatus?.value || 'all';
    const divVal = bdFilterDivision?.value || 'all';
    const deptVal = bdFilterDept?.value || 'all';

    const filtered = attendanceUsersCache.filter(u => {
      if (statusVal === 'attended' && !u.is_attended) return false;
      if (statusVal === 'unattended' && u.is_attended) return false;
      if (divVal !== 'all' && (u.division || '').trim() !== divVal) return false;
      if (deptVal !== 'all' && (u.department || '').trim() !== deptVal) return false;

      if (q) {
        const matchCode = (u.employee_code || '').toLowerCase().includes(q);
        const matchName = (u.full_name || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchPos = (u.position || '').toLowerCase().includes(q);
        const matchDept = (u.department || '').toLowerCase().includes(q);
        const matchSub = (u.sub_department || '').toLowerCase().includes(q);
        const matchLucky = u.lucky_number ? (`#${u.lucky_number}`).includes(q) : false;
        if (!matchCode && !matchName && !matchEmail && !matchPos && !matchDept && !matchSub && !matchLucky) {
          return false;
        }
      }
      return true;
    });

    renderAttendanceTable(filtered);
  }

  function renderAttendanceTable(users) {
    if (bdTableCount) {
      bdTableCount.textContent = `Hiển thị ${users.length} / ${attendanceUsersCache.length} nhân sự tham dự`;
    }

    if (!users || users.length === 0) {
      bdTableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-slate-400 font-bold">
            Không tìm thấy nhân sự phù hợp với bộ lọc.
          </td>
        </tr>
      `;
      return;
    }

    bdTableBody.innerHTML = '';
    users.forEach((u, idx) => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition border-b border-slate-100/80';

      const isGuest = (u.division || '').toLowerCase().includes('khách') || (u.employee_code || '').startsWith('KM');
      const codeBadge = isGuest
        ? `<span class="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded font-mono font-bold text-[11px]">${escapeHTML(u.employee_code || 'KM')}</span>`
        : `<span class="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-bold text-[11px]">${escapeHTML(u.employee_code || '—')}</span>`;

      const statusBadge = u.is_attended
        ? `<div class="flex flex-col items-center">
             <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100/80 text-emerald-800">
               <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ĐÃ CHECK-IN
             </span>
             <span class="text-[10px] font-mono text-slate-400 mt-0.5">${u.attended_at ? new Date(u.attended_at).toLocaleTimeString('vi-VN') : ''}</span>
           </div>`
        : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
             Chưa điểm danh
           </span>`;

      const luckyBadge = u.lucky_number
        ? `<button class="btn-bd-view-lucky inline-block px-2.5 py-1 bg-gradient-to-r from-amber-100 to-amber-200 hover:from-amber-200 hover:to-amber-300 text-amber-900 border border-amber-300 rounded-xl font-mono font-black text-xs shadow-xs tracking-wider cursor-pointer transition active:scale-95" data-id="${u.id}" title="Bấm để xem thẻ số may mắn & chụp ảnh">#${formatLuckyNumber(u.lucky_number)}</button>`
        : `<span class="text-slate-300 font-bold">—</span>`;

      const checkInActionBtn = u.is_attended
        ? `<button class="btn-bd-view-lucky px-2 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95" data-id="${u.id}" title="Xem lại số may mắn & chụp ảnh">🎉 Xem Số</button>
           <button class="btn-bd-reset p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer" title="Hủy điểm danh để check-in lại" data-id="${u.id}">🔄 Hủy</button>`
        : `<button class="btn-bd-quick-checkin px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95" data-id="${u.id}">⚡ Check-in</button>`;

      tr.innerHTML = `
        <td class="py-3 px-3 text-center text-slate-400 font-bold">${idx + 1}</td>
        <td class="py-3 px-3">${codeBadge}</td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-900">${escapeHTML(u.full_name)}</div>
          ${u.email ? `<div class="text-[10px] text-slate-400 font-mono">${escapeHTML(u.email)}</div>` : ''}
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-700">${escapeHTML(u.position || '—')}</div>
          <div class="text-[11px] text-slate-400">${escapeHTML(u.sub_department || '')}</div>
        </td>
        <td class="py-3 px-3">
          <div class="font-bold text-slate-700">${escapeHTML(u.department || '—')}</div>
          <div class="text-[11px] text-slate-400">${escapeHTML(u.division || '')}</div>
        </td>
        <td class="py-3 px-3 text-center">${statusBadge}</td>
        <td class="py-3 px-3 text-center">${luckyBadge}</td>
        <td class="py-3 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button class="btn-bd-view-qr px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer" data-id="${u.id}" title="Xem và tải thẻ QR">
              🎫 QR
            </button>
            <button class="btn-bd-email px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer" data-id="${u.id}" title="Gửi thư mời Outlook">
              📧 Mail
            </button>
            ${checkInActionBtn}
            <button class="btn-bd-edit p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer" data-id="${u.id}" title="Chỉnh sửa thông tin">
              ✏️
            </button>
            <button class="btn-bd-delete p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition cursor-pointer" data-id="${u.id}" title="Xóa người tham dự">
              🗑️
            </button>
          </div>
        </td>
      `;

      bdTableBody.appendChild(tr);
    });

    attachTableActionListeners();
  }

  function attachTableActionListeners() {
    // 🎉 View Lucky Result Popup (Xem lại số may mắn & chụp ảnh)
    document.querySelectorAll('.btn-bd-view-lucky').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = attendanceUsersCache.find(x => x.id === btn.dataset.id);
        if (u) openLuckyResultModal(u, false);
      });
    });

    // 🎫 View QR
    document.querySelectorAll('.btn-bd-view-qr').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = attendanceUsersCache.find(x => x.id === btn.dataset.id);
        if (u) openViewQrModal(u);
      });
    });

    // 📧 Mail Outlook preview
    document.querySelectorAll('.btn-bd-email').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = attendanceUsersCache.find(x => x.id === btn.dataset.id);
        if (u) openEmailPreviewModal(u);
      });
    });

    // ⚡ Quick Check-in
    document.querySelectorAll('.btn-bd-quick-checkin').forEach(btn => {
      btn.addEventListener('click', async () => {
        const u = attendanceUsersCache.find(x => x.id === btn.dataset.id);
        if (!u) return;
        if (!confirm(`Xác nhận điểm danh cho "${u.full_name}" (${u.employee_code || 'KM'}) và quay số may mắn?`)) return;
        await triggerLuckyDrawAndCheckIn(u, () => db.adminManualCheckIn(u.id));
      });
    });

    // 🔄 Reset attendance
    document.querySelectorAll('.btn-bd-reset').forEach(btn => {
      btn.addEventListener('click', async () => {
        const u = attendanceUsersCache.find(x => x.id === btn.dataset.id);
        if (!u) return;
        if (!confirm(`Hủy điểm danh cho "${u.full_name}"?\nSố may mắn #${u.lucky_number} sẽ bị thu hồi và có thể cấp lại khi check-in.`)) return;
        const res = await db.adminResetAttendance(u.id);
        if (res.success) {
          fetchAndRenderBusinessDay();
        } else {
          showAdminAlert('Lỗi', res.message);
        }
      });
    });

    // ✏️ Edit
    document.querySelectorAll('.btn-bd-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const u = attendanceUsersCache.find(x => x.id === btn.dataset.id);
        if (u) openEditAttendanceUserModal(u);
      });
    });

    // 🗑️ Delete
    document.querySelectorAll('.btn-bd-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const u = attendanceUsersCache.find(x => x.id === btn.dataset.id);
        if (!u) return;
        if (!confirm(`Xóa vĩnh viễn nhân sự "${u.full_name}" (${u.employee_code || 'KM'}) khỏi danh sách Business Day?`)) return;
        const res = await db.adminDeleteAttendanceUser(u.id);
        if (res.success) {
          fetchAndRenderBusinessDay();
        } else {
          showAdminAlert('Lỗi xóa', res.message);
        }
      });
    });
  }

  // 2. Export Complete Pass Card PNG (with Logo, QR, Name, Code, Dept)
  function drawCardRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, radius);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }
  }

  async function generateCompleteCardDataURL(user) {
    if (!user || !user.qr_code_data) return null;

    // 1. Generate base high-resolution QR
    const qrDataUrl = await QRCode.toDataURL(user.qr_code_data, {
      width: 300,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' }
    });

    const qrImg = new Image();
    await new Promise((resolve, reject) => {
      qrImg.onload = resolve;
      qrImg.onerror = reject;
      qrImg.src = qrDataUrl;
    });

    // 2. Setup canvas: 540 width x 720 height
    const canvas = document.createElement('canvas');
    canvas.width = 540;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Outer background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 540, 720);

    // Card border container
    const cardX = 14, cardY = 14, cardW = 512, cardH = 692, cardR = 28;
    drawCardRoundedRect(ctx, cardX, cardY, cardW, cardH, cardR);
    const grad = ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.6, '#F8FAFC');
    grad.addColorStop(1, '#FEFDFB');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.textAlign = 'center';

    // Header 1: HOÀNG ANH GROUP
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('H O À N G   A N H   G R O U P', 270, 56);

    // Header 2: BUSINESS DAY 2026
    ctx.font = '900 19px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText('BUSINESS DAY 2026', 270, 84);

    // QR Box container with white background
    const qrBoxX = 130, qrBoxY = 110, qrBoxSize = 280, qrBoxR = 20;
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.06)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    drawCardRoundedRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, qrBoxR);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // Draw QR Code centered inside box
    ctx.drawImage(qrImg, qrBoxX + 14, qrBoxY + 14, 252, 252);

    // Attendee Full Name
    ctx.font = '900 24px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(user.full_name || 'Khách Mời', 270, 436);

    // MSNV Badge Pill
    const codeText = user.employee_code || 'GUEST';
    ctx.font = 'bold 14px "Courier New", monospace';
    const codeMetrics = ctx.measureText(codeText);
    const pillW = Math.max(codeMetrics.width + 24, 96);
    const pillH = 28;
    const pillX = 270 - pillW / 2;
    const pillY = 452;
    drawCardRoundedRect(ctx, pillX, pillY, pillW, pillH, 8);
    ctx.fillStyle = '#FEF3C7';
    ctx.fill();
    ctx.strokeStyle = '#FDE68A';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#B45309';
    ctx.textBaseline = 'middle';
    ctx.fillText(codeText, 270, pillY + pillH / 2 + 1);
    ctx.textBaseline = 'alphabetic';

    // Position
    let currentY = 512;
    if (user.position) {
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#334155';
      ctx.fillText(user.position, 270, currentY);
      currentY += 22;
    }

    // Department • Division
    const deptDiv = [user.department, user.division].filter(Boolean).join(' • ');
    if (deptDiv) {
      ctx.font = '500 13px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText(deptDiv, 270, currentY);
    }

    // Divider Line
    ctx.strokeStyle = '#F1F5F9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(56, 566);
    ctx.lineTo(484, 566);
    ctx.stroke();

    // Status Pill (Chỉ hiển thị khi đã check-in / có số may mắn)
    if (user.is_attended && user.lucky_number) {
      const luckyText = `🎉 ĐÃ CHECK-IN • SỐ MAY MẮN: #${formatLuckyNumber(user.lucky_number)}`;
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      const statusMetrics = ctx.measureText(luckyText);
      const sW = statusMetrics.width + 32;
      const sH = 32;
      const sX = 270 - sW / 2;
      const sY = 586;
      drawCardRoundedRect(ctx, sX, sY, sW, sH, 16);
      ctx.fillStyle = '#FEF3C7';
      ctx.fill();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.fillStyle = '#92400E';
      ctx.textBaseline = 'middle';
      ctx.fillText(luckyText, 270, sY + sH / 2);
      ctx.textBaseline = 'alphabetic';
    } else if (user.is_attended) {
      const statusText = '✅ ĐÃ ĐIỂM DANH';
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
      const statusMetrics = ctx.measureText(statusText);
      const sW = statusMetrics.width + 32;
      const sH = 32;
      const sX = 270 - sW / 2;
      const sY = 586;
      drawCardRoundedRect(ctx, sX, sY, sW, sH, 16);
      ctx.fillStyle = '#ECFDF5';
      ctx.fill();
      ctx.strokeStyle = '#A7F3D0';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#065F46';
      ctx.textBaseline = 'middle';
      ctx.fillText(statusText, 270, sY + sH / 2);
      ctx.textBaseline = 'alphabetic';
    }

    // Footnote
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('Vui lòng xuất trình thẻ này tại bàn đón tiếp sự kiện', 270, 656);

    return canvas.toDataURL('image/png');
  }

  async function downloadQRAsPNG(user) {
    if (!user || !user.qr_code_data) return;
    try {
      const cardDataUrl = await generateCompleteCardDataURL(user);
      if (!cardDataUrl) throw new Error('Không thể tạo ảnh thẻ.');
      const a = document.createElement('a');
      a.href = cardDataUrl;
      const safeCode = (user.employee_code || 'GUEST').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeName = (user.full_name || 'Attendee').replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_');
      a.download = `TheDiemDanh_BusinessDay_${safeCode}_${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error('Lỗi tải file PNG thẻ điểm danh:', e);
      alert('Không thể tạo file ảnh thẻ: ' + e.message);
    }
  }

  // 3. 1.5s Lucky Roll Animation & Check-in Execution
  async function triggerLuckyDrawAndCheckIn(attendee, checkInAction, isFromScanner = false) {
    if (isProcessingCheckIn) return;
    isProcessingCheckIn = true;

    // If check-in originated from camera scanner, stop camera & close scanner modal immediately
    if (isFromScanner) {
      await stopCameraScanner();
    }

    // Show standalone lucky roll overlay
    modalLuckyRoll.classList.remove('hidden');
    luckyRollerName.textContent = attendee.full_name + (attendee.employee_code ? ` (${attendee.employee_code})` : '');
    luckyRollerDigits.textContent = '#???';

    // Start rolling slot number animation (between 1 and total attendees)
    const maxSpin = Math.max(attendanceUsersCache.length || 131, 131);
    const rollTimer = setInterval(() => {
      const randNum = Math.floor(Math.random() * maxSpin + 1);
      luckyRollerDigits.textContent = '#' + formatLuckyNumber(randNum);
      playSlotTickSound();
    }, 60);

    // Minimum delay of 1.5s for excitement anticipation
    const minDelayPromise = new Promise(resolve => setTimeout(resolve, 1500));
    const checkInPromise = (typeof checkInAction === 'function') ? checkInAction() : checkInAction;

    try {
      const [, checkInResult] = await Promise.all([minDelayPromise, checkInPromise]);
      clearInterval(rollTimer);

      if (!checkInResult || !checkInResult.success) {
        modalLuckyRoll.classList.add('hidden');
        if (checkInResult?.reason === 'already_attended') {
          // If already attended, open their result card with existing lucky number!
          const existingUser = checkInResult.data || checkInResult.user || attendanceUsersCache.find(u => u.id === attendee.id || u.employee_code === attendee.employee_code);
          if (existingUser) {
            await openLuckyResultModal(existingUser, isFromScanner);
          } else {
            showAdminAlert('Thông báo điểm danh', checkInResult?.message || 'Nhân viên đã điểm danh trước đó.');
          }
        } else {
          showAdminAlert('Điểm danh không thành công', checkInResult?.message || 'Có lỗi xảy ra khi điểm danh.');
        }
        isProcessingCheckIn = false;
        return;
      }

      const resultUser = checkInResult.user || checkInResult.data;
      const assignedNum = resultUser?.lucky_number || checkInResult.luckyNumber;
      luckyRollerDigits.textContent = `#${formatLuckyNumber(assignedNum)}`;

      // Winning sound and confetti!
      playWinFanfare();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });

      // Brief pause then close lucky roll overlay
      await new Promise(r => setTimeout(r, 450));
      modalLuckyRoll.classList.add('hidden');

      // Refresh background table & stats
      await fetchAndRenderBusinessDay();

      // Open the dedicated screenshot-ready Lucky Result popup!
      await openLuckyResultModal(resultUser, isFromScanner);
    } catch (err) {
      clearInterval(rollTimer);
      modalLuckyRoll.classList.add('hidden');
      console.error('Lỗi check-in:', err);
      showAdminAlert('Lỗi điểm danh', err.message);
    } finally {
      isProcessingCheckIn = false;
    }
  }

  // 3b. Open Celebration Lucky Result Modal (Screenshot & Review)
  async function openLuckyResultModal(attendee, isFromScanner = false) {
    if (!attendee) return;
    selectedAttendee = attendee;

    const luckyNumStr = formatLuckyNumber(attendee.lucky_number);
    popupLuckyNumber.textContent = '#' + luckyNumStr;
    popupLuckyFullname.textContent = attendee.full_name || 'Người tham dự';
    popupLuckyCode.textContent = attendee.employee_code || 'KM';
    popupLuckyPosition.textContent = attendee.position || 'Nhân sự tham dự';
    popupLuckyDept.textContent = [attendee.department, attendee.division].filter(Boolean).join(' • ') || 'Hoàng Anh Group';

    const timeStr = attendee.attended_at
      ? new Date(attendee.attended_at).toLocaleTimeString('vi-VN') + ' - ' + new Date(attendee.attended_at).toLocaleDateString('vi-VN')
      : new Date().toLocaleTimeString('vi-VN');
    popupLuckyTime.textContent = `⏰ Check-in: ${timeStr}`;

    if (btnLuckyNextScan) {
      if (isFromScanner) {
        btnLuckyNextScan.classList.remove('hidden');
      } else {
        btnLuckyNextScan.classList.add('hidden');
      }
    }

    // Render small QR canvas thumbnail
    if (popupLuckyQrCanvas && attendee.qr_code_data) {
      try {
        await QRCode.toCanvas(popupLuckyQrCanvas, attendee.qr_code_data, {
          width: 80,
          margin: 1,
          color: { dark: '#0F172A', light: '#FFFFFF' }
        });
      } catch (e) {
        console.error('Lỗi render QR canvas thumbnail:', e);
      }
    }

    modalLuckyResult.classList.remove('hidden');
  }

  if (btnCloseLuckyResult) {
    btnCloseLuckyResult.addEventListener('click', () => modalLuckyResult.classList.add('hidden'));
  }
  if (btnDismissLuckyResult) {
    btnDismissLuckyResult.addEventListener('click', () => modalLuckyResult.classList.add('hidden'));
  }
  if (btnDownloadLuckyCard) {
    btnDownloadLuckyCard.addEventListener('click', () => {
      if (selectedAttendee) downloadQRAsPNG(selectedAttendee);
    });
  }
  if (btnLuckyNextScan) {
    btnLuckyNextScan.addEventListener('click', async () => {
      modalLuckyResult.classList.add('hidden');
      await startCameraScanner();
    });
  }

  // 4. Camera Scanner Controller
  async function startCameraScanner() {
    modalQrScanner.classList.remove('hidden');
    scannerCameraStatus.textContent = 'Đang khởi động camera...';

    if (!html5QrScannerInstance) {
      html5QrScannerInstance = new Html5Qrcode('qr_reader_viewport');
    }

    try {
      isCameraScanning = true;
      await html5QrScannerInstance.start(
        { facingMode: cameraFacingMode },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        async (decodedText) => {
          if (isProcessingCheckIn) return;
          console.log('Đã quét mã QR:', decodedText);
          const attendee = attendanceUsersCache.find(u =>
            u.qr_code_data === decodedText ||
            (u.employee_code && u.employee_code.toLowerCase() === decodedText.trim().toLowerCase())
          ) || { full_name: 'Người tham dự' };

          await triggerLuckyDrawAndCheckIn(attendee, () => db.adminCheckInQR(decodedText), true);
        },
        () => { }
      );
      scannerCameraStatus.textContent = 'Camera đang hoạt động. Đưa mã QR vào khung hình.';
    } catch (err) {
      console.error('Lỗi khởi động camera:', err);
      scannerCameraStatus.textContent = '⚠️ Không thể mở camera. Bạn có thể nhập mã thủ công bên dưới.';
      isCameraScanning = false;
    }
  }

  async function stopCameraScanner() {
    if (html5QrScannerInstance && isCameraScanning) {
      try {
        await html5QrScannerInstance.stop();
      } catch (e) { }
      isCameraScanning = false;
    }
    modalQrScanner.classList.add('hidden');
  }

  if (btnScannerSwitchCam) {
    btnScannerSwitchCam.addEventListener('click', async () => {
      cameraFacingMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
      if (html5QrScannerInstance && isCameraScanning) {
        try {
          await html5QrScannerInstance.stop();
        } catch (e) { }
        isCameraScanning = false;
        await startCameraScanner();
      }
    });
  }

  if (btnScannerManualSubmit && scannerManualCodeInput) {
    btnScannerManualSubmit.addEventListener('click', async () => {
      const codeVal = scannerManualCodeInput.value.trim();
      if (!codeVal) return;
      scannerManualCodeInput.value = '';

      if (html5QrScannerInstance && isCameraScanning) {
        try {
          await html5QrScannerInstance.stop();
          isCameraScanning = false;
        } catch (e) { }
      }

      const attendee = attendanceUsersCache.find(u =>
        u.employee_code?.toLowerCase() === codeVal.toLowerCase() ||
        u.qr_code_data === codeVal
      ) || { full_name: codeVal };

      await triggerLuckyDrawAndCheckIn(attendee, () => db.adminCheckInQR(codeVal));
    });
  }

  if (btnCloseQrScanner) {
    btnCloseQrScanner.addEventListener('click', () => {
      stopCameraScanner();
    });
  }

  // 5. View QR Modal
  async function openViewQrModal(user) {
    selectedAttendee = user;
    qrViewFullname.textContent = user.full_name;
    qrViewCode.textContent = user.employee_code || 'KM';
    qrViewPosition.textContent = user.position || 'Nhân sự tham dự';
    qrViewDept.textContent = `${user.department || ''} • ${user.division || ''}`;

    const qrViewStatusContainer = document.getElementById('qr_view_status_container');
    if (user.is_attended) {
      if (qrViewStatusContainer) qrViewStatusContainer.classList.remove('hidden');
      qrViewStatusBadge.classList.remove('hidden');
      qrViewStatusBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800';
      qrViewStatusBadge.textContent = `✅ Đã điểm danh (${user.attended_at ? new Date(user.attended_at).toLocaleTimeString('vi-VN') : ''})`;
      if (user.lucky_number) {
        qrViewLuckyBadge.classList.remove('hidden');
        qrViewLuckyBadge.textContent = `Số May Mắn: #${formatLuckyNumber(user.lucky_number)}`;
      } else {
        qrViewLuckyBadge.classList.add('hidden');
      }
    } else {
      if (qrViewStatusContainer) qrViewStatusContainer.classList.add('hidden');
      qrViewStatusBadge.classList.add('hidden');
      qrViewLuckyBadge.classList.add('hidden');
    }

    try {
      await QRCode.toCanvas(qrViewCanvas, user.qr_code_data, {
        width: 176,
        margin: 1,
        color: { dark: '#0f172a', light: '#ffffff' }
      });
    } catch (e) {
      console.error('Lỗi render QR canvas:', e);
    }

    modalViewQr.classList.remove('hidden');
  }

  if (btnCloseViewQr) {
    btnCloseViewQr.addEventListener('click', () => modalViewQr.classList.add('hidden'));
  }
  if (btnDownloadQrPng) {
    btnDownloadQrPng.addEventListener('click', () => {
      if (selectedAttendee) downloadQRAsPNG(selectedAttendee);
    });
  }
  if (btnViewQrOutlook) {
    btnViewQrOutlook.addEventListener('click', () => {
      modalViewQr.classList.add('hidden');
      if (selectedAttendee) openEmailPreviewModal(selectedAttendee);
    });
  }

  // 6. Email Preview & Outlook Trigger
  async function openEmailPreviewModal(user) {
    selectedAttendee = user;
    if (!emailTemplateCache) {
      emailTemplateCache = await db.getBusinessDayEmailTemplate();
    }

    mailPreviewName.textContent = user.full_name;
    mailPreviewTo.textContent = user.email || '(Chưa có email)';

    let subject = emailTemplateCache.subject || '';
    let body = emailTemplateCache.body || '';

    const replacements = {
      '{FULL_NAME}': user.full_name || '',
      '{MSNV}': user.employee_code || '',
      '{POSITION}': user.position || '',
      '{DEPARTMENT}': user.department || '',
      '{DIVISION}': user.division || '',
      '{EVENT_NAME}': 'Business Day 2026',
      '{DATE}': 'Cuối tháng 12/2026',
      '{LOCATION}': 'Hội trường Hoàng Anh Group'
    };

    Object.entries(replacements).forEach(([key, val]) => {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    });

    mailPreviewSubject.value = subject;
    mailPreviewBody.value = body;

    modalEmailPreview.classList.remove('hidden');
  }

  if (btnCloseEmailPreview) {
    btnCloseEmailPreview.addEventListener('click', () => modalEmailPreview.classList.add('hidden'));
  }

  if (btnDownloadPreviewQr) {
    btnDownloadPreviewQr.addEventListener('click', () => {
      if (selectedAttendee) downloadQRAsPNG(selectedAttendee);
    });
  }

  if (btnCopyEmailContent) {
    btnCopyEmailContent.addEventListener('click', async () => {
      const fullText = `Tiêu đề: ${mailPreviewSubject.value}\n\n${mailPreviewBody.value}`;
      await navigator.clipboard.writeText(fullText);
      showAdminAlert('Đã sao chép ✅', 'Nội dung thư mời đã được lưu vào khay nhớ tạm.');
    });
  }

  if (btnSendOutlookMailto) {
    btnSendOutlookMailto.addEventListener('click', () => {
      if (!selectedAttendee) return;
      // Auto-download QR PNG for convenient attachment
      downloadQRAsPNG(selectedAttendee);

      const to = selectedAttendee.email ? encodeURIComponent(selectedAttendee.email) : '';
      const subj = encodeURIComponent(mailPreviewSubject.value);
      const bdy = encodeURIComponent(mailPreviewBody.value);
      const mailtoUrl = `mailto:${to}?subject=${subj}&body=${bdy}`;

      window.location.href = mailtoUrl;

      showAdminAlert(
        'Đã mở Microsoft Outlook 📧',
        'Ảnh mã QR (.png) cũng đã được tải về máy bạn. Vui lòng đính kèm ảnh QR vừa tải vào cửa sổ Outlook và bấm Gửi!'
      );
    });
  }

  // 7. Email Template Settings Modal
  async function openEmailTemplateModal() {
    const tpl = await db.getBusinessDayEmailTemplate();
    emailTemplateCache = tpl;
    formTplSubject.value = tpl.subject || '';
    formTplBody.value = tpl.body || '';
    modalEmailTemplate.classList.remove('hidden');
  }

  if (btnBdEmailTemplate) {
    btnBdEmailTemplate.addEventListener('click', () => openEmailTemplateModal());
  }
  if (btnCloseEmailTemplate) {
    btnCloseEmailTemplate.addEventListener('click', () => modalEmailTemplate.classList.add('hidden'));
  }
  if (btnCancelEmailTemplate) {
    btnCancelEmailTemplate.addEventListener('click', () => modalEmailTemplate.classList.add('hidden'));
  }

  document.querySelectorAll('.btn-insert-tpl').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.textContent.trim();
      const pos = formTplBody.selectionStart || formTplBody.value.length;
      const text = formTplBody.value;
      formTplBody.value = text.slice(0, pos) + tag + text.slice(pos);
      formTplBody.focus();
      formTplBody.selectionStart = formTplBody.selectionEnd = pos + tag.length;
    });
  });

  if (btnResetEmailTemplateDefault) {
    btnResetEmailTemplateDefault.addEventListener('click', () => {
      formTplSubject.value = '[HOÀNG ANH] Thư Mời & Mã QR Tham Dự Sự Kiện Business Day 2026 - {FULL_NAME}';
      formTplBody.value = `Kính gửi Anh/Chị {FULL_NAME} ({MSNV} - {DEPARTMENT}),

Phòng Nhân sự trân trọng kính mời Anh/Chị tham dự Sự Kiện Business Day 2026 diễn ra vào cuối tháng 12.

THÔNG TIN ĐIỂM DANH CÁ NHÂN:
- Họ và tên: {FULL_NAME}
- Mã định danh: {MSNV}
- Phòng ban / Bộ phận: {DEPARTMENT}

Vui lòng lưu lại hình ảnh Mã QR đính kèm thư này và mang theo điện thoại khi đến tham dự sự kiện.
Khi đến bàn đón tiếp, Ban tổ chức sẽ quét mã QR của Anh/Chị để điểm danh và cấp Số May Mắn tham gia chương trình Bốc Thăm Trúng Thưởng!

Trân trọng,
Phòng Nhân Sự - Hoàng Anh Group`;
    });
  }

  if (formEmailTemplate) {
    formEmailTemplate.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updated = {
        subject: formTplSubject.value.trim(),
        body: formTplBody.value.trim()
      };
      const res = await db.saveBusinessDayEmailTemplate(updated);
      if (res.success) {
        emailTemplateCache = updated;
        modalEmailTemplate.classList.add('hidden');
        showAdminAlert('Đã lưu mẫu email ✅', 'Cấu hình thư mời Business Day đã được cập nhật thành công.');
      } else {
        showAdminAlert('Lỗi lưu mẫu email', res.message);
      }
    });
  }

  // 8. Add / Edit Attendee & Guest
  function openAddAttendanceUserModal() {
    formBdUser.reset();
    formBdUserId.value = '';
    modalBdUserTitle.textContent = 'Thêm Người Tham Dự Business Day';
    bdTypeEmployee.checked = true;
    formBdCode.readOnly = false;
    formBdCode.value = '';
    formBdCodeHint.textContent = 'Nhập MSNV công ty hoặc chọn Khách Mời để tự sinh mã.';
    modalAttendanceUser.classList.remove('hidden');
  }

  function openEditAttendanceUserModal(user) {
    formBdUserId.value = user.id;
    modalBdUserTitle.textContent = 'Chỉnh Sửa Thông Tin Người Tham Dự';
    const isGuest = (user.division || '').toLowerCase().includes('khách') || (user.employee_code || '').startsWith('KM');
    if (isGuest) bdTypeGuest.checked = true;
    else bdTypeEmployee.checked = true;

    formBdCode.value = user.employee_code || '';
    formBdCode.readOnly = user.is_attended; // If attended, lock code
    formBdFullname.value = user.full_name || '';
    formBdEmail.value = user.email || '';
    formBdPosition.value = user.position || '';
    formBdSubDept.value = user.sub_department || '';
    formBdDept.value = user.department || '';
    formBdDivision.value = user.division || 'Khối văn phòng';
    modalAttendanceUser.classList.remove('hidden');
  }

  if (bdTypeGuest) {
    bdTypeGuest.addEventListener('change', () => {
      if (bdTypeGuest.checked && !formBdUserId.value) {
        const guestCodes = attendanceUsersCache
          .map(u => u.employee_code)
          .filter(c => typeof c === 'string' && c.startsWith('KM.'));
        let maxNum = 0;
        guestCodes.forEach(c => {
          const num = parseInt(c.replace('KM.', ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        const nextCode = `KM.${String(maxNum + 1).padStart(3, '0')}`;
        formBdCode.value = nextCode;
        formBdDivision.value = 'Khách mời';
        formBdCodeHint.textContent = `Đã tự sinh mã khách mời: ${nextCode}`;
      }
    });
  }

  if (bdTypeEmployee) {
    bdTypeEmployee.addEventListener('change', () => {
      if (bdTypeEmployee.checked && !formBdUserId.value) {
        formBdCode.value = '';
        formBdDivision.value = 'Khối văn phòng';
        formBdCodeHint.textContent = 'Nhập MSNV của nhân viên công ty.';
      }
    });
  }

  if (btnBdAddUser) {
    btnBdAddUser.addEventListener('click', () => openAddAttendanceUserModal());
  }
  if (btnCloseBdUserModal) {
    btnCloseBdUserModal.addEventListener('click', () => modalAttendanceUser.classList.add('hidden'));
  }
  if (btnCancelBdUser) {
    btnCancelBdUser.addEventListener('click', () => modalAttendanceUser.classList.add('hidden'));
  }

  if (formBdUser) {
    formBdUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = formBdUserId.value;
      const payload = {
        employee_code: formBdCode.value.trim().toUpperCase(),
        full_name: formBdFullname.value.trim(),
        email: formBdEmail.value.trim() || null,
        position: formBdPosition.value.trim() || null,
        sub_department: formBdSubDept.value.trim() || null,
        department: formBdDept.value.trim() || null,
        division: formBdDivision.value.trim() || null
      };

      if (id) {
        const res = await db.adminUpdateAttendanceUser(id, payload);
        if (res.success) {
          modalAttendanceUser.classList.add('hidden');
          showAdminAlert('Cập nhật thành công ✅', `Đã lưu thông tin của "${payload.full_name}".`);
          fetchAndRenderBusinessDay();
        } else {
          showAdminAlert('Lỗi cập nhật', res.message);
        }
      } else {
        const res = await db.adminCreateAttendanceUser(payload);
        if (res.success) {
          modalAttendanceUser.classList.add('hidden');
          showAdminAlert('Thêm thành công ✅', `Đã thêm "${payload.full_name}" vào danh sách tham dự.`);
          fetchAndRenderBusinessDay();
        } else {
          showAdminAlert('Lỗi thêm mới', res.message);
        }
      }
    });
  }

  // 9. Search, Filter, Export, Refresh Events
  if (bdSearchInput) {
    bdSearchInput.addEventListener('input', () => applyAttendanceFilters());
  }
  if (bdFilterStatus) {
    bdFilterStatus.addEventListener('change', () => applyAttendanceFilters());
  }
  if (bdFilterDivision) {
    bdFilterDivision.addEventListener('change', () => applyAttendanceFilters());
  }
  if (bdFilterDept) {
    bdFilterDept.addEventListener('change', () => applyAttendanceFilters());
  }
  if (bdBtnFilterReset) {
    bdBtnFilterReset.addEventListener('click', () => {
      bdSearchInput.value = '';
      bdFilterStatus.value = 'all';
      bdFilterDivision.value = 'all';
      bdFilterDept.value = 'all';
      applyAttendanceFilters();
    });
  }

  if (btnBdRefresh) {
    btnBdRefresh.addEventListener('click', () => fetchAndRenderBusinessDay());
  }

  if (btnBdExportExcel) {
    btnBdExportExcel.addEventListener('click', async () => {
      try {
        btnBdExportExcel.disabled = true;
        btnBdExportExcel.innerHTML = '<span>⏳ Đang xuất...</span>';
        await db.adminExportAttendanceXLSX();
        showAdminAlert('Xuất thành công ✅', 'File báo cáo điểm danh Business Day đã được tải về.');
      } catch (e) {
        showAdminAlert('Lỗi xuất báo cáo', e.message);
      } finally {
        btnBdExportExcel.disabled = false;
        btnBdExportExcel.innerHTML = '<span>📊 Xuất Excel (.xlsx)</span>';
      }
    });
  }

  if (btnBdOpenScanner) {
    btnBdOpenScanner.addEventListener('click', () => startCameraScanner());
  }
});