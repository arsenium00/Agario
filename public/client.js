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

// Автоматическое определение размера canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  mouseX = canvas.width / 2;
  mouseY = canvas.height / 2;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==================== ПОДКЛЮЧЕНИЕ ====================
function connect() {
  // Используем текущий URL (автоматически подхватит порт)
  const url = window.location.origin;
  
  console.log('Подключение к:', url);

  socket = io(url, {
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
    timeout: 20000,
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    console.log('✅ Подключено к серверу');
  });

  socket.on('init', (data) => {
    myId = data.id;
    console.log('Получен ID:', myId);
  });

  socket.on('gameState', (state) => {
    players = state.players || {};
    foods = state.foods || [];
    bots = state.bots || [];

    if (players[myId]) {
      myPlayer = players[myId];
      document.getElementById('sizeDisplay').textContent = Math.floor(myPlayer.size);
    }
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Ошибка подключения:', err.message);
  });
  
  socket.on('disconnect', () => {
    console.log('⚠️ Отключено от сервера');
    myPlayer = null;
  });
}

// ==================== РЕНДЕР ====================
function gameLoop() {
  if (!myPlayer) {
    requestAnimationFrame(gameLoop);
    return;
  }

  // Отправка позиции мыши
  const rect = canvas.getBoundingClientRect();
  const worldX = myPlayer.x + (mouseX - canvas.width / 2);
  const worldY = myPlayer.y + (mouseY - canvas.height / 2);
  if (socket) socket.emit('mouseMove', { x: worldX, y: worldY });

  // Рендер
  ctx.fillStyle = '#0f1f0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(canvas.width/2 - myPlayer.x, canvas.height/2 - myPlayer.y);

  // Еда
  ctx.fillStyle = '#ffeb3b';
  foods.forEach(f => {
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size, 0, Math.PI*2);
    ctx.fill();
  });

  // Боты
  bots.forEach(bot => {
    ctx.fillStyle = bot.color;
    ctx.beginPath();
    ctx.arc(bot.x, bot.y, bot.size, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(bot.name, bot.x, bot.y - bot.size - 10);
  });

  // Игроки
  Object.values(players).forEach(p => {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.name || 'Игрок', p.x, p.y - p.size - 12);
  });

  ctx.restore();

  requestAnimationFrame(gameLoop);
}

// Управление
canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

document.addEventListener('keydown', e => {
  if (e.key === ' ' && myPlayer && myPlayer.size > 38 && socket) {
    socket.emit('split');
    // Убираем локальное изменение, доверяем серверу
  }
});

// Запуск
document.getElementById('playBtn').addEventListener('click', () => {
  nickname = document.getElementById('nickname').value.trim() || 'Игрок';
  document.getElementById('menu').style.display = 'none';
  document.getElementById('gameContainer').style.display = 'block';

  connect();

  setTimeout(() => {
    if (socket) socket.emit('setName', nickname);
  }, 600);

  gameLoop();
});
