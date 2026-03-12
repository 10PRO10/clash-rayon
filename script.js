// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let elixir = 5;
const maxElixir = 10;
const elixirRate = 0.4;
let playerUnits = [];
let enemyUnits = [];
let particles = [];
let gameActive = true;
let enemyTowerHP = 1000;
let playerTowerHP = 1000;
const maxTowerHP = 1000;
let enemyElixir = 0;

// ==================== АУДИО СИСТЕМА ====================
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        const sounds = {
            spawn: { freq: 400, duration: 0.1, type: 'sine' },
            attack: { freq: 200, duration: 0.15, type: 'square' },
            hit: { freq: 150, duration: 0.1, type: 'sawtooth' },
            win: { pattern: [523.25, 659.25, 783.99, 1046.50], duration: 0.3 },
            lose: { pattern: [783.99, 659.25, 523.25, 392.00], duration: 0.3 }
        };
        
        const sound = sounds[type];
        if (!sound) return;
        
        if (sound.pattern) {
            sound.pattern.forEach((freq, i) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.frequency.value = freq;
                osc.type = type === 'lose' ? 'sawtooth' : 'sine';
                gain.gain.setValueAtTime(0.2, audioContext.currentTime + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.1 + sound.duration);
                osc.start(audioContext.currentTime + i * 0.1);
                osc.stop(audioContext.currentTime + i * 0.1 + sound.duration);
            });
        } else {
            oscillator.frequency.value = sound.freq;
            oscillator.type = sound.type;
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sound.duration);
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + sound.duration);
        }
    } catch (e) {
        console.log('Audio error:', e);
    }
}

// ==================== СИСТЕМА ЧАСТИЦ ====================
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 8;
        this.vy = (Math.random() - 0.5) * 8;
        this.life = 1;
        this.color = color;
        this.element = document.createElement('div');
        this.element.className = 'particle';
        this.element.style.cssText = `
            position: absolute;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: ${color};
            left: ${x}px;
            top: ${y}px;
            pointer-events: none;
            z-index: 100;
        `;
        document.getElementById('game-area').appendChild(this.element);
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.3;
        this.life -= 0.02;
        
        this.element.style.cssText = `
            position: absolute;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: ${this.color};
            left: ${this.x}px;
            top: ${this.y}px;
            opacity: ${this.life};
            transform: scale(${this.life});
            pointer-events: none;
            z-index: 100;
        `;
        
        if (this.life <= 0) {
            this.element.remove();
            return false;
        }
        return true;
    }
}

