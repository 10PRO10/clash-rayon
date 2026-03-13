// ==================== КОНФИГУРАЦИЯ ====================
const SUPABASE_URL = 'https://fvusxxmnqwjmapyibdna.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2dXN4eG1ucXdqbWFweWliZG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjA3NzUsImV4cCI6MjA4ODg5Njc3NX0.8XLqBvkJLSADyxiYNCx110zCal3djtR5JVyzLdrsXsM';

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let supabaseClient = null;
let roomId = null;
let roomCode = null;
let isPlayer1 = false;
let isMultiplayer = false;
let gameChannel = null;
let isConnected = false;

// Игровые переменные
let elixir = 5;
const maxElixir = 10;
const elixirRate = 0.5;
let playerUnits = [];
let enemyUnits = [];
let particles = [];
let gameActive = false;
let enemyTowerHP = 1000;
let playerTowerHP = 1000;
const maxTowerHP = 1000;

// Синхронизация
let lastSyncTime = 0;
let syncInterval = 200; // мс между отправками
let pendingSync = false;
let remoteGameState = null;
let unitIdCounter = 0;

// DOM
let gameArea, elixirFill, elixirText, enemyTower, playerTower, connectionStatus;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
function initSupabase() {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase:', SUPABASE_URL);
        return true;
    }
    console.error('❌ Supabase не загружен!');
    return false;
}

// ==================== АУДИО ====================
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    try {
        if (audioContext.state === 'suspended') audioContext.resume();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        const sounds = {
            spawn: { freq: 400, dur: 0.1, type: 'sine' },
            attack: { freq: 200, dur: 0.15, type: 'square' },
            hit: { freq: 150, dur: 0.1, type: 'sawtooth' },
            win: { pat: [523.25, 659.25, 783.99, 1046.50], dur: 0.3 },
            lose: { pat: [783.99, 659.25, 523.25, 392.00], dur: 0.3 }
        };
        const s = sounds[type];
        if (!s) return;
        
        if (s.pat) {
            s.pat.forEach((f, i) => {
                const o = audioContext.createOscillator();
                const g = audioContext.createGain();
                o.connect(g); g.connect(audioContext.destination);
                o.frequency.value = f;
                o.type = type === 'lose' ? 'sawtooth' : 'sine';
                g.gain.setValueAtTime(0.2, audioContext.currentTime + i*0.1);
                g.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i*0.1 + s.dur);
                o.start(audioContext.currentTime + i*0.1);
                o.stop(audioContext.currentTime + i*0.1 + s.dur);
            });
        } else {
            osc.frequency.value = s.freq;
            osc.type = s.type;
            gain.gain.setValueAtTime(0.3, audioContext.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + s.dur);
            osc.start(); osc.stop(audioContext.currentTime + s.dur);
        }
    } catch(e) { console.log('Audio:', e); }
}

// ==================== ЧАСТИЦЫ ====================
class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random()-0.5)*8;
        this.vy = (Math.random()-0.5)*8;
        this.life = 1;
        this.el = document.createElement('div');
        this.el.className = 'particle';
        this.el.style.cssText = `position:absolute;width:6px;height:6px;border-radius:50%;background:${color};left:${x}px;top:${y}px;pointer-events:none;z-index:100;`;
        gameArea.appendChild(this.el);
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.vy += 0.3; this.life -= 0.02;
        this.el.style.cssText = `position:absolute;width:6px;height:6px;border-radius:50%;background:${this.el.style.backgroundColor};left:${this.x}px;top:${this.y}px;opacity:${this.life};transform:scale(${this.life});pointer-events:none;z-index:100;`;
        if (this.life <= 0) { this.el.remove(); return false; }
        return true;
    }
}
function createExplosion(x, y, color, count=10) {
    for (let i=0; i<count; i++) particles.push(new Particle(x, y, color));
}

