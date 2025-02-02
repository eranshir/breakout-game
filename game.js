// Add these classes before the Game class
class Paddle {
    constructor(gameWidth, gameHeight) {
        this.width = 100;
        this.height = 20;
        this.position = {
            x: gameWidth / 2 - this.width / 2,
            y: gameHeight - this.height - 10
        };
        this.speed = 500; // pixels per second
        this.gameWidth = gameWidth;
        this.velocity = 0;
    }

    moveLeft() { this.velocity = -this.speed; }
    moveRight() { this.velocity = this.speed; }
    stop() { this.velocity = 0; }

    update(deltaTime) {
        if (!deltaTime) return;
        
        this.position.x += this.velocity * (deltaTime / 1000);

        // Keep paddle within game bounds
        if (this.position.x < 0) this.position.x = 0;
        if (this.position.x + this.width > this.gameWidth) {
            this.position.x = this.gameWidth - this.width;
        }
    }

    draw(ctx) {
        ctx.fillStyle = '#0095DD';
        ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
    }
}

class Brick {
    constructor(x, y) {
        this.width = 20;
        this.height = 5;
        this.position = { x, y };
        this.markedForDeletion = false;
        this.hasPowerUp = Math.random() < 0.2; // 20% chance of power-up
        this.powerUpType = this.getRandomPowerUpType();
        this.color = this.getRandomColor();
    }

    getRandomPowerUpType() {
        const types = ['enlarge', 'shrink', 'multiball', 'speedup', 'slowdown',
                      'fireball', 'guns', 'gravity'];
        return types[Math.floor(Math.random() * types.length)];
    }

    getRandomColor() {
        const colors = [
            '#FF0000', // Red
            '#00FF00', // Green
            '#0000FF', // Blue
            '#FFFF00', // Yellow
            '#FF00FF', // Magenta
            '#00FFFF'  // Cyan
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    draw(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
        
        // Add a 3D effect
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.position.x, this.position.y, this.width, this.height);
        
        // Highlight
        ctx.beginPath();
        ctx.moveTo(this.position.x, this.position.y + this.height);
        ctx.lineTo(this.position.x, this.position.y);
        ctx.lineTo(this.position.x + this.width, this.position.y);
        ctx.strokeStyle = '#FFFFFF33';
        ctx.stroke();
        
        // Shadow
        ctx.beginPath();
        ctx.moveTo(this.position.x + this.width, this.position.y);
        ctx.lineTo(this.position.x + this.width, this.position.y + this.height);
        ctx.lineTo(this.position.x, this.position.y + this.height);
        ctx.strokeStyle = '#00000033';
        ctx.stroke();
    }
}

class Ball {
    constructor(gameWidth, gameHeight) {
        this.gameWidth = gameWidth;
        this.gameHeight = gameHeight;
        this.size = 8;
        this.reset();
        this.fireball = false;
        this.gravity = false;
        this.gravityForce = 400; // pixels per second squared
        this.stuck = true;  // Add this new property
    }

    reset() {
        this.position = {
            x: this.gameWidth / 2,
            y: this.gameHeight / 2
        };
        this.speed = {
            x: 300,
            y: -300
        };
        this.stuck = true;  // Reset to stuck state
    }

    release() {
        this.stuck = false;
    }

    update(deltaTime) {
        if (!deltaTime) return;

        if (this.stuck) {
            // If stuck, follow the paddle
            this.position.x = game.paddle.position.x + game.paddle.width / 2;
            this.position.y = game.paddle.position.y - this.size;
            return;
        }

        if (this.gravity) {
            // Apply gravity
            this.speed.y += this.gravityForce * (deltaTime / 1000);
        }

        this.position.x += this.speed.x * (deltaTime / 1000);
        this.position.y += this.speed.y * (deltaTime / 1000);

        // Wall collisions
        if (this.position.x + this.size > this.gameWidth || this.position.x - this.size < 0) {
            this.speed.x = -this.speed.x;
        }
        if (this.position.y - this.size < 0) {
            this.speed.y = -this.speed.y;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.size, 0, Math.PI * 2);
        // Change color for fireball
        ctx.fillStyle = this.fireball ? '#ff4400' : '#0095DD';
        ctx.fill();
        if (this.fireball) {
            // Add flame effect
            ctx.beginPath();
            ctx.arc(this.position.x, this.position.y, this.size * 1.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 68, 0, 0.3)';
            ctx.fill();
        }
        ctx.closePath();
    }

