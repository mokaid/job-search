// src/LinkedInJobBot.js - Complete fixed version with dynamic screen resolution
const robot = require('robotjs');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const { EnhancedHumanMouse } = require('./automation/EnhancedHumanMouse');
const { HumanTyping } = require('./automation/HumanTyping');
const { APIService } = require('./services/APIService');
const { ScreenshotManager } = require('./utils/ScreenshotManager');
const { Logger } = require('./utils/Logger');
const { JobTracker } = require('./utils/JobTracker');

class LinkedInJobBot {
    constructor(config) {
        this.config = config;
        this.logger = new Logger(config);
        
        // Initialize automation components
        this.mouse = new EnhancedHumanMouse(config);
        this.typing = new HumanTyping(config);
        this.apiService = new APIService(config);
        this.screenshotManager = new ScreenshotManager(config);
        this.jobTracker = new JobTracker(config);
        
        // Bot state
        this.isRunning = false;
        this.currentObjective = 'initialize';
        this.userProfile = null;
        this.sessionStartTime = null;
        this.applicationsCount = 0;
        this.consecutiveErrors = 0;
        this.lastActionTime = Date.now();
        
        // Screen dimensions (will be detected dynamically)
        this.screenDimensions = null;
        
        // Performance metrics
        this.metrics = {
            totalActions: 0,
            successfulActions: 0,
            llmCalls: 0,
            averageDecisionTime: 0,
            sessionDuration: 0
        };
        
        // Safety checks
        this.maxConsecutiveErrors = config.get('safety.emergencyStop.errorThreshold') || 5;
        this.maxSessionTime = config.get('bot.maxSessionTime') || 7200000;
        this.maxApplications = config.get('bot.maxApplications') || 50;
    }

    // Get actual screen dimensions
    getActualScreenDimensions() {
        if (!this.screenDimensions) {
            this.screenDimensions = robot.getScreenSize();
            console.log(`🖥️  Detected screen dimensions: ${this.screenDimensions.width} x ${this.screenDimensions.height}`);
        }
        return this.screenDimensions;
    }

    // Main bot lifecycle
    async start() {
        try {
            this.logger.info('🚀 LinkedIn Job Bot starting...');
            this.sessionStartTime = Date.now();
            
            // Initialize components
            await this.initialize();
            
            // Main execution loop
            this.isRunning = true;
            await this.mainExecutionLoop();
            
        } catch (error) {
            this.logger.error(`Fatal error in bot execution: ${error.message}`);
            await this.handleCriticalError(error);
        } finally {
            await this.cleanup();
        }
    }

    async initialize() {
        this.logger.info('Initializing bot components...');
        
        // Detect screen dimensions
        this.getActualScreenDimensions();
        
        // Load user profile from resume
        this.userProfile = await this.apiService.analyzeResume();
        this.logger.info(`Profile loaded: ${this.userProfile.name} - ${this.userProfile.title}`);
        
        // Initialize job tracker
        await this.jobTracker.initialize();
        
        // Use hardcoded screenshot for testing
        const initialScreenshot = {
            buffer: null,
            width: this.screenDimensions.width,
            height: this.screenDimensions.height,
            filepath: './data/screenshots/action_0_1749764287747.png',
            timestamp: Date.now(),
            label: 'hardcoded_test'
        };
        
        const initialAnalysis = await this.getLLMDecision(initialScreenshot, 'analyze_current_state');
        
        this.currentObjective = initialAnalysis.suggested_starting_point || 'navigate_to_jobs';
        this.logger.info(`Initial objective set: ${this.currentObjective}`);
    }

