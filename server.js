const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['websocket', 'polling']
});

// Раздаем статические файлы из папки public
app.use(express.static(path.join(__dirname, 'public')));

// Для всех остальных маршрутов отдаем index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const MAP_WIDTH = 4000;
const MAP_HEIGHT = 4000;
const FOOD_COUNT = 400;
const BOT_COUNT = 10;
const UPDATE_RATE = 1000 / 50;

let players = {};
let foods = [];
let bots = {};
let nextBotId = 1;

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
    this.lastSplit = 0;
    this.lastEject = 0;
  }
}

class Bot {
  constructor(id, name, x, y, color) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.size = Math.random() * 50 + 30;
    this.mass = this.size;
    this.color = color;
    this.targetX = x;
    this.targetY = y;
    this.moveCooldown = 0;
  }
}

function getRandomColor() {
  const hue = Math.random() * 360;
  return `hsl(${hue}, 65%, 50%)`;
}

function getBotName() {
  const names = ['🍎 Apple', '🍊 Orange', '🍒 Cherry', '🍇 Grape', '🍓 Straw', 
                  '🍉 Melon', '🍑 Peach', '🥝 Kiwi', '🍋 Lemon', '🍈 Melon'];
  return names[Math.floor(Math.random() * names.length)];
}

function createFood() {
  return {
    id: Math.random(),
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
    size: 6,
    mass: 6
  };
}

function initFoods() {
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) {
    foods.push(createFood());
  }
}

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

function checkEat(consumer, target) {
  const consumerSize = consumer.size;
  const targetSize = target.size;
  
  if (consumerSize > targetSize * 1.2) {
    const dx = consumer.x - target.x;
    const dy = consumer.y - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < consumerSize + targetSize - 8) {
      consumer.mass += target.mass;
      consumer.size = Math.sqrt(consumer.mass) * 1.4;
      return true;
    }
  }
  return false;
}

function movePlayer(player, deltaTime) {
  const speed = Math.max(60, 400 - player.size * 0.8) * deltaTime;
  
  let dx = player.targetX - player.x;
  let dy = player.targetY - player.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 1) {
    const move = Math.min(speed, distance);
    player.x += (dx / distance) * move;
    player.y += (dy / distance) * move;
  }
  
  player.x = Math.max(player.size, Math.min(MAP_WIDTH - player.size, player.x));
  player.y = Math.max(player.size, Math.min(MAP_HEIGHT - player.size, player.y));
}

function moveBot(bot, deltaTime) {
  if (bot.moveCooldown > 0) {
    bot.moveCooldown -= deltaTime;
  }
  
  if (bot.moveCooldown <= 0) {
    let closestFood = null;
    let minDist = Infinity;
    
    const checkCount = Math.min(50, foods.length);
    for (let i = 0; i < checkCount; i++) {
      const food = foods[i];
      const dx = food.x - bot.x;
      const dy = food.y - bot.y;
      const dist = dx * dx + dy * dy;
      if (dist < minDist) {
        minDist = dist;
        closestFood = food;
      }
    }
    
    if (closestFood && minDist < 40000) {
      bot.targetX = closestFood.x;
      bot.targetY = closestFood.y;
    } else {
      if (Math.random() < 0.01) {
        bot.targetX = Math.random() * MAP_WIDTH;
        bot.targetY = Math.random() * MAP_HEIGHT;
      }
    }
    bot.moveCooldown = 0.5;
  }
  
  const speed = Math.max(40, 250 - bot.size * 0.5) * deltaTime;
  let dx = bot.targetX - bot.x;
  let dy = bot.targetY - bot.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 5) {
    const move = Math.min(speed, distance);
    bot.x += (dx / distance) * move;
    bot.y += (dy / distance) * move;
  }
  
  bot.x = Math.max(bot.size, Math.min(MAP_WIDTH - bot.size, bot.x));
  bot.y = Math.max(bot.size, Math.min(MAP_HEIGHT - bot.size, bot.y));
}

function splitPlayer(player) {
  const now = Date.now();
  if (now - player.lastSplit < 4000) return false;
  if (player.size < 45) return false;
  
  player.lastSplit = now;
  return true;
}

function ejectMass(player) {
  const now = Date.now();
  if (now - player.lastEject < 800) return false;
  
  if (player.size > 50) {
    const ejectAmount = Math.min(12, player.mass * 0.08);
    if (ejectAmount > 0) {
      player.mass -= ejectAmount;
      player.size = Math.sqrt(player.mass) * 1.4;
      
      const angle = Math.atan2(player.targetY - player.y, player.targetX - player.x);
      foods.push({
        id: Math.random(),
        x: player.x + Math.cos(angle) * player.size,
        y: player.y + Math.sin(angle) * player.size,
        size: 8,
        mass: ejectAmount
      });
      
      player.lastEject = now;
      return true;
    }
  }
  return false;
}

