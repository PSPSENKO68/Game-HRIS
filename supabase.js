/**
 * Game HRIS — Supabase Database Module
 * Tất cả thao tác CRUD đều kết nối thẳng đến Supabase.
 * localStorage chỉ dùng để cache session hiện tại.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Thiếu biến môi trường VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong file .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Bootstrap: Tạo tài khoản Super Admin nếu chưa tồn tại ─────────────────
// Chạy 1 lần duy nhất khi app khởi động. Admin không cần làm gì thêm.
export async function bootstrapDatabase() {
  try {
    // Kiểm tra xem bảng users có tồn tại chưa (nếu SQL chưa chạy sẽ báo lỗi)
    const { error: tableErr } = await supabase.from('users').select('id').limit(1);
    if (tableErr) {
      console.error('❌ Bảng users chưa tồn tại. Vui lòng chạy SQL schema trong Supabase Dashboard.', tableErr.message);
      return { success: false, reason: 'table_missing' };
    }

    // Đã bỏ logic tự động tạo Super Admin theo yêu cầu của user.

    // Seed cấu hình mặc định
    await supabase.from('settings').upsert({ key: 'max_plays_per_day', value: '3' });

    console.log('✅ Đã khởi tạo Super Admin thành công!');
    return { success: true, reason: 'created' };
  } catch (err) {
    console.error('Bootstrap error:', err);
    return { success: false, reason: err.message };
  }
}


function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Helper: Parse CSV text → Array of objects ───────────────────────────────
export function parseCSV(text) {
  // Tự động nhận diện delimiter: tab, phẩy, chấm phẩy
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(delimiter).map(v => v.trim().replace(/^["']|["']$/g, ''));
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] !== undefined ? values[idx] : '';
    });
    result.push(obj);
  }
  return result;
}

// ─── Helper: Parse XLSX ArrayBuffer → Array of objects ───────────────────────
function parseXLSX(arrayBuffer) {
  if (!window.XLSX) throw new Error('SheetJS (XLSX) chưa được tải.');
  const workbook = window.XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return window.XLSX.utils.sheet_to_json(worksheet, { defval: '' });
}

// ─── Export accounts.csv ─────────────────────────────────────────────────────
export async function exportAccountsAsCSV() {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Export accounts error:', error);
    return;
  }

  const rows = ['employee_code,full_name,department,pin,role,is_active,max_plays'];
  (users || []).forEach(u => {
    const maxPlays = u.max_plays !== null && u.max_plays !== undefined ? u.max_plays : '';
    rows.push(`"${u.employee_code}","${u.full_name}","${u.department}","${u.pin}","${u.role}","${u.is_active}",${maxPlays}`);
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', 'accounts.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── Main Database API ────────────────────────────────────────────────────────
export const db = {

  // ── 1. AUTH ──────────────────────────────────────────────────────────────
  async login(employeeCode, pin) {
    const code = (employeeCode || '').trim();
    const cleanPin = (pin || '').trim();

    // 1. Tìm theo employee_code (SĐT / email / mã nhân viên)
    let { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('employee_code', code)
      .limit(1);

    // 2. Nếu không thấy, tìm theo Họ và tên (full_name) không phân biệt hoa thường
    if (!users || users.length === 0) {
      const res = await supabase
        .from('users')
        .select('*')
        .ilike('full_name', code)
        .limit(1);
      users = res.data;
      error = res.error;
    }

    const user = users && users.length > 0 ? users[0] : null;

    if (error || !user) {
      return { success: false, message: 'Tài khoản không tồn tại trong hệ thống.' };
    }
    if (user.pin !== cleanPin) {
      return { success: false, message: 'Mật khẩu / Mã PIN không đúng.' };
    }
    if (!user.is_active) {
      return { success: false, message: 'Tài khoản đã bị khóa hoặc chưa kích hoạt.' };
    }
    const mustChangePassword = await db.checkMustChangePassword(user);
    return { success: true, user, mustChangePassword };
  },

  async getUserById(id) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    return data || null;
  },

  // ── 1B. RULES ĐỔI MẬT KHẨU LẦN ĐẦU (TRỪ ADMIN) ─────────────────────────
  async getFirstLoginPwdRule() {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'require_first_login_pwd_change')
      .limit(1);
    if (!error && data && data.length > 0) {
      return data[0].value !== 'false';
    }
    return true; // Mặc định BẬT quy tắc bắt đổi mật khẩu lần đầu
  },

  async setFirstLoginPwdRule(enabled) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'require_first_login_pwd_change', value: enabled ? 'true' : 'false' });
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async checkMustChangePassword(user) {
    if (!user) return false;
    const role = (user.role || 'user').toLowerCase();
    // Miễn trừ tài khoản Admin & Owner
    if (role === 'admin' || role === 'owner') return false;

    const ruleEnabled = await db.getFirstLoginPwdRule();
    if (!ruleEnabled) return false;

    if ('must_change_password' in user && user.must_change_password === false) {
      return false;
    }

    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', `pwd_changed_${user.id}`)
      .limit(1);

    if (!error && data && data.length > 0 && data[0].value) {
      return false;
    }
    return true;
  },

  async markPasswordChanged(userId) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: `pwd_changed_${userId}`, value: new Date().toISOString() });
    if (error) console.error('markPasswordChanged error:', error);
    return !error;
  },

  async resetPasswordChangedFlag(userId) {
    const { error } = await supabase
      .from('settings')
      .delete()
      .eq('key', `pwd_changed_${userId}`);
    if (error) console.error('resetPasswordChangedFlag error:', error);
    return !error;
  },

  async adminGetPasswordChangedUserIds() {
    const { data, error } = await supabase
      .from('settings')
      .select('key')
      .like('key', 'pwd_changed_%');
    if (error || !data) return new Set();
    return new Set(data.map(row => row.key.replace('pwd_changed_', '')));
  },

  async completeFirstLoginPasswordChange(userId, newPin) {
    const cleanPin = (newPin || '').trim();
    if (cleanPin.length < 4) {
      return { success: false, message: 'Mật khẩu / Mã PIN mới phải có ít nhất 4 ký tự.' };
    }

    const { data: userRow, error: fetchErr } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchErr || !userRow) {
      return { success: false, message: 'Không tìm thấy thông tin tài khoản.' };
    }

    if (userRow.pin === cleanPin) {
      return { success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại.' };
    }

    const updatePayload = { pin: cleanPin };
    if ('must_change_password' in userRow) {
      updatePayload.must_change_password = false;
    }

    const { data: updatedUser, error: updErr } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select('*')
      .single();

    if (updErr) {
      return { success: false, message: updErr.message };
    }

    await db.markPasswordChanged(userId);
    return { success: true, user: updatedUser || { ...userRow, ...updatePayload } };
  },

  // ── 2. KIỂM TRA NGÀY / LƯỢT CHƠI ────────────────────────────────────────
  isSunday() {
    return new Date().getDay() === 0;
  },

  async getPlaysToday(userId) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const { count, error } = await supabase
      .from('play_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('played_at', todayStart.toISOString())
      .lte('played_at', todayEnd.toISOString());

    if (error) {
      console.error('getPlaysToday error:', error);
      return 0;
    }
    return count || 0;
  },

  async getDailyLimit() {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'max_plays_per_day')
      .single();
    if (!error && data) return parseInt(data.value) || 3;
    return 3;
  },

  async updateDailyLimit(newLimit) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'max_plays_per_day', value: String(parseInt(newLimit) || 3) });
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // ── 3. QUIZ & CÂU HỎI ───────────────────────────────────────────────────
  async getActiveQuiz() {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .eq('active', true)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0];
  },

  async getQuizQuestions(quizId) {
    const { data: questions, error } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId);

    if (error || !questions || questions.length === 0) return [];

    const enriched = [];
    for (const q of questions) {
      const { data: answers } = await supabase
        .from('answers')
        .select('*')
        .eq('question_id', q.id);
      enriched.push({ ...q, answers: answers || [] });
    }
    return enriched;
  },

  // ── 4. LƯU KẾT QUẢ CHƠI ────────────────────────────────────────────────
  async savePlayRecord(userId, quizId, score, correctCount = 0, wrongCount = 0, timeSpent = 0, wrongAnswers = []) {
    const record = {
      id: genId('h'),
      user_id: userId,
      quiz_id: quizId,
      score: parseInt(score) || 0,
      played_at: new Date().toISOString(),
      correct_count: correctCount,
      wrong_count: wrongCount,
      time_spent: timeSpent,
      wrong_answers: wrongAnswers
    };

    const { error } = await supabase.from('play_history').insert(record);
    if (error) {
      console.error('savePlayRecord error:', error);
      return { success: false };
    }

    // Cập nhật total_score trên user (cộng dồn vào điểm hiện tại để không làm mất điểm Admin sửa)
    const { data: userData } = await supabase
      .from('users')
      .select('total_score')
      .eq('id', userId)
      .single();

    const currentTotal = parseInt(userData?.total_score) || 0;
    const newTotal = currentTotal + (parseInt(score) || 0);
    await supabase.from('users').update({ total_score: newTotal }).eq('id', userId);

    return { success: true };
  },

  // ── 5. LEADERBOARD ──────────────────────────────────────────────────────
  async getLeaderboard(limit = 20) {
    const { data, error } = await supabase
      .from('users')
      .select('id, employee_code, full_name, department, total_score, role')
      .eq('is_active', true)
      .neq('role', 'owner')
      .gt('total_score', 0)  // Chỉ lấy người có điểm > 0
      .order('total_score', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('getLeaderboard error:', error);
      return [];
    }
    return data || [];
  },

  async getUserRank(userId) {
    const { data } = await supabase
      .from('users')
      .select('id, total_score')
      .eq('is_active', true)
      .neq('role', 'owner')
      .gt('total_score', 0)  // Chỉ xếp hạng người có điểm > 0
      .order('total_score', { ascending: false });

    if (!data) return null;

    // Kiểm tra user có trong danh sách rank không (phải có điểm > 0)
    const rank = data.findIndex(u => u.id === userId);
    if (rank < 0) return null; // Không có hạng (chưa có điểm)

    // Xử lý đồng hạng: người đồng điểm có cùng hạng
    const myScore = data[rank].total_score;
    const firstWithSameScore = data.findIndex(u => u.total_score === myScore);
    return firstWithSameScore + 1;
  },

  // ── 6. ADMIN: DASHBOARD ─────────────────────────────────────────────────
  async adminGetUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('adminGetUsers error:', error);
      return [];
    }
    return data || [];
  },

  async adminGetAggregatedScores() {
    const users = await db.adminGetUsers();
    const quizzes = await db.adminGetQuizzes();

    const { data: playHistory } = await supabase.from('play_history').select('*');
    const history = playHistory || [];

    const activeQuiz = await db.getActiveQuiz();
    const currentWeekNo = activeQuiz ? activeQuiz.week_no : null;
    const currentWeekQuizIds = quizzes.filter(q => q.week_no === currentWeekNo).map(q => q.id);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3);

    return users.map(user => {
      const userHistory = history.filter(h => h.user_id === user.id);
      let weekScore = 0, monthScore = 0, quarterScore = 0;

      userHistory.forEach(h => {
        const val = parseInt(h.score) || 0;
        const d = new Date(h.played_at);
        if (currentWeekQuizIds.includes(h.quiz_id)) weekScore += val;
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) monthScore += val;
        if (Math.floor(d.getMonth() / 3) === currentQuarter && d.getFullYear() === currentYear) quarterScore += val;
      });

      return { ...user, week_score: weekScore, month_score: monthScore, quarter_score: quarterScore };
    });
  },

  // ── 7. ADMIN: QUẢN LÝ USER ──────────────────────────────────────────────
  async adminCreateUser(userData) {
    // Kiểm tra trùng employee_code
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('employee_code', userData.employee_code.trim())
      .single();

    if (existing) {
      return { success: false, message: `Tài khoản "${userData.employee_code}" đã tồn tại trong hệ thống.` };
    }

    const newUser = {
      id: genId('u'),
      employee_code: userData.employee_code.trim(),
      full_name: (userData.full_name || '').trim(),
      department: (userData.department || '').trim(),
      pin: (userData.pin || '').trim(),
      total_score: parseInt(userData.total_score) || 0,
      is_active: userData.is_active !== undefined ? userData.is_active : true,
      role: userData.role || 'user',
      max_plays: (userData.max_plays !== undefined && userData.max_plays !== '' && userData.max_plays !== null)
        ? parseInt(userData.max_plays)
        : null,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('users').insert(newUser);
    if (error) return { success: false, message: error.message };
    return { success: true, user: newUser };
  },

  async adminUpdateUser(id, updates) {
    // Dọn null/undefined trong updates
    const cleanUpdates = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) cleanUpdates[k] = v;
    }
    // max_plays đặc biệt: cho phép null
    if ('max_plays' in updates) {
      cleanUpdates.max_plays = (updates.max_plays !== '' && updates.max_plays !== undefined && updates.max_plays !== null)
        ? parseInt(updates.max_plays)
        : null;
    }

    const { error } = await supabase.from('users').update(cleanUpdates).eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

async adminDeleteUser(id) {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // ── Khóa / Mở khóa hàng loạt theo danh sách ID ──
  async adminBulkUpdateUserStatus(userIds, isActive) {
    if (!userIds || userIds.length === 0) return { success: true, count: 0 };
    let query = supabase
      .from('users')
      .update({ is_active: isActive })
      .in('id', userIds);

    if (!isActive) {
      query = query.neq('role', 'owner');
    }

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // ── Khóa / Mở khóa toàn bộ nhân viên (ngoại trừ owner/admin) ──
  async adminSetAllUsersStatus(isActive, excludeUserId = null) {
    let query = supabase
      .from('users')
      .update({ is_active: isActive })
      .neq('role', 'owner');

    if (!isActive && excludeUserId) {
      query = query.neq('id', excludeUserId);
    }

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // ── 8. ADMIN: QUẢN LÝ QUIZ ──────────────────────────────────────────────
  async adminGetQuestions(quizId) {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: true });
    if (error) return [];
    return data || [];
  },

  async adminGetQuizzes() {
    const { data, error } = await supabase
      .from('quizzes')
      .select('*')
      .order('week_no', { ascending: false });
    if (error) return [];
    return data || [];
  },

  async adminCreateQuiz(quizData) {
    const newQuiz = {
      id: genId('q'),
      title: (quizData.title || '').trim(),
      month_no: parseInt(quizData.month_no) || 1,
      week_no: parseInt(quizData.week_no) || 1,
      active: quizData.active || false,
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('quizzes').insert(newQuiz);
    if (error) return { success: false, message: error.message };
    return { success: true, quiz: newQuiz };
  },

  async adminUpdateQuiz(quizId, updates) {
    const { error } = await supabase.from('quizzes').update({
      title: updates.title,
      month_no: updates.month_no,
      week_no: updates.week_no
    }).eq('id', quizId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },


  async adminToggleQuizActive(quizId, isActive) {
    // Nếu kích hoạt, tắt các quiz khác trước
    if (isActive) {
      await supabase.from('quizzes').update({ active: false }).neq('id', quizId);
    }
    const { error } = await supabase.from('quizzes').update({ active: isActive }).eq('id', quizId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminDeleteQuiz(quizId) {
    // Cascade delete sẽ xóa questions và answers liên quan
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // ── 9. ADMIN: IMPORT QUIZ TỪ EXCEL/CSV ──────────────────────────────────
  /**
   * Import toàn bộ câu hỏi từ rows (mảng objects) vào quiz mới.
   * Format mỗi row: { 'Câu hỏi', 'Answer 1', 'Answer 2', 'Answer 3', 'Answer 4', 'Đáp án đúng' }
   */
  async adminImportQuizFromRows(rows, quizTitle, monthNo, weekNo, activateNow = false) {
    // Bước 1: Tạo Quiz mới
    const quizResult = await db.adminCreateQuiz({ title: quizTitle, month_no: monthNo, week_no: weekNo, active: false });
    if (!quizResult.success) return quizResult;

    const quizId = quizResult.quiz.id;
    let importedCount = 0;

    // Bước 2: Tạo từng câu hỏi + đáp án
    for (const row of rows) {
      const questionText = (row['Câu hỏi'] || row['question'] || row['Question'] || '').trim();
      if (!questionText) continue;

      const answers = [
        row['Answer 1'] || row['answer_1'] || row['option1'] || '',
        row['Answer 2'] || row['answer_2'] || row['option2'] || '',
        row['Answer 3'] || row['answer_3'] || row['option3'] || '',
        row['Answer 4'] || row['answer_4'] || row['option4'] || '',
      ];

      const correctIdx = parseInt(row['Đáp án đúng'] || row['correct'] || row['correct_option_index_1_to_4'] || '1') - 1;

      const point = parseInt(row['Point'] || row['point'] || row['Điểm'] || '10');
      const timeLimit = parseInt(row['Time'] || row['time'] || row['Thời gian'] || '15');

      const questionId = genId('qn');
      const { error: qErr } = await supabase.from('questions').insert({
        id: questionId,
        quiz_id: quizId,
        question_text: questionText,
        point: isNaN(point) ? 10 : point,
        time_limit: isNaN(timeLimit) ? 15 : timeLimit
      });

      if (qErr) {
        console.error('Error inserting question:', qErr);
        continue;
      }

      const answerRows = answers
        .filter(a => a.trim())
        .map((answerText, i) => ({
          id: genId('a'),
          question_id: questionId,
          answer_text: answerText.trim(),
          is_correct: i === correctIdx
        }));

      if (answerRows.length > 0) {
        await supabase.from('answers').insert(answerRows);
      }
      importedCount++;
    }

    // Bước 3: Kích hoạt nếu cần
    if (activateNow && importedCount > 0) {
      await db.adminToggleQuizActive(quizId, true);
    }

    return { success: true, importedCount, quizId };
  },

  // ── 10. ADMIN: QUẢN LÝ CÂU HỎI ─────────────────────────────────────────
  async adminGetQuestions(quizId) {
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', quizId)
      .order('id');

    if (!questions || questions.length === 0) return [];

    const enriched = [];
    for (const q of questions) {
      const { data: answers } = await supabase
        .from('answers')
        .select('*')
        .eq('question_id', q.id);
      enriched.push({ ...q, answers: answers || [] });
    }
    return enriched;
  },

  async adminCreateQuestion(quizId, questionText, answers, correctIndex, point = 10, timeLimit = 15) {
    const questionId = genId('qn');
    const { error: qErr } = await supabase.from('questions').insert({
      id: questionId,
      quiz_id: quizId,
      question_text: questionText,
      point: point,
      time_limit: timeLimit
    });
    if (qErr) return { success: false, message: qErr.message };

    const answerRows = answers.map((text, i) => ({
      id: genId('a'),
      question_id: questionId,
      answer_text: text,
      is_correct: i === parseInt(correctIndex)
    }));

    const { error: aErr } = await supabase.from('answers').insert(answerRows);
    if (aErr) return { success: false, message: aErr.message };
    return { success: true };
  },

  async adminDeleteQuestion(questionId) {
    const { error } = await supabase.from('questions').delete().eq('id', questionId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminUpdateQuestion(questionId, questionText, answers, correctIndex, point = 10, timeLimit = 15) {
    // 1. Cập nhật nội dung câu hỏi
    const { error: qErr } = await supabase
      .from('questions')
      .update({
        question_text: questionText,
        point: point,
        time_limit: timeLimit
      })
      .eq('id', questionId);
    if (qErr) return { success: false, message: qErr.message };

    // 2. Xóa toàn bộ đáp án cũ
    const { error: delErr } = await supabase
      .from('answers')
      .delete()
      .eq('question_id', questionId);
    if (delErr) return { success: false, message: delErr.message };

    // 3. Insert lại đáp án mới
    const answerRows = answers
      .filter(t => t.trim())
      .map((text, i) => ({
        id: genId('a'),
        question_id: questionId,
        answer_text: text.trim(),
        is_correct: i === parseInt(correctIndex)
      }));

    if (answerRows.length > 0) {
      const { error: aErr } = await supabase.from('answers').insert(answerRows);
      if (aErr) return { success: false, message: aErr.message };
    }

    return { success: true };
  },

  // ── 11. ADMIN: IMPORT USERS TỪ CSV/XLSX ─────────────────────────
  // phase: 'check' | 'create' | 'update'
  async adminImportUsersFromRows(rows, phase = 'check') {
    let created = 0, updated = 0;
    const duplicates = []; // danh sách tài khoản bị trùng
    const newRows = []; // dòng chưa tồn tại

    for (const row of rows) {
      const employeeCode = (row.employee_code || '').toString().trim();
      if (!employeeCode) continue;

      const userData = {
        employee_code: employeeCode,
        full_name: (row.full_name || 'Nhân viên mới').trim(),
        department: (row.department || '').trim(),
        pin: (row.pin || '1234').trim(),
        role: (row.role || 'user').trim(),
        is_active: row.is_active !== undefined ? row.is_active.toString() === 'true' : true,
        max_plays: (row.max_plays !== undefined && row.max_plays !== '') ? parseInt(row.max_plays) : null,
      };

      const { data: existing } = await supabase
        .from('users')
        .select('id, full_name, employee_code, pin')
        .eq('employee_code', employeeCode)
        .single();

      if (existing) {
        duplicates.push({ ...userData, existingId: existing.id, existingPin: existing.pin });
      } else {
        newRows.push(userData);
      }
    }

    // Phase 'check': chỉ trả về danh sách trùng — chưa đụng DB
    if (phase === 'check') {
      return { success: true, duplicates, newCount: newRows.length };
    }

    // Phase 'create': chỉ tạo những tài khoản mới (không trùng)
    if (phase === 'create') {
      for (const userData of newRows) {
        const newUser = {
          id: genId('u'),
          ...userData,
          total_score: 0,
          created_at: new Date().toISOString()
        };
        const { error } = await supabase.from('users').insert(newUser);
        if (!error) created++;
        else console.error('Import user error:', error);
      }
      return { success: true, created, updated: 0 };
    }

    // Phase 'update': tạo mới và cập nhật cả trùng
    if (phase === 'update') {
      // Tạo mới
      for (const userData of newRows) {
        const newUser = {
          id: genId('u'),
          ...userData,
          total_score: 0,
          created_at: new Date().toISOString()
        };
        const { error } = await supabase.from('users').insert(newUser);
        if (!error) created++;
        else console.error('Import user error:', error);
      }
      // Cập nhật trùng
      for (const userData of duplicates) {
        await supabase.from('users').update({
          full_name: userData.full_name,
          department: userData.department,
          pin: userData.pin,
          role: userData.role,
          is_active: userData.is_active,
          max_plays: userData.max_plays
        }).eq('id', userData.existingId);
        // Nếu PIN thay đổi (ví dụ reset lại mật khẩu mặc định), yêu cầu đổi mật khẩu lại ở lần đăng nhập tới
        if (userData.existingPin !== userData.pin) {
          await db.resetPasswordChangedFlag(userData.existingId);
        }
        updated++;
      }
      return { success: true, created, updated };
    }

    return { success: false, message: 'Phase không hợp lệ' };
  },

  // ── 13. EXPORT BÁO CÁO ĐIỂM SỐ (XLSX) ──────────────────────────────────
  async adminExportScoresXLSX(period = 'total') {
    const aggregated = await db.adminGetAggregatedScores();
    if (!window.XLSX) {
      alert('SheetJS chưa được tải. Vui lòng tải lại trang.');
      return;
    }

    const scoreField = period === 'week' ? 'week_score'
      : period === 'month' ? 'month_score'
        : period === 'quarter' ? 'quarter_score'
          : 'total_score';

    const rows = aggregated
      .filter(u => u.role !== 'owner')
      .sort((a, b) => (b[scoreField] || 0) - (a[scoreField] || 0))
      .map((u, i) => ({
        'STT': i + 1,
        'Tài khoản': u.employee_code,
        'Họ Tên': u.full_name,
        'Phòng Ban': u.department,
        'Điểm Tuần': u.week_score || 0,
        'Điểm Tháng': u.month_score || 0,
        'Điểm Quý': u.quarter_score || 0,
        'Tổng Điểm': u.total_score || 0,
        'Trạng Thái': u.is_active ? 'Hoạt động' : 'Tạm khóa'
      }));

    const ws = window.XLSX.utils.json_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Báo Cáo Điểm');

    const periodLabel = period === 'week' ? 'Tuan' : period === 'month' ? 'Thang' : period === 'quarter' ? 'Quy' : 'ToanPhan';
    window.XLSX.writeFile(wb, `BaoCaoDiem_${periodLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  // ── 10. ADMIN: LỊCH SỬ THI ĐẤU VÀ THỐNG KÊ ──────────────────────────────
  async adminGetPlayHistory() {
    const { data, error } = await supabase
      .from('play_history')
      .select(`
        *,
        users ( full_name, employee_code, department ),
        quizzes ( title, month_no, week_no )
      `)
      .order('played_at', { ascending: false });
    if (error) {
      console.error('adminGetPlayHistory error:', error);
      return [];
    }
    return data || [];
  },

  async adminGetQuizParticipantCount() {
    // Gom nhóm user_id duy nhất cho mỗi bộ đề
    const { data, error } = await supabase
      .from('play_history')
      .select('quiz_id, user_id');

    if (error) return {};

    const counts = {};
    const seen = {};

    (data || []).forEach(row => {
      if (!seen[row.quiz_id]) seen[row.quiz_id] = new Set();
      seen[row.quiz_id].add(row.user_id);
    });

    for (const quizId in seen) {
      counts[quizId] = seen[quizId].size;
    }

    return counts;
  },

  // ── FLASHCARD API ────────────────────────────────────────────────────────

  async adminGetFlashcardSets() {
    const { data, error } = await supabase
      .from('flashcard_sets')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  },

  async adminCreateFlashcardSet(title, description = '', category = '') {
    const newSet = {
      id: genId('fs'),
      title: title.trim(),
      description: description.trim(),
      category: category.trim(),
      active: false,
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('flashcard_sets').insert(newSet);
    if (error) return { success: false, message: error.message };
    return { success: true, set: newSet };
  },

  async adminUpdateFlashcardSet(setId, updates) {
    const { error } = await supabase
      .from('flashcard_sets')
      .update({ title: updates.title, description: updates.description, category: updates.category })
      .eq('id', setId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminToggleFlashcardSetActive(setId, isActive) {
    const { error } = await supabase
      .from('flashcard_sets')
      .update({ active: isActive })
      .eq('id', setId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminDeleteFlashcardSet(setId) {
    const { error } = await supabase.from('flashcard_sets').delete().eq('id', setId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminGetFlashcards(setId) {
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .eq('set_id', setId)
      .order('created_at', { ascending: true });
    if (error) return [];
    const list = data || [];
    // Thứ tự tự nhiên: nếu câu hỏi bắt đầu bằng số (1, 2, 10...), sắp xếp theo số,
    // nếu không thì theo thứ tự tạo created_at
    list.sort((a, b) => {
      const numA = parseInt((a.question || '').match(/^\s*(\d+)/)?.[1]);
      const numB = parseInt((b.question || '').match(/^\s*(\d+)/)?.[1]);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
    return list;
  },

  async adminCreateFlashcard(setId, question, answer) {
    const newCard = {
      id: genId('fc'),
      set_id: setId,
      question: question.trim(),
      answer: answer.trim(),
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('flashcards').insert(newCard);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminUpdateFlashcard(cardId, question, answer) {
    const { error } = await supabase
      .from('flashcards')
      .update({ question: question.trim(), answer: answer.trim() })
      .eq('id', cardId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminDeleteFlashcard(cardId) {
    const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminImportFlashcardsFromRows(rows, setTitle, category = '') {
    const setResult = await db.adminCreateFlashcardSet(setTitle, '', category);
    if (!setResult.success) return setResult;
    const setId = setResult.set.id;
    let importedCount = 0;
    const baseTime = Date.now();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const question = (row['Cau hoi'] || row['question'] || row['Question'] || row['front'] || '').trim();
      const answer = (row['Cau tra loi'] || row['answer'] || row['Answer'] || row['back'] || '').trim();
      if (!question || !answer) continue;
      const { error } = await supabase.from('flashcards').insert({
        id: genId('fc'),
        set_id: setId,
        question,
        answer,
        created_at: new Date(baseTime + i * 100).toISOString()
      });
      if (!error) importedCount++;
    }
    return { success: true, importedCount, setId };
  },

  async getActiveFlashcardSets() {
    const { data, error } = await supabase
      .from('flashcard_sets')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data;
  },

  async getFlashcardsForStudy(userId, setId) {
    const { data: cards, error } = await supabase
      .from('flashcards').select('*').eq('set_id', setId).order('created_at', { ascending: true });
    if (error || !cards) return [];

    // Thứ tự tự nhiên: nếu câu hỏi bắt đầu bằng số (1, 2, 10...), sắp xếp theo số,
    // nếu không thì theo thứ tự tạo created_at
    cards.sort((a, b) => {
      const numA = parseInt((a.question || '').match(/^\s*(\d+)/)?.[1]);
      const numB = parseInt((b.question || '').match(/^\s*(\d+)/)?.[1]);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });

    const cardIds = cards.map(c => c.id);
    const { data: progress } = await supabase
      .from('flashcard_progress').select('*').eq('user_id', userId).in('flashcard_id', cardIds);
    const progressMap = {};
    (progress || []).forEach(p => { progressMap[p.flashcard_id] = p; });
    const now = new Date();
    const enriched = cards.map(card => {
      const prog = progressMap[card.id];
      return {
        ...card,
        status: prog?.status || 'new',
        next_review: prog?.next_review ? new Date(prog.next_review) : now,
        review_count: prog?.review_count || 0
      };
    });
    // Giữ nguyên thứ tự câu hỏi gốc, không xáo trộn thứ tự theo spaced repetition
    return enriched;
  },

  async saveFlashcardProgress(userId, flashcardId, status) {
    const now = new Date();
    let nextReview = new Date(now);
    if (status === 'known') nextReview.setDate(nextReview.getDate() + 7);
    else if (status === 'learning') nextReview.setDate(nextReview.getDate() + 1);
    // review: next_review = now
    const { data: existing } = await supabase
      .from('flashcard_progress').select('review_count')
      .eq('user_id', userId).eq('flashcard_id', flashcardId).single();
    const newCount = (existing?.review_count || 0) + 1;
    const record = {
      id: genId('fp'), user_id: userId, flashcard_id: flashcardId,
      status, next_review: nextReview.toISOString(), review_count: newCount,
      updated_at: now.toISOString()
    };
    const { error } = await supabase
      .from('flashcard_progress').upsert(record, { onConflict: 'user_id,flashcard_id' });
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async getFlashcardSetStats(userId, setId) {
    const { data: cards } = await supabase.from('flashcards').select('id').eq('set_id', setId);
    if (!cards || cards.length === 0) return { total: 0, known: 0, learning: 0, review: 0, new: 0 };
    const cardIds = cards.map(c => c.id);
    const { data: progress } = await supabase
      .from('flashcard_progress').select('status').eq('user_id', userId).in('flashcard_id', cardIds);
    const stats = { total: cards.length, known: 0, learning: 0, review: 0, new: 0 };
    (progress || []).forEach(p => { if (stats[p.status] !== undefined) stats[p.status]++; });
    stats.new = Math.max(0, cards.length - (stats.known + stats.learning + stats.review));
    return stats;
  },

  // ── 14. BUSINESS DAY 2026: QR CHECK-IN & SỰ KIỆN ĐIỂM DANH ───────────────

  async adminGetAttendanceUsers(filter = {}) {
    let query = supabase.from('attendance_users').select('*');

    if (filter.status === 'attended') {
      query = query.eq('is_attended', true);
    } else if (filter.status === 'unattended') {
      query = query.eq('is_attended', false);
    }

    if (filter.department && filter.department !== 'all') {
      query = query.eq('department', filter.department);
    }

    if (filter.division && filter.division !== 'all') {
      query = query.eq('division', filter.division);
    }

    query = query.order('stt', { ascending: true, nullsFirst: false });
    const { data, error } = await query;
    if (error) {
      console.error('adminGetAttendanceUsers error:', error);
      return [];
    }
    let list = data || [];

    if (filter.search) {
      const q = filter.search.toLowerCase().trim();
      list = list.filter(u =>
        (u.full_name || '').toLowerCase().includes(q) ||
        (u.employee_code || '').toLowerCase().includes(q) ||
        (u.department || '').toLowerCase().includes(q) ||
        (u.position || '').toLowerCase().includes(q)
      );
    }
    return list;
  },

  async adminGetAttendanceStats() {
    const { data, error } = await supabase
      .from('attendance_users')
      .select('is_attended, department, division');

    if (error || !data) {
      return { total: 0, attended: 0, unattended: 0, attendedPct: 0, departments: [], divisions: [] };
    }

    const total = data.length;
    const attended = data.filter(u => u.is_attended).length;
    const unattended = total - attended;
    const attendedPct = total > 0 ? Math.round((attended / total) * 100) : 0;

    const deptSet = new Set();
    const divSet = new Set();
    data.forEach(u => {
      if (u.department) deptSet.add(u.department);
      if (u.division) divSet.add(u.division);
    });

    return {
      total,
      attended,
      unattended,
      attendedPct,
      departments: Array.from(deptSet).sort(),
      divisions: Array.from(divSet).sort()
    };
  },

  async _assignLuckyNumber() {
    const { data: users } = await supabase
      .from('attendance_users')
      .select('lucky_number')
      .not('lucky_number', 'is', null);

    const taken = new Set((users || []).map(u => u.lucky_number));

    // Dải số may mắn 3 chữ số từ 101 đến 999
    const available = [];
    for (let n = 101; n <= 999; n++) {
      if (!taken.has(n)) available.push(n);
    }

    if (available.length === 0) {
      for (let n = 1000; n <= 9999; n++) {
        if (!taken.has(n)) { available.push(n); break; }
      }
    }

    const randomIdx = Math.floor(Math.random() * available.length);
    return available[randomIdx];
  },

  async adminCheckInQR(qrInput) {
    const code = (qrInput || '').trim();
    if (!code) return { success: false, reason: 'empty', message: 'Mã QR trống!' };

    // 1. Tìm theo qr_code_data trước
    let { data: users } = await supabase
      .from('attendance_users')
      .select('*')
      .eq('qr_code_data', code)
      .limit(1);

    // 2. Nếu không thấy, tìm theo MSNV (phòng hờ nhập MSNV trực tiếp)
    if (!users || users.length === 0) {
      const res = await supabase
        .from('attendance_users')
        .select('*')
        .ilike('employee_code', code)
        .limit(1);
      users = res.data;
    }

    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      return { success: false, reason: 'not_found', message: 'Không tìm thấy nhân viên/khách mời với mã này!' };
    }

    if (user.is_attended) {
      const timeStr = user.attended_at ? new Date(user.attended_at).toLocaleTimeString('vi-VN') : '';
      return {
        success: false,
        reason: 'already_attended',
        user,
        message: `Mã này ĐÃ ĐƯỢC ĐIỂM DANH lúc ${timeStr} với Số may mắn: #${user.lucky_number}`
      };
    }

    // 3. Chưa điểm danh → cấp số may mắn & ghi nhận
    const luckyNumber = await this._assignLuckyNumber();
    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from('attendance_users')
      .update({
        is_attended: true,
        attended_at: now,
        lucky_number: luckyNumber
      })
      .eq('id', user.id)
      .select('*')
      .single();

    if (updErr) {
      return { success: false, reason: 'error', message: updErr.message };
    }

    return {
      success: true,
      user: updated,
      luckyNumber
    };
  },

  async adminManualCheckIn(userId) {
    const { data: user, error } = await supabase
      .from('attendance_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return { success: false, message: 'Không tìm thấy nhân viên.' };
    }

    if (user.is_attended) {
      return { success: false, message: `Nhân viên "${user.full_name}" đã điểm danh trước đó với số #${user.lucky_number}.` };
    }

    const luckyNumber = await this._assignLuckyNumber();
    const now = new Date().toISOString();

    const { data: updated, error: updErr } = await supabase
      .from('attendance_users')
      .update({
        is_attended: true,
        attended_at: now,
        lucky_number: luckyNumber
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (updErr) return { success: false, message: updErr.message };
    return { success: true, user: updated, luckyNumber };
  },

  async adminCreateAttendanceUser(userData) {
    const rawCode = (userData.employee_code || '').trim();
    let employeeCode = rawCode;

    // Nếu không nhập mã (ví dụ khách mời), tự động sinh KM.xxx
    if (!employeeCode) {
      const { data: allUsers } = await supabase.from('attendance_users').select('employee_code');
      const kmCodes = (allUsers || [])
        .map(u => u.employee_code)
        .filter(c => /^KM\.\d+$/i.test(c))
        .map(c => parseInt(c.replace(/^KM\./i, '')))
        .filter(n => !isNaN(n));
      const nextKm = (kmCodes.length > 0 ? Math.max(...kmCodes) : 0) + 1;
      employeeCode = 'KM.' + String(nextKm).padStart(3, '0');
    }

    // Kiểm tra trùng mã
    const { data: existing } = await supabase
      .from('attendance_users')
      .select('id')
      .eq('employee_code', employeeCode)
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: false, message: `Mã "${employeeCode}" đã tồn tại trong danh sách sự kiện!` };
    }

    const { count } = await supabase.from('attendance_users').select('*', { count: 'exact', head: true });
    const nextStt = (count || 0) + 1;

    const cleanCode = employeeCode.replace(/[^A-Za-z0-9]/g, '');
    const secret = Math.random().toString(36).substring(2, 8).toUpperCase();
    const qrCodeData = `HABD26_${cleanCode}_${secret}`;

    const newObj = {
      id: genId('att'),
      stt: nextStt,
      employee_code: employeeCode,
      full_name: (userData.full_name || '').trim(),
      email: (userData.email || '').trim(),
      position: (userData.position || 'Khách mời').trim(),
      department: (userData.department || 'Khách mời').trim(),
      sub_department: (userData.sub_department || '').trim(),
      division: (userData.division || 'Khách mời').trim(),
      qr_code_data: qrCodeData,
      is_attended: false,
      attended_at: null,
      lucky_number: null,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('attendance_users').insert(newObj);
    if (error) return { success: false, message: error.message };
    return { success: true, user: newObj };
  },

  async adminUpdateAttendanceUser(id, updates) {
    const cleanUpdates = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) cleanUpdates[k] = v;
    }
    const { error } = await supabase
      .from('attendance_users')
      .update(cleanUpdates)
      .eq('id', id);

    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminDeleteAttendanceUser(id) {
    const { error } = await supabase.from('attendance_users').delete().eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminResetAttendance(userId = null) {
    let query = supabase.from('attendance_users').update({
      is_attended: false,
      attended_at: null,
      lucky_number: null
    });

    if (userId) {
      query = query.eq('id', userId);
    } else {
      query = query.neq('id', 'placeholder_never_match');
    }

    const { error } = await query;
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  async adminExportAttendanceXLSX() {
    const { data: users, error } = await supabase
      .from('attendance_users')
      .select('*')
      .order('stt', { ascending: true });

    if (error || !users || users.length === 0) {
      alert('Chưa có dữ liệu nhân sự để xuất file.');
      return;
    }

    if (!window.XLSX) {
      alert('SheetJS (XLSX) chưa được tải.');
      return;
    }

    const rows = users.map((u, i) => ({
      'STT': u.stt || (i + 1),
      'MSNV': u.employee_code,
      'Họ và tên': u.full_name,
      'Email': u.email || '—',
      'Vị trí': u.position || '—',
      'Phòng ban': u.department || '—',
      'Bộ phận': u.sub_department || '—',
      'Khối': u.division || '—',
      'Trạng thái': u.is_attended ? 'ĐÃ ĐIỂM DANH' : 'Chưa điểm danh',
      'Giờ điểm danh': u.attended_at ? new Date(u.attended_at).toLocaleString('vi-VN') : '—',
      'Số may mắn': u.lucky_number ? `#${u.lucky_number}` : '—',
      'Mã QR Token': u.qr_code_data
    }));

    const ws = window.XLSX.utils.json_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Diem Danh Business Day 2026');

    const fileName = `BaoCao_DiemDanh_BusinessDay_${new Date().toISOString().slice(0, 10)}.xlsx`;
    window.XLSX.writeFile(wb, fileName);
  },

  async getBusinessDayEmailTemplate() {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'bd_email_template')
      .limit(1);

    if (data && data.length > 0 && data[0].value) {
      try {
        return JSON.parse(data[0].value);
      } catch (e) {}
    }

    return {
      subject: '[HOÀNG ANH] Thư Mời & Mã QR Tham Dự Sự Kiện Business Day 2026 - {FULL_NAME}',
      body: `Kính gửi Anh/Chị {FULL_NAME} ({MSNV} - {DEPARTMENT}),

Phòng Nhân sự trân trọng kính mời Anh/Chị tham dự Sự Kiện Business Day 2026 diễn ra vào cuối tháng 12.

THÔNG TIN ĐIỂM DANH CÁ NHÂN:
- Họ và tên: {FULL_NAME}
- Mã định danh: {MSNV}
- Phòng ban / Bộ phận: {DEPARTMENT}

Vui lòng lưu lại hình ảnh Mã QR đính kèm thư này và mang theo điện thoại khi đến tham dự sự kiện.
Khi đến bàn đón tiếp, Ban tổ chức sẽ quét mã QR của Anh/Chị để điểm danh và cấp Số May Mắn tham gia chương trình Bốc Thăm Trúng Thưởng!

Trân trọng,
Phòng Nhân Sự - Hoàng Anh Group`
    };
  },

  async saveBusinessDayEmailTemplate(template) {
    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'bd_email_template',
        value: JSON.stringify(template)
      });
    if (error) return { success: false, message: error.message };
    return { success: true };
  }
};