    // Main execution loop with LLM decision making
    async mainExecutionLoop() {
        const loopInterval = this.config.get('bot.screenshotInterval');
        
        while (this.isRunning && this.shouldContinueSession()) {
            const loopStartTime = Date.now();
            
            try {
                // Use hardcoded screenshot for testing
                const screenshot = {
                    buffer: null,
                    width: this.screenDimensions.width,
                    height: this.screenDimensions.height,
                    filepath: './data/screenshots/action_0_1749764287747.png',
                    timestamp: Date.now(),
                    label: 'hardcoded_test'
                };
                
                // Get LLM decision
                this.logger.debug('Requesting LLM decision...');
                const decision = await this.getLLMDecision(screenshot);
                
                // Log decision
                this.logger.info(`LLM Decision: ${decision.action} | Confidence: ${decision.confidence} | Reason: ${decision.reasoning}`);
                
                // Execute decision
                await this.executeDecision(decision, screenshot);
                
                // Update metrics
                this.updateMetrics(loopStartTime, true);
                
                // Reset error counter on successful action
                this.consecutiveErrors = 0;
                
            } catch (error) {
                this.logger.error(`Error in main loop: ${error.message}`);
                await this.handleLoopError(error);
            }
            
            // Wait for next iteration
            await this.sleep(loopInterval);
            
            // Add random human breaks
            if (this.shouldTakeBreak()) {
                await this.takeHumanBreak();
            }
        }
        
        this.logger.info('Main execution loop completed');
    }

    // Get decision from LLM based on current screenshot
    async getLLMDecision(screenshot, objective = null) {
        const startTime = Date.now();
        
        // Ensure screenshot file was saved
        if (!screenshot.filepath) {
            throw new Error('Screenshot file path is required for LLM analysis');
        }
        
        try {
            const decision = await this.apiService.getNextAction({
                screenshot_path: screenshot.filepath,
                current_objective: objective || this.currentObjective,
                user_profile: this.userProfile,
                session_context: this.getSessionContext(),
                previous_actions: this.getRecentActions(),
                screen_info: {
                    width: screenshot.width,
                    height: screenshot.height,
                    timestamp: screenshot.timestamp,
                    filepath: screenshot.filepath
                }
            });
            
            // Update metrics
            this.metrics.llmCalls++;
            const decisionTime = Date.now() - startTime;
            this.metrics.averageDecisionTime = 
                (this.metrics.averageDecisionTime * (this.metrics.llmCalls - 1) + decisionTime) / this.metrics.llmCalls;
            
            // Validate decision
            this.validateLLMDecision(decision);
            
            return decision;
            
        } catch (error) {
            this.logger.error(`LLM decision error: ${error.message}`);
            return this.getFallbackDecision();
        }
    }

    // Execute the LLM's decision
    async executeDecision(decision, screenshot) {
        const { action, coordinates, text_to_type, reasoning } = decision;
        
        this.logger.debug(`Executing action: ${action}`);
        this.metrics.totalActions++;
        
        // Log action for learning
        await this.jobTracker.logAction({
            action,
            coordinates,
            text: text_to_type,
            reasoning,
            timestamp: Date.now(),
            screenshot_path: screenshot.filepath
        });
        
        try {
            switch (action) {
                case 'click':
                    await this.executeClick(coordinates, decision);
                    break;
                    
                case 'type':
                    await this.executeTyping(text_to_type, coordinates, decision);
                    break;
                    
                case 'scroll':
                    await this.executeScroll(decision);
                    break;
                    
                case 'drag':
                    await this.executeDrag(decision);
                    break;
                    
                case 'wait_and_observe':
                    await this.executeWaitAndObserve(decision);
                    break;
                    
                case 'navigate_back':
                    await this.executeNavigateBack();
                    break;
                    
                case 'refresh_page':
                    await this.executeRefreshPage();
                    break;
                    
                case 'submit_application':
                    await this.executeSubmitApplication(decision);
                    break;
                    
                case 'skip_job':
                    await this.executeSkipJob(decision);
                    break;
                    
                case 'analyze_job_posting':
                    await this.executeJobAnalysis(decision);
                    break;
                    
                case 'fill_form_field':
                    await this.executeFillFormField(decision);
                    break;
                    
                case 'handle_multi_step_form':
                    await this.executeMultiStepForm(decision);
                    break;
                    
                case 'emergency_stop':
                    await this.executeEmergencyStop(decision);
                    break;
                    
                default:
                    this.logger.warn(`Unknown action: ${action}`);
                    await this.sleep(2000);
            }
            
            // Update objective if provided
            if (decision.next_objective) {
                this.currentObjective = decision.next_objective;
                this.logger.debug(`Objective updated: ${this.currentObjective}`);
            }
            
            this.metrics.successfulActions++;
            
        } catch (error) {
            this.logger.error(`Action execution error: ${error.message}`);
            throw error;
        }
    }

