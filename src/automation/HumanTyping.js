// src/automation/HumanTyping.js - Advanced human-like typing simulation
const robot = require('robotjs');

class HumanTyping {
    constructor(config) {
        this.config = config;
        this.typingHistory = [];
        this.currentWPM = config.get('typing.wpm');
        this.fatigue = 0;
        this.lastTypingTime = Date.now();
        
        // Character timing patterns
        this.characterPatterns = this.initializeCharacterPatterns();
        
        // Common typing errors and corrections
        this.commonErrors = this.initializeCommonErrors();
    }

    // Main typing method with human-like behavior
    async typeText(text, options = {}) {
        const typingConfig = {
            ...this.config.get('typing'),
            ...options
        };

        // Adjust WPM based on text complexity and fatigue
        const adjustedWPM = this.calculateAdjustedWPM(text, typingConfig);
        
        // Generate typing pattern for the entire text
        const typingPattern = this.generateTypingPattern(text, adjustedWPM, typingConfig);
        
        // Execute typing with human-like behavior
        await this.executeTypingPattern(typingPattern, typingConfig);
        
        // Update typing metrics
        this.updateTypingMetrics(text, Date.now() - this.lastTypingTime);
    }

    // Generate detailed typing pattern for text
    generateTypingPattern(text, wpm, config) {
        const pattern = [];
        const baseDelay = 60000 / (wpm * 5); // Convert WPM to ms per character
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const context = this.getCharacterContext(text, i);
            
            // Calculate base delay for this character
            let delay = this.calculateCharacterDelay(char, baseDelay, config);
            
            // Apply context-based adjustments
            delay = this.applyContextualAdjustments(delay, context, config);
            
            // Decide if typing error should occur
            const shouldError = this.shouldMakeTypingError(char, config);
            
            // Add thinking pauses
            const shouldPause = this.shouldAddThinkingPause(text, i, config);
            
            pattern.push({
                character: char,
                delay: Math.floor(delay),
                shouldError,
                shouldPause,
                pauseDuration: shouldPause ? this.calculateThinkingPauseDuration(config) : 0,
                context
            });
        }
        
