#!/bin/bash
# setup-linkedin-bot.sh - Complete project setup script

echo "🚀 Creating LinkedIn Job Bot project..."

# Create project directory
mkdir -p linkedin-job-bot
cd linkedin-job-bot

# Create directory structure
mkdir -p src/{config,automation,services,utils}
mkdir -p config data/{screenshots,logs} scripts

echo "📁 Created directory structure"

# Create package.json
cat > package.json << 'EOF'
{
  "name": "linkedin-job-bot",
  "version": "1.0.0",
  "description": "LLM-driven LinkedIn job application automation",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "test": "node main.js --preset testing",
    "conservative": "node main.js --preset conservative",
    "setup": "node scripts/setup.js"
  },
  "dependencies": {
    "robotjs": "^0.6.0",
    "sharp": "^0.32.6",
    "node-fetch": "^2.6.7",
    "form-data": "^4.0.0",
    "dotenv": "^16.3.1"
  }
}
EOF

# Create .env.example
cat > .env.example << 'EOF'
LLM_SERVICE_URL=http://localhost:3000
RESUME_ANALYSIS_URL=http://localhost:3000/analyze-resume
OCR_SERVICE_URL=http://localhost:3000/ocr
OPENAI_API_KEY=your_openai_api_key_here
RESUME_FILE_PATH=./data/resume.pdf
USER_PROFILE_PATH=./data/user-profile.json
DEBUG_MODE=false
EOF

# Create main.js
cat > main.js << 'EOF'
// main.js - Entry point
const { LinkedInJobBot } = require('./src/LinkedInJobBot');
const { BotConfig } = require('./src/config/BotConfig');

async function main() {
    try {
        console.log('🚀 Starting LinkedIn Job Bot...');
        
        const config = BotConfig.load();
        const bot = new LinkedInJobBot(config);
        
        process.on('SIGINT', async () => {
            console.log('🛑 Stopping bot...');
            await bot.stop();
            process.exit(0);
        });
        
        await bot.start();
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
EOF

# Create config file
cat > config/user-config.json << 'EOF'
{
  "bot": {
    "screenshotInterval": 30000,
    "maxApplications": 50,
    "debugMode": false
  },
  "mouse": {
    "movement": {
      "baseSpeed": 8,
      "jitterIntensity": 1.5
    },
    "bezier": {
      "curvature": 0.3,
      "randomness": 0.2
    }
  },
  "typing": {
    "wpm": 45,
    "errorRate": 0.02
  }
}
EOF

# Create setup script
cat > scripts/setup.js << 'EOF'
const fs = require('fs');

console.log('🚀 Setting up project...');

// Create .env from template
if (!fs.existsSync('.env')) {
    fs.copyFileSync('.env.example', '.env');
    console.log('✅ Created .env file');
}

console.log('🎉 Setup complete!');
console.log('\nNext steps:');
console.log('1. Edit .env with your API keys');
console.log('2. Add resume.pdf to ./data/ folder');
console.log('3. Copy source files from artifacts');
console.log('4. Run: npm install');
console.log('5. Run: npm start');
EOF

# Create README
cat > README.md << 'EOF'
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
EOF

echo "✅ Basic project structure created!"
echo "📁 Project location: $(pwd)"
echo ""
echo "Next steps:"
echo "1. Copy the source files from the artifacts"
echo "2. Run: npm install"
echo "3. Run: npm run setup"
echo "4. Configure .env file"
echo "5. Add your resume"