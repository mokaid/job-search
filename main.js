// main.js - Fixed entry point
const { LinkedInJobBot } = require('./src/LinkedInJobBot');
const { BotConfig } = require('./src/config/BotConfig');

async function main() {
    try {
        console.log('🚀 Starting LinkedIn Job Bot...');
        
        // Load configuration
        const config = BotConfig.load();
        
        // Validate environment
        if (!config.validateEnvironment()) {
            console.error('❌ Environment validation failed. Please check your .env file and resume.pdf');
            process.exit(1);
        }
        
        // Create bot instance
        console.log('🤖 Creating bot instance...');
        const bot = new LinkedInJobBot(config);
        
        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🛑 Stopping bot...');
            await bot.stop();
            setTimeout(() => {
                console.log('👋 Bot stopped gracefully');
                process.exit(0);
            }, 1000);
        });
        
        process.on('SIGTERM', async () => {
            console.log('\n🛑 Received SIGTERM, stopping bot...');
            await bot.stop();
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });
        
        // Start the bot
        console.log('▶️  Starting bot execution...');
        await bot.start();
        
    } catch (error) {
        console.error('💥 Error:', error.message);
        console.error('📝 Stack trace:', error.stack);
        process.exit(1);
    }
}

// Only run if this is the main module
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Unhandled error in main:', error);
        process.exit(1);
    });
}