// ==================== КОНФИГУРАЦИЯ ЮНИТОВ ====================
const unitsConfig = {
    'gopnik': { cost:3, hp:100, speed:1.8, damage:15, attackSpeed:1000, range:40, icon:'👕', size:35, color:'#e74c3c' },
    'babka': { cost:5, hp:60, speed:1.2, damage:25, attackSpeed:1500, range:120, icon:'👵', size:35, color:'#9b59b6' },
    'dvornik': { cost:4, hp:150, speed:1.0, damage:20, attackSpeed:1200, range:45, icon:'🧹', size:35, color:'#27ae60' },
    'podezdniy': { cost:6, hp:200, speed:0.8, damage:30, attackSpeed:1500, range:50, icon:'🚪', size:40, color:'#e67e22' },
    'sigareta': { cost:2, hp:30, speed:3.0, damage:40, attackSpeed:800, range:30, icon:'🚬', size:25, color:'#95a5a6' }
};

// ==================== КЛАСС ЮНИТА ====================
class Unit {
    constructor(type, isPlayer, customX, customY, syncId = null) {
        const cfg = unitsConfig[type];
        this.type = type; this.isPlayer = isPlayer;
        this.syncId = syncId || `u_${Date.now()}_${++unitIdCounter}`;
        this.hp = cfg.hp; this.maxHp = cfg.hp;
        this.speed = cfg.speed; this.damage = cfg.damage;
        this.attackSpeed = cfg.attackSpeed; this.range = cfg.range;
        this.icon = cfg.icon; this.size = cfg.size; this.color = cfg.color;
        this.x = customX !== undefined ? customX : (160 + Math.random()*80);
        this.y = customY !== undefined ? customY : (isPlayer ? 530 : 70);
        this.lastAttackTime = 0; this.state = 'moving';
        this.needsSync = true;
        
        this.el = document.createElement('div');
        this.el.className = `unit ${isPlayer ? 'player' : 'enemy'}`;
        this.el.innerHTML = `<div style="z-index:2;font-size:28px;">${this.icon}</div>`;
        this.hpBar = document.createElement('div');
        this.hpBar.className = 'hp-bar';
        this.hpBar.innerHTML = '<div class="hp-fill"></div>';
        this.el.appendChild(this.hpBar);
        this.updatePosition();
        gameArea.appendChild(this.el);
        
        createExplosion(this.x+20, this.y+20, isPlayer ? '#3498db' : '#e74c3c', 8);
        playSound('spawn');
    }
    
    updatePosition() { this.el.style.left = this.x+'px'; this.el.style.top = this.y+'px'; }
    
    updateHpBar() {
        const fill = this.hpBar.querySelector('.hp-fill');
        const p = (this.hp/this.maxHp)*100;
        fill.style.width = p+'%';
        fill.className = 'hp-fill' + (p<=25?' low':p<=50?' medium':'');
    }
    
    applySeparation(units) {
        let sx=0, sy=0, cnt=0;
        for (let o of units) {
            if (o===this) continue;
            const dx=this.x-o.x, dy=this.y-o.y;
            const d = Math.sqrt(dx*dx+dy*dy);
            if (d < this.size && d > 0) { sx+=dx/d; sy+=dy/d; cnt++; }
        }
        return cnt>0 ? {x:sx/cnt*2, y:sy/cnt*2} : {x:0, y:0};
    }
    
    findTarget(enemies) {
        let closest=null, minD=this.range+50;
        for (let e of enemies) {
            const d = Math.sqrt((this.x-e.x)**2 + (this.y-e.y)**2);
            if (d < minD) { minD=d; closest=e; }
        }
        return closest;
    }
    
    canAttack(t) {
        if (!t) return false;
        return Math.sqrt((this.x-t.x)**2 + (this.y-t.y)**2) <= this.range+25;
    }
    
