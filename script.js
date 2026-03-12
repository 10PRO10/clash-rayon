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
        this.element.style.backgroundColor = color;
        this.element.style.left = x + 'px';
        this.element.style.top = y + 'px';
        document.getElementById('game-area').appendChild(this.element);
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.3;
        this.life -= 0.02;
        
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
        this.element.style.opacity = this.life;
        this.element.style.transform = `scale(${this.life})`;
        
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
    'gopnik': { cost: 3, hp: 100, speed: 1.8, damage: 15, attackSpeed: 1000, range: 40, icon: '👕', name: 'Гопник', size: 35, color: '#e74c3c' },
    'babka': { cost: 5, hp: 60, speed: 1.2, damage: 25, attackSpeed: 1500, range: 120, icon: '👵', name: 'Бабушка', size: 35, color: '#9b59b6' },
    'dvornik': { cost: 4, hp: 150, speed: 1.0, damage: 20, attackSpeed: 1200, range: 45, icon: '🧹', name: 'Дворник', size: 35, color: '#27ae60' },
    'podezdniy': { cost: 6, hp: 200, speed: 0.8, damage: 30, attackSpeed: 1500, range: 50, icon: '🚪', name: 'Подъездный', size: 40, color: '#e67e22' },
    'sigareta': { cost: 2, hp: 30, speed: 3.0, damage: 40, attackSpeed: 800, range: 30, icon: '🚬', name: 'Сигарета', size: 25, color: '#95a5a6' }
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
    constructor(type, isPlayer) {
        const config = unitsConfig[type];
        Object.assign(this, {
            type,
            isPlayer,
            hp: config.hp,
            maxHp: config.hp,
            speed: config.speed,
            damage: config.damage,
            attackSpeed: config.attackSpeed,
            range: config.range,
            icon: config.icon,
            size: config.size,
            color: config.color,
            x: 160 + Math.random() * 80,
            y: isPlayer ? 530 : 70,
            lastAttackTime: 0,
            state: 'moving'
        });
        
        this.element = document.createElement('div');
        this.element.className = `unit ${isPlayer ? 'player' : 'enemy'}`;
        this.element.innerHTML = `<div style="z-index:2; font-size: 28px;">${this.icon}</div>`;
        
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
        const percent = (this.hp / this.maxHp) * 100;
        fill.style.width = percent + '%';
        fill.className = 'hp-fill' + (percent <= 25 ? ' low' : percent <= 50 ? ' medium' : '');
    }
    
    applySeparation(units) {
        let sepX = 0, sepY = 0, count = 0;
        
        for (let other of units) {
            if (other === this) continue;
            const dx = this.x - other.x;
            const dy = this.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < this.size && dist > 0) {
                sepX += dx / dist;
                sepY += dy / dist;
                count++;
            }
        }
        
        return count > 0 ? { x: sepX / count * 2, y: sepY / count * 2 } : { x: 0, y: 0 };
    }
    
    findTarget(enemies) {
        let closest = null;
        let closestDist = this.range + 50;
        
        for (let enemy of enemies) {
            const dx = Math.abs(this.x - enemy.x);
            const dy = Math.abs(this.y - enemy.y);
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < closestDist) {
                closestDist = dist;
                closest = enemy;
            }
        }
        return closest;
    }
    
    canAttack(target) {
        if (!target) return false;
        const dx = Math.abs(this.x - target.x);
        const dy = Math.abs(this.y - target.y);
        return Math.sqrt(dx * dx + dy * dy) <= this.range + 25;
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
    
    move(alliedUnits) {
        const direction = this.isPlayer ? -1 : 1;
        const separation = this.applySeparation(alliedUnits);
        
        let moveX = separation.x * 0.5;
        let moveY = (this.speed + separation.y * 0.3) * direction;
        
        if (Math.random() < 0.02) moveX += (Math.random() - 0.5) * 10;
        
        this.x = Math.max(145, Math.min(255, this.x + moveX));
        this.y = this.isPlayer ? Math.max(60, this.y + moveY) : Math.min(540, this.y + moveY);
        
        this.updatePosition();
    }
    
    takeDamage(damage) {
        this.hp -= damage;
        this.updateHpBar();
        this.element.style.filter = 'brightness(2)';
        setTimeout(() => this.element.style.filter = '', 100);
        
        if (this.hp <= 0) {
            createExplosion(this.x + 20, this.y + 20, this.color, 12);
            playSound('hit');
            this.die();
        }
    }
    
    showDamage(amount) {
        const effect = document.createElement('div');
        effect.className = 'damage-text';
        effect.textContent = '-' + amount;
        effect.style.left = (this.x + 10) + 'px';
        effect.style.top = (this.y - 20) + 'px';
        gameArea.appendChild(effect);
        setTimeout(() => effect.remove(), 1000);
    }
    
    die() {
        this.element.remove();
        const array = this.isPlayer ? playerUnits : enemyUnits;
        const index = array.indexOf(this);
        if (index > -1) array.splice(index, 1);
    }
    
    update() {
        if (!gameActive) return;
        
        const enemies = this.isPlayer ? enemyUnits : playerUnits;
        const tower = this.isPlayer ? enemyTower : playerTower;
        const towerY = this.isPlayer ? 110 : 490;
        
        const target = this.findTarget(enemies);
        const distToTower = Math.abs(this.y - towerY);
        
        if (target && this.canAttack(target)) {
            this.attack(target);
        } else if (distToTower < this.range + 20) {
            this.attackTower(tower);
        } else {
            this.state = 'moving';
            this.move(this.isPlayer ? playerUnits : enemyUnits);
        }
    }
}

