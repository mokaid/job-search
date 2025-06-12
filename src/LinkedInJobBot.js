// src/LinkedInJobBot.js - Main bot with LLM-driven decision making (File Upload Version)
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
        
        // Load user profile from resume
        this.userProfile = await this.apiService.analyzeResume();
        this.logger.info(`Profile loaded: ${this.userProfile.name} - ${this.userProfile.title}`);
        
        // Initialize job tracker
        await this.jobTracker.initialize();
        
        // HARDCODE THIS TOO - Don't take initial screenshot
        // const initialScreenshot = await this.screenshotManager.capture('initialization');
        
        const initialScreenshot = {
            buffer: null,
            width: 3456,
            height: 2234,
            filepath: './data/screenshots/action_0_1749764287747.png', // Same hardcoded file
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
                // Take screenshot
                this.logger.debug('Taking screenshot for analysis...');
               // const screenshot = await this.screenshotManager.capture(`action_${this.metrics.totalActions}`);
                

                const screenshot = {
                    buffer: null,
                    width: 3456,
                    height: 2234,
                    filepath: './data/screenshots/action_0_1749764287747.png', // 👈 Hardcoded test file
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

    // Get decision from LLM based on current screenshot - UPDATED FOR FILE UPLOAD
    async getLLMDecision(screenshot, objective = null) {
        const startTime = Date.now();
        
        // Ensure screenshot file was saved
        if (!screenshot.filepath) {
            throw new Error('Screenshot file path is required for LLM analysis');
        }
        
        try {
            const decision = await this.apiService.getNextAction({
                screenshot_path: screenshot.filepath, // Pass file path instead of base64!
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

    // Action execution methods
    async executeClick(coordinates, decision) {
        console.log('🖱️ executeClick called');
        console.log('📍 Input coordinates:', coordinates);
        console.log('📊 Decision:', JSON.stringify(decision, null, 2));
        
        // Handle percentage-based coordinates from Claude Vision
        let actualCoords = coordinates;
        
        if (decision.x_percentage !== undefined && decision.y_percentage !== undefined) {
            // Convert percentages to actual screen coordinates
            actualCoords = {
                x: Math.round(3456 * decision.x_percentage), // Use hardcoded dimensions
                y: Math.round(2234 * decision.y_percentage)
            };
            
            console.log(`🔄 Converted coordinates: ${decision.x_percentage * 100}%, ${decision.y_percentage * 100}% → (${actualCoords.x}, ${actualCoords.y})`);
            this.logger.debug(`Converted coordinates: ${decision.x_percentage * 100}%, ${decision.y_percentage * 100}% → (${actualCoords.x}, ${actualCoords.y})`);
        } else {
            console.log('❌ No x_percentage/y_percentage found');
        }
        
        // UPDATED VALIDATION - Use screenshot dimensions instead of actual screen size
        if (!this.validateCoordinatesForScreenshot(actualCoords, 3456, 2234)) {
            console.log('❌ Invalid coordinates for screenshot dimensions:', actualCoords);
            throw new Error(`Invalid coordinates for screenshot: (${actualCoords.x}, ${actualCoords.y}) - max: (3456, 2234)`);
        }
        
        console.log(`🖱️ About to click at (${actualCoords.x}, ${actualCoords.y})`);
        this.logger.debug(`Clicking at (${actualCoords.x}, ${actualCoords.y})`);
        
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

    // Updated job analysis method - uses file path
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
        const screenSize = robot.getScreenSize();
        
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
        
        const screenSize = robot.getScreenSize();
        return coords.x >= 0 && coords.y >= 0 && 
               coords.x < screenSize.width && coords.y < screenSize.height;
    }

    // NEW METHOD: Validate coordinates for screenshot dimensions
    validateCoordinatesForScreenshot(coords, maxWidth, maxHeight) {
        if (!coords || typeof coords.x !== 'number' || typeof coords.y !== 'number') {
            console.log('❌ Invalid coordinate structure:', coords);
            return false;
        }
        
        const isValid = coords.x >= 0 && coords.y >= 0 && 
                       coords.x < maxWidth && coords.y < maxHeight;
        
        console.log(`🔍 Coordinate validation: (${coords.x}, ${coords.y}) vs max: (${maxWidth}, ${maxHeight}) = ${isValid ? 'VALID' : 'INVALID'}`);
        
        return isValid;
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
            success_rate: this.metrics.successfulActions / Math.max(1, this.metrics.totalActions)
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
            average_decision_time: this.metrics.averageDecisionTime
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