        return pattern;
    }

    // Execute the typing pattern with realistic behavior
    async executeTypingPattern(pattern, config) {
        for (let i = 0; i < pattern.length; i++) {
            const item = pattern[i];
            
            // Add thinking pause before character if needed
            if (item.shouldPause) {
                await this.sleep(item.pauseDuration);
            }
            
            // Handle typing error
            if (item.shouldError) {
                await this.executeTypingError(item, pattern, i, config);
            } else {
                // Normal character typing
                await this.typeCharacter(item.character, item.delay);
            }
            
            // Update fatigue
            this.updateTypingFatigue();
        }
    }

    // Type a single character with appropriate delay
    async typeCharacter(char, delay) {
        // Handle special characters
        if (char === '\n') {
            robot.keyTap('enter');
        } else if (char === '\t') {
            robot.keyTap('tab');
        } else if (char === '\b') {
            robot.keyTap('backspace');
        } else {
            robot.typeString(char);
        }
        
        if (delay > 0) {
            await this.sleep(delay);
        }
    }

    // Execute realistic typing error and correction
    async executeTypingError(item, pattern, index, config) {
        const errorChar = this.generateTypingError(item.character);
        
        // Type the wrong character first
        await this.typeCharacter(errorChar, item.delay);
        
        // Pause before realizing the error (human reaction time)
        const reactionDelay = this.randomDelay(
            config.correctionDelay.min,
            config.correctionDelay.max
        );
        await this.sleep(reactionDelay);
        
        // Correct the error
        robot.keyTap('backspace');
        await this.sleep(this.randomDelay(50, 150));
        
        // Type the correct character
        await this.typeCharacter(item.character, item.delay * 0.8); // Slightly faster after correction
    }

    // Calculate character-specific delay
    calculateCharacterDelay(char, baseDelay, config) {
        let delay = baseDelay;
        
        // Apply character-specific multipliers
        if (char === ' ') {
            delay *= 0.5; // Spaces are faster
        } else if (/[A-Z]/.test(char)) {
            delay *= config.capitalLetterDelay; // Capitals slower (shift key)
        } else if (/[0-9]/.test(char)) {
            delay *= config.numberDelay; // Numbers slightly slower
        } else if (/[!@#$%^&*()_+{}|:"<>?[\]\\;'.,/]/.test(char)) {
            delay *= config.symbolDelay; // Symbols slower
        }
        
        // Check if character requires finger movement
        if (this.characterPatterns[char]) {
            delay *= this.characterPatterns[char].difficultyMultiplier;
        }
        
        // Add random variation
        delay *= (0.7 + Math.random() * 0.6);
        
        // Apply fatigue effect
        delay *= (1 + this.fatigue * 0.3);
        
        return delay;
    }

    // Apply contextual adjustments to typing delay
    applyContextualAdjustments(delay, context, config) {
        // Slow down at word boundaries
        if (context.isWordStart || context.isWordEnd) {
            delay *= 1.2;
        }
        
        // Slow down after punctuation
        if (context.afterPunctuation) {
            delay *= 1.4;
        }
        
        // Speed up for common words/patterns
        if (context.isCommonWord) {
            delay *= 0.8;
        }
        
        // Slow down for complex words
        if (context.isComplexWord) {
            delay *= 1.3;
        }
        
        return delay;
    }

    // Get character context for intelligent timing
    getCharacterContext(text, index) {
        const char = text[index];
        const prevChar = index > 0 ? text[index - 1] : '';
        const nextChar = index < text.length - 1 ? text[index + 1] : '';
        
        // Extract current word
        const wordMatch = text.substring(0, index + 1).match(/\b\w+$/);
        const currentWord = wordMatch ? wordMatch[0] : '';
        
        return {
            character: char,
            prevChar,
            nextChar,
            isWordStart: /\s/.test(prevChar) && /\w/.test(char),
            isWordEnd: /\w/.test(char) && (/\s/.test(nextChar) || nextChar === ''),
            afterPunctuation: /[.!?]/.test(prevChar),
            isCommonWord: this.isCommonWord(currentWord),
            isComplexWord: currentWord.length > 8,
            wordLength: currentWord.length
        };
    }

    // Calculate adjusted WPM based on text complexity and fatigue
    calculateAdjustedWPM(text, config) {
        let adjustedWPM = this.currentWPM;
        
        // Apply WPM variation
        const variation = config.wpmVariation;
        adjustedWPM += (Math.random() - 0.5) * variation;
        
        // Adjust for text complexity
        const complexityFactor = this.calculateTextComplexity(text);
        adjustedWPM *= (1 - complexityFactor * 0.3);
        
        // Apply fatigue effect
        adjustedWPM *= (1 - this.fatigue * 0.2);
        
        return Math.max(20, adjustedWPM); // Minimum 20 WPM
    }

    // Calculate text complexity score
    calculateTextComplexity(text) {
        let complexity = 0;
        
        // Count special characters
        const specialChars = (text.match(/[!@#$%^&*()_+{}|:"<>?[\]\\;'.,/]/g) || []).length;
        complexity += specialChars / text.length * 0.5;
        
        // Count numbers
        const numbers = (text.match(/[0-9]/g) || []).length;
        complexity += numbers / text.length * 0.3;
        
        // Count capital letters
        const capitals = (text.match(/[A-Z]/g) || []).length;
        complexity += capitals / text.length * 0.2;
        
        // Average word length
        const words = text.split(/\s+/).filter(word => word.length > 0);
        const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
        complexity += Math.max(0, (avgWordLength - 5) / 10);
        
        return Math.min(1, complexity);
    }

    // Determine if thinking pause should be added
    shouldAddThinkingPause(text, index, config) {
        if (!config.thinkingPauses.enabled) return false;
        
        const char = text[index];
        const context = this.getCharacterContext(text, index);
        
        // Higher chance at word boundaries and after punctuation
        let pauseProbability = config.thinkingPauses.probability;
        
        if (context.isWordStart) pauseProbability *= 2;
        if (context.afterPunctuation) pauseProbability *= 3;
        if (context.isComplexWord) pauseProbability *= 1.5;
        
        return Math.random() < pauseProbability;
    }

    // Calculate thinking pause duration
    calculateThinkingPauseDuration(config) {
        return this.randomDelay(
            config.thinkingPauses.duration.min,
            config.thinkingPauses.duration.max
        );
    }

    // Determine if typing error should occur
    shouldMakeTypingError(char, config) {
        if (!config.errorRate) return false;
        
        // Adjust error rate based on character difficulty
        let errorRate = config.errorRate;
        
        if (/[A-Z]/.test(char)) errorRate *= 1.5; // More errors on capitals
        if (/[0-9!@#$%^&*()]/.test(char)) errorRate *= 2; // More errors on symbols/numbers
        
        // Less errors on common characters
        if (/[aeiou\s]/.test(char)) errorRate *= 0.5;
        
        // Apply fatigue effect
        errorRate *= (1 + this.fatigue * 0.5);
        
        return Math.random() < errorRate;
    }

    // Generate realistic typing error
    generateTypingError(correctChar) {
        // Use common error patterns
        if (this.commonErrors[correctChar]) {
            const errors = this.commonErrors[correctChar];
            return errors[Math.floor(Math.random() * errors.length)];
        }
        
        // Generate adjacent key error
        return this.getAdjacentKey(correctChar);
    }

    // Get adjacent key for realistic errors
    getAdjacentKey(char) {
        const keyboardLayout = {
            'q': ['w', 'a', 's'], 'w': ['q', 'e', 'a', 's', 'd'], 'e': ['w', 'r', 's', 'd', 'f'],
            'r': ['e', 't', 'd', 'f', 'g'], 't': ['r', 'y', 'f', 'g', 'h'], 'y': ['t', 'u', 'g', 'h', 'j'],
            'u': ['y', 'i', 'h', 'j', 'k'], 'i': ['u', 'o', 'j', 'k', 'l'], 'o': ['i', 'p', 'k', 'l'],
            'p': ['o', 'l'], 'a': ['q', 'w', 's', 'z'], 's': ['a', 'w', 'e', 'd', 'z', 'x'],
            'd': ['s', 'e', 'r', 'f', 'x', 'c'], 'f': ['d', 'r', 't', 'g', 'c', 'v'], 'g': ['f', 't', 'y', 'h', 'v', 'b'],
            'h': ['g', 'y', 'u', 'j', 'b', 'n'], 'j': ['h', 'u', 'i', 'k', 'n', 'm'], 'k': ['j', 'i', 'o', 'l', 'm'],
            'l': ['k', 'o', 'p', 'm'], 'z': ['a', 's', 'x'], 'x': ['z', 's', 'd', 'c'], 'c': ['x', 'd', 'f', 'v'],
            'v': ['c', 'f', 'g', 'b'], 'b': ['v', 'g', 'h', 'n'], 'n': ['b', 'h', 'j', 'm'], 'm': ['n', 'j', 'k', 'l']
        };
        
        const adjacent = keyboardLayout[char.toLowerCase()];
        if (adjacent && adjacent.length > 0) {
            return adjacent[Math.floor(Math.random() * adjacent.length)];
        }
        
        return char; // Return original if no adjacent found
    }

    // Initialize character difficulty patterns
    initializeCharacterPatterns() {
        return {
            // Easy characters (home row)
            'a': { difficultyMultiplier: 0.8 }, 's': { difficultyMultiplier: 0.8 },
            'd': { difficultyMultiplier: 0.8 }, 'f': { difficultyMultiplier: 0.8 },
            'g': { difficultyMultiplier: 0.8 }, 'h': { difficultyMultiplier: 0.8 },
            'j': { difficultyMultiplier: 0.8 }, 'k': { difficultyMultiplier: 0.8 },
            'l': { difficultyMultiplier: 0.8 },
            
            // Medium characters
            'q': { difficultyMultiplier: 1.2 }, 'w': { difficultyMultiplier: 1.0 },
            'e': { difficultyMultiplier: 0.9 }, 'r': { difficultyMultiplier: 0.9 },
            't': { difficultyMultiplier: 0.9 }, 'y': { difficultyMultiplier: 1.0 },
            'u': { difficultyMultiplier: 1.0 }, 'i': { difficultyMultiplier: 1.0 },
            'o': { difficultyMultiplier: 1.0 }, 'p': { difficultyMultiplier: 1.2 },
            
            // Difficult characters (bottom row, numbers, symbols)
            'z': { difficultyMultiplier: 1.3 }, 'x': { difficultyMultiplier: 1.2 },
            'c': { difficultyMultiplier: 1.1 }, 'v': { difficultyMultiplier: 1.1 },
            'b': { difficultyMultiplier: 1.2 }, 'n': { difficultyMultiplier: 1.1 },
            'm': { difficultyMultiplier: 1.1 }
        };
    }

    // Initialize common typing errors
    initializeCommonErrors() {
        return {
            'a': ['s', 'q'], 'e': ['w', 'r'], 'i': ['u', 'o'], 'o': ['i', 'p'],
            'u': ['y', 'i'], 'the': ['teh', 'hte'], 'and': ['adn', 'nad'],
            'you': ['yuo', 'oyu'], 'that': ['taht', 'tath']
        };
    }

    // Check if word is common (for speed adjustment)
    isCommonWord(word) {
        const commonWords = [
            'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
            'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before',
            'after', 'above', 'below', 'between', 'among', 'a', 'an', 'as', 'are',
            'was', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did',
            'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them'
        ];
        
        return commonWords.includes(word.toLowerCase());
    }

    // Update typing fatigue
    updateTypingFatigue() {
        const timeSinceLastType = Date.now() - this.lastTypingTime;
        
        if (timeSinceLastType > 60000) { // 1 minute rest
            this.fatigue = Math.max(0, this.fatigue - 0.1);
        } else {
            this.fatigue = Math.min(1, this.fatigue + 0.005);
        }
        
        this.lastTypingTime = Date.now();
    }

    // Update typing metrics
    updateTypingMetrics(text, duration) {
        this.typingHistory.push({
            text: text.substring(0, 50), // First 50 chars for privacy
            duration,
            wpm: (text.length / 5) / (duration / 60000), // Calculate actual WPM
            timestamp: Date.now()
        });
        
        // Keep only recent history
        if (this.typingHistory.length > 20) {
            this.typingHistory.shift();
        }
    }

    // Get typing statistics
    getTypingStats() {
        const recent = this.typingHistory.slice(-10);
        const avgWPM = recent.reduce((sum, entry) => sum + entry.wpm, 0) / recent.length;
        
        return {
            currentWPM: this.currentWPM,
            averageWPM: avgWPM || 0,
            fatigue: this.fatigue,
            totalSessions: this.typingHistory.length
        };
    }

    // Utility methods
    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Reset typing state
    reset() {
        this.fatigue = 0;
        this.lastTypingTime = Date.now();
        this.currentWPM = this.config.get('typing.wpm');
    }
}

module.exports = { HumanTyping };