    attack(target) {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackSpeed) return;
        this.lastAttackTime = now; this.state = 'attacking';
        this.el.classList.add('attacking');
        setTimeout(() => this.el.classList.remove('attacking'), 200);
        target.takeDamage(this.damage);
        this.showDamage(this.damage);
        playSound('attack');
        this.needsSync = true;
        setTimeout(() => { this.state='moving'; }, this.attackSpeed);
    }
    
    attackTower(tower) {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackSpeed) return;
        this.lastAttackTime = now; this.state = 'attacking';
        tower.classList.add('hit');
        setTimeout(() => tower.classList.remove('hit'), 300);
        
        const isEnemy = tower === enemyTower;
        if (isEnemy) {
            enemyTowerHP -= this.damage;
            updateTowerHP(document.getElementById('enemy-hp'), enemyTowerHP);
            createExplosion(tower.offsetLeft+35, tower.offsetTop+45, '#e74c3c', 5);
            if (enemyTowerHP <= 0) endGame('win');
        } else {
            playerTowerHP -= this.damage;
            updateTowerHP(document.getElementById('player-hp'), playerTowerHP);
            if (playerTowerHP <= 0) endGame('lose');
        }
        this.showDamage(this.damage);
        playSound('hit');
        this.needsSync = true;
        setTimeout(() => { this.state='moving'; }, this.attackSpeed);
    }
    
    move(allied) {
        const dir = this.isPlayer ? -1 : 1;
        const sep = this.applySeparation(allied);
        let mx = sep.x*0.5, my = (this.speed + sep.y*0.3)*dir;
        if (Math.random() < 0.02) mx += (Math.random()-0.5)*10;
        this.x = Math.max(145, Math.min(255, this.x+mx));
        this.y = this.isPlayer ? Math.max(60, this.y+my) : Math.min(540, this.y+my);
        this.updatePosition();
        this.needsSync = true;
    }
    
    takeDamage(dmg) {
        this.hp -= dmg; this.updateHpBar();
        this.el.style.filter = 'brightness(2)';
        setTimeout(() => this.el.style.filter = '', 100);
        if (this.hp <= 0) {
            createExplosion(this.x+20, this.y+20, this.color, 12);
            playSound('hit');
            this.needsSync = true;
            this.die();
        }
    }
    
    showDamage(amt) {
        const el = document.createElement('div');
        el.className = 'damage-text';
        el.textContent = '-' + amt;
        el.style.cssText = `position:absolute;color:#fff;font-weight:bold;font-size:20px;pointer-events:none;animation:damageFloat 1s ease-out forwards;z-index:100;text-shadow:2px 2px 4px #000;left:${this.x+10}px;top:${this.y-20}px;`;
        gameArea.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }
    
    die() {
        this.el.remove();
        const arr = this.isPlayer ? playerUnits : enemyUnits;
        const i = arr.indexOf(this);
        if (i > -1) { arr.splice(i, 1); this.needsSync = true; }
    }
    
    update() {
        if (!gameActive) return;
        const enemies = this.isPlayer ? enemyUnits : playerUnits;
        const tower = this.isPlayer ? enemyTower : playerTower;
        const tY = this.isPlayer ? 110 : 490;
        const target = this.findTarget(enemies);
        const dT = Math.abs(this.y - tY);
        
        if (target && this.canAttack(target)) this.attack(target);
        else if (dT < this.range+20) this.attackTower(tower);
        else { this.state='moving'; this.move(this.isPlayer ? playerUnits : enemyUnits); }
    }
    
    // Сериализация для отправки
    toJSON() {
        return {
            id: this.syncId, type: this.type,
            x: Math.round(this.x), y: Math.round(this.y),
            hp: this.hp, maxHp: this.maxHp,
            state: this.state, lastAttack: this.lastAttackTime
        };
    }
    
    // Десериализация из сети
    static fromJSON(data, isPlayer) {
        const u = new Unit(data.type, isPlayer, data.x, data.y, data.id);
        u.hp = data.hp; u.maxHp = data.maxHp;
        u.state = data.state; u.lastAttackTime = data.lastAttack || 0;
        u.updateHpBar();
        u.updatePosition();
        return u;
    }
}

