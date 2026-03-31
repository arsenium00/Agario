const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,           // разрешает любой origin (важно для Render)
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.static('public'));

const MAP_WIDTH = 2200;
const MAP_HEIGHT = 2200;

let players = {};
let foods = [];
let bots = [];

// Генерация еды
function spawnFood(count = 200) {
  for (let i = 0; i < count; i++) {
    foods.push({
      id: 'f' + Date.now() + i,
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
      size: 6
    });
  }
}

// Создание бота
function createBot() {
  bots.push({
    id: 'bot' + bots.length,
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    size: 20 + Math.random() * 22,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    name: 'Бот',
    targetX: Math.random() * MAP_WIDTH,
    targetY: Math.random() * MAP_HEIGHT
  });
}

spawnFood();
for (let i = 0; i < 10; i++) createBot();

// ==================== ИГРОВОЙ ТИК ====================
setInterval(() => {
  // Движение игроков
  for (let id in players) {
    const p = players[id];
    if (p.targetX !== undefined) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const speed = Math.max(2.8, 9.5 / (p.size / 25));
        p.x += (dx / dist) * speed;
        p.y += (dy / dist) * speed;
      }
    }
    p.x = Math.max(p.size, Math.min(MAP_WIDTH - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_HEIGHT - p.size, p.y));
  }

  // Движение ботов
  bots.forEach(bot => {
    if (Math.random() < 0.06) {
      bot.targetX = Math.random() * MAP_WIDTH;
      bot.targetY = Math.random() * MAP_HEIGHT;
    }
    const dx = bot.targetX - bot.x;
    const dy = bot.targetY - bot.y;
    const dist = Math.hypot(dx, dy) || 1;
    bot.x += (dx / dist) * 3.4;
    bot.y += (dy / dist) * 3.4;
    bot.x = Math.max(bot.size, Math.min(MAP_WIDTH - bot.size, bot.x));
    bot.y = Math.max(bot.size, Math.min(MAP_HEIGHT - bot.size, bot.y));
  });

  // === ПОЕДАНИЕ ЕДЫ ===
  for (let id in players) {
    const p = players[id];
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      if (Math.hypot(p.x - f.x, p.y - f.y) < p.size + f.size + 2) {
        p.size += 0.7;
        foods.splice(i, 1);
        spawnFood(1); // добавляем новую
      }
    }
  }

  // Боты едят еду
  bots.forEach(bot => {
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      if (Math.hypot(bot.x - f.x, bot.y - f.y) < bot.size + f.size + 2) {
        bot.size += 0.6;
        foods.splice(i, 1);
        spawnFood(1);
        break;
      }
    }
  });

  // === СТОЛКНОВЕНИЯ И ПОЕДАНИЕ ИГРОКОВ И БОТОВ ===
  const playerList = Object.values(players);

  // Игрок ↔ Игрок
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const a = playerList[i];
      const b = playerList[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist < a.size + b.size - 5) {
        if (a.size > b.size * 1.2) {
          a.size += b.size * 0.6;
          b.size = 20;
          b.x = Math.random() * MAP_WIDTH;
          b.y = Math.random() * MAP_HEIGHT;
        } else if (b.size > a.size * 1.2) {
          b.size += a.size * 0.6;
          a.size = 20;
          a.x = Math.random() * MAP_WIDTH;
          a.y = Math.random() * MAP_HEIGHT;
        }
      }
    }
  }

  // Игрок ↔ Бот
  for (let id in players) {
    const p = players[id];
    for (let i = bots.length - 1; i >= 0; i--) {
      const b = bots[i];
      const dist = Math.hypot(p.x - b.x, p.y - b.y);
      if (dist < p.size + b.size - 5) {
        if (p.size > b.size * 1.2) {
          p.size += b.size * 0.6;
          b.size = 20 + Math.random() * 22;
          b.x = Math.random() * MAP_WIDTH;
          b.y = Math.random() * MAP_HEIGHT;
        } else if (b.size > p.size * 1.2) {
          b.size += p.size * 0.6;
          p.size = 20;
          p.x = Math.random() * MAP_WIDTH;
          p.y = Math.random() * MAP_HEIGHT;
        }
      }
    }
  }

  // Отправка состояния
  io.emit('gameState', { players, foods, bots });

}, 45);

// ====================== SOCKET ======================
io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

  players[socket.id] = {
    id: socket.id,
    x: 400 + Math.random() * 1400,
    y: 400 + Math.random() * 1400,
    size: 24,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    name: 'Игрок',
    targetX: 0,
    targetY: 0
  };

  socket.emit('init', { id: socket.id, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT });

  socket.on('setName', (name) => {
    if (players[socket.id]) players[socket.id].name = (name || 'Игрок').slice(0, 14);
  });

  socket.on('mouseMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].targetX = data.x;
      players[socket.id].targetY = data.y;
    }
  });

  socket.on('split', () => {
    const p = players[socket.id];
    if (p && p.size > 38) {
      p.size = Math.max(20, p.size / 1.75);
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    console.log('Игрок отключился:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен → порт ${PORT}`);
});
