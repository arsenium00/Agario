const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(express.static('public'));

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;
const MIN_PLAYER_SIZE = 18;
const FOOD_COUNT = 250;
const BOT_COUNT = 15;

let players = {};
let foods = [];
let bots = [];

// Генерация еды
function spawnFood(count = FOOD_COUNT) {
  for (let i = 0; i < count; i++) {
    foods.push({
      id: 'f' + Date.now() + i + Math.random(),
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
      size: 6 + Math.random() * 4,
      value: 1
    });
  }
}

// Умный бот с ИИ
class SmartBot {
  constructor(id, x, y, size, name) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.size = size;
    this.color = '#' + Math.floor(Math.random() * 16777215).toString(16);
    this.name = name || `Бот ${id}`;
    this.targetX = x;
    this.targetY = y;
    this.state = 'wander'; // wander, hunt, flee
    this.targetPlayer = null;
    this.lastDecision = 0;
  }

  decide(players, bots, foods) {
    const now = Date.now();
    if (now - this.lastDecision < 800) return;
    this.lastDecision = now;

    let nearestSmaller = null;
    let nearestLarger = null;
    let minSmallerDist = Infinity;
    let minLargerDist = Infinity;

    // Анализ всех игроков
    for (let id in players) {
      const p = players[id];
      const dist = Math.hypot(this.x - p.x, this.y - p.y);
      const sizeRatio = this.size / p.size;
      
      if (sizeRatio > 1.25 && dist < minSmallerDist && dist < 500) {
        // Бот больше игрока - может съесть
        minSmallerDist = dist;
        nearestSmaller = p;
      } else if (sizeRatio < 0.8 && dist < minLargerDist && dist < 400) {
        // Бот меньше игрока - опасность
        minLargerDist = dist;
        nearestLarger = p;
      }
    }

    // Анализ других ботов
    for (let bot of bots) {
      if (bot.id === this.id) continue;
      const dist = Math.hypot(this.x - bot.x, this.y - bot.y);
      const sizeRatio = this.size / bot.size;
      
      if (sizeRatio > 1.2 && dist < minSmallerDist && dist < 450) {
        minSmallerDist = dist;
        nearestSmaller = bot;
      } else if (sizeRatio < 0.85 && dist < minLargerDist && dist < 400) {
        minLargerDist = dist;
        nearestLarger = bot;
      }
    }

    // Принятие решения
    if (nearestLarger && minLargerDist < 350) {
      // Убегаем от опасности
      this.state = 'flee';
      const dx = this.x - nearestLarger.x;
      const dy = this.y - nearestLarger.y;
      const angle = Math.atan2(dy, dx);
      const fleeDistance = 400;
      this.targetX = this.x + Math.cos(angle) * fleeDistance;
      this.targetY = this.y + Math.sin(angle) * fleeDistance;
      
      // Границы карты
      this.targetX = Math.max(50, Math.min(MAP_WIDTH - 50, this.targetX));
      this.targetY = Math.max(50, Math.min(MAP_HEIGHT - 50, this.targetY));
    } 
    else if (nearestSmaller && minSmallerDist < 450) {
      // Охотимся на меньшего
      this.state = 'hunt';
      this.targetX = nearestSmaller.x;
      this.targetY = nearestSmaller.y;
    } 
    else {
      // Сбор еды или случайное блуждание
      this.state = 'wander';
      let nearestFood = null;
      let minFoodDist = Infinity;
      
      for (let f of foods) {
        const dist = Math.hypot(this.x - f.x, this.y - f.y);
        if (dist < minFoodDist && dist < 300) {
          minFoodDist = dist;
          nearestFood = f;
        }
      }
      
      if (nearestFood) {
        this.targetX = nearestFood.x;
        this.targetY = nearestFood.y;
      } else if (Math.random() < 0.03) {
        // Случайная цель
        this.targetX = Math.random() * MAP_WIDTH;
        this.targetY = Math.random() * MAP_HEIGHT;
      }
    }
  }

  move() {
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist > 3) {
      let speed = 3.2;
      // Чем больше бот, тем медленнее
      speed = Math.max(1.8, 5.5 / (this.size / 28));
      // При бегстве быстрее
      if (this.state === 'flee') speed *= 1.3;
      
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
    }
    
    // Границы
    this.x = Math.max(this.size, Math.min(MAP_WIDTH - this.size, this.x));
    this.y = Math.max(this.size, Math.min(MAP_HEIGHT - this.size, this.y));
  }
}

function createBot() {
  const size = 22 + Math.random() * 25;
  bots.push(new SmartBot(
    'bot_' + Date.now() + '_' + Math.random(),
    Math.random() * MAP_WIDTH,
    Math.random() * MAP_HEIGHT,
    size,
    ['🍖 Охотник', '🐺 Волк', '🦁 Лев', '🐯 Тигр', '🐍 Змей', '🦅 Орёл'][Math.floor(Math.random() * 6)]
  ));
}

// Инициализация
spawnFood();
for (let i = 0; i < BOT_COUNT; i++) createBot();

// Поддержание количества еды
setInterval(() => {
  if (foods.length < FOOD_COUNT - 30) {
    spawnFood(15);
  }
}, 3000);