// ==================== ИГРОВЫЕ ФУНКЦИИ ====================
function updateUI() {
    if (!elixirFill || !elixirText) return;
    elixirFill.style.width = (elixir/maxElixir*100)+'%';
    elixirText.textContent = Math.floor(elixir)+'/'+maxElixir;
    document.querySelectorAll('.card').forEach(card => {
        const cost = parseInt(card.dataset.cost);
        card.classList.toggle('disabled', elixir < cost);
    });
}

function updateTowerHP(bar, hp) {
    if (bar) bar.style.width = Math.max(0, (hp/maxTowerHP)*100)+'%';
}

function spawnUnit(type) {
    const cost = unitsConfig[type].cost;
    if (elixir >= cost && gameActive) {
        elixir -= cost; updateUI();
        const unit = new Unit(type, true);
        playerUnits.push(unit);
        if (isMultiplayer) requestSync();
    }
}

function spawnUnitAt(type, x, y) {
    const cost = unitsConfig[type].cost;
    if (elixir >= cost && gameActive) {
        elixir -= cost; updateUI();
        const unit = new Unit(type, true, x, y);
        playerUnits.push(unit);
        if (isMultiplayer) requestSync();
    }
}

// ==================== СИНХРОНИЗАЦИЯ ====================
function requestSync() {
    if (!isMultiplayer || !roomId || !isConnected) return;
    pendingSync = true;
}

async function syncGameState() {
    if (!isMultiplayer || !roomId || !isConnected || !supabaseClient) return;
    
    const now = Date.now();
    if (now - lastSyncTime < syncInterval) return;
    if (!pendingSync) return;
    
    pendingSync = false;
    lastSyncTime = now;
    
    // Собираем состояние
    const state = {
        p1_elixir: isPlayer1 ? elixir : undefined,
        p2_elixir: !isPlayer1 ? elixir : undefined,
        p1_tower_hp: isPlayer1 ? playerTowerHP : undefined,
        p2_tower_hp: !isPlayer1 ? playerTowerHP : undefined,
        p1_units: isPlayer1 ? playerUnits.map(u => u.toJSON()) : undefined,
        p2_units: !isPlayer1 ? playerUnits.map(u => u.toJSON()) : undefined,
        last_sync: now
    };
    
    try {
        await supabaseClient.from('game_rooms').update({
            game_state: state,
            updated_at: new Date().toISOString()
        }).eq('id', roomId);
    } catch (e) {
        console.error('❌ Sync error:', e);
        pendingSync = true; // Повторить
    }
}

async function handleGameUpdate(newState) {
    if (!newState.game_state) return;
    const gs = newState.game_state;
    
    // Статус игры
    if (!gameActive && newState.status === 'playing' && !isPlayer1) {
        startGame();
    }
    if (newState.status === 'finished' && newState.winner) {
        const iWin = (isPlayer1 && newState.winner==='player1') || (!isPlayer1 && newState.winner==='player2');
        endGame(iWin ? 'win' : 'lose');
        return;
    }
    
    // HP башен
    if (isPlayer1) {
        if (gs.p2_tower_hp !== undefined) {
            enemyTowerHP = gs.p2_tower_hp;
            updateTowerHP(document.getElementById('enemy-hp'), enemyTowerHP);
        }
    } else {
        if (gs.p1_tower_hp !== undefined) {
            enemyTowerHP = gs.p1_tower_hp;
            updateTowerHP(document.getElementById('enemy-hp'), enemyTowerHP);
        }
    }
    
    // Эликсир (для отображения)
    if (isPlayer1 && gs.p2_elixir !== undefined) {
        // Можно показать эликсир врага
    }
    
    // 🎯 СИНХРОНИЗАЦИЯ ЮНИТОВ
    syncUnits(gs);
}

