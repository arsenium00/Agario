const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = 3000;
const MAP_WIDTH = 5000;
const MAP_HEIGHT = 5000;
const MAX_PLAYERS = 50;
const FOOD_COUNT = 800;
const BOT_COUNT = 30;
const UPDATE_RATE = 1000 / 60; // 60 FPS

let players = {};
let foods = [];
let bots = {};
let nextBotId = 1;

// Класс игрока
class Player {
  constructor(id, name, x, y, color) {
    this.id = id;
    this.name = name || 'Игрок';
    this.x = x;
    this.y = y;
    this.size = 32;
    this.color = color;
    this.mass = 32;
    this.targetX = x;
    this.targetY = y;
    this.cells = [{
      id: `${id}_0`,
      x: x,
      y: y,
      size: 32,
      mass: 32
    }];
    this.lastSplit = 0;
    this.lastEject = 0;
  }
}

// Класс бота
class Bot {
  constructor(id, name, x, y, color) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.size = Math.random() * 60 + 25;
    this.mass = this.size;
    this.color = color;
    this.targetX = x;
    this.targetY = y;
    this.lastMove = Date.now();
    this.isBot = true;
  }
}

// Генерация случайного цвета
function getRandomColor() {
  const hue = Math.random() * 360;
  return `hsl(${hue}, 70%, 55%)`;
}

// Генерация имени бота
function getBotName() {
  const names = ['🤖 Alpha', '🤖 Beta', '🤖 Gamma', '🤖 Delta', '🤖 Omega', 
                  '🤖 Prime', '🤖 Neo', '🤖 Zero', '🤖 Cyber', '🤖 Quantum'];
  return names[Math.floor(Math.random() * names.length)];
}

// Создание еды
function createFood() {
  return {
    id: Math.random(),
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    size: 8,
    mass: 8
  };
}

// Инициализация еды
function initFoods() {
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) {
    foods.push(createFood());
  }
}

// Инициализация ботов
function initBots() {
  bots = {};
  for (let i = 0; i < BOT_COUNT; i++) {
    const botId = `bot_${nextBotId++}`;
    bots[botId] = new Bot(
      botId,
      getBotName(),
      Math.random() * MAP_WIDTH,
      Math.random() * MAP_HEIGHT,
      getRandomColor()
    );
  }
}

// Проверка коллизии и поедание
function checkEat(consumer, target) {
  const consumerSize = consumer.size;
  const targetSize = target.size;
  
  // Условие поедания: потребитель на 15% больше цели
  if (consumerSize > targetSize * 1.15) {
    const dx = consumer.x - target.x;
    const dy = consumer.y - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < consumerSize + targetSize - 5) {
      consumer.mass += target.mass;
      consumer.size = Math.sqrt(consumer.mass) * 1.5;
      return true;
    }
  }
  return false;
}

// Движение игрока
function movePlayer(player, deltaTime) {
  const speed = Math.max(100, 800 - player.size * 1.5) * deltaTime;
  
  let dx = player.targetX - player.x;
  let dy = player.targetY - player.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 0.01) {
    const move = Math.min(speed, distance);
    player.x += (dx / distance) * move;
    player.y += (dy / distance) * move;
  }
  
  // Границы карты
  player.x = Math.max(player.size, Math.min(MAP_WIDTH - player.size, player.x));
  player.y = Math.max(player.size, Math.min(MAP_HEIGHT - player.size, player.y));
}

// ИИ для ботов
function moveBot(bot, deltaTime) {
  // Поиск ближайшей еды или меньшего игрока
  let closestTarget = null;
  let minDistance = Infinity;
  
  // Ищем еду
  for (let food of foods) {
    const dx = food.x - bot.x;
    const dy = food.y - bot.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < minDistance && distance < 500) {
      minDistance = distance;
      closestTarget = food;
    }
  }
  
  // Ищем игроков меньше себя
  for (let id in players) {
    const player = players[id];
    if (player.size < bot.size * 0.85) {
      const dx = player.x - bot.x;
      const dy = player.y - bot.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < minDistance && distance < 600) {
        minDistance = distance;
        closestTarget = player;
      }
    }
  }
  
  if (closestTarget) {
    bot.targetX = closestTarget.x;
    bot.targetY = closestTarget.y;
  } else {
    // Случайное движение
    if (Math.random() < 0.02) {
      bot.targetX = Math.random() * MAP_WIDTH;
      bot.targetY = Math.random() * MAP_HEIGHT;
    }
  }
  
  // Движение бота
  const speed = Math.max(80, 500 - bot.size * 1.2) * deltaTime;
  let dx = bot.targetX - bot.x;
  let dy = bot.targetY - bot.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 0.01) {
    const move = Math.min(speed, distance);
    bot.x += (dx / distance) * move;
    bot.y += (dy / distance) * move;
  }
  
  // Границы
  bot.x = Math.max(bot.size, Math.min(MAP_WIDTH - bot.size, bot.x));
  bot.y = Math.max(bot.size, Math.min(MAP_HEIGHT - bot.size, bot.y));
}