    // FIXED: Execute click with dynamic screen resolution
    async executeClick(coordinates, decision) {
        console.log('🖱️ executeClick called');
        console.log('📍 Input coordinates:', coordinates);
        console.log('📊 Decision:', JSON.stringify(decision, null, 2));
        
        // Get actual screen dimensions
        const actualScreen = this.getActualScreenDimensions();
        
        // Add coordinate debugging with actual dimensions
        this.debugCoordinates(decision, actualScreen.width, actualScreen.height);
        
        // Handle percentage-based coordinates from Claude Vision
        let actualCoords = coordinates;
        
        if (decision.x_percentage !== undefined && decision.y_percentage !== undefined) {
            // Apply smart coordinate correction first
            const correctedDecision = this.smartCoordinateCorrection(decision);
            
            // Convert corrected percentages to absolute coordinates using ACTUAL screen size
            actualCoords = {
                x: Math.round(actualScreen.width * correctedDecision.x_percentage),
                y: Math.round(actualScreen.height * correctedDecision.y_percentage)
            };
            
            console.log(`🔄 Screen-adjusted coordinates: (${actualCoords.x}, ${actualCoords.y})`);
            console.log(`   Using actual screen: ${actualScreen.width} x ${actualScreen.height}`);
            
            if (correctedDecision.corrected) {
                console.log(`   Correction applied: ${correctedDecision.correction_reason}`);
            }
        }
        
        // Validate coordinates against ACTUAL screen dimensions
        if (!this.validateCoordinatesForActualScreen(actualCoords, actualScreen)) {
            console.log('❌ Invalid coordinates for actual screen dimensions:', actualCoords);
            throw new Error(`Invalid coordinates: (${actualCoords.x}, ${actualCoords.y}) for screen ${actualScreen.width}x${actualScreen.height}`);
        }
        
        console.log(`🖱️ About to click at (${actualCoords.x}, ${actualCoords.y})`);
        
        try {
            console.log('🔄 Moving mouse...');
            await this.mouse.moveToPosition(actualCoords.x, actualCoords.y);
            console.log('🖱️ Clicking...');
            await this.mouse.click('left');
            console.log('✅ Click completed');
        } catch (error) {
            console.error('❌ Mouse action failed:', error);
            throw error;
        }
        
        const waitTime = decision.expected_load_time || this.randomDelay(1000, 3000);
        console.log(`⏳ Waiting ${waitTime}ms...`);
        await this.sleep(waitTime);
    }

    // FIXED: Smart coordinate correction with known LinkedIn elements
    smartCoordinateCorrection(decision) {
        const reasoning = decision.reasoning.toLowerCase();
        const originalX = decision.x_percentage;
        const originalY = decision.y_percentage;
        
        // Known LinkedIn navigation elements (percentages work for any screen size)
        const knownElements = {
            jobs: { x: 0.21, y: 0.05, keywords: ['jobs', 'job search', 'job tab', 'navigate to jobs'] },
            home: { x: 0.17, y: 0.05, keywords: ['home', 'feed', 'home tab'] },
            network: { x: 0.19, y: 0.05, keywords: ['network', 'my network', 'connections'] },
            messaging: { x: 0.23, y: 0.05, keywords: ['messaging', 'messages', 'chat'] },
            notifications: { x: 0.25, y: 0.05, keywords: ['notifications', 'alerts'] },
            search: { x: 0.11, y: 0.05, keywords: ['search', 'search bar'] }
        };
        
        // Check if reasoning matches any known elements
        for (const [elementName, element] of Object.entries(knownElements)) {
            for (const keyword of element.keywords) {
                if (reasoning.includes(keyword)) {
                    console.log(`🎯 SMART CORRECTION: Detected "${elementName}" element`);
                    return {
                        ...decision,
                        x_percentage: element.x,
                        y_percentage: element.y,
                        corrected: true,
                        correction_reason: `Detected "${elementName}" from reasoning: "${keyword}"`
                    };
                }
            }
        }
        
        // General corrections for navigation bar (top 20% of screen)
        if (originalY < 0.2) {
            // If it's in navigation area but X coordinate seems wrong
            if (originalX > 0.5) {
                console.log('🔧 GENERAL CORRECTION: Navigation element too far right');
                return {
                    ...decision,
                    x_percentage: Math.min(originalX, 0.3), // Cap at 30% from left
                    corrected: true,
                    correction_reason: 'Navigation element was positioned too far right'
                };
            }
        }
        
        return {
            ...decision,
            corrected: false
        };
    }

