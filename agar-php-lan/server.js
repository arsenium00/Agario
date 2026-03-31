const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }   // важно для Render и других хостингов
});

app.use(express.static('public'));

const MAP_WIDTH = 2200;
const MAP_HEIGHT = 2200;

let players = {};
let foods = [];
let bots = [];

// Генерация еды
function spawnFood(count = 250) {
  for (let i = 0; i < count; i++) {
    foods.push({
      id: 'f' + Date.now() + Math.random().toString(36).substr(2, 5),
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
      size: 6
    });
  }
}

// Создание ботов
function createBot() {
  bots.push({
    id: 'bot' + bots.length,
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    size: 20 + Math.random() * 25,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    name: 'Бот',
    targetX: Math.random() * MAP_WIDTH,
    targetY: Math.random() * MAP_HEIGHT
  });
}

spawnFood();
for (let i = 0; i < 12; i++) createBot();

// Игровой тик (50 мс = 20 FPS)
setInterval(() => {
  // Движение игроков
  for (let id in players) {
    const p = players[id];
    if (p.targetX !== undefined) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 8) {
        const speed = Math.max(2.8, 9.5 / (p.size / 25));
        p.x += (dx / dist) * speed;
        p.y += (dy / dist) * speed;
      }
    }
    // границы карты
    p.x = Math.max(p.size, Math.min(MAP_WIDTH - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_HEIGHT - p.size, p.y));
  }

  // Движение ботов
  bots.forEach(bot => {
    if (Math.random() < 0.05) {
      bot.targetX = Math.random() * MAP_WIDTH;
      bot.targetY = Math.random() * MAP_HEIGHT;
    }
    const dx = bot.targetX - bot.x;
    const dy = bot.targetY - bot.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = 3.4;
    bot.x += (dx / dist) * speed;
    bot.y += (dy / dist) * speed;

    bot.x = Math.max(bot.size, Math.min(MAP_WIDTH - bot.size, bot.x));
    bot.y = Math.max(bot.size, Math.min(MAP_HEIGHT - bot.size, bot.y));
  });

  // Поедание еды и столкновения (упрощённая логика)
  // ... (можно оставить ту же логику, что была раньше)

  // Отправка состояния всем клиентам
  io.emit('gameState', { players, foods, bots });

}, 50);

io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

  players[socket.id] = {
    id: socket.id,
    x: 300 + Math.random() * (MAP_WIDTH - 600),
    y: 300 + Math.random() * (MAP_HEIGHT - 600),
    size: 24,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    name: 'Игрок',
    targetX: 0,
    targetY: 0
  };

  socket.emit('init', { 
    id: socket.id, 
    mapWidth: MAP_WIDTH, 
    mapHeight: MAP_HEIGHT 
  });

  socket.on('setName', (name) => {
    if (players[socket.id]) players[socket.id].name = name.slice(0, 14);
  });

  socket.on('mouseMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].targetX = data.x;
      players[socket.id].targetY = data.y;
    }
  });

  // Раздвоение (пробел)
  socket.on('split', () => {
    const p = players[socket.id];
    if (p && p.size > 38) {
      p.size = p.size / 1.8;
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    console.log('Игрок отключился:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log(`Открой в браузере: http://localhost:${PORT}`);
});