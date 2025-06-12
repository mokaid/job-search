// src/automation/EnhancedHumanMouse.js - Advanced human-like mouse automation
const robot = require('robotjs');

class EnhancedHumanMouse {
    constructor(config) {
        this.config = config;
        this.currentPosition = robot.getMousePos();
        this.movementHistory = [];
        this.fatigue = 0;
        this.lastMovementTime = Date.now();
        
        // Initialize robot settings for smoother movements
        robot.setMouseDelay(1);
        robot.setKeyboardDelay(1);
    }

    // Main movement method with Bezier curves
    async moveToPosition(targetX, targetY, options = {}) {
        const startTime = Date.now();
        const currentPos = robot.getMousePos();
        
        // Merge options with config
        const moveConfig = {
            ...this.config.get('mouse.movement'),
            ...this.config.get('mouse.bezier'),
            ...options
        };

        // Add human hesitation
        if (moveConfig.humanHesitation && Math.random() < moveConfig.hesitationChance) {
            await this.addHesitation();
        }

        // Generate natural path using advanced Bezier curves
        const path = this.generateAdvancedBezierPath(
            currentPos.x, currentPos.y,
            targetX, targetY,
            moveConfig
        );

        // Execute movement with human-like timing
        await this.executeMovementPath(path, moveConfig);

        // Add overshoot and correction
        if (moveConfig.overshootProbability && Math.random() < moveConfig.overshootProbability) {
            await this.addOvershootCorrection(targetX, targetY, moveConfig);
        }

        // Update movement history and fatigue
        this.updateMovementMetrics(startTime, currentPos, { x: targetX, y: targetY });
        
        this.currentPosition = { x: targetX, y: targetY };
    }

    // Generate sophisticated Bezier path with multiple control points
    generateAdvancedBezierPath(startX, startY, endX, endY, config) {
        const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        
        // Calculate adaptive number of steps
        let steps;
        if (config.adaptiveSteps) {
            steps = Math.max(config.minSteps, Math.min(config.maxSteps, Math.floor(distance / 5)));
            steps += Math.floor(Math.random() * 10) - 5; // Add variation
        } else {
            steps = Math.floor(distance / 5);
        }

        // Generate control points for natural curves
        const controlPoints = this.generateSmartControlPoints(
            startX, startY, endX, endY, distance, config
        );

        // Create cubic Bezier curve points
        const pathPoints = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.calculateCubicBezierPoint(
                t,
                { x: startX, y: startY },
                controlPoints.cp1,
                controlPoints.cp2,
                { x: endX, y: endY }
            );
            
            // Add micro-jitter for realism
            point.x += this.generateJitter(config.jitterIntensity);
            point.y += this.generateJitter(config.jitterIntensity);
            
            pathPoints.push(point);
        }

