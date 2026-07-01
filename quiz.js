/**
 * Quiz core gameplay engine
 * Manages question shuffling, answering state, score calculation, correct feedback, and database persistence.
 */

import { db } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Authenticated session check
  const sessionUser = sessionStorage.getItem('current_user');
  if (!sessionUser) {
    window.location.replace('/login.html');
    return;
  }
  const user = JSON.parse(sessionUser);

  // 2. Quiz ID validation
  const quizId = sessionStorage.getItem('current_quiz_id');
  if (!quizId) {
    window.location.replace('/index.html');
    return;
  }

  // Get elements
  const questionCounter = document.getElementById('question_counter');
  const scoreDisplay = document.getElementById('score_display');
  const progressBarFill = document.getElementById('progress_bar_fill');
  const quizWeekBadge = document.getElementById('quiz_week_badge');
  const questionText = document.getElementById('question_text');
  
  const answersContainer = document.getElementById('answers_container');
  const feedbackBanner = document.getElementById('feedback_banner');
  const feedbackIcon = document.getElementById('feedback_icon');
  const feedbackTitle = document.getElementById('feedback_title');
  const feedbackSub = document.getElementById('feedback_sub');
  const btnNextQuestion = document.getElementById('btn_next_question');

  // Opt buttons references
  const optButtons = {
    red: { btn: document.getElementById('opt_red'), label: document.getElementById('text_red') },
    blue: { btn: document.getElementById('opt_blue'), label: document.getElementById('text_blue') },
    yellow: { btn: document.getElementById('opt_yellow'), label: document.getElementById('text_yellow') },
    green: { btn: document.getElementById('opt_green'), label: document.getElementById('text_green') }
  };

  // Quit buttons
  const btnQuitQuiz = document.getElementById('btn_quit_quiz');
  const quitConfirmModal = document.getElementById('quit_confirm_modal');
  const btnCancelQuit = document.getElementById('btn_cancel_quit');
  const btnConfirmQuit = document.getElementById('btn_confirm_quit');

  // Gameplay state values
  let rawQuestions = [];
  let questions = [];
  let currentIndex = 0;
  let currentScore = 0;
  let correctCount = 0;
  let hasSelected = false;

  // Active quiz metadata elements
  const activeQuiz = await db.getActiveQuiz();
  if (activeQuiz && quizWeekBadge) {
    quizWeekBadge.textContent = `Quiz Tuần ${activeQuiz.week_no || 'Này'}`;
  }

  // Fetch questions
  const loadedQuestions = await db.getQuizQuestions(quizId);
  if (!loadedQuestions || loadedQuestions.length === 0) {
    console.error('No questions found for this quiz ID', quizId);
    window.location.replace('/index.html');
    return;
  }

  rawQuestions = loadedQuestions;

  // Helper: Shuffle items in array
  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Set up quiz questions sequence:
  // Randomize questions list, then take maximum of 10 questions (as requested "Mỗi quiz 10 câu. Random thứ tự câu hỏi")
  questions = shuffleArray(rawQuestions).slice(0, 10);

  // Initialize Gameplay
  loadQuestion(currentIndex);

  function loadQuestion(index) {
    hasSelected = false;
    feedbackBanner.classList.add('hidden');
    answersContainer.classList.remove('opacity-50');

    // Reset buttons styles to clean original Kahoot states
    Object.keys(optButtons).forEach(key => {
      const { btn } = optButtons[key];
      btn.disabled = false;
      btn.className = btn.className.replace(/\b(ring-4|ring-emerald-500|border-4|opacity-40)\b/g, '').trim();
      btn.classList.add('scale-100');
    });

    const currentQuestion = questions[index];
    if (!currentQuestion) return;

    // Counter UI
    questionCounter.textContent = `Câu ${index + 1}/${questions.length}`;
    scoreDisplay.textContent = currentScore;
    
    // Smooth progress fill
    const progressPerc = (index / questions.length) * 100;
    progressBarFill.style.width = `${progressPerc}%`;

    // Question content text
    questionText.textContent = currentQuestion.question_text;

    // Randomize answers list
    const shuffledAnswers = shuffleArray(currentQuestion.answers || []);

    // Get the keys of our 4 buttons
    const optKeys = Object.keys(optButtons);

    // Dynamic map to support 1-4 answers structurally
    optKeys.forEach((key, idx) => {
      const { btn, label } = optButtons[key];
      const answerData = shuffledAnswers[idx];

      if (answerData) {
        btn.classList.remove('hidden');
        label.textContent = answerData.answer_text;
        
        // Store answer dataset attributes natively on button elements
        btn.setAttribute('data-id', answerData.id);
        btn.setAttribute('data-correct', answerData.is_correct ? 'true' : 'false');
      } else {
        // Safe hide if question has fewer than 4 choices
        btn.classList.add('hidden');
      }
    });
  }

  // Setup click listeners on colored option buttons
  Object.keys(optButtons).forEach(key => {
    const { btn } = optButtons[key];
    btn.addEventListener('click', () => {
      if (hasSelected) return;
      handleAnswerSelection(btn);
    });
  });

  function handleAnswerSelection(selectedButton) {
    hasSelected = true;
    answersContainer.classList.add('opacity-80');

    const isCorrect = selectedButton.getAttribute('data-correct') === 'true';
    const selectedAnswerId = selectedButton.getAttribute('data-id');

    // Freeze all choices
    Object.keys(optButtons).forEach(key => {
      optButtons[key].btn.disabled = true;
    });

    if (isCorrect) {
      // Correct flow
      correctCount += 1;
      const pointsPerQuestion = 100 / questions.length;
      currentScore = Math.round(correctCount * pointsPerQuestion);
      
      // Update score display immediately for microfeedback
      scoreDisplay.textContent = currentScore;

      // Animate selected button
      selectedButton.classList.add('ring-4', 'ring-emerald-400');

      // Style feedback banner beautiful green success
      feedbackBanner.className = "mb-6 p-4 rounded-3xl bg-emerald-600 text-white flex items-center justify-between shadow-lg";
      feedbackIcon.className = "w-10 h-10 rounded-2xl bg-white text-emerald-600 flex items-center justify-center font-black text-xl";
      feedbackIcon.textContent = "✓";
      feedbackTitle.textContent = "CHÍNH XÁC! 🎉";
      feedbackSub.textContent = `+${Math.round(pointsPerQuestion)} Điểm công ty`;
    } else {
      // Incorrect flow
      selectedButton.classList.add('opacity-40', 'ring-4', 'ring-rose-400');

      // Style feedback banner red error
      feedbackBanner.className = "mb-6 p-4 rounded-3xl bg-rose-600 text-white flex items-center justify-between shadow-lg animate-shake";
      feedbackIcon.className = "w-10 h-10 rounded-2xl bg-white text-rose-600 flex items-center justify-center font-black text-xl animate-bounce";
      feedbackIcon.textContent = "✗";
      feedbackTitle.textContent = "SAI MẤT RỒI! 😢";
      feedbackSub.textContent = "Cố gắng câu sau nhé!";
    }

    // Highlight the correct answer with a glow border or distinctive opacity
    Object.keys(optButtons).forEach(key => {
      const currentBtn = optButtons[key].btn;
      const optCorrect = currentBtn.getAttribute('data-correct') === 'true';
      
      if (optCorrect) {
        currentBtn.classList.remove('opacity-40');
        currentBtn.classList.add('ring-4', 'ring-emerald-500', 'scale-[1.02]');
      } else {
        if (currentBtn !== selectedButton) {
          currentBtn.classList.add('opacity-40');
        }
      }
    });

    // Make feedback details visible
    feedbackBanner.classList.remove('hidden');
  }

  // Handle "TIẾP TỤC" (Next question or finish)
  btnNextQuestion.addEventListener('click', async () => {
    currentIndex += 1;

    if (currentIndex < questions.length) {
      // Transition to next question
      loadQuestion(currentIndex);
    } else {
      // Quiz finished! Calculate final calculations
      btnNextQuestion.disabled = true;
      btnNextQuestion.textContent = "ĐANG LƯU...";

      // If quiz finished, score is currentScore (max 100)
      const earnedBonus = 0;
      const totalQuizScore = currentScore;

      try {
        // Save results to Database
        await db.savePlayRecord(user.id, quizId, totalQuizScore);

        // Save session items so results page can display them elegantly
        sessionStorage.setItem('last_quiz_score', totalQuizScore);
        sessionStorage.setItem('last_quiz_correct_count', correctCount);
        sessionStorage.setItem('last_quiz_bonus', earnedBonus);
        sessionStorage.setItem('last_quiz_total_questions', questions.length);

        // Redirect to results visualizer page
        window.location.replace('/result.html');
      } catch (err) {
        console.error('Failed to commit results history record', err);
        // Navigate gracefully regardless to prevent blocking user progress
        window.location.replace('/result.html');
      }
    }
  });

  // Quit and Modal management routines
  if (btnQuitQuiz) {
    btnQuitQuiz.addEventListener('click', () => {
      quitConfirmModal.classList.remove('hidden');
    });
  }

  if (btnCancelQuit) {
    btnCancelQuit.addEventListener('click', () => {
      quitConfirmModal.classList.add('hidden');
    });
  }

  if (btnConfirmQuit) {
    btnConfirmQuit.addEventListener('click', () => {
      window.location.replace('/index.html');
    });
  }
});
