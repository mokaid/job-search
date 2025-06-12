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