function syncUnits(gs) {
    const remoteUnits = isPlayer1 ? gs.p2_units : gs.p1_units;
    const localUnits = isPlayer1 ? enemyUnits : playerUnits;
    
    if (!remoteUnits || !Array.isArray(remoteUnits)) return;
    
    // Создаём мапу существующих юнитов по ID
    const existingMap = new Map(localUnits.map(u => [u.syncId, u]));
    const receivedIds = new Set();
    
    for (const remote of remoteUnits) {
        receivedIds.add(remote.id);
        let unit = existingMap.get(remote.id);
        
        if (unit) {
            // Обновляем существующего
            if (unit.hp !== remote.hp) {
                unit.hp = remote.hp;
                unit.updateHpBar();
            }
            if (unit.x !== remote.x || unit.y !== remote.y) {
                unit.x = remote.x;
                unit.y = remote.y;
                unit.updatePosition();
            }
            unit.state = remote.state;
            unit.lastAttackTime = remote.lastAttack || 0;
        } else {
            // Создаём нового
            const newUnit = Unit.fromJSON(remote, !isPlayer1);
            localUnits.push(newUnit);
        }
    }
    
    // Удаляем умерших юнитов
    for (const [id, unit] of existingMap) {
        if (!receivedIds.has(id)) {
            unit.die();
        }
    }
}

// ==================== МУЛЬТИПЛЕЕР ФУНКЦИИ ====================
window.createRoom = async function() {
    if (!supabaseClient && !initSupabase()) { alert('❌ Ошибка подключения!'); return; }
    
    isMultiplayer = true; isPlayer1 = true;
    roomCode = generateRoomCode();
    
    try {
        const { data, error } = await supabaseClient.from('game_rooms')
            .insert([{
                room_code: roomCode,
                player1_id: 'p1_'+Date.now(),
                player1_ready: true,
                status: 'waiting',
                game_state: { p1_elixir:5, p2_elixir:5, p1_tower_hp:1000, p2_tower_hp:1000, p1_units:[], p2_units:[], last_sync:0 }
            }]).select().single();
        
        if (error) throw error;
        roomId = data.id;
        showWaitingScreen(roomCode);
        subscribeToRoom(roomId);
    } catch (e) {
        console.error('❌ Create error:', e);
        alert('Ошибка: '+e.message);
    }
};

window.joinRoom = async function() {
    if (!supabaseClient && !initSupabase()) { alert('❌ Ошибка подключения!'); return; }
    
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (code.length !== 6) { alert('Введи 6-значный код!'); return; }
    
    const btn = event.target;
    const origText = btn.textContent;
    btn.textContent = '⏳...'; btn.disabled = true;
    
    try {
        // Проверка комнаты
        const { data: room, error: findErr } = await supabaseClient
            .from('game_rooms').select('*').eq('room_code', code).eq('status', 'waiting').single();
        
        if (findErr || !room) { alert('❌ Комната не найдена!'); btn.textContent=origText; btn.disabled=false; return; }
        
        // Присоединение
        const { data, error } = await supabaseClient
            .from('game_rooms').update({
                player2_id: 'p2_'+Date.now(),
                player2_ready: true,
                status: 'playing'
            }).eq('room_code', code).eq('status', 'waiting').select().single();
        
        if (error || !data) { alert('❌ Не удалось присоединиться!'); btn.textContent=origText; btn.disabled=false; return; }
        
        roomId = data.id;
        isMultiplayer = true; isPlayer1 = false; roomCode = code;
        
        startGame();
        subscribeToRoom(roomId);
    } catch (e) {
        console.error('❌ Join error:', e);
        alert('Ошибка: '+e.message);
    } finally {
        btn.textContent = origText; btn.disabled = false;
    }
};

window.startSinglePlayer = function() {
    isMultiplayer = false; startGame();
};

window.copyRoomCode = function() {
    navigator.clipboard.writeText(roomCode);
    alert('📋 Код: '+roomCode);
};

window.leaveRoom = function() {
    if (roomId && supabaseClient) supabaseClient.from('game_rooms').delete().eq('id', roomId);
    location.reload();
};

function showWaitingScreen(code) {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('waiting-screen').classList.remove('hidden');
    document.getElementById('my-room-code').textContent = code;
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i=0; i<6; i++) code += chars[Math.floor(Math.random()*chars.length)];
    return code;
}

