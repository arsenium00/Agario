const socket = io();
let canvas, ctx;
let playerId = null;
let mapWidth = 3000, mapHeight = 3000;
let camera = { x: 0, y: 0 };
let players = {};
let foods = [];
let bots = [];
let myPlayer = null;

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 640;

let mouseX = VIEW_WIDTH / 2;
let mouseY = VIEW_HEIGHT / 2;

// Инициализация после подключения
socket.on('init', (data) => {
  playerId = data.id;
  mapWidth = data.mapWidth;
  mapHeight = data.mapHeight;
  
  document.getElementById('menu').style.display = 'none';
  document.getElementById('gameContainer').style.display = 'block';
  
  initCanvas();
  startGameLoop();
});

socket.on('gameState', (data) => {
  players = data.players;
  foods = data.foods;
  bots = data.bots;
  
  if (players[playerId]) {
    myPlayer = players[playerId];
    document.getElementById('sizeDisplay').innerText = Math.floor(myPlayer.size);
  }
  
  updateLeaderboard();
});

function initCanvas() {
  canvas = document.getElementById('canvas');
  ctx = canvas.getContext('2d');
  
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let canvasX = (e.clientX - rect.left) * scaleX;
    let canvasY = (e.clientY - rect.top) * scaleY;
    
    const worldX = camera.x + canvasX;
    const worldY = camera.y + canvasY;
    
    mouseX = worldX;
    mouseY = worldY;
    
    socket.emit('mouseMove', { x: worldX, y: worldY });
  });
  
  canvas.addEventListener('click', () => {
    socket.emit('split');
  });
  
  // Косое движение для сплита
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      socket.emit('split');
    }
  });
}

function updateLeaderboard() {
  const allPlayers = [...Object.values(players), ...bots];
  const sorted = allPlayers.sort((a, b) => b.size - a.size);
  const top10 = sorted.slice(0, 10);
  
  const leadersDiv = document.getElementById('leaders');
  leadersDiv.innerHTML = top10.map((p, i) => {
    const isPlayer = p.id === playerId;
    const prefix = isPlayer ? '👉 ' : `${i+1}. `;
    const name = p.name || (p.id?.startsWith('bot') ? '🤖 Бот' : 'Игрок');
    return `<div style="${isPlayer ? 'color: #00ff44; font-weight: bold;' : ''}">${prefix}${name} - ${Math.floor(p.size)}</div>`;
  }).join('');
}

function startGameLoop() {
  function updateCamera() {
    if (myPlayer) {
      camera.x = myPlayer.x - VIEW_WIDTH / 2;
      camera.y = myPlayer.y - VIEW_HEIGHT / 2;
      
      camera.x = Math.max(0, Math.min(mapWidth - VIEW_WIDTH, camera.x));
      camera.y = Math.max(0, Math.min(mapHeight - VIEW_HEIGHT, camera.y));
    }
  }
  
  function draw() {
    if (!ctx) return;
    
    // Очистка
    ctx.fillStyle = '#1a2a1a';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    
    // Сетка
    ctx.strokeStyle = '#2a4a2a';
    ctx.lineWidth = 1;
    const gridSize = 100;
    const startX = Math.floor(camera.x / gridSize) * gridSize;
    const startY = Math.floor(camera.y / gridSize) * gridSize;
    
    for (let x = startX; x < camera.x + VIEW_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x - camera.x, 0);
      ctx.lineTo(x - camera.x, VIEW_HEIGHT);
      ctx.stroke();
    }
    for (let y = startY; y < camera.y + VIEW_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y - camera.y);
      ctx.lineTo(VIEW_WIDTH, y - camera.y);
      ctx.stroke();
    }
    
    // Еда
    for (let f of foods) {
      const screenX = f.x - camera.x;
      const screenY = f.y - camera.y;
      if (screenX + f.size > 0 && screenX - f.size < VIEW_WIDTH &&
          screenY + f.size > 0 && screenY - f.size < VIEW_HEIGHT) {
        
        ctx.beginPath();
        ctx.arc(screenX, screenY, f.size, 0, Math.PI * 2);
        ctx.fillStyle = '#ffaa44';
        ctx.fill();
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffdd88';
        ctx.arc(screenX, screenY, f.size - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    
    // Боты
    for (let b of bots) {
      const screenX = b.x - camera.x;
      const screenY = b.y - camera.y;
      if (screenX + b.size > 0 && screenX - b.size < VIEW_WIDTH &&
          screenY + b.size > 0 && screenY - b.size < VIEW_HEIGHT) {
        
        ctx.beginPath();
        ctx.arc(screenX, screenY, b.size, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.font = `bold ${Math.max(12, Math.floor(b.size / 3.5))}px Arial`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 3;
        ctx.fillText(b.name, screenX - ctx.measureText(b.name).width / 2, screenY - b.size / 2 - 5);
        ctx.font = `${Math.max(10, Math.floor(b.size / 4))}px Arial`;
        ctx.fillStyle = '#ffffaa';
        ctx.fillText(Math.floor(b.size), screenX - 10, screenY + 5);
        ctx.shadowBlur = 0;
      }
    }
    
    // Игроки
    for (let id in players) {
      const p = players[id];
      const screenX = p.x - camera.x;
      const screenY = p.y - camera.y;
      if (screenX + p.size > 0 && screenX - p.size < VIEW_WIDTH &&
          screenY + p.size > 0 && screenY - p.size < VIEW_HEIGHT) {
        
        ctx.beginPath();
        ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
        
        if (id === playerId) {
          const grad = ctx.createRadialGradient(screenX - 5, screenY - 5, 5, screenX, screenY, p.size);
          grad.addColorStop(0, '#00ff88');
          grad.addColorStop(1, '#00aa44');
          ctx.fillStyle = grad;
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#00ff44';
        } else {
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 5;
        }
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.font = `bold ${Math.max(12, Math.floor(p.size / 3))}px Arial`;
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 3;
        ctx.fillText(p.name, screenX - ctx.measureText(p.name).width / 2, screenY - p.size / 2 - 5);
        ctx.font = `${Math.max(10, Math.floor(p.size / 3.5))}px Arial`;
        ctx.fillStyle = '#ffffaa';
        ctx.fillText(Math.floor(p.size), screenX - 12, screenY + 6);
        ctx.shadowBlur = 0;
      }
    }
    
    // Прицел
    if (myPlayer) {
      ctx.beginPath();
      ctx.arc(mouseX - camera.x, mouseY - camera.y, 12, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mouseX - camera.x - 18, mouseY - camera.y);
      ctx.lineTo(mouseX - camera.x + 18, mouseY - camera.y);
      ctx.moveTo(mouseX - camera.x, mouseY - camera.y - 18);
      ctx.lineTo(mouseX - camera.x, mouseY - camera.y + 18);
      ctx.stroke();
    }
  }
  
  function animate() {
    updateCamera();
    draw();
    requestAnimationFrame(animate);
  }
  
  animate();
}

// Отправка ника
document.getElementById('playBtn').addEventListener('click', () => {
  const name = document.getElementById('nickname').value.trim();
  if (name) {
    socket.emit('setName', name);
  }
});
