/**
 * Leaderboard — Game HRIS
 * Hiển thị bảng xếp hạng Top 20 nhân viên điểm cao nhất.
 */

import { db } from './supabase.js';

document.addEventListener('DOMContentLoaded', async () => {
  const leaderboardList = document.getElementById('leaderboard_list');
  const selfRankRow = document.getElementById('self_rank_row');
  const selfRankNum = document.getElementById('self_rank_num');
  const selfName = document.getElementById('self_name');
  const selfDept = document.getElementById('self_dept');
  const selfScore = document.getElementById('self_score');

  // Session user
  const sessionUser = sessionStorage.getItem('current_user');
  let currentUser = sessionUser ? JSON.parse(sessionUser) : null;

  try {
    const rankings = await db.getLeaderboard();

    leaderboardList.innerHTML = '';

    if (!rankings || rankings.length === 0) {
      leaderboardList.innerHTML = `
        <div class="py-12 text-center text-[#877A6E] text-xs font-semibold">
          Chưa có hoạt động xếp hạng nào được ghi nhận.
        </div>
      `;
      return;
    }

    // Tìm vị trí của user hiện tại bằng ID (chính xác hơn name)
    let currentUserRank = -1;
    let currentUserScore = currentUser ? (currentUser.total_score || 0) : 0;

    if (currentUser) {
      const foundIdx = rankings.findIndex(r => r.id === currentUser.id);
      if (foundIdx !== -1) {
        currentUserRank = foundIdx + 1;
        currentUserScore = rankings[foundIdx].total_score;
      } else {
        // Ngoài top 20 → lấy rank thực từ DB
        const realRank = await db.getUserRank(currentUser.id);
        currentUserRank = realRank || '20+';
      }
    }

    // Hiển thị badge rank cá nhân
    if (currentUser && selfRankRow) {
      selfRankNum.textContent = `#${currentUserRank}`;
      selfName.textContent = currentUser.full_name;
      selfDept.textContent = currentUser.department;
      selfScore.textContent = `${currentUserScore}đ`;
      selfRankRow.classList.remove('hidden');
    }

    // Render danh sách
    rankings.forEach((player, index) => {
      const rank = index + 1;
      const isSelf = currentUser && (player.id === currentUser.id);

      // Medal icon
      let medalHtml = '';
      if (rank === 1) {
        medalHtml = `<div class="w-9 h-9 rounded-xl medal-gold flex items-center justify-center text-sm">🥇</div>`;
      } else if (rank === 2) {
        medalHtml = `<div class="w-9 h-9 rounded-xl medal-silver flex items-center justify-center text-sm">🥈</div>`;
      } else if (rank === 3) {
        medalHtml = `<div class="w-9 h-9 rounded-xl medal-bronze flex items-center justify-center text-sm">🥉</div>`;
      } else {
        medalHtml = `<div class="w-9 h-9 rounded-xl medal-default flex items-center justify-center text-xs font-black font-['Space_Grotesk']">#${rank}</div>`;
      }

      const selfBadge = isSelf
        ? `<span class="inline-flex px-1.5 py-0.5 text-[8px] font-black rounded-md uppercase tracking-wider" style="background:#E07242;color:#fff">BẠN</span>`
        : '';

      // Score color: top 3 get brand orange
      const scoreColor = rank <= 3 ? '#E07242' : '#2C2C2C';

      const row = document.createElement('div');
      row.className = `rank-row ${isSelf ? 'is-self' : ''}`;
      row.innerHTML = `
        <div class="flex items-center gap-3">
          ${medalHtml}
          <div>
            <div class="font-bold text-[13px] text-[#2C2C2C] flex items-center gap-1.5">
              <span>${player.full_name}</span>
              ${selfBadge}
            </div>
            <p class="text-[10px] text-[#877A6E] mt-0.5">${player.department || '—'}</p>
          </div>
        </div>
        <div class="text-right">
          <span class="text-sm font-extrabold font-['Space_Grotesk']" style="color:${scoreColor}">${player.total_score || 0}đ</span>
        </div>
      `;
      leaderboardList.appendChild(row);
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    if (leaderboardList) {
      leaderboardList.innerHTML = `
        <div class="py-12 text-center text-rose-500 text-xs font-semibold">
          Lỗi tải dữ liệu. Vui lòng kiểm tra kết nối.
        </div>
      `;
    }
  }
});