    checkCollision(paddle) {
        // Paddle collision
        if (this.position.y + this.size > paddle.position.y &&
            this.position.x > paddle.position.x &&
            this.position.x < paddle.position.x + paddle.width) {
            this.position.y = paddle.position.y - this.size;
            this.speed.y = -this.speed.y;

            // Add angle based on where ball hits the paddle
            const hitPosition = (this.position.x - paddle.position.x) / paddle.width;
            this.speed.x = 300 * (hitPosition - 0.5); // -150 to 150 px/s
        }

        // Bottom screen collision (game over)
        if (this.position.y + this.size > this.gameHeight) {
            return true; // Ball lost
        }

        return false;
    }

    checkBrickCollision(brick) {
        if (!brick || brick.markedForDeletion) return false;

        const ballLeft = this.position.x - this.size;
        const ballRight = this.position.x + this.size;
        const ballTop = this.position.y - this.size;
        const ballBottom = this.position.y + this.size;

        const brickLeft = brick.position.x;
        const brickRight = brick.position.x + brick.width;
        const brickTop = brick.position.y;
        const brickBottom = brick.position.y + brick.height;

        if (ballRight > brickLeft && 
            ballLeft < brickRight && 
            ballBottom > brickTop && 
            ballTop < brickBottom) {
            
            if (!this.fireball) {
                // Normal ball behavior - bounce
                const fromBottom = Math.abs(ballTop - brickBottom);
                const fromTop = Math.abs(ballBottom - brickTop);
                const fromLeft = Math.abs(ballRight - brickLeft);
                const fromRight = Math.abs(ballLeft - brickRight);

                const min = Math.min(fromBottom, fromTop, fromLeft, fromRight);

                if (min === fromTop || min === fromBottom) {
                    this.speed.y = -this.speed.y;
                } else {
                    this.speed.x = -this.speed.x;
                }
            }
            // Fireball just destroys without bouncing

            brick.markedForDeletion = true;
            return true;
        }
        return false;
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.position = { x, y };
        this.width = 20;
        this.height = 20;
        this.speed = 150;
        this.type = type;
        this.markedForDeletion = false;
        this.color = this.getColorForType(type);
    }

    getColorForType(type) {
        switch(type) {
            case 'enlarge': return '#00ff00';
            case 'shrink': return '#ff0000';
            case 'multiball': return '#0000ff';
            case 'speedup': return '#ffff00';
            case 'slowdown': return '#00ffff';
            default: return '#ffffff';
        }
    }

    update(deltaTime) {
        if (!deltaTime) return;
        this.position.y += this.speed * (deltaTime / 1000);
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.rect(this.position.x, this.position.y, this.width, this.height);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.closePath();
    }
}

class Particle {
    constructor(x, y, color, speed = { x: 0, y: 0 }) {
        this.position = { x, y };
        this.size = 2;
        this.color = color;
        this.speed = speed;
        this.alpha = 1;
        this.fadeSpeed = 0.02;
    }

    update() {
        this.position.x += this.speed.x;
        this.position.y += this.speed.y;
        this.alpha -= this.fadeSpeed;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.position.x, this.position.y, this.size, this.size);
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y) {
        this.position = { x, y };
        this.width = 4;
        this.height = 10;
        this.speed = -400; // Negative because moving up
        this.markedForDeletion = false;
    }

    update(deltaTime) {
        if (!deltaTime) return;
        this.position.y += this.speed * (deltaTime / 1000);
        
        // Remove bullet if it goes off screen
        if (this.position.y < 0) {
            this.markedForDeletion = true;
        }
    }

