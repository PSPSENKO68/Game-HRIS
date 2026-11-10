/**
 * Flashcard Module — Game HRIS
 * Học flashcard với Spaced Repetition (Đã thuộc / Chưa thuộc / Cần học lại)
 */

import { db } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  // ── Auth check ──────────────────────────────────────────────────────────
  const sessionUser = sessionStorage.getItem('current_user');
  if (!sessionUser) { window.location.replace('/login.html'); return; }
  const user = JSON.parse(sessionUser);

  // Header user info
  const headerUser = document.getElementById('header_user');
  const headerUserName = document.getElementById('header_user_name');
  if (headerUser) {
    headerUser.classList.remove('hidden');
    headerUserName.textContent = user.full_name;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let cards = [];          // Danh sách thẻ hiện tại
  let currentIdx = 0;
  let isFlipped = false;
  let sessionStats = { known: 0, learning: 0, review: 0 };
  let sessionCardRatings = {}; // Ghi nhớ đánh giá của từng thẻ { [cardId]: status }
  let currentSetId = null;
  let currentSetName = '';

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const screenSets    = document.getElementById('screen_sets');
  const screenStudy   = document.getElementById('screen_study');
  const screenDone    = document.getElementById('screen_done');
  const setsList      = document.getElementById('sets_list');

  const fcScene       = document.getElementById('fc_scene');
  const fcCard        = document.getElementById('fc_card');
  const fcQuestionTxt = document.getElementById('fc_question_text');
  const fcAnswerTxt   = document.getElementById('fc_answer_text');
  const fcActions     = document.getElementById('fc_actions');

  const btnPrevCard   = document.getElementById('btn_prev_card');
  const btnToggleFlip = document.getElementById('btn_toggle_flip');
  const btnNextCard   = document.getElementById('btn_next_card');
  const flipBtnLabel  = document.getElementById('flip_btn_label');
  const nextBtnLabel  = document.getElementById('next_btn_label');

  const studySetName  = document.getElementById('study_set_name');
  const studyProgText = document.getElementById('study_progress_text');
  const studyProgBar  = document.getElementById('study_progress_bar');

  const countKnown    = document.getElementById('count_known');
  const countLearning = document.getElementById('count_learning');
  const countReview   = document.getElementById('count_review');
  const countRemaining= document.getElementById('count_remaining');

  const btnBackToSets   = document.getElementById('btn_back_to_sets');
  const btnRestartStudy = document.getElementById('btn_restart_study');
  const btnKnown        = document.getElementById('btn_known');
  const btnLearning     = document.getElementById('btn_learning');
  const btnReview       = document.getElementById('btn_review');
  const btnStudyAgain   = document.getElementById('btn_study_again');
  const btnBackFromDone = document.getElementById('btn_back_from_done');

  const doneKnown    = document.getElementById('done_known');
  const doneLearning = document.getElementById('done_learning');
  const doneReview   = document.getElementById('done_review');

  // ── SCREEN HELPERS ───────────────────────────────────────────────────────
  function showScreen(name) {
    screenSets.classList.add('hidden');
    screenStudy.classList.add('hidden');
    screenDone.classList.add('hidden');
    if (name === 'sets') screenSets.classList.remove('hidden');
    else if (name === 'study') screenStudy.classList.remove('hidden');
    else if (name === 'done') screenDone.classList.remove('hidden');
  }

  // ── LOAD BỘ FLASHCARD ────────────────────────────────────────────────────
  async function loadSets() {
    setsList.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm">Đang nạp...</div>';
    const sets = await db.getActiveFlashcardSets();

    if (!sets || sets.length === 0) {
      setsList.innerHTML = `
        <div class="p-10 text-center">
          <div class="text-5xl mb-3">📭</div>
          <p class="text-slate-500 font-semibold">Chưa có bộ flashcard nào được kích hoạt.</p>
          <p class="text-xs text-slate-400 mt-1">Admin cần kích hoạt bộ flashcard để bạn học.</p>
        </div>`;
      return;
    }

    setsList.innerHTML = '';
    for (const set of sets) {
      const stats = await db.getFlashcardSetStats(user.id, set.id);
      const knownPct = stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'set-card';
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">${set.category || 'Chung'}</span>
              <span class="text-[10px] font-bold text-slate-400">${stats.total} thẻ</span>
            </div>
            <h3 class="font-bold text-slate-900">${set.title}</h3>
            ${set.description ? `<p class="text-[11px] text-slate-500 mt-0.5">${set.description}</p>` : ''}
          </div>
          <div class="text-right flex-shrink-0">
            <p class="text-2xl font-black font-['Space_Grotesk'] text-emerald-600">${knownPct}%</p>
            <p class="text-[9px] text-slate-400 font-semibold">đã thuộc</p>
          </div>
        </div>
        <!-- Progress bar -->
        <div class="progress-bar mb-3">
          <div class="progress-fill" style="width: ${knownPct}%"></div>
        </div>
        <!-- Mini stats -->
        <div class="flex items-center gap-2 mb-3">
          <span class="stat-known inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full">✅ ${stats.known}</span>
          <span class="stat-learning inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full">🤔 ${stats.learning}</span>
          <span class="stat-review inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full">📚 ${stats.review}</span>
          <span class="stat-new inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full">🆕 ${stats.new}</span>
        </div>
        <button class="btn-start-set w-full py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition"
          style="background: linear-gradient(135deg, #E07242, #E5853F);"
          data-id="${set.id}" data-title="${set.title}">
          ${stats.known === stats.total && stats.total > 0 ? '🔄 Ôn lại bộ này' : '▶ Bắt đầu học'}
        </button>
      `;
      setsList.appendChild(card);
    }

    document.querySelectorAll('.btn-start-set').forEach(btn => {
      btn.addEventListener('click', () => startStudy(btn.dataset.id, btn.dataset.title));
    });
  }

  // ── BẮT ĐẦU HỌC ─────────────────────────────────────────────────────────
  async function startStudy(setId, setName) {
    currentSetId = setId;
    currentSetName = setName;
    currentIdx = 0;
    sessionStats = { known: 0, learning: 0, review: 0 };
    sessionCardRatings = {};
    isFlipped = false;

    cards = await db.getFlashcardsForStudy(user.id, setId);

    if (!cards || cards.length === 0) {
      alert('Bộ flashcard này chưa có thẻ nào.');
      return;
    }

    studySetName.textContent = setName;
    updateStats();
    showScreen('study');
    showCard();
  }

  // ── HIỂN THỊ THẺ ─────────────────────────────────────────────────────────
  function showCard() {
    if (currentIdx >= cards.length) {
      showDone();
      return;
    }

    const card = cards[currentIdx];
    fcQuestionTxt.textContent = card.question;
    fcAnswerTxt.textContent = card.answer;

    // Reset flip
    isFlipped = false;
    fcCard.classList.remove('flipped');
    fcActions.classList.add('hidden');
    if (flipBtnLabel) flipBtnLabel.textContent = 'Lật đáp án';

    // Cập nhật trạng thái nút điều hướng trái / phải
    if (btnPrevCard) {
      btnPrevCard.disabled = (currentIdx === 0);
    }
    if (btnNextCard && nextBtnLabel) {
      if (currentIdx === cards.length - 1) {
        nextBtnLabel.textContent = 'Xem kết quả';
      } else {
        nextBtnLabel.textContent = 'Câu sau';
      }
      btnNextCard.disabled = false;
    }

    // Update progress bar & counter
    const progress = Math.round(((currentIdx + 1) / cards.length) * 100);
    studyProgBar.style.width = progress + '%';
    studyProgText.textContent = `${currentIdx + 1} / ${cards.length}`;

    updateStats();
  }

  // ── FLIP THẺ ─────────────────────────────────────────────────────────────
  function toggleFlip() {
    isFlipped = !isFlipped;
    fcCard.classList.toggle('flipped', isFlipped);
    if (isFlipped) {
      if (flipBtnLabel) flipBtnLabel.textContent = 'Lật câu hỏi';
      setTimeout(() => fcActions.classList.remove('hidden'), 250);
    } else {
      if (flipBtnLabel) flipBtnLabel.textContent = 'Lật đáp án';
      fcActions.classList.add('hidden');
    }
  }

  fcScene.addEventListener('click', toggleFlip);
  if (btnToggleFlip) {
    btnToggleFlip.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFlip();
    });
  }

  // ── ĐIỀU HƯỚNG TRÁI / PHẢI ───────────────────────────────────────────────
  function goToPrevCard() {
    if (currentIdx > 0) {
      currentIdx--;
      showCard();
    }
  }

  function goToNextCard() {
    if (currentIdx < cards.length - 1) {
      currentIdx++;
      showCard();
    } else {
      showDone();
    }
  }

  if (btnPrevCard) btnPrevCard.addEventListener('click', goToPrevCard);
  if (btnNextCard) btnNextCard.addEventListener('click', goToNextCard);

  // ── XỬ LÝ 3 NÚT ĐÁNH GIÁ (ĐÃ THUỘC / CHƯA THUỘC / CẦN HỌC LẠI) ─────────
  async function handleAction(status) {
    if (!cards || cards.length === 0 || currentIdx >= cards.length) return;
    const card = cards[currentIdx];

    // Lưu tiến độ vào cơ sở dữ liệu
    await db.saveFlashcardProgress(user.id, card.id, status);

    // Cập nhật thống kê phiên học (tránh trùng lặp nếu lật lại đổi đánh giá)
    const prevStatus = sessionCardRatings[card.id];
    if (prevStatus && sessionStats[prevStatus] > 0) {
      sessionStats[prevStatus]--;
    }
    sessionStats[status]++;
    sessionCardRatings[card.id] = status;
    updateStats();

    if (currentIdx < cards.length - 1) {
      currentIdx++;
      showCard();
    } else {
      showDone();
    }
  }

  btnKnown.addEventListener('click',    () => handleAction('known'));
  btnLearning.addEventListener('click', () => handleAction('learning'));
  btnReview.addEventListener('click',   () => handleAction('review'));

  // ── CẬP NHẬT STATUS PILLS ────────────────────────────────────────────────
  function updateStats() {
    countKnown.textContent    = sessionStats.known;
    countLearning.textContent = sessionStats.learning;
    countReview.textContent   = sessionStats.review;
    const ratedCount = Object.keys(sessionCardRatings).length;
    countRemaining.textContent = Math.max(0, cards.length - ratedCount);
  }

  // ── MÀN HÌNH HOÀN THÀNH ──────────────────────────────────────────────────
  function showDone() {
    doneKnown.textContent    = sessionStats.known;
    doneLearning.textContent = sessionStats.learning;
    doneReview.textContent   = sessionStats.review;
    showScreen('done');
  }

  // ── NAVIGATION ───────────────────────────────────────────────────────────
  btnBackToSets.addEventListener('click', () => {
    showScreen('sets');
    loadSets();
  });

  btnRestartStudy.addEventListener('click', () => {
    startStudy(currentSetId, currentSetName);
  });

  btnStudyAgain.addEventListener('click', () => {
    startStudy(currentSetId, currentSetName);
  });

  btnBackFromDone.addEventListener('click', () => {
    showScreen('sets');
    loadSets();
  });

  // ── KEYBOARD SHORTCUTS (HỖ TRỢ MŨI TÊN TRÁI / PHẢI) ─────────────────────
  document.addEventListener('keydown', (e) => {
    if (screenStudy.classList.contains('hidden')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleFlip();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goToPrevCard();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToNextCard();
    } else if (isFlipped) {
      if (e.key === '1') handleAction('known');
      if (e.key === '2') handleAction('learning');
      if (e.key === '3') handleAction('review');
    }
  });

  // ── INIT ─────────────────────────────────────────────────────────────────
  showScreen('sets');
  loadSets();
});

