// src/utils/ScreenshotManager.js - Optimized screenshot management for file uploads
const sharp = require('sharp');
const robot = require('robotjs');
const fs = require('fs').promises;
const path = require('path');

class ScreenshotManager {
    constructor(config) {
        this.config = config;
        this.enabled = config.get('screenshots.enabled') !== false; // Default to true
        this.directory = config.get('screenshots.directory') || './data/screenshots';
        this.keepHistory = config.get('screenshots.keepHistory') !== false; // Default to true
        this.maxFiles = config.get('screenshots.maxFiles') || 1000;
        this.quality = config.get('screenshots.quality') || 90;
        this.annotateActions = config.get('screenshots.annotateActions') || true;
        
        // New optimization settings
        this.compressForUpload = true; // Always compress for efficient uploads
        this.maxUploadSize = 2 * 1024 * 1024; // 2MB max for uploads
        this.compressionQuality = 85; // Good balance of quality vs size
        
        if (this.enabled) {
            this.ensureDirectory();
        }
    }

    async ensureDirectory() {
        try {
            await fs.mkdir(this.directory, { recursive: true });
            console.log(`📁 Screenshots directory ready: ${this.directory}`);
        } catch (error) {
            console.error('Failed to create screenshot directory:', error.message);
            throw error; // This is critical, should fail if can't create directory
        }
    }

    async capture(label = 'screenshot') {
        if (!this.enabled) {
            return { 
                buffer: null, 
                width: 0, 
                height: 0, 
                filepath: null, 
                timestamp: Date.now(),
                filesize: 0,
                label
            };
        }

        try {
            const timestamp = Date.now();
            console.log(`📸 Capturing screenshot: ${label}`);
            
            const img = robot.screen.capture();
            const rawBuffer = Buffer.from(img.image);
            
            let filepath = null;
            let optimizedBuffer = null;
            let filesize = 0;
            
            if (this.keepHistory) {
                const filename = `${label}_${timestamp}.png`;
                filepath = path.join(this.directory, filename);
                
                // Create optimized PNG for file upload
                optimizedBuffer = await sharp(rawBuffer, {
                    raw: {
                        width: img.width,
                        height: img.height,
                        channels: 4
                    }
                })
                .png({ 
                    quality: this.compressionQuality,
                    compressionLevel: 9, // Max compression
                    progressive: false,  // Faster processing
                    force: true
                })
                .toBuffer();
                
                // Save to file
                await fs.writeFile(filepath, optimizedBuffer);
                filesize = optimizedBuffer.length;
                
                console.log(`💾 Screenshot saved: ${filepath} (${this.formatFileSize(filesize)})`);
                
                // Check if file is too large for upload
                if (filesize > this.maxUploadSize) {
                    console.warn(`⚠️ Screenshot is large (${this.formatFileSize(filesize)}), may cause upload issues`);
                }
            }

            return {
                buffer: optimizedBuffer || rawBuffer, // Optimized buffer for uploads
                width: img.width,
                height: img.height,
                filepath,
                timestamp,
                filesize,
                label,
                isOptimized: !!optimizedBuffer
            };
            
        } catch (error) {
            console.error(`❌ Screenshot capture failed for "${label}":`, error.message);
            throw error;
        }
    }

    // Keep the toBase64 method for backward compatibility, but optimize it
    async toBase64(screenshot) {
        if (!screenshot.buffer && !screenshot.filepath) {
            throw new Error('No screenshot buffer or file path available');
        }

        try {
            let buffer = screenshot.buffer;
            
            // If no buffer but we have filepath, read the file
            if (!buffer && screenshot.filepath) {
                buffer = await fs.readFile(screenshot.filepath);
            }
            
            // If it's raw buffer, convert to PNG first
            if (!screenshot.isOptimized && screenshot.width && screenshot.height) {
                buffer = await sharp(buffer, {
                    raw: {
                        width: screenshot.width,
                        height: screenshot.height,
                        channels: 4
                    }
                })
                .png({ quality: this.compressionQuality })
                .toBuffer();
            }
            
            return buffer.toString('base64');
            
        } catch (error) {
            console.error('Failed to convert screenshot to base64:', error.message);
            throw error;
        }
    }

