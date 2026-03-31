const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let socket;
let myId = null;
let myPlayer = null;
let players = {};
let foods = [];
let bots = [];
let nickname = "Игрок";

const MAP_WIDTH = 2200;
const MAP_HEIGHT = 2200;

let mouseX = canvas.width / 2;
let mouseY = canvas.height / 2;

// Подключение к серверу
function connectToServer() {
  // Если запускаешь локально — можно оставить "http://localhost:3000"
  // На Render/Railway используй текущий адрес сайта
  socket = io();   // автоматически берёт текущий хост

  socket.on('init', (data) => {
    myId = data.id;
  });

  socket.on('gameState', (state) => {
    players = state.players || {};
    foods = state.foods || [];
    bots = state.bots || {};

    if (players[myId]) {
      myPlayer = players[myId];
      document.getElementById('sizeDisplay').textContent = Math.floor(myPlayer.size);
      updateLeaderboard();
    }
  });

  socket.on('disconnect', () => {
    console.log('Отключён от сервера');
  });
}

// Обновление лидерборда
function updateLeaderboard() {
  const sorted = Object.values(players)
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  let html = '';
  sorted.forEach((p, i) => {
    const isMe = p.id === myId ? ' (ты)' : '';
    html += `${i+1}. ${p.name || 'Игрок'} — ${Math.floor(p.size)}${isMe}<br>`;
  });
  document.getElementById('leaders').innerHTML = html;
}

// Главный игровой цикл
function gameLoop() {
  if (!myPlayer) {
    requestAnimationFrame(gameLoop);
    return;
  }

  // Движение к курсору
  const rect = canvas.getBoundingClientRect();
  const worldMouseX = myPlayer.x + (mouseX - canvas.width / 2);
  const worldMouseY = myPlayer.y + (mouseY - canvas.height / 2);

  const dx = worldMouseX - myPlayer.x;
  const dy = worldMouseY - myPlayer.y;
  const dist = Math.hypot(dx, dy) || 1;
  const speed = Math.max(3, 9.8 / (myPlayer.size / 25));

  // Отправляем цель на сервер
  socket.emit('mouseMove', { x: worldMouseX, y: worldMouseY });

  // Рендер
  ctx.fillStyle = '#112211';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width/2 - myPlayer.x, canvas.height/2 - myPlayer.y);

  // Еда
  ctx.fillStyle = '#ffff00';
  foods.forEach(f => {
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Боты
  Object.values(bots).forEach(bot => {
    ctx.fillStyle = bot.color || '#8888ff';
    ctx.beginPath();
    ctx.arc(bot.x, bot.y, bot.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(bot.name || 'Бот', bot.x, bot.y - bot.size - 10);
  });

  // Все игроки
  Object.values(players).forEach(p => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || 'Игрок', p.x, p.y - p.size - 12);
  });

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// Управление мышью
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

// Раздвоение по пробелу
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && myPlayer && myPlayer.size > 38) {
    socket.emit('split');
    // Локально сразу уменьшаем для отзывчивости
    myPlayer.size /= 1.8;
  }
});

// Запуск игры
document.getElementById('playBtn').addEventListener('click', () => {
  nickname = document.getElementById('nickname').value.trim() || 'Игрок';

  document.getElementById('menu').style.display = 'none';
  document.getElementById('gameContainer').style.display = 'block';

  connectToServer();

  // Отправляем ник
  setTimeout(() => {
    if (socket) socket.emit('setName', nickname);
  }, 500);

  gameLoop();
});