// ==================== ИГРОВЫЕ ФУНКЦИИ ====================

function updateUI() {
    const percent = (elixir / maxElixir) * 100;
    elixirFill.style.width = percent + '%';
    elixirText.textContent = Math.floor(elixir) + '/' + maxElixir;
    
    Object.keys(unitsConfig).forEach(type => {
        const card = document.getElementById(`card-${type}`);
        if (card) card.classList.toggle('disabled', elixir < unitsConfig[type].cost);
    });
}

function updateTowerHP(hpBar, hp) {
    hpBar.style.width = Math.max(0, (hp / maxTowerHP) * 100) + '%';
}

function spawnUnit(type) {
    const cost = unitsConfig[type].cost;
    if (elixir >= cost && gameActive) {
        elixir -= cost;
        updateUI();
        playerUnits.push(new Unit(type, true));
    }
}

function spawnEnemyUnit() {
    if (!gameActive) return;
    
    const availableUnits = ['gopnik', 'dvornik'];
    if (enemyElixir >= 6) availableUnits.push('podezdniy');
    if (enemyElixir >= 5) availableUnits.push('babka');
    if (enemyElixir >= 2) availableUnits.push('sigareta');
    
    const randomType = availableUnits[Math.floor(Math.random() * availableUnits.length)];
    const cost = unitsConfig[randomType].cost;
    
    if (enemyElixir >= cost) {
        enemyElixir -= cost;
        enemyUnits.push(new Unit(randomType, false));
    }
}

function updateParticles() {
    particles = particles.filter(p => p.update());
}

function gameLoop() {
    if (!gameActive) return;
    
    enemyElixir = Math.min(10, enemyElixir + 0.3);
    
    playerUnits.forEach(unit => unit.update());
    enemyUnits.forEach(unit => unit.update());
    updateParticles();
    
    requestAnimationFrame(gameLoop);
}

function endGame(result) {
    gameActive = false;
    
    const gameOverScreen = document.getElementById('game-over');
    const title = document.getElementById('game-over-title');
    
    gameOverScreen.classList.remove('hidden');
    title.textContent = result === 'win' ? '🎉 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ!';
    title.style.color = result === 'win' ? '#2ecc71' : '#e74c3c';
    
    playSound(result);
    if (result === 'win') createExplosion(200, 300, '#f1c40f', 50);
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

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

updateUI();
gameLoop();

console.log('✅ CLASH RAYON ЗАПУЩЕН! 🔥');
console.log('🎵 Кликни для включения звука');