// Обработка сплита
function splitPlayer(player) {
  const now = Date.now();
  if (now - player.lastSplit < 3000) return false;
  
  if (player.cells.length >= 16) return false;
  
  const newCells = [];
  const oldCells = player.cells;
  
  for (let cell of oldCells) {
    if (cell.size > 60) {
      const newSize = cell.size / 2;
      const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);
      const offset = cell.size / 2;
      
      const newCell1 = {
        id: `${player.id}_${Date.now()}_${Math.random()}`,
        x: cell.x + Math.cos(angle) * offset,
        y: cell.y + Math.sin(angle) * offset,
        size: newSize,
        mass: cell.mass / 2
      };
      
      const newCell2 = {
        id: `${player.id}_${Date.now()}_${Math.random()}`,
        x: cell.x - Math.cos(angle) * offset,
        y: cell.y - Math.sin(angle) * offset,
        size: newSize,
        mass: cell.mass / 2
      };
      
      newCells.push(newCell1, newCell2);
    } else {
      newCells.push(cell);
    }
  }
  
  player.cells = newCells;
  player.lastSplit = now;
  return true;
}

// Выброс массы
function ejectMass(player) {
  const now = Date.now();
  if (now - player.lastEject < 500) return false;
  
  if (player.cells.length > 0 && player.size > 40) {
    const cell = player.cells[0];
    const ejectMass = Math.min(15, cell.mass * 0.1);
    
    if (ejectMass > 0) {
      cell.mass -= ejectMass;
      cell.size = Math.sqrt(cell.mass) * 1.5;
      
      const angle = Math.atan2(player.targetY - cell.y, player.targetX - cell.x);
      foods.push({
        id: Math.random(),
        x: cell.x + Math.cos(angle) * cell.size,
        y: cell.y + Math.sin(angle) * cell.size,
        size: 10,
        mass: ejectMass
      });
      
      player.lastEject = now;
      return true;
    }
  }
  return false;
}

