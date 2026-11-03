/**
 * Admin Module — Game HRIS
 * Quản lý người dùng, quiz, import/export — kết nối trực tiếp Supabase.
 */

import { db, parseCSV, exportAccountsAsCSV } from './supabase.js';

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
  const adminDbMode = document.getElementById('admin_db_mode');
  const sectionUsers = document.getElementById('section_users');
  const sectionQuizzes = document.getElementById('section_quizzes');
  const sectionHistory = document.getElementById('section_history');
  const sectionImport = document.getElementById('section_import');
  const sectionFlashcards = document.getElementById('section_flashcards');

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
  const btnOpenUserModal = document.getElementById('btn_open_user_modal');
  const btnCloseUserModal = document.getElementById('btn_close_user_modal');
  const usersTableBody = document.getElementById('users_table_body');

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
    { btn: tabFlashcardsBtn, section: sectionFlashcards }
  ];

  tabConfigs.forEach(tab => {
    if (!tab.btn) return;
    tab.btn.addEventListener('click', () => {
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
      if (tab.btn === tabQuizzesBtn) fetchAndRenderQuizzes();
      if (tab.btn === tabHistoryBtn) fetchAndRenderHistory();
      if (tab.btn === tabFlashcardsBtn) fetchAndRenderFlashcardSets();
    });
  });

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

    const usersList = await db.adminGetUsers();
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
        <td class="p-3 font-mono text-slate-400 text-xs">••••</td>
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
      if (uId) {
        result = await db.adminUpdateUser(uId, userData);
        if (result.success) showAdminAlert('Cập nhật thành công ✅', `Đã cập nhật tài khoản "${userData.full_name}".`);
        else showAdminAlert('Lỗi', result.message || 'Không thể cập nhật.');
      } else {
        result = await db.adminCreateUser(userData);
        if (result.success) showAdminAlert('Thêm thành công ✅', `Đã tạo tài khoản mới cho "${userData.full_name}".`);
        else showAdminAlert('Lỗi', result.message || 'Không thể tạo tài khoản.');
      }

      if (result.success) {
        modalUser.classList.add('hidden');
        fetchAndRenderUsers();
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
          <div class="grid grid-cols-2 gap-2">
            <div>
              <p class="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Câu hỏi</p>
              <p class="text-xs font-semibold text-slate-800 leading-snug">${card.question}</p>
            </div>
            <div>
              <p class="text-[9px] font-bold text-emerald-600 uppercase mb-0.5">Câu trả lời</p>
              <p class="text-xs font-semibold text-slate-700 leading-snug">${card.answer}</p>
            </div>
          </div>
        </div>
        <div class="flex gap-1 flex-shrink-0">
          <button class="fc-edit-btn p-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-100 transition text-[11px] cursor-pointer" data-id="${card.id}" data-q="${card.question.replace(/"/g, '&quot;')}" data-a="${card.answer.replace(/"/g, '&quot;')}">✏️</button>
          <button class="fc-delete-btn p-1.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-100 transition text-[11px] cursor-pointer" data-id="${card.id}">🗑️</button>
        </div>
      `;
      flashcardsList.appendChild(item);
    });

    document.querySelectorAll('.fc-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        fcEditId.value = btn.dataset.id;
        fcQuestionInput.value = btn.dataset.q;
        fcAnswerInput.value = btn.dataset.a;
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

});
