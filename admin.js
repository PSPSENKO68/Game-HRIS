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
  const tabImportBtn = document.getElementById('tab_import_btn');
  const adminDbMode = document.getElementById('admin_db_mode');
  const sectionUsers = document.getElementById('section_users');
  const sectionQuizzes = document.getElementById('section_quizzes');
  const sectionImport = document.getElementById('section_import');

  // User Modal
  const modalUser = document.getElementById('modal_user');
  const formUser = document.getElementById('form_user');
  const formUserId = document.getElementById('form_user_id');
  const formUserCode = document.getElementById('form_user_code');
  const formUserFullName = document.getElementById('form_user_fullname');
  const formUserDept = document.getElementById('form_user_dept');
  const formUserPin = document.getElementById('form_user_pin');
  const formUserMaxPlays = document.getElementById('form_user_max_plays');
  const formUserActive = document.getElementById('form_user_active');
  const btnOpenUserModal = document.getElementById('btn_open_user_modal');
  const btnCloseUserModal = document.getElementById('btn_close_user_modal');
  const usersTableBody = document.getElementById('users_table_body');

  // Quiz Modal
  const quizzesContainer = document.getElementById('quizzes_container');
  const modalQuiz = document.getElementById('modal_quiz');
  const formQuiz = document.getElementById('form_quiz');
  const formQuizTitle = document.getElementById('form_quiz_title');
  const formQuizWeek = document.getElementById('form_quiz_week');
  const formQuizActive = document.getElementById('form_quiz_active');
  const btnOpenQuizModal = document.getElementById('btn_open_quiz_modal');
  const btnCloseQuizModal = document.getElementById('btn_close_quiz_modal');

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
  const tabs = [
    { btn: tabUsersBtn, section: sectionUsers },
    { btn: tabQuizzesBtn, section: sectionQuizzes },
    { btn: tabImportBtn, section: sectionImport }
  ];

  tabs.forEach(tab => {
    if (!tab.btn) return;
    tab.btn.addEventListener('click', () => {
      tabs.forEach(t => {
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
    });
  });

  // ── 1. USERS MANAGEMENT ──────────────────────────────────────────────────────
  async function fetchAndRenderUsers() {
    if (!usersTableBody) return;
    usersTableBody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400">Đang nạp danh sách...</td></tr>`;

    const usersList = await db.adminGetUsers();
    usersTableBody.innerHTML = '';

    if (!usersList || usersList.length === 0) {
      usersTableBody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400 italic">Chưa có nhân viên nào. Hãy thêm mới hoặc import từ file.</td></tr>`;
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
        <td class="p-3 font-mono text-slate-700 text-xs">${u.employee_code}</td>
        <td class="p-3 font-bold text-slate-900">${u.full_name}</td>
        <td class="p-3">${roleBadge}</td>
        <td class="p-3 text-slate-500 text-xs">${u.department || '—'}</td>
        <td class="p-3 font-mono text-slate-400 text-xs">••••</td>
        <td class="p-3 text-center">${limitDisplay}</td>
        <td class="p-3 text-center font-extrabold text-indigo-600 font-['Space_Grotesk']">${u.total_score || 0}đ</td>
        <td class="p-3 text-center">
          <button class="toggle-active-btn inline-flex px-2.5 py-1 text-[10px] font-bold rounded-lg cursor-pointer ${
            u.is_active
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

    const qList = await db.adminGetQuizzes();
    quizzesContainer.innerHTML = '';

    if (!qList || qList.length === 0) {
      quizzesContainer.innerHTML = '<p class="text-slate-400 col-span-2 p-4 italic">Chưa có đề thi nào. Import từ Excel hoặc tạo mới.</p>';
      return;
    }

    qList.forEach(q => {
      const card = document.createElement('div');
      card.className = `p-5 rounded-3xl border shadow-xs transition duration-150 flex flex-col justify-between ${
        q.active ? 'bg-indigo-900 border-indigo-950 text-white relative overflow-hidden' : 'bg-white border-slate-200 text-slate-800'
      }`;
      card.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-3.5">
            <span class="inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
              q.active ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-500 border border-slate-200'
            }">Tuần ${q.week_no}</span>
            <div class="flex items-center space-x-1.5 text-xs font-bold">
              <input type="checkbox" class="quiz-toggle-active-chk cursor-pointer w-4 h-4 rounded" data-id="${q.id}" ${q.active ? 'checked' : ''} />
              <span>Kích hoạt</span>
            </div>
          </div>
          <h3 class="font-extrabold text-sm mb-4 leading-snug font-['Space_Grotesk']">${q.title}</h3>
        </div>
        <div class="flex items-center justify-between pt-4 border-t ${q.active ? 'border-white/10' : 'border-slate-100'}">
          <button class="view-q-questions-btn px-3 py-1.5 border hover:opacity-90 active:scale-95 text-[10px] font-bold rounded-xl transition cursor-pointer ${
            q.active ? 'bg-white/15 text-white border-white/20 hover:bg-white/25' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
          }" data-id="${q.id}" data-title="${q.title}" data-week="${q.week_no}">🔍 Xem câu hỏi</button>
          <button class="delete-quiz-btn px-2 py-1.5 text-[10px] font-bold rounded-xl hover:opacity-90 active:scale-95 transition flex items-center gap-1 cursor-pointer ${
            q.active ? 'bg-rose-500/20 text-rose-200 border border-rose-500/30' : 'bg-rose-50 text-rose-600 border border-rose-200'
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
        showQuizQuestions(qId, title, week);
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

  async function showQuizQuestions(quizId, title, weekLabel) {
    currentExpandedQuizId = quizId;
    if (selectedQuizSubtitle) selectedQuizSubtitle.textContent = `QUIZ • Tuần ${weekLabel}`;
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
            <button class="edit-question-btn p-1.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-100 transition inline-flex items-center cursor-pointer text-[10px] font-bold gap-1" data-id="${q.id}" data-qtext="${encodeURIComponent(q.question_text)}" data-point="${q.point || 10}" data-time="${q.time_limit || 15}" data-answers='${JSON.stringify((q.answers || []).map(a => ({text: a.answer_text, correct: a.is_correct})))}' title="Sửa câu hỏi">✏️ Sửa</button>
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
          showQuizQuestions(quizId, title, weekLabel);
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
        try { answers = JSON.parse(btn.getAttribute('data-answers') || '[]'); } catch (_) {}

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

  // Quiz Modal: Open
  if (btnOpenQuizModal) {
    btnOpenQuizModal.addEventListener('click', () => {
      formQuiz.reset();
      modalQuiz.classList.remove('hidden');
    });
  }
  if (btnCloseQuizModal) {
    btnCloseQuizModal.addEventListener('click', () => modalQuiz.classList.add('hidden'));
  }

  if (formQuiz) {
    formQuiz.addEventListener('submit', async (e) => {
      e.preventDefault();
      const result = await db.adminCreateQuiz({
        title: formQuizTitle.value.trim(),
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
          const text = await file.text();
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
          const result = await db.adminImportUsersFromRows(rows, false);
          showAdminAlert('Kết quả Import ✅', `Tạo mới: ${result.created} | Cập nhật: ${result.updated} | Bỏ qua: ${result.skipped}`);
          fetchAndRenderUsers();
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

  // ── Initial render ───────────────────────────────────────────────────────────
  fetchAndRenderUsers();
});
