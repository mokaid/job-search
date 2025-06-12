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