    // New method: Get file path and validate it exists
    async getValidFilePath(screenshot) {
        if (!screenshot.filepath) {
            throw new Error('No screenshot file path available');
        }
        
        try {
            await fs.access(screenshot.filepath);
            return screenshot.filepath;
        } catch (error) {
            throw new Error(`Screenshot file not found: ${screenshot.filepath}`);
        }
    }

    // New method: Compress existing screenshot for upload
    async compressForUpload(screenshotPath, maxSize = null) {
        try {
            const targetSize = maxSize || this.maxUploadSize;
            let quality = this.compressionQuality;
            let compressedBuffer;
            
            do {
                compressedBuffer = await sharp(screenshotPath)
                    .png({ 
                        quality: quality,
                        compressionLevel: 9,
                        progressive: false
                    })
                    .toBuffer();
                
                if (compressedBuffer.length <= targetSize || quality <= 30) {
                    break;
                }
                
                quality -= 10; // Reduce quality if still too large
                console.log(`🔄 Recompressing screenshot, quality: ${quality}%`);
                
            } while (quality > 30);
            
            console.log(`📦 Compressed screenshot: ${this.formatFileSize(compressedBuffer.length)} (quality: ${quality}%)`);
            return compressedBuffer;
            
        } catch (error) {
            console.error('Failed to compress screenshot:', error.message);
            throw error;
        }
    }

    async annotateScreenshot(screenshot, annotations) {
        if (!this.annotateActions || (!screenshot.buffer && !screenshot.filepath)) {
            return screenshot;
        }

        try {
            let inputBuffer = screenshot.buffer;
            
            // Read from file if no buffer
            if (!inputBuffer && screenshot.filepath) {
                inputBuffer = await fs.readFile(screenshot.filepath);
            }
            
            let image;
            
            // Handle raw vs PNG buffer
            if (screenshot.isOptimized || screenshot.filepath) {
                image = sharp(inputBuffer);
            } else {
                image = sharp(inputBuffer, {
                    raw: {
                        width: screenshot.width,
                        height: screenshot.height,
                        channels: 4
                    }
                });
            }

            // Add annotations
            const svgOverlay = this.createSVGOverlay(annotations, screenshot.width, screenshot.height);
            
            if (svgOverlay) {
                image = image.composite([{
                    input: Buffer.from(svgOverlay),
                    top: 0,
                    left: 0
                }]);
            }

            const annotatedBuffer = await image.png({ quality: this.compressionQuality }).toBuffer();
            
            // Save annotated version if keeping history
            if (this.keepHistory && screenshot.filepath) {
                const annotatedPath = screenshot.filepath.replace('.png', '_annotated.png');
                await fs.writeFile(annotatedPath, annotatedBuffer);
                console.log(`📝 Annotated screenshot saved: ${annotatedPath}`);
            }
            
            return {
                ...screenshot,
                buffer: annotatedBuffer,
                isOptimized: true,
                filesize: annotatedBuffer.length
            };
            
        } catch (error) {
            console.error('Failed to annotate screenshot:', error.message);
            return screenshot; // Return original on error
        }
    }

