# LinkedIn Job Bot

LLM-driven job application automation with human-like behavior.

## Setup

1. Run setup: `npm run setup`
2. Edit `.env` with your API keys
3. Add `resume.pdf` to `./data/` folder
4. Copy source files from provided artifacts
5. Install: `npm install`
6. Start: `npm start`

## Required Source Files

Copy these from the artifacts:
- `src/LinkedInJobBot.js`
- `src/config/BotConfig.js`
- `src/automation/EnhancedHumanMouse.js`
- `src/automation/HumanTyping.js`
- `src/services/APIService.js`
- `src/utils/Logger.js`
- `src/utils/ScreenshotManager.js`
- `src/utils/JobTracker.js`

## API Endpoints Needed

- `POST /get-next-action`
- `POST /analyze-resume`
- `POST /generate-form-response`
- `POST /analyze-job`