// Игровой тик
setInterval(() => {
  // Движение игроков
  for (let id in players) {
    const p = players[id];
    if (p.targetX !== undefined) {
      const dx = p.targetX - p.x;
      const dy = p.targetY - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 3) {
        let speed = Math.max(2.5, 9.8 / (p.size / 28));
        speed = Math.min(speed, 14);
        p.x += (dx / dist) * speed;
        p.y += (dy / dist) * speed;
      }
    }
    p.x = Math.max(p.size, Math.min(MAP_WIDTH - p.size, p.x));
    p.y = Math.max(p.size, Math.min(MAP_HEIGHT - p.size, p.y));
  }

  // Движение ботов с ИИ
  const playerArray = Object.values(players);
  bots.forEach(bot => {
    bot.decide(playerArray, bots, foods);
    bot.move();
  });

  // === ПОЕДАНИЕ ЕДЫ ИГРОКАМИ ===
  for (let id in players) {
    const p = players[id];
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const dist = Math.hypot(p.x - f.x, p.y - f.y);
      if (dist < p.size + f.size) {
        p.size += 0.8;
        foods.splice(i, 1);
      }
    }
  }

  // === ПОЕДАНИЕ ЕДЫ БОТАМИ ===
  bots.forEach(bot => {
    for (let i = foods.length - 1; i >= 0; i--) {
      const f = foods[i];
      const dist = Math.hypot(bot.x - f.x, bot.y - f.y);
      if (dist < bot.size + f.size) {
        bot.size += 0.7;
        foods.splice(i, 1);
      }
    }
  });

  // === СТОЛКНОВЕНИЯ И ПОЕДАНИЕ ===
  const playerList = Object.values(players);

  // Игрок ↔ Игрок
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const a = playerList[i];
      const b = playerList[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const threshold = (a.size + b.size) * 0.92;
      
      if (dist < threshold) {
        if (a.size > b.size * 1.15) {
          // a съедает b
          a.size += b.size * 0.45;
          a.size = Math.min(a.size, 350);
          b.size = MIN_PLAYER_SIZE;
          b.x = 100 + Math.random() * (MAP_WIDTH - 200);
          b.y = 100 + Math.random() * (MAP_HEIGHT - 200);
        } else if (b.size > a.size * 1.15) {
          // b съедает a
          b.size += a.size * 0.45;
          b.size = Math.min(b.size, 350);
          a.size = MIN_PLAYER_SIZE;
          a.x = 100 + Math.random() * (MAP_WIDTH - 200);
          a.y = 100 + Math.random() * (MAP_HEIGHT - 200);
        } else {
          // Отталкивание при равных размерах
          const angle = Math.atan2(a.y - b.y, a.x - b.x);
          const push = 8;
          a.x += Math.cos(angle) * push;
          a.y += Math.sin(angle) * push;
          b.x -= Math.cos(angle) * push;
          b.y -= Math.sin(angle) * push;
        }
      }
    }
  }

  // Игрок ↔ Бот
  for (let id in players) {
    const p = players[id];
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      const dist = Math.hypot(p.x - b.x, p.y - b.y);
      const threshold = (p.size + b.size) * 0.92;
      
      if (dist < threshold) {
        if (p.size > b.size * 1.15) {
          // Игрок съедает бота
          p.size += b.size * 0.45;
          p.size = Math.min(p.size, 380);
          // Возрождение бота
          b.size = 22 + Math.random() * 25;
          b.x = Math.random() * MAP_WIDTH;
          b.y = Math.random() * MAP_HEIGHT;
          b.state = 'wander';
        } else if (b.size > p.size * 1.15) {
          // Бот съедает игрока
          b.size += p.size * 0.45;
          b.size = Math.min(b.size, 380);
          p.size = MIN_PLAYER_SIZE;
          p.x = 100 + Math.random() * (MAP_WIDTH - 200);
          p.y = 100 + Math.random() * (MAP_HEIGHT - 200);
        } else {
          // Отталкивание
          const angle = Math.atan2(p.y - b.y, p.x - b.x);
          const push = 6;
          p.x += Math.cos(angle) * push;
          p.y += Math.sin(angle) * push;
          b.x -= Math.cos(angle) * push;
          b.y -= Math.sin(angle) * push;
        }
      }
    }
  }

  // Добор еды
  if (foods.length < FOOD_COUNT) {
    spawnFood(Math.min(30, FOOD_COUNT - foods.length));
  }

  // Отправка состояния
  const botsData = bots.map(b => ({
    id: b.id,
    x: b.x,
    y: b.y,
    size: b.size,
    color: b.color,
    name: b.name
  }));
  
  io.emit('gameState', { players, foods, bots: botsData });

}, 45);

// ====================== SOCKET ======================
io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

  players[socket.id] = {
    id: socket.id,
    x: 500 + Math.random() * (MAP_WIDTH - 1000),
    y: 500 + Math.random() * (MAP_HEIGHT - 1000),
    size: MIN_PLAYER_SIZE,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    name: 'Игрок',
    targetX: 0,
    targetY: 0,
    score: 0
  };

  socket.emit('init', { 
    id: socket.id, 
    mapWidth: MAP_WIDTH, 
    mapHeight: MAP_HEIGHT 
  });

  socket.on('setName', (name) => {
    if (players[socket.id]) {
      players[socket.id].name = (name || 'Игрок').slice(0, 14);
    }
  });

  socket.on('mouseMove', (data) => {
    if (players[socket.id]) {
      players[socket.id].targetX = data.x;
      players[socket.id].targetY = data.y;
    }
  });

  socket.on('split', () => {
    const p = players[socket.id];
    if (p && p.size > 45) {
      p.size = Math.max(MIN_PLAYER_SIZE, p.size * 0.6);
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
