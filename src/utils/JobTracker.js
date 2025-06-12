// src/utils/JobTracker.js - Job application tracking (FIXED VERSION)
const fs = require('fs').promises;
const path = require('path');

class JobTracker {
    constructor(config) {
        this.config = config;
        this.trackApplications = config.get('application.trackApplications') || true;
        this.dataDirectory = './data';
        this.applicationsFile = path.join(this.dataDirectory, 'applications.json');
        this.actionsFile = path.join(this.dataDirectory, 'actions.json');
        this.sessionsFile = path.join(this.dataDirectory, 'sessions.json');
        
        this.applications = [];
        this.actions = [];
        this.currentSession = null;
    }

    async initialize() {
        if (!this.trackApplications) return;

        try {
            await fs.mkdir(this.dataDirectory, { recursive: true });
            
            // Load existing data
            await this.loadApplications();
            await this.loadActions();
            
            // Start new session
            this.currentSession = {
                session_id: this.generateSessionId(),
                start_time: Date.now(),
                end_time: null,
                applications_submitted: 0,
                total_actions: 0,
                success_rate: 0,
                objectives_completed: []
            };
            
            console.log(`Started new session: ${this.currentSession.session_id}`);
            
        } catch (error) {
            console.error('Failed to initialize job tracker:', error.message);
            // Don't throw, continue without tracking
        }
    }

    async loadApplications() {
        try {
            const data = await fs.readFile(this.applicationsFile, 'utf8');
            this.applications = JSON.parse(data);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty array
            this.applications = [];
        }
    }

    async loadActions() {
        try {
            const data = await fs.readFile(this.actionsFile, 'utf8');
            this.actions = JSON.parse(data);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty array
            this.actions = [];
        }
    }

    async logApplication(applicationData) {
        if (!this.trackApplications) return;

        try {
            const application = {
                id: this.generateApplicationId(),
                session_id: this.currentSession?.session_id || 'no_session',
                timestamp: Date.now(),
                status: applicationData.status, // 'submitted', 'skipped', 'failed'
                job_info: applicationData.job_info || {},
                reason: applicationData.reason || null,
                submission_time: applicationData.submission_time || Date.now(),
                form_data: applicationData.form_data || {},
                match_score: applicationData.match_score || null
            };

            this.applications.push(application);
            
            if (application.status === 'submitted' && this.currentSession) {
                this.currentSession.applications_submitted++;
            }

            await this.saveApplications();
        } catch (error) {
            console.error('Failed to log application:', error.message);
        }
    }

    async logAction(actionData) {
        if (!this.trackApplications) return;

        try {
            const action = {
                id: this.generateActionId(),
                session_id: this.currentSession?.session_id || 'no_session',
                timestamp: Date.now(),
                action: actionData.action,
                coordinates: actionData.coordinates || null,
                text: actionData.text || null,
                reasoning: actionData.reasoning || null,
                screenshot_path: actionData.screenshot_path || null,
                success: actionData.success !== false, // Default to true
                error: actionData.error || null,
                duration: actionData.duration || null
            };

            this.actions.push(action);
            
            if (this.currentSession) {
                this.currentSession.total_actions++;
            }

            // Keep only recent actions in memory
            if (this.actions.length > 1000) {
                this.actions = this.actions.slice(-500);
            }

            await this.saveActions();
        } catch (error) {
            console.error('Failed to log action:', error.message);
        }
    }

    async logEvent(eventData) {
        if (!this.trackApplications) return;

        try {
            const event = {
                id: this.generateEventId(),
                session_id: this.currentSession?.session_id || 'no_session',
                timestamp: Date.now(),
                type: eventData.type,
                data: eventData,
                severity: eventData.severity || 'info'
            };

            // Log as action for simplicity
            await this.logAction({
                action: 'system_event',
                reasoning: `${event.type}: ${JSON.stringify(event.data)}`,
                success: true
            });
        } catch (error) {
            console.error('Failed to log event:', error.message);
        }
    }

    async saveApplications() {
        try {
            await fs.writeFile(this.applicationsFile, JSON.stringify(this.applications, null, 2));
        } catch (error) {
            console.error('Failed to save applications:', error.message);
        }
    }

    async saveActions() {
        try {
            await fs.writeFile(this.actionsFile, JSON.stringify(this.actions, null, 2));
        } catch (error) {
            console.error('Failed to save actions:', error.message);
        }
    }

    async saveSessionSummary(summaryData) {
        if (!this.trackApplications) {
            console.log('Application tracking disabled, skipping session summary');
            return;
        }

        if (!this.currentSession) {
            console.log('No active session to save summary for');
            return;
        }

        try {
            this.currentSession.end_time = Date.now();
            this.currentSession.duration = this.currentSession.end_time - this.currentSession.start_time;
            this.currentSession = { ...this.currentSession, ...summaryData };

            // Load existing sessions
            let sessions = [];
            try {
                const data = await fs.readFile(this.sessionsFile, 'utf8');
                sessions = JSON.parse(data);
            } catch (error) {
                // File doesn't exist, start with empty array
                sessions = [];
            }

            sessions.push(this.currentSession);
            await fs.writeFile(this.sessionsFile, JSON.stringify(sessions, null, 2));
            
            console.log(`Session summary saved: ${this.currentSession.session_id}`);
            
        } catch (error) {
            console.error('Failed to save session summary:', error.message);
        }
    }

    getRecentActions(count = 5) {
        try {
            const sessionId = this.currentSession?.session_id || 'no_session';
            return this.actions
                .filter(action => action.session_id === sessionId)
                .slice(-count)
                .map(action => ({
                    action: action.action,
                    timestamp: action.timestamp,
                    success: action.success,
                    reasoning: action.reasoning
                }));
        } catch (error) {
            console.error('Failed to get recent actions:', error.message);
            return [];
        }
    }

    getApplicationStats() {
        try {
            const sessionId = this.currentSession?.session_id || 'no_session';
            const sessionApplications = this.applications.filter(
                app => app.session_id === sessionId
            );

            return {
                total_applications: sessionApplications.length,
                submitted: sessionApplications.filter(app => app.status === 'submitted').length,
                skipped: sessionApplications.filter(app => app.status === 'skipped').length,
                failed: sessionApplications.filter(app => app.status === 'failed').length,
                average_match_score: this.calculateAverageMatchScore(sessionApplications)
            };
        } catch (error) {
            console.error('Failed to get application stats:', error.message);
            return {
                total_applications: 0,
                submitted: 0,
                skipped: 0,
                failed: 0,
                average_match_score: 0
            };
        }
    }

    calculateAverageMatchScore(applications) {
        try {
            const withScores = applications.filter(app => app.match_score !== null && app.match_score !== undefined);
            if (withScores.length === 0) return 0;
            
            return withScores.reduce((sum, app) => sum + app.match_score, 0) / withScores.length;
        } catch (error) {
            console.error('Failed to calculate average match score:', error.message);
            return 0;
        }
    }

    // ID generators
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateApplicationId() {
        return `app_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateActionId() {
        return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Cleanup method for safe shutdown
    async cleanup() {
        try {
            if (this.currentSession) {
                await this.saveSessionSummary({
                    end_reason: 'normal_shutdown'
                });
            }
        } catch (error) {
            console.error('Failed to cleanup job tracker:', error.message);
        }
    }

    // Get current session info safely
    getCurrentSession() {
        return this.currentSession ? { ...this.currentSession } : null;
    }

    // Check if tracking is active
    isTrackingActive() {
        return this.trackApplications && this.currentSession !== null;
    }
}

module.exports = { JobTracker };