    // FIXED: Validation method for actual screen
    validateCoordinatesForActualScreen(coords, screenSize) {
        if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') {
            console.log('❌ Invalid coordinate structure:', coords);
            return false;
        }
        
        const isValid = coords.x >= 0 && coords.y >= 0 && 
                       coords.x < screenSize.width && coords.y < screenSize.height;
        
        console.log(`🔍 Coordinate validation: (${coords.x}, ${coords.y}) vs screen: (${screenSize.width}, ${screenSize.height}) = ${isValid ? 'VALID' : 'INVALID'}`);
        
        return isValid;
    }

    // FIXED: Debug method with dynamic dimensions
    debugCoordinates(decision, screenWidth, screenHeight) {
        console.log('\n🔍 COORDINATE DEBUG:');
        console.log('🖥️  Screen Resolution:', `${screenWidth} x ${screenHeight}`);
        console.log('📊 LLM Decision:', {
            action: decision.action,
            reasoning: decision.reasoning,
            confidence: decision.confidence,
            x_percentage: decision.x_percentage,
            y_percentage: decision.y_percentage
        });
        
        if (decision.x_percentage !== undefined && decision.y_percentage !== undefined) {
            const calculatedX = Math.round(screenWidth * decision.x_percentage);
            const calculatedY = Math.round(screenHeight * decision.y_percentage);
            
            console.log('📍 Percentage Coordinates:', {
                x_percent: `${(decision.x_percentage * 100).toFixed(1)}%`,
                y_percent: `${(decision.y_percentage * 100).toFixed(1)}%`
            });
            
            console.log('📍 Calculated Absolute Coordinates:', {
                x: calculatedX,
                y: calculatedY,
                screen_width: screenWidth,
                screen_height: screenHeight
            });
            
            // Suggest coordinates for actual screen resolution
            console.log('📍 Expected LinkedIn Element Coordinates (for your screen):');
            console.log(`  Jobs Tab: ~(${Math.round(screenWidth * 0.21)}, ${Math.round(screenHeight * 0.05)}) or ~21% from left`);
            console.log(`  Home Tab: ~(${Math.round(screenWidth * 0.17)}, ${Math.round(screenHeight * 0.05)}) or ~17% from left`); 
            console.log(`  Search Bar: ~(${Math.round(screenWidth * 0.11)}, ${Math.round(screenHeight * 0.05)}) or ~11% from left`);
            
            // Validate if coordinates seem reasonable for actual screen
            if (calculatedX > screenWidth * 0.8) {
                console.log('⚠️  WARNING: X coordinate seems too far right for your screen!');
                console.log('💡 Suggested fix: Try x_percentage around 0.21 for Jobs tab');
            }
            
            if (calculatedY > screenHeight * 0.5) {
                console.log('⚠️  WARNING: Y coordinate seems too low for navigation bar!');
                console.log('💡 Suggested fix: Try y_percentage around 0.05-0.15 for navigation bar');
            }
        }
        console.log(''); // Empty line for readability
    }

    // Execute typing action
    async executeTyping(text, coordinates, decision) {
        if (!text) {
            this.logger.warn('No text provided for typing action');
            return;
        }
        
        this.logger.debug(`Typing: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        
        // Click on field if coordinates provided
        if (coordinates) {
            await this.mouse.moveToPosition(coordinates.x, coordinates.y);
            await this.mouse.click('left');
            await this.sleep(500);
        }
        
        // Clear existing text if specified
        if (decision.clear_existing) {
            await this.clearField();
        }
        
        // Type with human-like behavior
        await this.typing.typeText(text, {
            wpm: decision.typing_speed || undefined,
            thinking: decision.add_thinking_pauses !== false
        });
    }

    async executeScroll(decision) {
        const direction = decision.scroll_direction || 'down';
        const amount = decision.scroll_amount || 3;
        
        this.logger.debug(`Scrolling ${direction} by ${amount}`);
        
        await this.mouse.scroll(direction, amount);
        
        // Wait for content to load
        await this.sleep(this.randomDelay(500, 1500));
    }

    async executeDrag(decision) {
        const { start_coords, end_coords } = decision;
        
        if (!this.validateCoordinates(start_coords) || !this.validateCoordinates(end_coords)) {
            throw new Error('Invalid coordinates for drag action');
        }
        
        this.logger.debug(`Dragging from (${start_coords.x}, ${start_coords.y}) to (${end_coords.x}, ${end_coords.y})`);
        
        await this.mouse.drag(start_coords.x, start_coords.y, end_coords.x, end_coords.y);
    }

    async executeWaitAndObserve(decision) {
        const waitTime = decision.wait_duration || 3000;
        this.logger.debug(`Waiting and observing for ${waitTime}ms`);
        
        await this.sleep(waitTime);
        
        // Optionally move mouse to simulate attention
        if (decision.simulate_attention) {
            await this.simulateAttentionMovement();
        }
    }

    async executeNavigateBack() {
        this.logger.debug('Navigating back');
        robot.keyTap('left', process.platform === 'darwin' ? ['cmd'] : ['ctrl']);
        await this.sleep(this.randomDelay(2000, 4000));
    }

    async executeRefreshPage() {
        this.logger.debug('Refreshing page');
        robot.keyTap('r', process.platform === 'darwin' ? ['cmd'] : ['ctrl']);
        await this.sleep(this.randomDelay(3000, 6000));
    }

    async executeSubmitApplication(decision) {
        this.logger.info('🎯 Submitting job application');
        
        if (decision.coordinates) {
            await this.executeClick(decision.coordinates, decision);
        }
        
        // Log successful application
        await this.jobTracker.logApplication({
            status: 'submitted',
            job_info: decision.job_info || {},
            submission_time: Date.now()
        });
        
        this.applicationsCount++;
        this.logger.info(`✅ Application #${this.applicationsCount} submitted successfully!`);
        
        // Update objective to find next job
        this.currentObjective = 'find_next_job';
        
        // Take a human-like break after application
        await this.sleep(this.randomDelay(3000, 8000));
    }

    async executeSkipJob(decision) {
        this.logger.info(`⏭️  Skipping job: ${decision.skip_reason}`);
        
        // Log skipped job
        await this.jobTracker.logApplication({
            status: 'skipped',
            reason: decision.skip_reason,
            job_info: decision.job_info || {},
            timestamp: Date.now()
        });
        
        this.currentObjective = 'find_next_job';
    }

    async executeJobAnalysis(decision) {
        this.logger.debug('Job analysis suggested - executing click action instead');
        
        // Instead of taking new screenshot, just click where Claude suggested
        if (decision.x_percentage !== undefined && decision.y_percentage !== undefined) {
            await this.executeClick(null, decision);
            
            // Update objective
            this.currentObjective = decision.next_objective || 'navigate_to_jobs_section';
        } else {
            this.logger.warn('No coordinates provided for job analysis action');
        }
    }

    async executeFillFormField(decision) {
        this.logger.debug('Filling form field with LLM-generated content');
        
        const { field_info, generated_content } = decision;
        
        // Click on field
        if (field_info.coordinates) {
            await this.mouse.moveToPosition(field_info.coordinates.x, field_info.coordinates.y);
            await this.mouse.click('left');
            await this.sleep(300);
        }
        
        // Handle different field types
        switch (field_info.type) {
            case 'dropdown':
                await this.handleDropdownField(field_info, generated_content);
                break;
            case 'radio':
                await this.handleRadioField(field_info, generated_content);
                break;
            case 'checkbox':
                await this.handleCheckboxField(field_info, generated_content);
                break;
            case 'textarea':
            case 'input':
            default:
                await this.clearField();
                await this.typing.typeText(generated_content);
        }
        
        // Wait between fields
        await this.sleep(this.randomDelay(1000, 3000));
    }

    async executeMultiStepForm(decision) {
        this.logger.debug('Handling multi-step application form');
        
        const { form_fields, form_page_info } = decision;
        
        // Fill all fields on current page
        for (const field of form_fields) {
            await this.executeFillFormField({
                field_info: field,
                generated_content: field.suggested_content
            });
        }
        
        // Look for next/submit button
        if (form_page_info.next_button) {
            await this.executeClick(form_page_info.next_button.coordinates, {
                expected_load_time: 2000
            });
        }
    }

    async executeEmergencyStop(decision) {
        this.logger.warn(`🚨 Emergency stop triggered: ${decision.reason}`);
        this.isRunning = false;
        
        await this.jobTracker.logEvent({
            type: 'emergency_stop',
            reason: decision.reason,
            timestamp: Date.now()
        });
    }

    // Helper methods for form handling
    async handleDropdownField(fieldInfo, value) {
        // Click to open dropdown
        await this.mouse.click('left');
        await this.sleep(500);
        
        // Type to search or use arrow keys
        if (fieldInfo.searchable) {
            await this.typing.typeText(value);
            await this.sleep(1000);
            robot.keyTap('enter');
        } else {
            // Navigate with arrow keys
            const options = fieldInfo.options || [];
            const targetIndex = options.findIndex(opt => 
                opt.toLowerCase().includes(value.toLowerCase())
            );
            
            if (targetIndex > 0) {
                for (let i = 0; i < targetIndex; i++) {
                    robot.keyTap('down');
                    await this.sleep(100);
                }
            }
            robot.keyTap('enter');
        }
    }

    async handleRadioField(fieldInfo, value) {
        // Find the radio button that matches the value
        if (fieldInfo.option_coordinates) {
            const matchingOption = fieldInfo.option_coordinates.find(opt =>
                opt.label.toLowerCase().includes(value.toLowerCase())
            );
            
            if (matchingOption) {
                await this.mouse.moveToPosition(matchingOption.x, matchingOption.y);
                await this.mouse.click('left');
            }
        }
    }

    async handleCheckboxField(fieldInfo, value) {
        // Determine if checkbox should be checked based on value
        const shouldCheck = ['yes', 'true', '1', 'check', 'select'].includes(value.toLowerCase());
        
        if (shouldCheck !== fieldInfo.currently_checked) {
            await this.mouse.click('left');
        }
    }

    // Utility methods
    async clearField() {
        const platform = process.platform;
        const modifier = platform === 'darwin' ? ['cmd'] : ['ctrl'];
        
        robot.keyTap('a', modifier); // Select all
        await this.sleep(100);
        robot.keyTap('delete');
        await this.sleep(200);
    }

    async simulateReadingTime(textLength) {
        const baseTime = this.config.get('safety.humanBehavior.readingTime.baseTime') || 2000;
        const perWordTime = this.config.get('safety.humanBehavior.readingTime.perWordTime') || 50;
        
        const estimatedWords = Math.max(1, Math.floor(textLength / 5));
        const readingTime = baseTime + (estimatedWords * perWordTime);
        
        await this.sleep(this.randomDelay(readingTime * 0.8, readingTime * 1.2));
    }

    async simulateAttentionMovement() {
        const currentPos = robot.getMousePos();
        const screenSize = this.getActualScreenDimensions();
        
        // Generate 2-3 attention points around the screen
        const attentionPoints = [];
        for (let i = 0; i < this.randomInt(2, 4); i++) {
            attentionPoints.push({
                x: this.randomInt(100, screenSize.width - 100),
                y: this.randomInt(100, screenSize.height - 100)
            });
        }
        
        // Move to each attention point briefly
        for (const point of attentionPoints) {
            await this.mouse.moveToPosition(point.x, point.y);
            await this.sleep(this.randomDelay(200, 800));
        }
        
        // Return to original position
        await this.mouse.moveToPosition(currentPos.x, currentPos.y);
    }

    async takeHumanBreak() {
        const breakConfig = this.config.get('safety.randomBreaks');
        const breakDuration = this.randomDelay(
            breakConfig.duration.min || 60000,
            breakConfig.duration.max || 300000
        );
        
        this.logger.info(`Taking human break for ${Math.floor(breakDuration / 1000)} seconds`);
        
        // Log break
        await this.jobTracker.logEvent({
            type: 'human_break',
            duration: breakDuration,
            timestamp: Date.now()
        });
        
        await this.sleep(breakDuration);
    }

    // Session management
    shouldContinueSession() {
        // Check session time limit
        const sessionDuration = Date.now() - this.sessionStartTime;
        if (sessionDuration > this.maxSessionTime) {
            this.logger.info('Maximum session time reached');
            return false;
        }
        
        // Check application limit
        if (this.applicationsCount >= this.maxApplications) {
            this.logger.info('Maximum applications reached');
            return false;
        }
        
        // Check consecutive errors
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            this.logger.error('Too many consecutive errors, stopping');
            return false;
        }
        
        return true;
    }

    shouldTakeBreak() {
        const breakConfig = this.config.get('safety.randomBreaks');
        if (!breakConfig.enabled) return false;
        
        const timeSinceLastAction = Date.now() - this.lastActionTime;
        const minInterval = breakConfig.minInterval || 600000;
        const probability = this.config.get('bot.humanBreakProbability') || 0.1;
        
        return timeSinceLastAction > minInterval && Math.random() < probability;
    }

    // Error handling
    async handleLoopError(error) {
        this.consecutiveErrors++;
        this.logger.error(`Loop error #${this.consecutiveErrors}: ${error.message}`);
        
        // Take screenshot for debugging
        await this.screenshotManager.capture(`error_${this.consecutiveErrors}`);
        
        // Wait before retry
        await this.sleep(this.randomDelay(2000, 5000));
    }

    async handleCriticalError(error) {
        this.logger.error(`Critical error: ${error.message}`);
        
        await this.jobTracker.logEvent({
            type: 'critical_error',
            error: error.message,
            stack: error.stack,
            timestamp: Date.now()
        });
        
        // Take final screenshot
        await this.screenshotManager.capture('critical_error');
    }

    // Validation methods
    validateCoordinates(coords) {
        if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') {
            return false;
        }
        
        const screenSize = this.getActualScreenDimensions();
        return coords.x >= 0 && coords.y >= 0 && 
               coords.x < screenSize.width && coords.y < screenSize.height;
    }

    validateLLMDecision(decision) {
        if (!decision || !decision.action) {
            throw new Error('Invalid LLM decision: missing action');
        }
        
        if (decision.confidence < 0.3) {
            this.logger.warn(`Low confidence decision: ${decision.confidence}`);
        }
    }

    getFallbackDecision() {
        return {
            action: 'wait_and_observe',
            reasoning: 'Fallback decision due to LLM error',
            confidence: 0.1,
            wait_duration: 5000
        };
    }

    // Context methods
    getSessionContext() {
        return {
            applications_submitted: this.applicationsCount,
            session_duration: Date.now() - this.sessionStartTime,
            current_objective: this.currentObjective,
            consecutive_errors: this.consecutiveErrors,
            total_actions: this.metrics.totalActions,
            success_rate: this.metrics.successfulActions / Math.max(1, this.metrics.totalActions),
            screen_resolution: `${this.screenDimensions?.width}x${this.screenDimensions?.height}`
        };
    }

    getRecentActions() {
        // Return last 5 actions from job tracker
        return this.jobTracker.getRecentActions(5);
    }

    updateMetrics(startTime, success) {
        const duration = Date.now() - startTime;
        this.metrics.sessionDuration = Date.now() - this.sessionStartTime;
        this.lastActionTime = Date.now();
        
        if (success) {
            this.metrics.successfulActions++;
        }
    }

    // Cleanup
    async cleanup() {
        this.logger.info('Cleaning up bot session...');
        
        // Save final metrics
        await this.jobTracker.saveSessionSummary({
            applications_submitted: this.applicationsCount,
            session_duration: this.metrics.sessionDuration,
            total_actions: this.metrics.totalActions,
            success_rate: this.metrics.successfulActions / Math.max(1, this.metrics.totalActions),
            llm_calls: this.metrics.llmCalls,
            average_decision_time: this.metrics.averageDecisionTime,
            screen_resolution: `${this.screenDimensions?.width}x${this.screenDimensions?.height}`
        });
        
        // Clean up old screenshots if needed
        await this.screenshotManager.cleanup();
        
        this.logger.info(`Session completed: ${this.applicationsCount} applications submitted`);
    }

    // Utility methods
    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async stop() {
        this.logger.info('Stop signal received');
        this.isRunning = false;
    }
}

module.exports = { LinkedInJobBot };