    createSVGOverlay(annotations, width, height) {
        if (!annotations || annotations.length === 0) return null;

        let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
        
        for (const annotation of annotations) {
            switch (annotation.type) {
                case 'click':
                    svg += `<circle cx="${annotation.x}" cy="${annotation.y}" r="12" 
                           fill="none" stroke="red" stroke-width="3" opacity="0.8"/>`;
                    svg += `<circle cx="${annotation.x}" cy="${annotation.y}" r="4" fill="red" opacity="0.9"/>`;
                    break;
                case 'rectangle':
                    svg += `<rect x="${annotation.x}" y="${annotation.y}" 
                           width="${annotation.width}" height="${annotation.height}"
                           fill="none" stroke="blue" stroke-width="2" opacity="0.7"/>`;
                    break;
                case 'text':
                    svg += `<text x="${annotation.x}" y="${annotation.y}" 
                           font-family="Arial, sans-serif" font-size="16" font-weight="bold"
                           fill="green" stroke="white" stroke-width="1" opacity="0.9">
                           ${this.escapeXML(annotation.text)}</text>`;
                    break;
                case 'arrow':
                    svg += `<line x1="${annotation.startX}" y1="${annotation.startY}" 
                           x2="${annotation.endX}" y2="${annotation.endY}" 
                           stroke="orange" stroke-width="3" marker-end="url(#arrowhead)"/>`;
                    break;
            }
        }
        
        // Add arrow marker definition
        svg += `<defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                        refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="orange"/>
                </marker>
            </defs>`;
        
        svg += '</svg>';
        return svg;
    }

    // Helper method to escape XML characters
    escapeXML(text) {
        return text.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case "'": return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    }

    // Enhanced cleanup with better file management
    async cleanup() {
        if (!this.keepHistory) return;

        try {
            console.log('🧹 Starting screenshot cleanup...');
            
            const files = await fs.readdir(this.directory);
            const screenshots = files
                .filter(file => file.endsWith('.png'))
                .map(file => ({
                    name: file,
                    path: path.join(this.directory, file),
                    stats: null
                }));

            // Get file stats and sort by modification time
            const validFiles = [];
            for (const file of screenshots) {
                try {
                    file.stats = await fs.stat(file.path);
                    validFiles.push(file);
                } catch (error) {
                    // File might have been deleted, skip
                    continue;
                }
            }

            // Sort by newest first
            validFiles.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

            if (validFiles.length > this.maxFiles) {
                const filesToDelete = validFiles.slice(this.maxFiles);
                let deletedCount = 0;
                let freedSpace = 0;
                
                for (const file of filesToDelete) {
                    try {
                        freedSpace += file.stats.size;
                        await fs.unlink(file.path);
                        deletedCount++;
                    } catch (error) {
                        console.error(`Failed to delete ${file.name}:`, error.message);
                    }
                }
                
                console.log(`✅ Cleaned up ${deletedCount} screenshots, freed ${this.formatFileSize(freedSpace)}`);
            } else {
                console.log(`📊 Screenshot count: ${validFiles.length}/${this.maxFiles} (no cleanup needed)`);
            }
        } catch (error) {
            console.error('Failed to cleanup screenshots:', error.message);
        }
    }

    // New method: Get screenshot directory info
    async getDirectoryInfo() {
        try {
            const files = await fs.readdir(this.directory);
            const screenshots = files.filter(file => file.endsWith('.png'));
            
            let totalSize = 0;
            for (const file of screenshots) {
                try {
                    const stats = await fs.stat(path.join(this.directory, file));
                    totalSize += stats.size;
                } catch (error) {
                    // Skip files that can't be accessed
                }
            }
            
            return {
                directory: this.directory,
                fileCount: screenshots.length,
                totalSize,
                formattedSize: this.formatFileSize(totalSize),
                maxFiles: this.maxFiles
            };
        } catch (error) {
            console.error('Failed to get directory info:', error.message);
            return null;
        }
    }

    // Helper method to format file sizes
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Method to validate screenshot for upload
    validateForUpload(screenshot) {
        const issues = [];
        
        if (!screenshot) {
            issues.push('Screenshot object is null/undefined');
            return issues;
        }
        
        if (!screenshot.filepath && !screenshot.buffer) {
            issues.push('No file path or buffer available');
        }
        
        if (screenshot.filesize > this.maxUploadSize) {
            issues.push(`File too large: ${this.formatFileSize(screenshot.filesize)} > ${this.formatFileSize(this.maxUploadSize)}`);
        }
        
        if (screenshot.width <= 0 || screenshot.height <= 0) {
            issues.push('Invalid dimensions');
        }
        
        return issues;
    }
}

module.exports = { ScreenshotManager };