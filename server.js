<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Agar.io Clone</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            user-select: none;
        }

        body {
            font-family: 'Arial', sans-serif;
            overflow: hidden;
            background: #0a1a0a;
        }

        #menu {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #1a3a1a 0%, #0a1a0a 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }

        .menu-container {
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 20px;
            text-align: center;
            box-shadow: 0 0 50px rgba(0, 255, 0, 0.3);
            border: 1px solid #00ff44;
        }

        h1 {
            color: #00ff44;
            font-size: 48px;
            margin-bottom: 20px;
            text-shadow: 0 0 20px rgba(0, 255, 68, 0.5);
        }

        input {
            width: 300px;
            padding: 12px 20px;
            font-size: 18px;
            margin: 20px 0;
            border: 2px solid #00ff44;
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.7);
            color: #fff;
            outline: none;
        }

        button {
            padding: 12px 40px;
            font-size: 20px;
            background: linear-gradient(135deg, #00ff44 0%, #00aa44 100%);
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        button:hover {
            transform: scale(1.05);
            box-shadow: 0 0 20px rgba(0, 255, 68, 0.5);
        }

        #gameContainer {
            position: relative;
            display: none;
        }

        canvas {
            display: block;
            cursor: crosshair;
        }

        .ui {
            position: fixed;
            top: 20px;
            left: 20px;
            right: 20px;
            pointer-events: none;
            z-index: 10;
        }

        .stats {
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            padding: 10px 20px;
            border-radius: 10px;
            display: inline-block;
            color: #00ff44;
            font-weight: bold;
            font-size: 18px;
            border-left: 3px solid #00ff44;
        }

        .leaderboard {
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            padding: 15px;
            border-radius: 10px;
            min-width: 250px;
            max-height: 400px;
            overflow-y: auto;
            pointer-events: auto;
            border-right: 3px solid #00ff44;
        }

        .leaderboard h3 {
            color: #ffaa44;
            margin-bottom: 10px;
            text-align: center;
        }

        .leaderboard div {
            color: white;
            padding: 5px;
            font-size: 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .controls {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(5px);
            padding: 10px 15px;
            border-radius: 10px;
            color: white;
            font-size: 12px;
            pointer-events: none;
        }

        .controls span {
            color: #00ff44;
            font-weight: bold;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }

        .split-effect {
            animation: pulse 0.3s ease;
        }
    </style>
</head>
<body>
    <div id="menu">
        <div class="menu-container">
            <h1>🍃 AGAR.IO CLONE</h1>
            <input type="text" id="nickname" placeholder="Введите никнейм" maxlength="15">
            <br>
            <button id="playBtn">▶ ИГРАТЬ</button>
            <div class="controls" style="position: relative; margin-top: 20px; background: transparent;">
                <span>🎮 Управление:</span> Мышь - движение | Пробел/Клик - разделение
            </div>
        </div>
    </div>

    <div id="gameContainer">
        <canvas id="canvas"></canvas>
        <div class="ui">
            <div class="stats">
                📊 Размер: <span id="sizeDisplay">0</span>
            </div>
        </div>
        <div class="leaderboard">
            <h3>🏆 ТОП ИГРОКОВ</h3>
            <div id="leaders"></div>
        </div>
        <div class="controls">
            <span>🎮 Управление:</span> Мышь - движение | Пробел/Клик - разделение | E - выброс массы
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io({
            transports: ['websocket']
        });
        
        let canvas, ctx;
        let playerId = null;
        let mapWidth = 4000, mapHeight = 4000;
        let camera = { x: 0, y: 0 };
        let players = {};
        let foods = [];
        let bots = {};
        let myPlayer = null;

        let VIEW_WIDTH = window.innerWidth;
        let VIEW_HEIGHT = window.innerHeight;

        let mouseX = VIEW_WIDTH / 2;
        let mouseY = VIEW_HEIGHT / 2;
        
        let frameRequest = null;
        let lastTimestamp = 0;
        let frameInterval = 1000 / 50;
        
        let splitEffect = false;
        let effectTimer = null;

        socket.on('init', (data) => {
            playerId = data.id;
            mapWidth = data.mapWidth;
            mapHeight = data.mapHeight;
            
            document.getElementById('menu').style.display = 'none';
            document.getElementById('gameContainer').style.display = 'block';
            
            initCanvas();
            startGameLoop();
            
            window.addEventListener('resize', () => {
                VIEW_WIDTH = window.innerWidth;
                VIEW_HEIGHT = window.innerHeight;
                canvas.width = VIEW_WIDTH;
                canvas.height = VIEW_HEIGHT;
            });
        });

        socket.on('gameState', (data) => {
            players = data.players;
            foods = data.foods || [];
            bots = data.bots || {};
            
            if (players[playerId]) {
                myPlayer = players[playerId];
                document.getElementById('sizeDisplay').innerText = Math.floor(myPlayer.size);
            }
            
            updateLeaderboard();
        });
        
        socket.on('playerEaten', (id) => {
            if (id === playerId) {
                const gameContainer = document.getElementById('gameContainer');
                gameContainer.style.opacity = '0.5';
                setTimeout(() => {
                    gameContainer.style.opacity = '1';
                }, 500);
            }
        });

        function initCanvas() {
            canvas = document.getElementById('canvas');
            canvas.width = VIEW_WIDTH;
            canvas.height = VIEW_HEIGHT;
            ctx = canvas.getContext('2d');
            
            let lastMouseEmit = 0;
            const MOUSE_EMIT_DELAY = 33; // 30fps для мыши
            
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
                
                const now = Date.now();
                if (now - lastMouseEmit > MOUSE_EMIT_DELAY) {
                    socket.emit('mouseMove', { x: worldX, y: worldY });
                    lastMouseEmit = now;
                }
            });
            
            canvas.addEventListener('click', () => {
                socket.emit('split');
                splitEffect = true;
                if (effectTimer) clearTimeout(effectTimer);
                effectTimer = setTimeout(() => {
                    splitEffect = false;
                }, 300);
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    e.preventDefault();
                    socket.emit('split');
                    splitEffect = true;
                    if (effectTimer) clearTimeout(effectTimer);
                    effectTimer = setTimeout(() => {
                        splitEffect = false;
                    }, 300);
                }
                if (e.code === 'KeyE') {
                    e.preventDefault();
                    socket.emit('eject');
                }
            });
        }

        function updateLeaderboard() {
            const allPlayers = [...Object.values(players), ...Object.values(bots)];
            const sorted = allPlayers.sort((a, b) => b.size - a.size);
            const top10 = sorted.slice(0, 10);
            
            const leadersDiv = document.getElementById('leaders');
            leadersDiv.innerHTML = top10.map((p, i) => {
                const isPlayer = p.id === playerId;
                const prefix = isPlayer ? '👉 ' : `${i+1}. `;
                const name = p.name || (p.id?.startsWith('bot') ? p.name || '🤖 Бот' : 'Игрок');
                return `<div style="${isPlayer ? 'color: #00ff44; font-weight: bold;' : ''}">
                    ${prefix}${name} - ${Math.floor(p.size)}
                </div>`;
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
                
                // Простая сетка
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
                        ctx.fillStyle = '#44ff44';
                        ctx.fill();
                        ctx.beginPath();
                        ctx.arc(screenX - 1, screenY - 1, f.size / 3, 0, Math.PI * 2);
                        ctx.fillStyle = '#aaffaa';
                        ctx.fill();
                    }
                }
                
                // Боты
                for (let id in bots) {
                    const b = bots[id];
                    const screenX = b.x - camera.x;
                    const screenY = b.y - camera.y;
                    if (screenX + b.size > 0 && screenX - b.size < VIEW_WIDTH &&
                        screenY + b.size > 0 && screenY - b.size < VIEW_HEIGHT) {
                        
                        ctx.beginPath();
                        ctx.arc(screenX, screenY, b.size, 0, Math.PI * 2);
                        ctx.fillStyle = b.color;
                        ctx.fill();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        
                        ctx.font = `bold ${Math.max(10, Math.floor(b.size / 4))}px Arial`;
                        ctx.fillStyle = '#fff';
                        ctx.fillText(b.name, screenX - ctx.measureText(b.name).width / 2, screenY - b.size / 2 - 3);
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
                            const grad = ctx.createRadialGradient(screenX - 3, screenY - 3, 3, screenX, screenY, p.size);
                            grad.addColorStop(0, '#88ff88');
                            grad.addColorStop(1, '#33aa33');
                            ctx.fillStyle = grad;
                            if (splitEffect) {
                                ctx.shadowBlur = 15;
                                ctx.shadowColor = '#88ff88';
                            }
                        } else {
                            ctx.fillStyle = p.color;
                        }
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                        
                        ctx.font = `bold ${Math.max(10, Math.floor(p.size / 4))}px Arial`;
                        ctx.fillStyle = '#fff';
                        ctx.fillText(p.name, screenX - ctx.measureText(p.name).width / 2, screenY - p.size / 2 - 3);
                    }
                }
                
                // Прицел
                if (myPlayer) {
                    ctx.beginPath();
                    ctx.arc(mouseX - camera.x, mouseY - camera.y, 12, 0, Math.PI * 2);
                    ctx.strokeStyle = '#fff';
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
            
            function animate(timestamp) {
                if (timestamp - lastTimestamp >= frameInterval) {
                    updateCamera();
                    draw();
                    lastTimestamp = timestamp;
                }
                frameRequest = requestAnimationFrame(animate);
            }
            
            animate(0);
        }

        document.getElementById('playBtn').addEventListener('click', () => {
            const name = document.getElementById('nickname').value.trim();
            socket.emit('setName', name || 'Игрок');
        });
    </script>
</body>
</html>