function createExplosion(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

// ==================== КОНФИГУРАЦИЯ ЮНИТОВ ====================
const unitsConfig = {
    'gopnik': { cost: 3, hp: 100, speed: 1.8, damage: 15, attackSpeed: 1000, range: 40, icon: '👕', size: 35, color: '#e74c3c' },
    'babka': { cost: 5, hp: 60, speed: 1.2, damage: 25, attackSpeed: 1500, range: 120, icon: '👵', size: 35, color: '#9b59b6' },
    'dvornik': { cost: 4, hp: 150, speed: 1.0, damage: 20, attackSpeed: 1200, range: 45, icon: '🧹', size: 35, color: '#27ae60' },
    'podezdniy': { cost: 6, hp: 200, speed: 0.8, damage: 30, attackSpeed: 1500, range: 50, icon: '🚪', size: 40, color: '#e67e22' },
    'sigareta': { cost: 2, hp: 30, speed: 3.0, damage: 40, attackSpeed: 800, range: 30, icon: '🚬', size: 25, color: '#95a5a6' }
};

// ==================== DOM ЭЛЕМЕНТЫ ====================
const gameArea = document.getElementById('game-area');
const elixirFill = document.getElementById('elixir-fill');
const elixirText = document.getElementById('elixir-text');
const enemyTower = document.getElementById('enemy-tower');
const playerTower = document.getElementById('player-tower');
const enemyHPBar = document.getElementById('enemy-hp');
const playerHPBar = document.getElementById('player-hp');

// ==================== КЛАСС ЮНИТА ====================
class Unit {
    constructor(type, isPlayer, customX, customY) {
        const cfg = unitsConfig[type];
        this.type = type;
        this.isPlayer = isPlayer;
        this.hp = cfg.hp;
        this.maxHp = cfg.hp;
        this.speed = cfg.speed;
        this.damage = cfg.damage;
        this.attackSpeed = cfg.attackSpeed;
        this.range = cfg.range;
        this.icon = cfg.icon;
        this.size = cfg.size;
        this.color = cfg.color;
        this.x = customX !== undefined ? customX : (160 + Math.random() * 80);
        this.y = customY !== undefined ? customY : (isPlayer ? 530 : 70);
        this.lastAttackTime = 0;
        this.state = 'moving';
        
        this.element = document.createElement('div');
        this.element.className = `unit ${isPlayer ? 'player' : 'enemy'}`;
        this.element.innerHTML = `<div style="z-index:2;font-size:28px;">${this.icon}</div>`;
        
        this.hpBar = document.createElement('div');
        this.hpBar.className = 'hp-bar';
        this.hpBar.innerHTML = '<div class="hp-fill"></div>';
        this.element.appendChild(this.hpBar);
        
        this.updatePosition();
        gameArea.appendChild(this.element);
        
        createExplosion(this.x + 20, this.y + 20, isPlayer ? '#3498db' : '#e74c3c', 8);
        playSound('spawn');
    }
    
    updatePosition() {
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
    }
    
    updateHpBar() {
        const fill = this.hpBar.querySelector('.hp-fill');
        const p = (this.hp / this.maxHp) * 100;
        fill.style.width = p + '%';
        fill.className = 'hp-fill' + (p <= 25 ? ' low' : p <= 50 ? ' medium' : '');
    }
    
    applySeparation(units) {
        let sx = 0, sy = 0, cnt = 0;
        for (let o of units) {
            if (o === this) continue;
            const dx = this.x - o.x;
            const dy = this.y - o.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < this.size && d > 0) {
                sx += dx / d;
                sy += dy / d;
                cnt++;
            }
        }
        return cnt > 0 ? { x: sx / cnt * 2, y: sy / cnt * 2 } : { x: 0, y: 0 };
    }
    
    findTarget(enemies) {
        let closest = null;
        let minD = this.range + 50;
        for (let e of enemies) {
            const d = Math.sqrt((this.x - e.x) ** 2 + (this.y - e.y) ** 2);
            if (d < minD) {
                minD = d;
                closest = e;
            }
        }
        return closest;
    }
    
    canAttack(t) {
        if (!t) return false;
        return Math.sqrt((this.x - t.x) ** 2 + (this.y - t.y) ** 2) <= this.range + 25;
    }
    
    attack(target) {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackSpeed) return;
        this.lastAttackTime = now;
        this.state = 'attacking';
        this.element.classList.add('attacking');
        setTimeout(() => this.element.classList.remove('attacking'), 200);
        target.takeDamage(this.damage);
        this.showDamage(this.damage);
        playSound('attack');
        setTimeout(() => { this.state = 'moving'; }, this.attackSpeed);
    }
    
    attackTower(tower) {
        const now = Date.now();
        if (now - this.lastAttackTime < this.attackSpeed) return;
        this.lastAttackTime = now;
        this.state = 'attacking';
        tower.classList.add('hit');
        setTimeout(() => tower.classList.remove('hit'), 300);
        
        const isEnemy = tower === enemyTower;
        if (isEnemy) {
            enemyTowerHP -= this.damage;
            updateTowerHP(enemyHPBar, enemyTowerHP);
            createExplosion(tower.offsetLeft + 35, tower.offsetTop + 45, '#e74c3c', 5);
            if (enemyTowerHP <= 0) endGame('win');
        } else {
            playerTowerHP -= this.damage;
            updateTowerHP(playerHPBar, playerTowerHP);
            createExplosion(tower.offsetLeft + 35, tower.offsetTop + 45, '#3498db', 5);
            if (playerTowerHP <= 0) endGame('lose');
        }
        this.showDamage(this.damage);
        playSound('hit');
        setTimeout(() => { this.state = 'moving'; }, this.attackSpeed);
    }
    
    move(allied) {
        const dir = this.isPlayer ? -1 : 1;
        const sep = this.applySeparation(allied);
        let mx = sep.x * 0.5;
        let my = (this.speed + sep.y * 0.3) * dir;
        if (Math.random() < 0.02) mx += (Math.random() - 0.5) * 10;
        this.x = Math.max(145, Math.min(255, this.x + mx));
        this.y = this.isPlayer ? Math.max(60, this.y + my) : Math.min(540, this.y + my);
        this.updatePosition();
    }
    
    takeDamage(dmg) {
        this.hp -= dmg;
        this.updateHpBar();
        this.element.style.filter = 'brightness(2)';
        setTimeout(() => this.element.style.filter = '', 100);
        if (this.hp <= 0) {
            createExplosion(this.x + 20, this.y + 20, this.color, 12);
            playSound('hit');
            this.die();
        }
    }
    
    showDamage(amt) {
        const el = document.createElement('div');
        el.className = 'damage-text';
        el.textContent = '-' + amt;
        el.style.cssText = `
            position: absolute;
            color: #fff;
            font-weight: bold;
            font-size: 20px;
            pointer-events: none;
            animation: damageFloat 1s ease-out forwards;
            z-index: 100;
            text-shadow: 2px 2px 4px #000;
            left: ${this.x + 10}px;
            top: ${this.y - 20}px;
        `;
        gameArea.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }
    
    die() {
        this.element.remove();
        const arr = this.isPlayer ? playerUnits : enemyUnits;
        const i = arr.indexOf(this);
        if (i > -1) arr.splice(i, 1);
    }
    
    update() {
        if (!gameActive) return;
        const enemies = this.isPlayer ? enemyUnits : playerUnits;
        const tower = this.isPlayer ? enemyTower : playerTower;
        const tY = this.isPlayer ? 110 : 490;
        const target = this.findTarget(enemies);
        const dT = Math.abs(this.y - tY);
        
        if (target && this.canAttack(target)) {
            this.attack(target);
        } else if (dT < this.range + 20) {
            this.attackTower(tower);
        } else {
            this.state = 'moving';
            this.move(this.isPlayer ? playerUnits : enemyUnits);
        }
    }
}