function subscribeToRoom(id) {
    if (!supabaseClient) return;
    
    gameChannel = supabaseClient.channel(`room:${id}`)
        .on('postgres_changes', 
            { event:'UPDATE', schema:'public', table:'game_rooms', filter:`id=eq.${id}` },
            (payload) => handleGameUpdate(payload.new)
        )
        .subscribe(status => {
            if (status === 'SUBSCRIBED') {
                isConnected = true;
                connectionStatus?.classList.add('connected');
                connectionStatus?.classList.remove('hidden');
                console.log('✅ Connected to room');
            } else if (status === 'CHANNEL_ERROR') {
                connectionStatus?.classList.add('error');
                console.error('❌ Channel error');
            }
        });
}

// ==================== ЗАПУСК ИГРЫ ====================
function startGame() {
    document.getElementById('multiplayer-menu').classList.add('hidden');
    document.getElementById('waiting-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    
    if (isMultiplayer) {
        document.getElementById('player1-name').textContent = isPlayer1 ? 'ТЫ' : 'ВРАГ';
        document.getElementById('player2-name').textContent = isPlayer1 ? 'ВРАГ' : 'ТЫ';
    }
    
    gameActive = true;
    gameArea = document.getElementById('game-area');
    elixirFill = document.getElementById('elixir-fill');
    elixirText = document.getElementById('elixir-text');
    enemyTower = document.getElementById('enemy-tower');
    playerTower = document.getElementById('player-tower');
    connectionStatus = document.getElementById('connection-status');
    
    initMobileControls();
    updateUI();
    gameLoop();
    
    // Спавн врага только в одиночной игре
    if (!isMultiplayer) {
        setInterval(spawnEnemyUnit, 7000);
    }
    
    // Эликсир
    setInterval(() => {
        if (elixir < maxElixir && gameActive) {
            elixir = Math.min(maxElixir, elixir + elixirRate);
            updateUI();
        }
    }, 1000);
    
    // Синхронизация
    if (isMultiplayer) {
        setInterval(() => {
            if (gameActive) syncGameState();
        }, syncInterval);
    }
}

function spawnEnemyUnit() {
    if (!gameActive) return;
    const avail = ['gopnik', 'dvornik'];
    if (Math.random() < 0.3) return;
    const t = avail[Math.floor(Math.random()*avail.length)];
    enemyUnits.push(new Unit(t, false));
}

function updateParticles() { particles = particles.filter(p => p.update()); }

function gameLoop() {
    if (!gameActive) return;
    playerUnits.forEach(u => u.update());
    enemyUnits.forEach(u => u.update());
    updateParticles();
    requestAnimationFrame(gameLoop);
}

function endGame(result) {
    gameActive = false;
    const screen = document.getElementById('game-over');
    const title = document.getElementById('game-over-title');
    const msg = document.getElementById('game-over-message');
    
    screen.classList.remove('hidden');
    title.textContent = result === 'win' ? '🎉 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ!';
    title.style.color = result === 'win' ? '#2ecc71' : '#e74c3c';
    msg.textContent = isMultiplayer ? (result==='win'?'Ты разгромил противника!':'В следующий раз повезёт!') : (result==='win'?'Ты захватил подъезд!':'Тебя выгнали!');
    
    playSound(result);
    if (result === 'win') createExplosion(200, 300, '#f1c40f', 50);
    
    if (isMultiplayer && roomId && supabaseClient) {
        supabaseClient.from('game_rooms').update({
            status: 'finished',
            winner: result==='win' ? (isPlayer1?'player1':'player2') : (isPlayer1?'player2':'player1')
        }).eq('id', roomId);
    }
}

// ==================== МОБИЛЬНЫЕ УПРАВЛЕНИЯ ====================
let draggedCard = null, dropZone = null;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function initMobileControls() {
    if (!gameArea) return;
    dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    gameArea.appendChild(dropZone);
    
    if (isMobile) {
        const hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.textContent = '👆 Тяни карту на поле';
        gameArea.appendChild(hint);
        setTimeout(() => hint.remove(), 6000);
    }
    
    document.querySelectorAll('.card').forEach(card => {
        const type = card.dataset.type;
        const cost = parseInt(card.dataset.cost);
        const startDrag = (e) => {
            if (card.classList.contains('disabled') || elixir < cost) return;
            e.preventDefault();
            draggedCard = { type, cost, original: card, clone: card.cloneNode(true) };
            draggedCard.clone.classList.add('dragging');
            document.body.appendChild(draggedCard.clone);
            card.style.opacity = '0.3'; card.classList.add('touched');
            updateDrag(e);
        };
        card.addEventListener('mousedown', startDrag);
        card.addEventListener('touchstart', startDrag, { passive: false });
    });
    
    const updateDrag = (e) => {
        if (!draggedCard) return;
        const cx = e.clientX || (e.touches?.[0]?.clientX);
        const cy = e.clientY || (e.touches?.[0]?.clientY);
        if (!cx || !cy) return;
        draggedCard.clone.style.left = (cx-45)+'px';
        draggedCard.clone.style.top = (cy-57)+'px';
        const rect = gameArea.getBoundingClientRect();
        const x = cx - rect.left, y = cy - rect.top;
        if (x>=0 && x<=rect.width && y>=0 && y<=rect.height) {
            dropZone.classList.add('active');
            dropZone.style.left = (x-30)+'px';
            dropZone.style.top = (y-30)+'px';
        } else dropZone.classList.remove('active');
    };
    
    const endDrag = (e) => {
        if (!draggedCard) return;
        const cx = e.clientX || (e.changedTouches?.[0]?.clientX);
        const cy = e.clientY || (e.changedTouches?.[0]?.clientY);
        if (cx && cy) {
            const rect = gameArea.getBoundingClientRect();
            const x = cx-rect.left, y = cy-rect.top;
            if (x>=0 && x<=rect.width && y>=0 && y<=rect.height) {
                const gx = Math.max(145, Math.min(255, x-20));
                const gy = Math.max(60, Math.min(540, y-20));
                spawnUnitAt(draggedCard.type, gx, gy);
                createExplosion(gx+20, gy+20, '#f1c40f', 15);
            }
        }
        if (draggedCard.clone.parentNode) draggedCard.clone.parentNode.removeChild(draggedCard.clone);
        draggedCard.original.style.opacity = '';
        draggedCard.original.classList.remove('touched');
        dropZone.classList.remove('active');
        draggedCard = null;
    };
    
    document.addEventListener('mousemove', e => { if (draggedCard) updateDrag(e); });
    document.addEventListener('touchmove', e => { if (draggedCard) { e.preventDefault(); updateDrag(e); } }, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    
    const wrapper = document.querySelector('.cards-scroll-wrapper');
    let isScrolling = false, scrollStart = 0;
    if (wrapper) {
        wrapper.addEventListener('touchstart', e => { if (!draggedCard) { isScrolling=true; scrollStart=e.touches[0].clientX-wrapper.scrollLeft; } }, { passive: true });
        wrapper.addEventListener('touchmove', e => { if (!draggedCard && isScrolling) wrapper.scrollLeft = scrollStart - e.touches[0].clientX; }, { passive: true });
        wrapper.addEventListener('touchend', () => { isScrolling=false; });
    }
}

document.addEventListener('touchstart', e => { if (e.touches.length>1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', e => { const now=Date.now(); if (now-lastTouchEnd<=300) e.preventDefault(); lastTouchEnd=now; }, { passive: false });

document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', e => {
        if (draggedCard) return;
        const type = card.dataset.type;
        const cost = parseInt(card.dataset.cost);
        if (!card.classList.contains('disabled') && elixir >= cost) spawnUnit(type);
    });
});

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
document.addEventListener('click', () => { if (audioContext.state==='suspended') audioContext.resume(); }, { once: true });

window.addEventListener('load', () => {
    console.log('🎮 CLASH RAYON MULTIPLAYER v2.0');
    initSupabase();
});