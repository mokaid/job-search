// src/services/APIService.js - OCR for screenshots, LLM for text-only tasks
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs').promises;

class APIService {
    constructor(config) {
        this.config = config;
        this.resumeURL = config.env.RESUME_ANALYSIS_URL;
        this.llmURL = config.env.LLM_SERVICE_URL;     // For text-only tasks
        this.ocrURL = config.env.OCR_SERVICE_URL;     // For screenshot analysis
        
        // API call statistics
        this.stats = {
            totalCalls: 0,
            successfulCalls: 0,
            failedCalls: 0,
            totalCost: 0,
            averageResponseTime: 0
        };
    }

    // Main decision endpoint - USES OCR SERVICE FOR SCREENSHOTS
// Complete getNextAction method with N8N output wrapper fix
async getNextAction(payload) {
    const startTime = Date.now();
    
    try {
        console.log('👁️ Sending screenshot to OCR service for analysis...');
        
        // Create FormData to send screenshot to OCR service
        const formData = new FormData();
        
        // Add screenshot file
        if (payload.screenshot_path && await this.fileExists(payload.screenshot_path)) {
            const screenshotBuffer = await fs.readFile(payload.screenshot_path);
            formData.append('screenshot', screenshotBuffer, {
                filename: 'screenshot.png',
                contentType: 'image/png'
            });
            console.log(`📷 Screenshot file: ${payload.screenshot_path} (${screenshotBuffer.length} bytes)`);
        } else {
            throw new Error('Screenshot file not found or not provided');
        }
        
        // Add all context data as JSON
        const contextData = {
            current_objective: payload.current_objective,
            user_profile: payload.user_profile,
            session_context: payload.session_context,
            previous_actions: payload.previous_actions || [],
            screen_info: payload.screen_info,
            bot_capabilities: this.getBotCapabilities(),
            safety_constraints: this.getSafetyConstraints(),
            timestamp: Date.now(),
            request_type: 'get_next_action',
            analysis_type: 'screenshot_to_action'
        };
        
        formData.append('data', JSON.stringify(contextData));

        console.log(`🔗 Calling OCR service: ${this.ocrURL}`);
        console.log(`📊 Session context: ${payload.session_context?.applications_submitted || 0} applications submitted`);
        console.log(`🎯 Current objective: ${payload.current_objective}`);
        
        const response = await fetch(this.ocrURL, {
            method: 'POST',
            body: formData,
            headers: {
                ...formData.getHeaders(),
                'User-Agent': 'LinkedIn-Job-Bot/1.0'
            },
            timeout: 45000
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OCR Service HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        // Parse the response text first to handle \n characters
        const responseText = await response.text();
        console.log('📥 Raw N8N Response (length:', responseText.length, '):', responseText);
        console.log('📥 Response as bytes:', Buffer.from(responseText).toString('hex'));
        
        let decision;
        try {
            // Try direct JSON parse first
            decision = JSON.parse(responseText);
            console.log('✅ Direct JSON parse successful');
            
            // Handle N8N output wrapper - THIS IS THE KEY FIX!
            if (decision.output) {
                console.log('🔧 Found N8N output wrapper, parsing inner JSON...');
                try {
                    const innerDecision = JSON.parse(decision.output);
                    console.log('✅ Inner JSON parsed successfully:', innerDecision);
                    decision = innerDecision; // Replace the wrapper with the actual decision
                } catch (innerParseError) {
                    console.error('❌ Failed to parse inner JSON:', innerParseError.message);
                    console.error('📄 Inner JSON:', decision.output);
                    throw new Error('Could not parse inner JSON from N8N output field');
                }
            }
            
        } catch (directParseError) {
            console.log('❌ Direct parse failed:', directParseError.message);
            
            // Clean up the response text
            let cleanedResponse = responseText.trim();
            console.log('🧹 Trimmed response:', cleanedResponse);
            
            // Fix missing opening brace
            if (cleanedResponse.startsWith(':\\n') || cleanedResponse.startsWith(': ')) {
                cleanedResponse = '{' + cleanedResponse.substring(cleanedResponse.indexOf('"'));
                console.log('🔧 Fixed opening brace:', cleanedResponse);
            }
            
            // Replace escaped newlines
            cleanedResponse = cleanedResponse.replace(/\\n/g, '').replace(/\n/g, '');
            console.log('🧹 Cleaned newlines:', cleanedResponse);
            
            try {
                decision = JSON.parse(cleanedResponse);
                console.log('✅ Cleaned JSON parse successful');
                
                // Handle N8N output wrapper for cleaned response too
                if (decision.output) {
                    console.log('🔧 Found N8N output wrapper in cleaned response...');
                    const innerDecision = JSON.parse(decision.output);
                    console.log('✅ Inner JSON from cleaned response parsed:', innerDecision);
                    decision = innerDecision;
                }
                
            } catch (cleanParseError) {
                console.log('❌ Cleaned parse failed:', cleanParseError.message);
                
                // Manual extraction as last resort
                console.log('🔧 Attempting manual extraction...');
                const actionMatch = responseText.match(/"action":\s*"([^"]+)"/);
                const reasoningMatch = responseText.match(/"reasoning":\s*"([^"]+)"/);
                const confidenceMatch = responseText.match(/"confidence":\s*([0-9.]+)/);
                const xMatch = responseText.match(/"x_percentage":\s*([0-9.]+)/);
                const yMatch = responseText.match(/"y_percentage":\s*([0-9.]+)/);
                const objectiveMatch = responseText.match(/"next_objective":\s*"([^"]+)"/);
                
                console.log('🔍 Extracted matches:');
                console.log('  action:', actionMatch ? actionMatch[1] : 'NOT FOUND');
                console.log('  reasoning:', reasoningMatch ? reasoningMatch[1] : 'NOT FOUND');
                console.log('  confidence:', confidenceMatch ? confidenceMatch[1] : 'NOT FOUND');
                console.log('  x_percentage:', xMatch ? xMatch[1] : 'NOT FOUND');
                console.log('  y_percentage:', yMatch ? yMatch[1] : 'NOT FOUND');
                console.log('  next_objective:', objectiveMatch ? objectiveMatch[1] : 'NOT FOUND');
                
                if (actionMatch) {
                    decision = {
                        action: actionMatch[1],
                        reasoning: reasoningMatch ? reasoningMatch[1] : 'No reasoning provided',
                        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5,
                        x_percentage: xMatch ? parseFloat(xMatch[1]) : undefined,
                        y_percentage: yMatch ? parseFloat(yMatch[1]) : undefined,
                        next_objective: objectiveMatch ? objectiveMatch[1] : undefined
                    };
                    console.log('🔧 Manually constructed decision:', decision);
                } else {
                    throw new Error('Could not extract action from response');
                }
            }
        }
        
        console.log('✅ Parsed Decision BEFORE validation:', JSON.stringify(decision, null, 2));
        
        // Add metadata
        decision.timestamp = Date.now();
        decision.source = 'ocr_service';
        decision.estimated_cost = decision.estimated_cost || 0;
        
        console.log('📋 Decision BEFORE validateDecisionResponse:', JSON.stringify(decision, null, 2));
        
        // Validate the decision structure
        this.validateDecisionResponse(decision);
        
        console.log('📋 Decision AFTER validateDecisionResponse:', JSON.stringify(decision, null, 2));
        
        // Update statistics
        this.updateStats(startTime, true, decision.estimated_cost);
        
        console.log(`✅ OCR Service Decision: ${decision.action} (confidence: ${decision.confidence})`);
        console.log(`💭 Reasoning: ${decision.reasoning}`);
        console.log(`📍 Coordinates: ${decision.x_percentage}, ${decision.y_percentage}`);
        
        return decision;

    } catch (error) {
        this.updateStats(startTime, false);
        console.error('❌ OCR Service Error:', error.message);
        
        // Emergency fallback
        console.log('🚨 Using emergency fallback action...');
        return {
            action: "wait_and_observe",
            reasoning: `OCR Service failed: ${error.message}. Taking safe fallback action.`,
            confidence: 0.1,
            wait_duration: 10000,
            estimated_cost: 0,
            timestamp: Date.now(),
            source: 'emergency_fallback',
            next_objective: payload.current_objective
        };
    }
}

    // Job analysis - ALSO USES OCR SERVICE (screenshots)
    async analyzeJobPosting(payload) {
        try {
            console.log('📋 Analyzing job posting with OCR service...');
            
            const formData = new FormData();
            
            // Add screenshot as file
            if (payload.screenshot_path && await this.fileExists(payload.screenshot_path)) {
                const screenshotBuffer = await fs.readFile(payload.screenshot_path);
                formData.append('screenshot', screenshotBuffer, {
                    filename: 'job_screenshot.png',
                    contentType: 'image/png'
                });
            } else {
                throw new Error('Job screenshot file not found');
            }
            
            // Add analysis data
            const analysisData = {
                user_profile: payload.user_profile,
                analysis_type: payload.analysis_type || 'job_match',
                request_type: 'analyze_job_posting',
                matching_criteria: {
                    min_match_score: 0.7,
                    required_skills: payload.user_profile?.skills || [],
                    preferred_locations: payload.user_profile?.preferred_locations || [],
                    salary_expectations: payload.user_profile?.salary_range || {}
                },
                timestamp: Date.now()
            };
            
            formData.append('data', JSON.stringify(analysisData));

            const response = await fetch(this.ocrURL, {
                method: 'POST',
                body: formData,
                headers: {
                    ...formData.getHeaders(),
                    'User-Agent': 'LinkedIn-Job-Bot/1.0'
                },
                timeout: 30000
            });

            if (!response.ok) {
                throw new Error(`OCR job analysis error: ${response.status}`);
            }

            const analysis = await response.json();
            analysis.timestamp = Date.now();
            analysis.source = 'ocr_service';

            console.log(`📊 Job match score: ${analysis.match_score}% - ${analysis.recommendation}`);
            
            return analysis;

        } catch (error) {
            console.error('Job Analysis Error:', error.message);
            return {
                match_score: 50,
                recommendation: "analyze_manually",
                reasoning: "Could not analyze job posting automatically",
                timestamp: Date.now(),
                source: 'fallback'
            };
        }
    }

    // Form response generation - USES LLM SERVICE (text-only)
    async generateFormResponse(payload) {
        try {
            console.log('📝 Generating form response with LLM service...');
            
            const formPayload = {
                field_info: payload.field_info,
                field_type: payload.field_type,
                field_label: payload.field_label,
                field_context: payload.field_context,
                job_info: payload.job_info || {},
                user_profile: payload.user_profile,
                form_context: payload.form_context || {},
                request_type: 'generate_form_response',
                response_guidelines: {
                    max_length: payload.response_guidelines?.max_length || 500,
                    tone: 'professional',
                    include_keywords: true,
                    avoid_overqualification: true
                },
                timestamp: Date.now()
            };

            const response = await fetch(this.llmURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'LinkedIn-Job-Bot/1.0'
                },
                body: JSON.stringify(formPayload),
                timeout: 20000
            });

            if (!response.ok) {
                throw new Error(`LLM form response error: ${response.status}`);
            }

            const result = await response.json();
            result.timestamp = Date.now();
            result.source = 'llm_service';

            console.log(`📄 Generated response: "${result.generated_response?.substring(0, 50)}..."`);
            
            return result;

        } catch (error) {
            console.error('Form Response Error:', error.message);
            // Fallback response
            const userProfile = payload.user_profile || {};
            return {
                generated_response: `I am interested in this position and believe my background in ${userProfile.title || 'my field'} makes me a strong candidate.`,
                field_type: payload.field_type,
                confidence: 0.3,
                timestamp: Date.now(),
                source: 'fallback_template'
            };
        }
    }

    // Cover letter generation - USES LLM SERVICE (text-only)
    async generateCoverLetter(payload) {
        try {
            console.log('📄 Generating cover letter with LLM service...');
            
            const coverLetterPayload = {
                job_info: payload.job_info,
                user_profile: payload.user_profile,
                company_info: payload.company_info || {},
                cover_letter_type: payload.type || 'standard',
                length_preference: payload.length || 'medium',
                request_type: 'generate_cover_letter',
                customization_level: 'high',
                tone: 'professional_enthusiastic',
                timestamp: Date.now()
            };

            const response = await fetch(this.llmURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'LinkedIn-Job-Bot/1.0'
                },
                body: JSON.stringify(coverLetterPayload),
                timeout: 30000
            });

            if (!response.ok) {
                throw new Error(`LLM cover letter error: ${response.status}`);
            }

            const result = await response.json();
            result.timestamp = Date.now();
            result.source = 'llm_service';

            console.log(`📝 Generated cover letter: ${result.word_count} words`);
            
            return result;

        } catch (error) {
            console.error('Cover Letter Error:', error.message);
            // Fallback cover letter
            const userProfile = payload.user_profile || {};
            const jobInfo = payload.job_info || {};
            
            return {
                cover_letter: `Dear Hiring Manager,\n\nI am writing to express my interest in the ${jobInfo.title || 'position'} role. As a ${userProfile.title || 'professional'} with experience in ${userProfile.skills?.slice(0, 2)?.join(' and ') || 'relevant technologies'}, I believe I would be a valuable addition to your team.\n\nThank you for your consideration.\n\nBest regards,\n${userProfile.name || 'Candidate'}`,
                word_count: 50,
                timestamp: Date.now(),
                source: 'fallback_template'
            };
        }
    }

    // Resume analysis - KEEP USING EXISTING RESUME WEBHOOK
    async analyzeResume() {
        try {
            console.log('📄 Analyzing resume via dedicated webhook...');
            
            // Check cache first
            const profileCachePath = this.config.env.USER_PROFILE_PATH;
            try {
                const cachedProfile = await fs.readFile(profileCachePath, 'utf8');
                const profile = JSON.parse(cachedProfile);
                
                if (Date.now() - profile.last_updated < 86400000) {
                    console.log('✅ Using cached user profile');
                    return profile;
                }
            } catch (error) {
                // No cache, proceed with API call
            }

            // Read resume file
            const resumePath = this.config.env.RESUME_FILE_PATH;
            const resumeBuffer = await fs.readFile(resumePath);
            
            // Create form data for resume upload
            const formData = new FormData();
            formData.append('resume_file', resumeBuffer, {
                filename: 'resume.pdf',
                contentType: 'application/pdf'
            });
            formData.append('analysis_type', 'comprehensive');
            formData.append('extract_preferences', 'true');

            console.log(`🔗 Calling resume analysis webhook: ${this.resumeURL}`);
            
            const response = await fetch(this.resumeURL, {
                method: 'POST',
                body: formData,
                headers: {
                    ...formData.getHeaders(),
                    'User-Agent': 'LinkedIn-Job-Bot/1.0'
                },
                timeout: 45000
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Resume analysis error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const profile = await response.json();
            
            // Cache the result
            profile.last_updated = Date.now();
            await fs.writeFile(profileCachePath, JSON.stringify(profile, null, 2));
            
            console.log(`✅ Resume analysis completed: ${profile.name} - ${profile.title}`);
            console.log(`🔧 Skills extracted: ${profile.skills?.join(', ') || 'None'}`);
            
            return profile;
            
        } catch (error) {
            console.error('❌ Resume Analysis Error:', error.message);
            throw new Error(`Failed to analyze resume: ${error.message}`);
        }
    }

    // OCR for specific image regions - USES OCR SERVICE
    async performOCR(payload) {
        try {
            console.log('🔍 Performing OCR with OCR service...');
            
            const formData = new FormData();
            
            // Add image file if available
            if (payload.image_path && await this.fileExists(payload.image_path)) {
                const imageBuffer = await fs.readFile(payload.image_path);
                formData.append('image', imageBuffer, {
                    filename: 'ocr_image.png',
                    contentType: 'image/png'
                });
            } else if (payload.image_base64) {
                // Fallback to base64 for small OCR tasks
                const ocrPayload = {
                    image_base64: payload.image_base64,
                    region: payload.region || null,
                    language: payload.language || 'eng',
                    request_type: 'perform_ocr',
                    enhance_image: true,
                    extract_structure: true,
                    timestamp: Date.now()
                };

                const response = await fetch(this.ocrURL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'LinkedIn-Job-Bot/1.0'
                    },
                    body: JSON.stringify(ocrPayload),
                    timeout: 20000
                });

                if (!response.ok) {
                    throw new Error(`OCR error: ${response.status}`);
                }

                const result = await response.json();
                result.timestamp = Date.now();
                result.source = 'ocr_service';
                
                return result;
            } else {
                throw new Error('No image file or base64 provided for OCR');
            }
            
            // File upload version
            const ocrData = {
                region: payload.region || null,
                language: payload.language || 'eng',
                request_type: 'perform_ocr',
                enhance_image: true,
                extract_structure: true,
                timestamp: Date.now()
            };
            
            formData.append('data', JSON.stringify(ocrData));

            const response = await fetch(this.ocrURL, {
                method: 'POST',
                body: formData,
                headers: {
                    ...formData.getHeaders(),
                    'User-Agent': 'LinkedIn-Job-Bot/1.0'
                },
                timeout: 20000
            });

            if (!response.ok) {
                throw new Error(`OCR error: ${response.status}`);
            }

            const result = await response.json();
            result.timestamp = Date.now();
            result.source = 'ocr_service';
            
            return result;

        } catch (error) {
            console.error('OCR Error:', error.message);
            return { 
                extracted_text: '', 
                timestamp: Date.now(),
                source: 'fallback',
                note: 'OCR failed, returning empty result'
            };
        }
    }

    // Job match evaluation - USES LLM SERVICE (text-only)
    async evaluateJobMatch(payload) {
        try {
            const matchPayload = {
                job_info: payload.job_info,
                user_profile: payload.user_profile,
                request_type: 'evaluate_job_match',
                matching_weights: {
                    skills: 0.4,
                    experience: 0.3,
                    location: 0.2,
                    salary: 0.1
                },
                strict_requirements: payload.strict_requirements || [],
                timestamp: Date.now()
            };

            const response = await fetch(this.llmURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'LinkedIn-Job-Bot/1.0'
                },
                body: JSON.stringify(matchPayload),
                timeout: 15000
            });

            if (!response.ok) {
                throw new Error(`LLM job match error: ${response.status}`);
            }

            const result = await response.json();
            result.timestamp = Date.now();
            result.source = 'llm_service';
            
            return result;

        } catch (error) {
            console.error('Job Match Error:', error.message);
            return { 
                match_score: 60, 
                reasoning: 'Could not evaluate job match automatically',
                timestamp: Date.now(),
                source: 'fallback'
            };
        }
    }

    // Helper method to check if file exists
    async fileExists(filepath) {
        try {
            await fs.access(filepath);
            return true;
        } catch {
            return false;
        }
    }

    // Bot capabilities for context
    getBotCapabilities() {
        return {
            actions: [
                'click', 'type', 'scroll', 'drag', 'wait_and_observe',
                'navigate_back', 'refresh_page', 'submit_application',
                'skip_job', 'analyze_job_posting', 'fill_form_field',
                'handle_multi_step_form', 'emergency_stop'
            ],
            input_methods: ['mouse_movement', 'keyboard_typing', 'scroll_wheel'],
            detection_capabilities: ['screenshot_analysis', 'text_recognition', 'ui_element_detection'],
            limitations: ['cannot_solve_captcha', 'requires_existing_login', 'single_browser_tab'],
            screen_resolution: 'dynamic',
            interaction_speed: 'human_like'
        };
    }

    // Safety constraints
    getSafetyConstraints() {
        return {
            rate_limits: {
                max_actions_per_minute: 20,
                required_delay_between_applications: 30000,
                screenshot_interval: 20000
            },
            prohibited_actions: [
                'modify_user_profile', 'delete_applications',
                'access_private_messages', 'change_account_settings',
                'interact_with_non_job_content'
            ],
            content_guidelines: {
                no_false_information: true,
                maintain_professional_tone: true,
                respect_character_limits: true,
                focus_on_job_applications_only: true
            },
            error_handling: {
                max_consecutive_errors: this.config.get('safety.emergencyStop.errorThreshold') || 5,
                emergency_stop_triggers: ['captcha_detected', 'account_locked', 'rate_limited', 'suspicious_activity']
            }
        };
    }

    // Validate LLM decision response
    validateDecisionResponse(decision) {
        console.log('🔍 validateDecisionResponse called with:', JSON.stringify(decision, null, 2));
        
        const requiredFields = ['action', 'reasoning', 'confidence'];
        const missingFields = requiredFields.filter(field => !decision[field]);
        
        if (missingFields.length > 0) {
            console.warn(`⚠️ Decision missing fields: ${missingFields.join(', ')}`);
            console.warn('🔧 FIXING missing fields...');
            if (!decision.action) {
                decision.action = 'wait_and_observe';
                console.warn('  → Set action to wait_and_observe');
            }
            if (!decision.reasoning) {
                decision.reasoning = 'Missing reasoning from service';
                console.warn('  → Set default reasoning');
            }
            if (!decision.confidence) {
                decision.confidence = 0.5;
                console.warn('  → Set confidence to 0.5');
            }
        }

        // Validate action type
        const validActions = this.getBotCapabilities().actions;
        if (!validActions.includes(decision.action)) {
            console.warn(`⚠️ Invalid action: ${decision.action}, using wait_and_observe`);
            decision.action = 'wait_and_observe';
            decision.reasoning = `Invalid action corrected: ${decision.action}`;
        }

        // Validate confidence score
        if (decision.confidence < 0 || decision.confidence > 1) {
            console.warn(`⚠️ Invalid confidence: ${decision.confidence}, setting to 0.5`);
            decision.confidence = 0.5;
        }

        // Validate coordinates if provided
        if (decision.coordinates) {
            if (typeof decision.coordinates.x !== 'number' || typeof decision.coordinates.y !== 'number') {
                console.warn('⚠️ Invalid coordinates format, removing coordinates');
                delete decision.coordinates;
            }
        }
        
        console.log('✅ validateDecisionResponse completed. Final decision:', JSON.stringify(decision, null, 2));
    }

    // Update API statistics
    updateStats(startTime, success, cost = 0) {
        this.stats.totalCalls++;
        const responseTime = Date.now() - startTime;
        
        if (success) {
            this.stats.successfulCalls++;
        } else {
            this.stats.failedCalls++;
        }
        
        this.stats.totalCost += cost;
        this.stats.averageResponseTime = 
            (this.stats.averageResponseTime * (this.stats.totalCalls - 1) + responseTime) / this.stats.totalCalls;
    }

    // Get API statistics
    getStats() {
        return {
            ...this.stats,
            successRate: this.stats.successfulCalls / Math.max(1, this.stats.totalCalls),
            averageResponseTime: Math.round(this.stats.averageResponseTime)
        };
    }

    // Utility method
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { APIService };