// ==================== ИГРОВЫЕ ФУНКЦИИ ====================
function updateUI() {
    elixirFill.style.width = (elixir / maxElixir * 100) + '%';
    elixirText.textContent = Math.floor(elixir) + '/' + maxElixir;
    
    Object.keys(unitsConfig).forEach(t => {
        const c = document.getElementById(`card-${t}`);
        if (c) c.classList.toggle('disabled', elixir < unitsConfig[t].cost);
    });
}

function updateTowerHP(bar, hp) {
    bar.style.width = Math.max(0, (hp / maxTowerHP) * 100) + '%';
}

function spawnUnit(type) {
    const cost = unitsConfig[type].cost;
    if (elixir >= cost && gameActive) {
        elixir -= cost;
        updateUI();
        playerUnits.push(new Unit(type, true));
    }
}

function spawnUnitAt(type, x, y) {
    const cost = unitsConfig[type].cost;
    if (elixir >= cost && gameActive) {
        elixir -= cost;
        updateUI();
        const u = new Unit(type, true, x, y);
        playerUnits.push(u);
    }
}

function spawnEnemyUnit() {
    if (!gameActive) return;
    const avail = ['gopnik', 'dvornik'];
    if (enemyElixir >= 6) avail.push('podezdniy');
    if (enemyElixir >= 5) avail.push('babka');
    if (enemyElixir >= 2) avail.push('sigareta');
    const t = avail[Math.floor(Math.random() * avail.length)];
    const cost = unitsConfig[t].cost;
    if (enemyElixir >= cost) {
        enemyElixir -= cost;
        enemyUnits.push(new Unit(t, false));
    }
}

function updateParticles() {
    particles = particles.filter(p => p.update());
}

function gameLoop() {
    if (!gameActive) return;
    enemyElixir = Math.min(10, enemyElixir + 0.3);
    playerUnits.forEach(u => u.update());
    enemyUnits.forEach(u => u.update());
    updateParticles();
    requestAnimationFrame(gameLoop);
}

function endGame(result) {
    gameActive = false;
    const screen = document.getElementById('game-over');
    const title = document.getElementById('game-over-title');
    screen.classList.remove('hidden');
    title.textContent = result === 'win' ? '🎉 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ!';
    title.style.color = result === 'win' ? '#2ecc71' : '#e74c3c';
    playSound(result);
    if (result === 'win') createExplosion(200, 300, '#f1c40f', 50);
}

