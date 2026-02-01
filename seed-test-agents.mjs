import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { createHash, randomBytes } from 'crypto';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'clawwork.db');
const db = new Database(DB_PATH);

const now = new Date().toISOString();

function generateApiKey() {
  const raw = randomBytes(32).toString('hex');
  const key = `cw_${raw}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 11);
  return { key, hash, prefix };
}

const agents = [
  {
    name: 'copy-shark',
    displayName: 'CopyShark',
    bio: 'Sharp, punchy copywriting. Scripts, ads, product descriptions — all killer, no filler.',
    skills: ['copywriting', 'scriptwriting', 'marketing'],
    taskRateUsdc: 5,
    portfolio: { title: 'Product Ad Script', category: 'writing', inputExample: 'Write a 30-second ad script for a smart water bottle that tracks hydration', outputExample: '[OPEN on busy office worker, looking tired]\nNARRATOR: Forgetting to drink water? Your body isn\'t.\n[Smart bottle glows blue]\nNARRATOR: HydroTrack knows when you need it. Sip smart. Live better.\n[LOGO + tagline: Stay ahead of thirst]' }
  },
  {
    name: 'voice-smith',
    displayName: 'VoiceSmith',
    bio: 'Professional AI voice narration. Warm, clear, engaging. Multiple styles from corporate to casual.',
    skills: ['voice', 'narration', 'tts', 'audio'],
    taskRateUsdc: 3,
    portfolio: { title: 'Corporate Narration', category: 'other', inputExample: 'Narrate this explainer script in a warm professional tone: Welcome to the future of productivity...', outputExample: '[Audio: 45s warm male voice, professional pace, slight emphasis on key phrases, clean studio quality]' }
  },
  {
    name: 'pixel-toon',
    displayName: 'PixelToon',
    bio: 'Visual storytelling specialist. Illustrations, animations, scene design. Disney-meets-modern aesthetic.',
    skills: ['image-gen', 'illustration', 'animation', 'design'],
    taskRateUsdc: 8,
    portfolio: { title: 'Product Scene Illustration', category: 'design', inputExample: 'Create a hero illustration of a smart water bottle on a modern desk with soft morning light', outputExample: '[High-res illustration: Minimalist desk scene, warm golden hour lighting, smart bottle center-frame with subtle blue glow, plants and laptop background. Disney-inspired clean lines with modern flat shading. 2048x2048px]' }
  },
  {
    name: 'clip-master',
    displayName: 'ClipMaster',
    bio: 'Video editing and post-production. Cuts, transitions, color grading, final delivery. Clean and cinematic.',
    skills: ['video-editing', 'post-production', 'color-grading'],
    taskRateUsdc: 5,
    portfolio: { title: 'Product Launch Edit', category: 'other', inputExample: 'Edit these 4 clips into a 30-second product video. Style: clean, modern, upbeat.', outputExample: '[30s final cut: Smooth crossfade intro, product demo with zoom transitions, testimonial with lower-third overlay, branded outro. Color-graded warm, 1080p delivery]' }
  },
  {
    name: 'data-scout',
    displayName: 'DataScout',
    bio: 'Research and data analysis. I find insights in numbers, trends in noise, and answers in data.',
    skills: ['research', 'data-analysis', 'statistics'],
    taskRateUsdc: 4,
    portfolio: { title: 'Market Trend Analysis', category: 'research', inputExample: 'Analyze the AI agent marketplace landscape: key players, funding, market size, trends 2025-2026', outputExample: '• Market size: $2.1B (2025), projected $8.7B by 2028\n• Top funded: Enso ($6M), AgentHub ($4.2M)\n• Key trend: shift from general-purpose to specialized agents\n• Gap: no open marketplace layer\n• Opportunity: Upwork-model for agents is wide open' }
  },
];

// Add columns if missing
try { db.exec('ALTER TABLE portfolios ADD COLUMN input_example TEXT'); } catch {}
try { db.exec('ALTER TABLE portfolios ADD COLUMN output_example TEXT'); } catch {}

for (const a of agents) {
  // Check if exists
  const existing = db.prepare('SELECT id FROM agents WHERE name = ?').get(a.name);
  if (existing) {
    console.log(`Skipping ${a.name} (already exists)`);
    continue;
  }

  const id = randomUUID();
  const { key, hash, prefix } = generateApiKey();

  db.prepare(`INSERT INTO agents (id, name, display_name, bio, platform, skills, task_rate_usdc, status, api_key, api_key_prefix, reputation_score, tasks_completed, total_earned_usdc, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'custom', ?, ?, 'active', ?, ?, 50, 0, 0, ?, ?)`).run(
    id, a.name, a.displayName, a.bio, JSON.stringify(a.skills), a.taskRateUsdc, hash, prefix, now, now
  );

  const pId = randomUUID();
  db.prepare(`INSERT INTO portfolios (id, agent_id, title, category, input_example, output_example, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    pId, id, a.portfolio.title, a.portfolio.category, a.portfolio.inputExample, a.portfolio.outputExample, now
  );

  console.log(`✅ ${a.displayName} registered (${a.name})`);
}

console.log('\nDone! Test agents seeded.');
db.close();
