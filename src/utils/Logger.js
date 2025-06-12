// src/utils/Logger.js - Enhanced logging system
const fs = require('fs').promises;
const path = require('path');

class Logger {
    constructor(config) {
        this.config = config;
        this.logLevel = config.get('logging.level') || 'info';
        this.saveToFile = config.get('logging.saveToFile') || true;
        this.logDirectory = config.get('logging.logDirectory') || './data/logs';
        this.maxLogFiles = config.get('logging.maxLogFiles') || 30;
        
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.currentLevel = this.levels[this.logLevel] || 1;
        
        if (this.saveToFile) {
            this.ensureLogDirectory();
        }
    }

    async ensureLogDirectory() {
        try {
            await fs.mkdir(this.logDirectory, { recursive: true });
        } catch (error) {
            console.error('Failed to create log directory:', error.message);
        }
    }

    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    log(level, message, meta = {}) {
        if (this.levels[level] < this.currentLevel) return;

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            ...meta
        };

        // Console output with colors
        this.outputToConsole(logEntry);

        // File output
        if (this.saveToFile) {
            this.outputToFile(logEntry);
        }
    }

    outputToConsole(entry) {
        const colors = {
            DEBUG: '\x1b[36m', // Cyan
            INFO: '\x1b[32m',  // Green
            WARN: '\x1b[33m',  // Yellow
            ERROR: '\x1b[31m', // Red
        };
        
        const color = colors[entry.level] || '\x1b[0m';
        const reset = '\x1b[0m';
        
        console.log(`${color}[${entry.timestamp}] [${entry.level}]${reset} ${entry.message}`);
        
        if (Object.keys(entry).length > 3) {
            const meta = { ...entry };
            delete meta.timestamp;
            delete meta.level;
            delete meta.message;
            console.log(`${color}  Meta:${reset}`, JSON.stringify(meta, null, 2));
        }
    }

    async outputToFile(entry) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const filename = `bot-${date}.log`;
            const filepath = path.join(this.logDirectory, filename);
            
            const logLine = JSON.stringify(entry) + '\n';
            await fs.appendFile(filepath, logLine);
            
            // Cleanup old logs
            if (Math.random() < 0.01) { // 1% chance to cleanup
                await this.cleanupOldLogs();
            }
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    async cleanupOldLogs() {
        try {
            const files = await fs.readdir(this.logDirectory);
            const logFiles = files
                .filter(file => file.startsWith('bot-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.logDirectory, file),
                    date: file.match(/bot-(\d{4}-\d{2}-\d{2})\.log/)?.[1]
                }))
                .filter(file => file.date)
                .sort((a, b) => b.date.localeCompare(a.date));

            if (logFiles.length > this.maxLogFiles) {
                const filesToDelete = logFiles.slice(this.maxLogFiles);
                for (const file of filesToDelete) {
                    await fs.unlink(file.path);
                }
                console.log(`Cleaned up ${filesToDelete.length} old log files`);
            }
        } catch (error) {
            console.error('Failed to cleanup old logs:', error.message);
        }
    }
}

module.exports = { Logger };