// Обновление игрового состояния
function updateGame() {
  const deltaTime = 1 / 60;
  
  // Движение игроков
  for (let id in players) {
    const player = players[id];
    if (player.cells.length > 0) {
      // Для простоты используем первую клетку
      const mainCell = player.cells[0];
      player.x = mainCell.x;
      player.y = mainCell.y;
      player.size = mainCell.size;
      player.mass = mainCell.mass;
      
      movePlayer(player, deltaTime);
      
      // Обновляем позицию клетки
      mainCell.x = player.x;
      mainCell.y = player.y;
    }
  }
  
  // Движение ботов
  for (let id in bots) {
    moveBot(bots[id], deltaTime);
  }
  
  // Проверка поедания еды игроками
  for (let id in players) {
    const player = players[id];
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      const dx = player.x - food.x;
      const dy = player.y - food.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < player.size + food.size) {
        player.mass += food.mass;
        player.size = Math.sqrt(player.mass) * 1.5;
        player.cells[0].mass = player.mass;
        player.cells[0].size = player.size;
        foods.splice(i, 1);
        foods.push(createFood());
      }
    }
  }
  
  // Проверка поедания еды ботами
  for (let id in bots) {
    const bot = bots[id];
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      const dx = bot.x - food.x;
      const dy = bot.y - food.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < bot.size + food.size) {
        bot.mass += food.mass;
        bot.size = Math.sqrt(bot.mass) * 1.5;
        foods.splice(i, 1);
        foods.push(createFood());
      }
    }
  }
  
  // Проверка поедания игроков
  const playersToRemove = [];
  for (let id1 in players) {
    const player1 = players[id1];
    for (let id2 in players) {
      if (id1 !== id2) {
        const player2 = players[id2];
        if (checkEat(player1, player2)) {
          player1.mass += player2.mass;
          player1.size = Math.sqrt(player1.mass) * 1.5;
          player1.cells[0].mass = player1.mass;
          player1.cells[0].size = player1.size;
          playersToRemove.push(id2);
        }
      }
    }
  }
  
  // Удаление съеденных игроков
  for (let id of playersToRemove) {
    delete players[id];
    io.emit('playerEaten', id);
  }
  
  // Проверка поедания ботов игроками
  const botsToRemove = [];
  for (let id in players) {
    const player = players[id];
    for (let botId in bots) {
      const bot = bots[botId];
      if (checkEat(player, bot)) {
        player.mass += bot.mass;
        player.size = Math.sqrt(player.mass) * 1.5;
        player.cells[0].mass = player.mass;
        player.cells[0].size = player.size;
        botsToRemove.push(botId);
      }
    }
  }
  
  // Удаление съеденных ботов и создание новых
  for (let botId of botsToRemove) {
    delete bots[botId];
    const newBotId = `bot_${nextBotId++}`;
    bots[newBotId] = new Bot(
      newBotId,
      getBotName(),
      Math.random() * MAP_WIDTH,
      Math.random() * MAP_HEIGHT,
      getRandomColor()
    );
  }
  
  // Проверка поедания игроков ботами
  const playersToEat = [];
  for (let botId in bots) {
    const bot = bots[botId];
    for (let playerId in players) {
      const player = players[playerId];
      if (bot.size > player.size * 1.15) {
        const dx = bot.x - player.x;
        const dy = bot.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < bot.size + player.size) {
          bot.mass += player.mass;
          bot.size = Math.sqrt(bot.mass) * 1.5;
          playersToEat.push(playerId);
        }
      }
    }
  }
  
  // Удаление съеденных игроков
  for (let playerId of playersToEat) {
    delete players[playerId];
    io.emit('playerEaten', playerId);
  }
}

// Отправка состояния игры
function sendGameState() {
  const gameState = {
    players: {},
    foods: foods,
    bots: bots
  };
  
  // Отправляем данные игроков
  for (let id in players) {
    const player = players[id];
    gameState.players[id] = {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      size: player.size,
      color: player.color,
      cells: player.cells
    };
  }
  
  io.emit('gameState', gameState);
}

// Обработка подключения
io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);
  
  // Создание нового игрока
  const playerId = socket.id;
  const player = new Player(
    playerId,
    'Игрок',
    Math.random() * MAP_WIDTH,
    Math.random() * MAP_HEIGHT,
    getRandomColor()
  );
  
  players[playerId] = player;
  
  socket.emit('init', {
    id: playerId,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT
  });
  
  // Установка имени
  socket.on('setName', (name) => {
    if (name && name.length > 0 && name.length < 20) {
      players[playerId].name = name;
    }
  });
  
  // Движение мыши
  socket.on('mouseMove', (data) => {
    if (players[playerId]) {
      players[playerId].targetX = Math.max(0, Math.min(MAP_WIDTH, data.x));
      players[playerId].targetY = Math.max(0, Math.min(MAP_HEIGHT, data.y));
    }
  });
  
  // Сплит
  socket.on('split', () => {
    if (players[playerId]) {
      splitPlayer(players[playerId]);
    }
  });
  
  // Выброс массы
  socket.on('eject', () => {
    if (players[playerId]) {
      ejectMass(players[playerId]);
    }
  });
  
  // Отключение
  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    delete players[playerId];
  });
});

// Инициализация игры
initFoods();
initBots();

// Игровой цикл
setInterval(() => {
  updateGame();
}, UPDATE_RATE);

// Отправка состояния
setInterval(() => {
  sendGameState();
}, UPDATE_RATE);

server.listen(PORT, () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
  console.log(`Карта: ${MAP_WIDTH}x${MAP_HEIGHT}`);
  console.log(`Еды: ${FOOD_COUNT}, Ботов: ${BOT_COUNT}`);
});
