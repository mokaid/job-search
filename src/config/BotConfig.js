// src/config/BotConfig.js - Centralized configuration management
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class BotConfig {
    constructor() {
        this.loadDefaultConfig();
        this.loadUserConfig();
        this.loadEnvironmentVariables();
    }

    loadDefaultConfig() {
        this.defaults = {
            // Core Bot Settings
            bot: {
                screenshotInterval: 30000,      // 30 seconds between actions
                maxApplications: 50,           // Stop after 50 applications
                maxSessionTime: 7200000,       // 2 hours max session
                retryAttempts: 3,              // Retry failed actions
                humanBreakProbability: 0.1,    // 10% chance of taking breaks
                enableLearning: true,          // Learn from successful patterns
                debugMode: false               // Enhanced logging
            },

            // Screenshot & Storage
            screenshots: {
                enabled: true,
                directory: './data/screenshots',
                keepHistory: true,
                maxFiles: 1000,                // Cleanup old screenshots
                quality: 90,                   // PNG compression level
                annotateActions: true          // Draw action points on screenshots
            },

            // Human-like Mouse Behavior
            mouse: {
                // Movement settings
                movement: {
                    baseSpeed: 8,              // Base movement speed (lower = slower)
                    acceleration: 1.2,         // Mouse acceleration factor
                    jitterIntensity: 1.5,      // Hand tremor simulation
                    overshootProbability: 0.15, // Chance of overshooting target
                    overshootDistance: 10,     // Max overshoot pixels
                    humanHesitation: true,     // Add hesitation before actions
                    hesitationChance: 0.1      // 10% chance of hesitation
                },

                // Bezier curve settings for natural paths
                bezier: {
                    curvature: 0.3,            // How curved the path is (0-1)
                    randomness: 0.2,           // Random variation in path
                    controlPointDistance: 50,   // Min distance for control points
                    adaptiveSteps: true,       // Adjust steps based on distance
                    minSteps: 10,              // Minimum path steps
                    maxSteps: 100              // Maximum path steps
                },

                // Click behavior
                clicking: {
                    preClickDelay: {
                        min: 100,
                        max: 300
                    },
                    postClickDelay: {
                        min: 50,
                        max: 200
                    },
                    clickDuration: {
                        min: 80,
                        max: 150
                    },
                    microMovementBeforeClick: true,
                    doubleClickInterval: {
                        min: 100,
                        max: 200
                    }
                }
            },

            // Human-like Typing Behavior
            typing: {
                wpm: 45,                       // Words per minute
                wpmVariation: 10,              // ±10 WPM variation
                errorRate: 0.02,               // 2% typing error rate
                correctionDelay: {
                    min: 500,
                    max: 1500
                },
                thinkingPauses: {
                    enabled: true,
                    probability: 0.05,         // 5% chance per character
                    duration: {
                        min: 500,
                        max: 2000
                    }
                },
                capitalLetterDelay: 1.3,       // Slower for capitals (shift key)
                numberDelay: 1.2,              // Slower for numbers
                symbolDelay: 1.5               // Slower for symbols
            },

            // Job Search Criteria
            jobSearch: {
                keywords: {
                    primary: [],               // Loaded from user profile
                    secondary: [],             // Alternative keywords
                    excluded: ['intern', 'unpaid', 'volunteer']
                },
                locations: {
                    preferred: [],             // Loaded from user profile
                    remote: true,              // Include remote jobs
                    maxDistance: 50            // km from preferred locations
                },
                filters: {
                    experienceLevel: ['entry', 'associate', 'mid-senior'],
                    jobType: ['full-time', 'contract'],
                    salaryRange: {
                        enabled: false,
                        min: 0,
                        max: 999999
                    },
                    companySize: ['startup', 'small', 'medium', 'large'],
                    postedWithin: 30           // days
                }
            },

            // Application Strategy
            application: {
                onlyEasyApply: true,           // Only apply to Easy Apply jobs
                skipCoverLetterRequired: false, // Apply even if cover letter required
                maxQuestionsToAnswer: 10,      // Skip jobs with too many questions
                autoGenerateCoverLetter: true, // Use LLM for cover letters
                customizeForEachJob: true,     // Tailor responses per job
                trackApplications: true       // Save application history
            },

            // LLM Integration
            llm: {
                provider: 'openai',            // 'openai', 'anthropic', 'local'
                model: 'gpt-4-vision-preview', // Model for screenshot analysis
                maxTokens: 4000,               // Max response tokens
                temperature: 0.3,              // Lower = more consistent
                retryOnFailure: true,          // Retry failed LLM calls
                fallbackToManual: false,       // Stop or continue on LLM failure
                costTracking: true             // Track API costs
            },

            // Safety & Detection Avoidance
            safety: {
                respectRateLimits: true,       // Follow LinkedIn rate limits
                randomBreaks: {
                    enabled: true,
                    minInterval: 600000,       // 10 minutes
                    maxInterval: 1800000,      // 30 minutes
                    duration: {
                        min: 60000,            // 1 minute
                        max: 300000            // 5 minutes
                    }
                },
                humanBehavior: {
                    scrollBeforeAction: 0.3,   // 30% chance to scroll first
                    lookAroundProbability: 0.2, // 20% chance to move mouse around
                    readingTime: {
                        enabled: true,
                        baseTime: 2000,        // Base reading time per job
                        perWordTime: 50        // Additional time per word
                    }
                },
                emergencyStop: {
                    captchaDetection: true,    // Stop if CAPTCHA detected
                    errorThreshold: 5,         // Stop after 5 consecutive errors
                    suspiciousActivityStop: true
                }
            },

            // Logging & Monitoring
            logging: {
                level: 'info',                 // 'debug', 'info', 'warn', 'error'
                saveToFile: true,
                logDirectory: './data/logs',
                rotateDaily: true,
                maxLogFiles: 30,               // Keep 30 days of logs
                includeScreenshots: true,      // Log with screenshot references
                performanceMetrics: true       // Track timing and success rates
            }
        };
    }

    loadUserConfig() {
        const userConfigPath = './config/user-config.json';
        
        if (fs.existsSync(userConfigPath)) {
            try {
                const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
                this.mergeConfig(userConfig);
            } catch (error) {
                console.warn(`Warning: Could not load user config: ${error.message}`);
            }
        }
    }

    loadEnvironmentVariables() {
        this.env = {
            // API Endpoints
            LLM_SERVICE_URL: process.env.LLM_SERVICE_URL || 'http://localhost:3000',
            RESUME_ANALYSIS_URL: process.env.RESUME_ANALYSIS_URL || 'http://localhost:3000/analyze-resume',
            OCR_SERVICE_URL: process.env.OCR_SERVICE_URL || 'http://localhost:3000/ocr',
            
            // API Keys
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
            
            // File Paths
            RESUME_FILE_PATH: process.env.RESUME_FILE_PATH || './data/resume.pdf',
            USER_PROFILE_PATH: process.env.USER_PROFILE_PATH || './data/user-profile.json',
            
            // Security
            ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
            
            // Debug
            DEBUG_MODE: process.env.DEBUG_MODE === 'true',
            HEADLESS_MODE: process.env.HEADLESS_MODE === 'true'
        };
    }

    mergeConfig(userConfig, target = this.defaults) {
        for (const [key, value] of Object.entries(userConfig)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                if (!target[key]) target[key] = {};
                this.mergeConfig(value, target[key]);
            } else {
                target[key] = value;
            }
        }
    }

    // Get configuration value with dot notation
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let current = this.defaults;
        
        for (const key of keys) {
            if (current[key] === undefined) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }

    // Set configuration value with dot notation
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.defaults;
        
        for (const key of keys) {
            if (!current[key]) current[key] = {};
            current = current[key];
        }
        
        current[lastKey] = value;
    }

    // Validate environment setup
    validateEnvironment() {
        const required = [
            'LLM_SERVICE_URL',
            'RESUME_ANALYSIS_URL'
        ];
        
        const missing = required.filter(key => !this.env[key]);
        
        if (missing.length > 0) {
            console.error(`Missing required environment variables: ${missing.join(', ')}`);
            return false;
        }
        
        // Check if resume file exists
        if (!fs.existsSync(this.env.RESUME_FILE_PATH)) {
            console.error(`Resume file not found: ${this.env.RESUME_FILE_PATH}`);
            return false;
        }
        
        return true;
    }

    // Save current configuration
    saveUserConfig() {
        const userConfigPath = './config/user-config.json';
        const configDir = path.dirname(userConfigPath);
        
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        fs.writeFileSync(userConfigPath, JSON.stringify(this.defaults, null, 2));
    }

    // Load preset configurations
    static loadPreset(presetName) {
        const presets = {
            conservative: {
                bot: { screenshotInterval: 45000, maxApplications: 20 },
                mouse: { movement: { baseSpeed: 12, jitterIntensity: 2 } },
                safety: { randomBreaks: { enabled: true, minInterval: 900000 } }
            },
            
            aggressive: {
                bot: { screenshotInterval: 20000, maxApplications: 100 },
                mouse: { movement: { baseSpeed: 5, jitterIntensity: 0.8 } },
                safety: { randomBreaks: { enabled: false } }
            },
            
            testing: {
                bot: { screenshotInterval: 5000, maxApplications: 5, debugMode: true },
                screenshots: { annotateActions: true },
                logging: { level: 'debug' }
            }
        };
        
        return presets[presetName] || {};
    }

    // Get preset configurations
    static getAvailablePresets() {
        return ['conservative', 'aggressive', 'testing'];
    }

    // Static factory method
    static load(presetName = null) {
        const config = new BotConfig();
        
        if (presetName) {
            const preset = BotConfig.loadPreset(presetName);
            config.mergeConfig(preset);
        }
        
        return config;
    }

    // Export configuration for debugging
    export() {
        return {
            config: this.defaults,
            environment: this.env,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { BotConfig };