function updateGame() {
  const deltaTime = 1 / 50;
  
  for (let id in players) {
    movePlayer(players[id], deltaTime);
  }
  
  for (let id in bots) {
    moveBot(bots[id], deltaTime);
  }
  
  for (let id in players) {
    const player = players[id];
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      const dx = player.x - food.x;
      const dy = player.y - food.y;
      if (dx * dx + dy * dy < (player.size + food.size) ** 2) {
        player.mass += food.mass;
        player.size = Math.sqrt(player.mass) * 1.4;
        foods.splice(i, 1);
        foods.push(createFood());
      }
    }
  }
  
  for (let id in bots) {
    const bot = bots[id];
    for (let i = foods.length - 1; i >= 0; i--) {
      const food = foods[i];
      const dx = bot.x - food.x;
      const dy = bot.y - food.y;
      if (dx * dx + dy * dy < (bot.size + food.size) ** 2) {
        bot.mass += food.mass;
        bot.size = Math.sqrt(bot.mass) * 1.4;
        foods.splice(i, 1);
        foods.push(createFood());
      }
    }
  }
  
  const playersToRemove = [];
  const playerIds = Object.keys(players);
  for (let i = 0; i < playerIds.length; i++) {
    const id1 = playerIds[i];
    const player1 = players[id1];
    for (let j = i + 1; j < playerIds.length; j++) {
      const id2 = playerIds[j];
      const player2 = players[id2];
      
      if (player1.size > player2.size * 1.2) {
        const dx = player1.x - player2.x;
        const dy = player1.y - player2.y;
        if (dx * dx + dy * dy < (player1.size + player2.size - 5) ** 2) {
          player1.mass += player2.mass;
          player1.size = Math.sqrt(player1.mass) * 1.4;
          playersToRemove.push(id2);
        }
      } else if (player2.size > player1.size * 1.2) {
        const dx = player2.x - player1.x;
        const dy = player2.y - player1.y;
        if (dx * dx + dy * dy < (player2.size + player1.size - 5) ** 2) {
          player2.mass += player1.mass;
          player2.size = Math.sqrt(player2.mass) * 1.4;
          playersToRemove.push(id1);
          break;
        }
      }
    }
  }
  
  for (let id of playersToRemove) {
    delete players[id];
    io.emit('playerEaten', id);
  }
  
  const botsToRemove = [];
  for (let id in players) {
    const player = players[id];
    for (let botId in bots) {
      const bot = bots[botId];
      if (player.size > bot.size * 1.2) {
        const dx = player.x - bot.x;
        const dy = player.y - bot.y;
        if (dx * dx + dy * dy < (player.size + bot.size - 5) ** 2) {
          player.mass += bot.mass;
          player.size = Math.sqrt(player.mass) * 1.4;
          botsToRemove.push(botId);
        }
      }
    }
  }
  
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
}

function sendGameState() {
  const gameState = {
    players: {},
    foods: foods.slice(0, 300),
    bots: bots
  };
  
  for (let id in players) {
    const player = players[id];
    gameState.players[id] = {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      size: player.size,
      color: player.color
    };
  }
  
  io.emit('gameState', gameState);
}

io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);
  
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
  
  socket.on('setName', (name) => {
    if (name && name.length > 0 && name.length < 20) {
      players[playerId].name = name;
    }
  });
  
  socket.on('mouseMove', (data) => {
    if (players[playerId]) {
      players[playerId].targetX = Math.max(0, Math.min(MAP_WIDTH, data.x));
      players[playerId].targetY = Math.max(0, Math.min(MAP_HEIGHT, data.y));
    }
  });
  
  socket.on('split', () => {
    if (players[playerId]) {
      splitPlayer(players[playerId]);
    }
  });
  
  socket.on('eject', () => {
    if (players[playerId]) {
      ejectMass(players[playerId]);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    delete players[playerId];
  });
});

initFoods();
initBots();

setInterval(() => {
  updateGame();
}, UPDATE_RATE);

setInterval(() => {
  sendGameState();
}, UPDATE_RATE);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
  console.log(`📊 Настройки: ${BOT_COUNT} ботов, ${FOOD_COUNT} еды, карта ${MAP_WIDTH}x${MAP_HEIGHT}`);
});