        return pathPoints;
    }

    // Smart control point generation based on movement context
    generateSmartControlPoints(startX, startY, endX, endY, distance, config) {
        const dx = endX - startX;
        const dy = endY - startY;
        
        // Calculate base control distance
        const baseControlDistance = Math.max(
            config.controlPointDistance,
            distance * config.curvature
        );

        // Generate perpendicular vector for natural curves
        const perpX = -dy / distance;
        const perpY = dx / distance;

        // Add movement history influence for more natural patterns
        const historyInfluence = this.calculateHistoryInfluence();
        
        // Smart randomness based on distance and context
        const smartRandomness = this.calculateSmartRandomness(distance, config);
        
        // Control point 1 (early in the path)
        const cp1Offset = baseControlDistance * (0.8 + Math.random() * 0.4);
        const cp1RandomX = (Math.random() - 0.5) * smartRandomness.x;
        const cp1RandomY = (Math.random() - 0.5) * smartRandomness.y;
        
        const cp1 = {
            x: startX + dx * 0.25 + perpX * cp1Offset + cp1RandomX + historyInfluence.x * 0.3,
            y: startY + dy * 0.25 + perpY * cp1Offset + cp1RandomY + historyInfluence.y * 0.3
        };

        // Control point 2 (later in the path)
        const cp2Offset = baseControlDistance * (0.6 + Math.random() * 0.6);
        const cp2RandomX = (Math.random() - 0.5) * smartRandomness.x;
        const cp2RandomY = (Math.random() - 0.5) * smartRandomness.y;
        
        const cp2 = {
            x: startX + dx * 0.75 + perpX * cp2Offset + cp2RandomX + historyInfluence.x * 0.5,
            y: startY + dy * 0.75 + perpY * cp2Offset + cp2RandomY + historyInfluence.y * 0.5
        };

        return { cp1, cp2 };
    }

    // Calculate influence from movement history for natural patterns
    calculateHistoryInfluence() {
        if (this.movementHistory.length < 2) {
            return { x: 0, y: 0 };
        }

        const recent = this.movementHistory.slice(-3);
        let avgDirection = { x: 0, y: 0 };
        
        for (let i = 1; i < recent.length; i++) {
            const prev = recent[i - 1];
            const curr = recent[i];
            avgDirection.x += curr.endX - prev.endX;
            avgDirection.y += curr.endY - prev.endY;
        }
        
        // Slight tendency to continue in similar direction (momentum)
        return {
            x: (avgDirection.x / recent.length) * 0.1,
            y: (avgDirection.y / recent.length) * 0.1
        };
    }

    // Smart randomness based on context
    calculateSmartRandomness(distance, config) {
        const baseRandomness = distance * config.randomness;
        
        // Reduce randomness for short distances (precision movements)
        const distanceFactor = Math.min(1, distance / 200);
        
        // Increase randomness with fatigue
        const fatigueFactor = 1 + this.fatigue * 0.5;
        
        return {
            x: baseRandomness * distanceFactor * fatigueFactor,
            y: baseRandomness * distanceFactor * fatigueFactor
        };
    }

    // Cubic Bezier curve calculation
    calculateCubicBezierPoint(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;

        return {
            x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
            y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
        };
    }

    // Execute movement along the calculated path
    async executeMovementPath(pathPoints, config) {
        for (let i = 0; i < pathPoints.length; i++) {
            const point = pathPoints[i];
            const progress = i / (pathPoints.length - 1);
            
            // Move to point
            robot.moveMouse(Math.round(point.x), Math.round(point.y));
            
            // Calculate human-like delay
            const delay = this.calculateHumanDelay(i, pathPoints.length, config, progress);
            
            if (delay > 0) {
                await this.sleep(delay);
            }
        }
    }

    // Calculate human-like delays with acceleration/deceleration
    calculateHumanDelay(step, totalSteps, config, progress) {
        const baseDelay = config.baseSpeed;
        
        // Human acceleration curve (slow start, fast middle, slow end)
        let speedMultiplier = 1;
        
        if (progress < 0.2) {
            // Slow start (acceleration)
            speedMultiplier = 0.3 + (progress / 0.2) * 0.7;
        } else if (progress > 0.8) {
            // Slow end (deceleration)
            const decelProgress = (progress - 0.8) / 0.2;
            speedMultiplier = 1.0 - decelProgress * 0.6;
        } else {
            // Fast middle with slight variation
            speedMultiplier = 0.8 + Math.random() * 0.4;
        }
        
        // Apply acceleration factor
        speedMultiplier *= config.acceleration;
        
        // Add fatigue effect (slower when tired)
        const fatigueMultiplier = 1 + this.fatigue * 0.3;
        
        // Random variation
        const randomVariation = 0.7 + Math.random() * 0.6;
        
        return Math.max(1, Math.floor(
            baseDelay * speedMultiplier * fatigueMultiplier * randomVariation
        ));
    }

    // Add realistic overshoot and correction
    async addOvershootCorrection(targetX, targetY, config) {
        const overshootDistance = config.overshootDistance * (0.5 + Math.random());
        const overshootAngle = Math.random() * Math.PI * 2;
        
        // Calculate overshoot position
        const overshootX = targetX + Math.cos(overshootAngle) * overshootDistance;
        const overshootY = targetY + Math.sin(overshootAngle) * overshootDistance;
        
        // Move to overshoot position
        robot.moveMouse(Math.round(overshootX), Math.round(overshootY));
        await this.sleep(this.randomDelay(30, 80));
        
        // Correct back to target with small path
        const correctionPath = this.generateAdvancedBezierPath(
            overshootX, overshootY, targetX, targetY,
            { ...config, curvature: 0.1, steps: 5 }
        );
        
        await this.executeMovementPath(correctionPath, { ...config, baseSpeed: config.baseSpeed * 0.7 });
    }

    // Human-like clicking with micro-movements
    async click(button = 'left', options = {}) {
        const clickConfig = {
            ...this.config.get('mouse.clicking'),
            ...options
        };

        // Pre-click delay (human reaction time)
        await this.sleep(this.randomDelay(
            clickConfig.preClickDelay.min,
            clickConfig.preClickDelay.max
        ));

        // Micro-movement before click (humans rarely click perfectly still)
        if (clickConfig.microMovementBeforeClick) {
            const currentPos = robot.getMousePos();
            const microX = currentPos.x + this.generateJitter(1.5);
            const microY = currentPos.y + this.generateJitter(1.5);
            robot.moveMouse(Math.round(microX), Math.round(microY));
            await this.sleep(this.randomDelay(10, 40));
        }

        // Variable click duration
        const clickDuration = this.randomDelay(
            clickConfig.clickDuration.min,
            clickConfig.clickDuration.max
        );

        // Execute click
        robot.mouseToggle('down', button);
        await this.sleep(clickDuration);
        robot.mouseToggle('up', button);

        // Post-click delay
        await this.sleep(this.randomDelay(
            clickConfig.postClickDelay.min,
            clickConfig.postClickDelay.max
        ));

        // Update fatigue
        this.updateFatigue();
    }

    // Advanced drag with natural path
    async drag(startX, startY, endX, endY, options = {}) {
        const dragConfig = {
            ...this.config.get('mouse.movement'),
            curvature: 0.1, // Less curved for dragging
            randomness: 0.05,
            ...options
        };

        // Move to start position
        await this.moveToPosition(startX, startY);
        await this.sleep(this.randomDelay(100, 300));

        // Start drag
        robot.mouseToggle('down', 'left');
        await this.sleep(this.randomDelay(50, 150));

        // Generate drag path (more stable than regular movement)
        const dragPath = this.generateAdvancedBezierPath(startX, startY, endX, endY, {
            ...dragConfig,
            jitterIntensity: dragConfig.jitterIntensity * 0.5 // Less jitter during drag
        });

        // Execute drag movement
        await this.executeMovementPath(dragPath, {
            ...dragConfig,
            baseSpeed: dragConfig.baseSpeed * 1.5 // Slightly slower for dragging
        });

        // End drag
        await this.sleep(this.randomDelay(50, 150));
        robot.mouseToggle('up', 'left');
    }

    // Generate realistic jitter
    generateJitter(intensity) {
        return (Math.random() - 0.5) * intensity * 2;
    }

    // Human hesitation before actions
    async addHesitation() {
        const hesitationDuration = this.randomDelay(200, 800);
        await this.sleep(hesitationDuration);
    }

    // Update movement metrics and fatigue
    updateMovementMetrics(startTime, startPos, endPos) {
        const movement = {
            startTime,
            endTime: Date.now(),
            startX: startPos.x,
            startY: startPos.y,
            endX: endPos.x,
            endY: endPos.y,
            distance: Math.sqrt(
                Math.pow(endPos.x - startPos.x, 2) + Math.pow(endPos.y - startPos.y, 2)
            )
        };

        this.movementHistory.push(movement);
        
        // Keep only recent history
        if (this.movementHistory.length > 10) {
            this.movementHistory.shift();
        }
        
        this.lastMovementTime = Date.now();
    }

    // Update fatigue level
    updateFatigue() {
        const timeSinceLastAction = Date.now() - this.lastMovementTime;
        
        if (timeSinceLastAction > 30000) { // 30 seconds rest
            this.fatigue = Math.max(0, this.fatigue - 0.1);
        } else {
            this.fatigue = Math.min(1, this.fatigue + 0.02);
        }
    }

    // Scroll with human-like behavior
    async scroll(direction, amount = 3, options = {}) {
        const scrollConfig = {
            scrollVariation: true,
            pauseBetweenScrolls: true,
            ...options
        };

        let scrollAmount = amount;
        if (scrollConfig.scrollVariation) {
            scrollAmount += Math.floor(Math.random() * 3) - 1;
        }

        robot.scrollMouse(0, direction === 'up' ? scrollAmount : -scrollAmount);
        
        if (scrollConfig.pauseBetweenScrolls) {
            await this.sleep(this.randomDelay(100, 300));
        }
    }

    // Get current mouse position
    getCurrentPosition() {
        return robot.getMousePos();
    }

    // Check if coordinates are within screen bounds
    isValidPosition(x, y) {
        const screenSize = robot.getScreenSize();
        return x >= 0 && y >= 0 && x < screenSize.width && y < screenSize.height;
    }

    // Generate random delay within range
    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Sleep utility
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Get movement statistics for analysis
    getMovementStats() {
        return {
            totalMovements: this.movementHistory.length,
            currentFatigue: this.fatigue,
            averageSpeed: this.calculateAverageSpeed(),
            lastMovementTime: this.lastMovementTime
        };
    }

    // Calculate average movement speed
    calculateAverageSpeed() {
        if (this.movementHistory.length < 2) return 0;
        
        const recentMovements = this.movementHistory.slice(-5);
        let totalSpeed = 0;
        
        for (const movement of recentMovements) {
            const duration = movement.endTime - movement.startTime;
            const speed = movement.distance / (duration || 1);
            totalSpeed += speed;
        }
        
        return totalSpeed / recentMovements.length;
    }

    // Reset fatigue and history (for new sessions)
    reset() {
        this.fatigue = 0;
        this.movementHistory = [];
        this.lastMovementTime = Date.now();
    }
}

module.exports = { EnhancedHumanMouse };