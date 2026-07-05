/**
 * Quiz results display script
 * Pulls current session result logs, validates retry limits, and guides navigation back to active play.
 */

import { db } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Authenticate check
  const sessionUser = sessionStorage.getItem('current_user');
  if (!sessionUser) {
    window.location.replace('/login.html');
    return;
  }
  const user = JSON.parse(sessionUser);

  // Get elements
  const scoreEarned = document.getElementById('score_earned');
  const correctCounter = document.getElementById('correct_counter');
  const bonusBadge = document.getElementById('bonus_badge');
  const userFeedbackMsg = document.getElementById('user_feedback_msg');

  const btnRetryQuiz = document.getElementById('btn_retry_quiz');
  const retryLimitModal = document.getElementById('retry_limit_modal');
  const closeLimitModal = document.getElementById('close_limit_modal');

  // Load latest state from session
  const score = parseInt(sessionStorage.getItem('last_quiz_score') || '0');
  const correct = parseInt(sessionStorage.getItem('last_quiz_correct_count') || '0');
  const total = parseInt(sessionStorage.getItem('last_quiz_total_questions') || '10');
  const bonus = parseInt(sessionStorage.getItem('last_quiz_bonus') || '20');

  const totalScoreDisplay = document.getElementById('total_score_display');

  // Populate UI elements
  if (scoreEarned) scoreEarned.textContent = score;
  if (correctCounter) correctCounter.textContent = `${correct}/${total}`;
  if (bonusBadge) bonusBadge.textContent = `+${bonus}đ`;

  // Fetch và hiển thị tổng điểm tích lũy mới nhất từ DB và Hạng
  if (totalScoreDisplay) {
    try {
      const freshUser = await db.getUserById(user.id);
      const totalScore = freshUser ? (freshUser.total_score || 0) : 0;
      totalScoreDisplay.innerHTML = `<span class="text-[#E9C691]">${totalScore}</span> <span class="text-white/50 text-base font-bold">điểm</span>`;

      const rankBadge = document.getElementById('rank_badge');
      if (rankBadge) {
        const rank = await db.getUserRank(user.id);
        if (rank) {
          rankBadge.textContent = `Hạng #${rank}`;
          // Kích hoạt animation nảy lên
          setTimeout(() => {
            rankBadge.classList.add('rank-animate');
          }, 300);
        } else {
          // Chưa có điểm → ẩn badge hạng
          rankBadge.style.display = 'none';
        }
      }
    } catch (_) {
      totalScoreDisplay.textContent = '—';
    }
  }

  // Dynamic feedback personalized comments
  if (userFeedbackMsg) {
    let comment = '';
    if (correct === total) {
      comment = `Tuyệt đỉnh! Bạn trả lời đúng tuyệt đối ${correct}/${total} câu hỏi! Tặng bạn ${bonus} điểm thưởng hoàn thành! 🏆`;
    } else if (correct >= 8) {
      comment = `Rất Xuất Sắc! Đúng ${correct}/${total} câu hỏi chính sách bảo mật & văn hóa doanh nghiệp. Tiếp tục phát huy nhé! 🎉`;
    } else if (correct >= 5) {
      comment = `Khá tốt! Bạn đạt được ${correct}/${total} câu trả lời chuẩn xác. Hãy lưu tâm thêm về quy chế công ty nhé! 👍`;
    } else {
      comment = `Hãy cố gắng thêm! Trả lời đúng ${correct}/${total} câu hỏi chưa tối ưu. Hãy thử sức lại để thăng cấp điểm! 💪`;
    }
    userFeedbackMsg.textContent = comment;
  }

  // Handle Retry click routine
  if (btnRetryQuiz) {
    btnRetryQuiz.addEventListener('click', async () => {
      // 1. Refresh count of plays today
      btnRetryQuiz.disabled = true;
      const initialText = btnRetryQuiz.innerHTML;
      btnRetryQuiz.innerHTML = 'ĐANG ĐỒNG BỘ LƯỢT CHƠI...';

      try {
        const playsToday = await db.getPlaysToday(user.id);

        if (playsToday >= 3) {
          // Trigger the limit modal indicating daily restriction
          retryLimitModal.classList.remove('hidden');
        } else {
          // Play again! Redirect directly to gameplay scene
          window.location.href = '/quiz.html';
        }
      } catch (err) {
        console.error('Error syncing dynamic play records', err);
        // Fallback safety
        window.location.href = '/index.html';
      } finally {
        btnRetryQuiz.disabled = false;
        btnRetryQuiz.innerHTML = initialText;
      }
    });
  }

  // Handle modal closures
  if (closeLimitModal) {
    closeLimitModal.addEventListener('click', () => {
      retryLimitModal.classList.add('hidden');
      window.location.replace('/index.html');
    });
  }
});