    draw(ctx) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
    }

    checkBrickCollision(brick) {
        if (!brick || brick.markedForDeletion) return false;

        return (this.position.x < brick.position.x + brick.width &&
                this.position.x + this.width > brick.position.x &&
                this.position.y < brick.position.y + brick.height &&
                this.position.y + this.height > brick.position.y);
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameState = 'menu'; // menu, playing, paused, gameOver
        
        // Initialize game loop
        this.lastTime = 0;
        this.init();

        this.paddle = new Paddle(this.canvas.width, this.canvas.height);
        this.balls = [new Ball(this.canvas.width, this.canvas.height)];
        
        // Add input handling
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));

        this.bricks = [];
        this.score = 0;
        this.lives = 3;
        this.setupLevel();

        this.powerUps = [];
        this.particles = [];
        this.sounds = {};
        this.loadSounds();

        this.bullets = [];
        this.hasGuns = false;
        this.lastShot = 0;
        this.shootDelay = 250; // Minimum time between shots in ms

        // Add new power-up types
        this.powerUpTypes = ['enlarge', 'shrink', 'multiball', 'speedup', 'slowdown', 
                            'fireball', 'guns', 'gravity'];

        // Add space bar handling for shooting
        document.addEventListener('keydown', (event) => {
            if (event.code === 'Space' && this.hasGuns && this.gameState === 'playing') {
                this.shoot();
            }
        });
    }

    init() {
        // Start the game loop
        requestAnimationFrame(this.gameLoop.bind(this));
    }

    gameLoop(timestamp) {
        // Calculate delta time
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and render based on game state
        switch(this.gameState) {
            case 'menu':
                this.drawMenu();
                break;
            case 'playing':
                this.update(deltaTime);
                this.render();
                break;
            case 'paused':
                this.drawPaused();
                break;
            case 'gameOver':
                this.drawGameOver();
                break;
        }

        requestAnimationFrame(this.gameLoop.bind(this));
    }

    handleKeyDown(event) {
        switch(event.key) {
            case 'ArrowLeft':
                this.paddle.moveLeft();
                break;
            case 'ArrowRight':
                this.paddle.moveRight();
                break;
            case ' ':
                if (this.gameState === 'menu') {
                    this.gameState = 'playing';
                } else if (this.gameState === 'playing') {
                    // Release all stuck balls when space is pressed
                    this.balls.forEach(ball => ball.release());
                    if (this.hasGuns) this.shoot();
                }
                break;
            case 'Escape':
                if (this.gameState === 'playing') this.gameState = 'paused';
                else if (this.gameState === 'paused') this.gameState = 'playing';
                break;
        }
    }

    handleKeyUp(event) {
        switch(event.key) {
            case 'ArrowLeft':
                if (this.paddle.velocity < 0) this.paddle.stop();
                break;
            case 'ArrowRight':
                if (this.paddle.velocity > 0) this.paddle.stop();
                break;
        }
    }

    update(deltaTime) {
        if (this.lives <= 0) {
            this.gameState = 'gameOver';
            return;
        }

        this.paddle.update(deltaTime);
        
        // Update all balls
        this.balls.forEach((ball, index) => {
            ball.update(deltaTime);
            
            // Check paddle collision for each ball
            if (ball.checkCollision(this.paddle)) {
                if (this.balls.length === 1) {
                    this.lives--;
                    ball.reset();
                } else {
                    // Remove the ball if it's not the last one
                    this.balls.splice(index, 1);
                }
            }
        });

        // Update power-ups
        this.powerUps.forEach(powerUp => {
            powerUp.update(deltaTime);
            
            // Check paddle collision with power-ups
            if (this.checkPowerUpCollision(powerUp)) {
                this.createParticles(
                    powerUp.position.x + powerUp.width / 2,
                    powerUp.position.y + powerUp.height / 2,
                    powerUp.color,
                    25
                );
                this.sounds.powerup.currentTime = 0;
                this.sounds.powerup.play();
                this.activatePowerUp(powerUp);
                powerUp.markedForDeletion = true;
            }
        });

        // Remove power-ups that are off screen or collected
        this.powerUps = this.powerUps.filter(powerUp => 
            !powerUp.markedForDeletion && powerUp.position.y < this.canvas.height
        );

        // Check brick collisions for all balls
        this.bricks.forEach(brick => {
            this.balls.forEach(ball => {
                if (ball.checkBrickCollision(brick)) {
                    this.score += 10;
                    this.createParticles(
                        brick.position.x + brick.width / 2,
                        brick.position.y + brick.height / 2,
                        brick.color
                    );
                    this.sounds.brick.currentTime = 0;
                    this.sounds.brick.play();
                    
                    if (brick.hasPowerUp) {
                        this.powerUps.push(new PowerUp(
                            brick.position.x + brick.width/2,
                            brick.position.y,
                            brick.powerUpType
                        ));
                    }
                }
            });
        });

        // Remove destroyed bricks
        this.bricks = this.bricks.filter(brick => !brick.markedForDeletion);

        // Check win condition
        if (this.bricks.length === 0) {
            this.setupLevel();
        }

        // Update bullets
        this.bullets.forEach(bullet => {
            bullet.update(deltaTime);
            this.bricks.forEach(brick => {
                if (bullet.checkBrickCollision(brick)) {
                    bullet.markedForDeletion = true;
                    brick.markedForDeletion = true;
                    this.score += 10;
                    this.createParticles(brick.position.x + brick.width/2, 
                                       brick.position.y + brick.height/2, 
                                       brick.color);
                }
            });
        });
        this.bullets = this.bullets.filter(bullet => !bullet.markedForDeletion);

        // Update particles
        this.particles = this.particles.filter(particle => {
            particle.update();
            return particle.alpha > 0;
        });
    }

    render() {
        this.paddle.draw(this.ctx);
        this.balls.forEach(ball => ball.draw(this.ctx));
        this.bricks.forEach(brick => brick.draw(this.ctx));
        this.powerUps.forEach(powerUp => powerUp.draw(this.ctx));
        
        // Draw particles
        this.particles.forEach(particle => particle.draw(this.ctx));

        // Draw bullets
        this.bullets.forEach(bullet => bullet.draw(this.ctx));

        // Draw score and lives
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '20px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 20, 30);
        this.ctx.fillText(`Lives: ${this.lives}`, this.canvas.width - 100, 30);
    }

    drawMenu() {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('BREAKOUT', this.canvas.width/2, this.canvas.height/2);
        this.ctx.font = '24px Arial';
        this.ctx.fillText('Press SPACE to start', this.canvas.width/2, this.canvas.height/2 + 50);
    }

    drawPaused() {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('PAUSED', this.canvas.width/2, this.canvas.height/2);
    }

    drawGameOver() {
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '48px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('GAME OVER', this.canvas.width/2, this.canvas.height/2);
    }

    setupLevel() {
        this.bricks = [];
        const patterns = [
            this.createStandardPattern,
            this.createPyramidPattern,
            this.createDiamondPattern,
            this.createCirclePattern
        ];
        
        // Choose a random pattern
        const pattern = patterns[Math.floor(Math.random() * patterns.length)];
        pattern.call(this);
    }

    createStandardPattern() {
        for (let y = 0; y < 20; y++) {
            for (let x = 0; x < 32; x++) {
                this.bricks.push(new Brick(
                    x * (20 + 2) + 35,
                    y * (5 + 2) + 30
                ));
            }
        }
    }

    createPyramidPattern() {
        const centerX = this.canvas.width / 2;
        for (let y = 0; y < 24; y++) {
            const bricksInRow = y + 1;
            const rowStartX = centerX - ((bricksInRow * 22) / 2);
            for (let x = 0; x < bricksInRow; x++) {
                this.bricks.push(new Brick(
                    rowStartX + x * 22,
                    this.canvas.height / 3 - y * 7
                ));
            }
        }
    }

    createDiamondPattern() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 3;
        const size = 16;

        // Top half
        for (let y = 0; y < size; y++) {
            const bricksInRow = y * 2 + 1;
            const rowStartX = centerX - ((bricksInRow * 22) / 2);
            for (let x = 0; x < bricksInRow; x++) {
                this.bricks.push(new Brick(
                    rowStartX + x * 22,
                    centerY - (y * 7)
                ));
            }
        }

        // Bottom half
        for (let y = size - 2; y >= 0; y--) {
            const bricksInRow = y * 2 + 1;
            const rowStartX = centerX - ((bricksInRow * 22) / 2);
            for (let x = 0; x < bricksInRow; x++) {
                this.bricks.push(new Brick(
                    rowStartX + x * 22,
                    centerY + ((size - y) * 7)
                ));
            }
        }
    }

    createCirclePattern() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 3;
        const radius = 150;
        const brickCount = 64;
        
        // Create more concentric circles
        for (let r = radius; r > 10; r -= 10) {
            const circumference = 2 * Math.PI * r;
            const bricksInCircle = Math.floor(brickCount * (r / radius));
            
            for (let i = 0; i < bricksInCircle; i++) {
                const angle = (i / bricksInCircle) * Math.PI * 2;
                const x = centerX + Math.cos(angle) * r - 10;
                const y = centerY + Math.sin(angle) * r - 2.5;
                
                this.bricks.push(new Brick(x, y));
            }
        }
    }

    checkPowerUpCollision(powerUp) {
        return (powerUp.position.y + powerUp.height > this.paddle.position.y &&
                powerUp.position.x < this.paddle.position.x + this.paddle.width &&
                powerUp.position.x + powerUp.width > this.paddle.position.x);
    }

    activatePowerUp(powerUp) {
        switch(powerUp.type) {
            case 'enlarge':
                this.paddle.width = Math.min(this.paddle.width * 1.5, 150);
                setTimeout(() => this.paddle.width = 100, 10000); // Reset after 10s
                break;
            case 'shrink':
                this.paddle.width = Math.max(this.paddle.width * 0.5, 50);
                setTimeout(() => this.paddle.width = 100, 10000);
                break;
            case 'multiball':
                // Add two new balls at current ball positions
                this.balls.forEach(ball => {
                    for (let i = 0; i < 2; i++) {
                        const newBall = new Ball(this.canvas.width, this.canvas.height);
                        newBall.position = {...ball.position};
                        newBall.speed = {
                            x: ball.speed.x * (Math.random() > 0.5 ? 1 : -1),
                            y: ball.speed.y * (Math.random() > 0.5 ? 1 : -1)
                        };
                        this.balls.push(newBall);
                    }
                });
                break;
            case 'speedup':
                this.balls.forEach(ball => {
                    ball.speed.x *= 1.5;
                    ball.speed.y *= 1.5;
                });
                setTimeout(() => {
                    this.balls.forEach(ball => {
                        ball.speed.x /= 1.5;
                        ball.speed.y /= 1.5;
                    });
                }, 10000);
                break;
            case 'slowdown':
                this.balls.forEach(ball => {
                    ball.speed.x *= 0.5;
                    ball.speed.y *= 0.5;
                });
                setTimeout(() => {
                    this.balls.forEach(ball => {
                        ball.speed.x /= 0.5;
                        ball.speed.y /= 0.5;
                    });
                }, 10000);
                break;
            case 'fireball':
                this.balls.forEach(ball => {
                    ball.fireball = true;
                });
                setTimeout(() => {
                    this.balls.forEach(ball => {
                        ball.fireball = false;
                    });
                }, 10000);
                break;
            case 'guns':
                this.hasGuns = true;
                setTimeout(() => {
                    this.hasGuns = false;
                }, 10000);
                break;
            case 'gravity':
                this.balls.forEach(ball => {
                    ball.gravity = true;
                });
                setTimeout(() => {
                    this.balls.forEach(ball => {
                        ball.gravity = false;
                        // Reset vertical speed to prevent excessive speed
                        ball.speed.y = Math.min(Math.abs(ball.speed.y), 300) * 
                                     (ball.speed.y > 0 ? 1 : -1);
                    });
                }, 10000);
                break;
        }
    }

    loadSounds() {
        const soundFiles = {
            brick: 'brick.wav',
            paddle: 'paddle.wav',
            powerup: 'powerup.wav',
            lose: 'lose.wav'
        };

        for (const [key, file] of Object.entries(soundFiles)) {
            const audio = new Audio();
            audio.src = `sounds/${file}`;
            this.sounds[key] = audio;
        }
    }

    createParticles(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            const speed = {
                x: (Math.random() - 0.5) * 4,
                y: (Math.random() - 0.5) * 4
            };
            this.particles.push(new Particle(x, y, color, speed));
        }
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShot >= this.shootDelay) {
            // Create two bullets, one from each end of the paddle
            this.bullets.push(
                new Bullet(this.paddle.position.x + 10, this.paddle.position.y),
                new Bullet(this.paddle.position.x + this.paddle.width - 10, this.paddle.position.y)
            );
            this.lastShot = now;
        }
    }
}

// Start the game
const game = new Game(); 