// ==================== МОБИЛЬНЫЕ УПРАВЛЕНИЯ ====================
let draggedCard = null;
let dropZone = null;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function initMobileControls() {
    // Зона сброса
    dropZone = document.createElement('div');
    dropZone.className = 'drop-zone';
    gameArea.appendChild(dropZone);
    
    // Подсказка для мобильных
    if (isMobile) {
        const hint = document.createElement('div');
        hint.className = 'swipe-hint';
        hint.textContent = '👆 Тяни карту на поле';
        gameArea.appendChild(hint);
        setTimeout(() => hint.remove(), 6000);
    }
    
    // Инициализация карточек
    document.querySelectorAll('.card').forEach(card => {
        const type = card.dataset.type;
        const cost = parseInt(card.dataset.cost);
        
        const startDrag = (e) => {
            if (card.classList.contains('disabled') || elixir < cost) return;
            e.preventDefault();
            
            draggedCard = { type, cost, original: card, clone: card.cloneNode(true) };
            draggedCard.clone.classList.add('dragging');
            document.body.appendChild(draggedCard.clone);
            card.style.opacity = '0.3';
            card.classList.add('touched');
            updateDrag(e);
        };
        
        card.addEventListener('mousedown', startDrag);
        card.addEventListener('touchstart', startDrag, { passive: false });
    });
    
    const updateDrag = (e) => {
        if (!draggedCard) return;
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        if (!clientX || !clientY) return;
        
        draggedCard.clone.style.left = (clientX - 45) + 'px';
        draggedCard.clone.style.top = (clientY - 57) + 'px';
        
        const rect = gameArea.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            dropZone.classList.add('active');
            dropZone.style.left = (x - 30) + 'px';
            dropZone.style.top = (y - 30) + 'px';
        } else {
            dropZone.classList.remove('active');
        }
    };
    
    const endDrag = (e) => {
        if (!draggedCard) return;
        
        const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
        const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
        
        if (clientX && clientY) {
            const rect = gameArea.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            
            if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
                const gameX = Math.max(145, Math.min(255, x - 20));
                const gameY = Math.max(60, Math.min(540, y - 20));
                spawnUnitAt(draggedCard.type, gameX, gameY);
                createExplosion(gameX + 20, gameY + 20, '#f1c40f', 15);
            }
        }
        
        if (draggedCard.clone.parentNode) {
            draggedCard.clone.parentNode.removeChild(draggedCard.clone);
        }
        draggedCard.original.style.opacity = '';
        draggedCard.original.classList.remove('touched');
        dropZone.classList.remove('active');
        draggedCard = null;
    };
    
    document.addEventListener('mousemove', (e) => { if (draggedCard) updateDrag(e); });
    document.addEventListener('touchmove', (e) => {
        if (draggedCard) {
            e.preventDefault();
            updateDrag(e);
        }
    }, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    
    // Скролл карточек
    const wrapper = document.querySelector('.cards-scroll-wrapper');
    let isScrolling = false;
    let scrollStart = 0;
    
    if (wrapper) {
        wrapper.addEventListener('touchstart', (e) => {
            if (!draggedCard) {
                isScrolling = true;
                scrollStart = e.touches[0].clientX - wrapper.scrollLeft;
            }
        }, { passive: true });
        
        wrapper.addEventListener('touchmove', (e) => {
            if (!draggedCard && isScrolling) {
                wrapper.scrollLeft = scrollStart - e.touches[0].clientX;
            }
        }, { passive: true });
        
        wrapper.addEventListener('touchend', () => { isScrolling = false; });
    }
}

// Предотвращение зума
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, { passive: false });

// ==================== КЛИК ПО КАРТОЧКАМ (для ПК) ====================
document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
        if (draggedCard) return; // Если был драг - не кликать
        const type = card.dataset.type;
        const cost = parseInt(card.dataset.cost);
        if (!card.classList.contains('disabled') && elixir >= cost) {
            spawnUnit(type);
        }
    });
});

// ==================== ЗАПУСК ====================
setInterval(() => {
    if (elixir < maxElixir && gameActive) {
        elixir = Math.min(maxElixir, elixir + elixirRate);
        updateUI();
    }
}, 1000);

setInterval(spawnEnemyUnit, 4000);

document.addEventListener('click', () => {
    if (audioContext.state === 'suspended') audioContext.resume();
}, { once: true });

window.addEventListener('load', () => {
    initMobileControls();
    updateUI();
    gameLoop();
    console.log('✅ CLASH RAYON ЗАПУЩЕН! 📱 Мобильные свайпы активны!');
});