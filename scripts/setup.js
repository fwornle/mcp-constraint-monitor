#!/usr/bin/env node

/**
 * Setup script for MCP Constraint Monitor
 * Initializes databases and configuration
 */

import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(__dirname);

async function setupDirectories() {
  console.log('📁 Setting up directories...');
  
  const dirs = [
    join(rootDir, 'data'),
    join(rootDir, 'logs'),
    join(rootDir, 'config', 'projects')
  ];
  
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`  ✅ Created: ${dir}`);
    }
  }
}

async function setupConfiguration() {
  console.log('⚙️  Setting up configuration...');
  
  // Copy default constraints to user config if not exists
  const defaultConstraints = join(rootDir, 'config', 'default-constraints.yaml');
  const userConstraints = join(process.cwd(), 'constraints.yaml');
  
  if (!existsSync(userConstraints) && existsSync(defaultConstraints)) {
    try {
      copyFileSync(defaultConstraints, userConstraints);
      console.log('  ✅ Created constraints.yaml from defaults');
    } catch (error) {
      console.log('  ⚠️  Could not copy default constraints:', error.message);
    }
  }
  
  // Create default project config
  const projectConfig = {
    name: 'default-project',
    constraints: {
      configFile: './constraints.yaml',
      enabled: true
    },
    databases: {
      analytics: {
        path: join(process.cwd(), 'constraint-analytics.db')
      }
    }
  };
  
  const configPath = join(process.cwd(), 'mcp-constraint-monitor.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify(projectConfig, null, 2));
    console.log('  ✅ Created mcp-constraint-monitor.json');
  }
}

async function checkEnvironment() {
  console.log('🌍 Checking environment...');
  
  const optionalVars = ['GROQ_API_KEY', 'QDRANT_HOST', 'ANALYTICS_DB_PATH'];
  const warnings = [];
  
  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      warnings.push(varName);
    }
  }
  
  if (warnings.length > 0) {
    console.log('  ℹ️  Optional environment variables not set:');
    warnings.forEach(w => console.log(`      - ${w}`));
    console.log('  💡 These can be configured later for enhanced functionality');
  } else {
    console.log('  ✅ All optional environment variables configured');
  }
}

async function testDatabases() {
  console.log('🔍 Testing database connections...');
  
  // Test analytics database (SQLite)
  try {
    const { DuckDBAnalytics } = await import('../src/databases/duckdb-client.js');
    const analytics = new DuckDBAnalytics({ path: ':memory:' });
    await analytics.initialize();
    await analytics.close();
    console.log('  ✅ Analytics database (SQLite) - OK');
  } catch (error) {
    console.log('  ⚠️  Analytics database test failed:', error.message);
  }
  
  // Test Qdrant (optional)
  if (process.env.QDRANT_HOST) {
    try {
      const { QdrantDatabase } = await import('../src/databases/qdrant-client.js');
      const qdrant = new QdrantDatabase();
      await qdrant.initialize();
      await qdrant.close();
      console.log('  ✅ Qdrant vector database - OK');
    } catch (error) {
      console.log('  ⚠️  Qdrant database not available:', error.message);
      console.log('  💡 Install Docker and run: docker run -p 6333:6333 qdrant/qdrant');
    }
  }
}

async function main() {
  console.log('🛡️  MCP Constraint Monitor Setup\n');
  
  try {
    await setupDirectories();
    await setupConfiguration();
    await checkEnvironment();
    await testDatabases();
    
    console.log('\n✅ Setup completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Add to your Claude MCP config:');
    console.log('      "constraint-monitor": {');
    console.log('        "command": "npx",');
    console.log('        "args": ["mcp-constraint-monitor"]');
    console.log('      }');
    console.log('   2. Customize constraints in constraints.yaml');
    console.log('   3. Start Claude Code with MCP integration');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}