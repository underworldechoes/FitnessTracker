const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'fittracker';
let db, usersCollection;

async function connectToDatabase() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db(DB_NAME);
    usersCollection = db.collection('users');
    console.log(' Connected to MongoDB successfully');
    
    await usersCollection.createIndex({ email: 1 }, { unique: true });
  } catch (error) {
    console.error(' MongoDB connection failed:', error);
    process.exit(1);
  }
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = {
      name,
      email,
      password: hashedPassword,
      profile: {
        age: 0,
        height: 0,
        experience: 'beginner',
        createdAt: new Date()
      },
      workoutRoutine: null,
      workoutProgress: {
        completedWorkouts: 0,
        streak: 0,
        lastCompleted: null
      },
      gamification: {
        xp: 0,
        level: 1
      },
      badges: {},
      chatMessages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await usersCollection.insertOne(user);
    
    const token = jwt.sign(
      { userId: result.insertedId.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: result.insertedId,
        name: user.name,
        email: user.email,
        profile: user.profile
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { updatedAt: new Date() } }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        profile: user.profile,
        workoutRoutine: user.workoutRoutine,
        workoutProgress: user.workoutProgress,
        gamification: user.gamification,
        badges: user.badges
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User Profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user.userId) },
      { projection: { password: 0 } }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update User Profile
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { age, height, experience, photoDataUrl } = req.body;
    
    const updateData = {
      'profile.age': age,
      'profile.height': height,
      'profile.experience': experience,
      updatedAt: new Date()
    };

    if (photoDataUrl) {
      updateData['profile.photoDataUrl'] = photoDataUrl;
    }
    
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save Workout Routine
app.post('/api/user/routine', authenticateToken, async (req, res) => {
  try {
    const { routine } = req.body;
    
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { 
        $set: { 
          workoutRoutine: routine,
          updatedAt: new Date()
        } 
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Routine saved successfully' });
  } catch (error) {
    console.error('Save routine error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Workout Progress
app.post('/api/user/progress', authenticateToken, async (req, res) => {
  try {
    const { progress, gamification, badges } = req.body;
    
    const updateData = {
      updatedAt: new Date()
    };

    if (progress) updateData.workoutProgress = progress;
    if (gamification) updateData.gamification = gamification;
    if (badges) updateData.badges = badges;
    
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Progress updated successfully' });
  } catch (error) {
    console.error('Update progress error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save Chat Messages
app.post('/api/user/chat', authenticateToken, async (req, res) => {
  try {
    const { messages } = req.body;
    
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.user.userId) },
      { 
        $set: { 
          chatMessages: messages,
          updatedAt: new Date()
        } 
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'Chat messages saved successfully' });
  } catch (error) {
    console.error('Save chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// AI Chat Endpoint
app.post('/api/chat', authenticateToken, async (req, res) => {
  try {
    const { message, userData } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const responses = {
      greeting: [
        "Hello! I'm your AI fitness coach. Ready to crush your goals today? 💪",
        "Hey there! Your personal fitness coach is here. What can I help you with?",
        "Hi! I'm excited to help you with your fitness journey. What's on your mind?"
      ],
      workout: [
        "I recommend starting with compound exercises like squats, push-ups, and planks. Focus on proper form over heavy weights!",
        "For a balanced routine, include strength training 3-4 times per week and cardio 2-3 times. Don't forget rest days!",
        "Try this: 3 sets of 8-12 reps for each exercise. Increase weight when you can complete all reps with good form."
      ],
      nutrition: [
        "Focus on balanced meals: lean protein, complex carbs, healthy fats, and plenty of vegetables. Stay hydrated with water!",
        "Post-workout nutrition is key: aim for 20-30g of protein within 30 minutes after training to aid recovery.",
        "Meal timing matters: eat a light meal 1-2 hours before workout and refuel within 30 minutes after."
      ],
      motivation: [
        "You're doing amazing! Remember why you started. Every workout brings you closer to your goals! 🎯",
        "Consistency beats intensity. Showing up is 80% of the battle. You've got this!",
        "Progress isn't always linear. Celebrate small wins and keep pushing forward!"
      ],
      progress: [
        "Track your workouts and celebrate improvements, even small ones. Progress takes time but consistency pays off!",
        "Take progress photos and measurements - sometimes the scale doesn't tell the whole story!",
        "Focus on how you feel - more energy, better sleep, improved mood are all signs of progress!"
      ],
      default: [
        "I'm here to help with your fitness journey! Ask me about workouts, nutrition, motivation, or tracking progress.",
        "As your AI coach, I can help with exercise routines, diet tips, or keeping you motivated. What do you need?",
        "Whether it's workout plans, nutrition advice, or just some motivation, I've got your back! What can I help with?"
      ]
    };

    let category = 'default';
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
      category = 'greeting';
    } else if (lowerMessage.includes('workout') || lowerMessage.includes('exercise') || lowerMessage.includes('train')) {
      category = 'workout';
    } else if (lowerMessage.includes('food') || lowerMessage.includes('nutrition') || lowerMessage.includes('diet') || lowerMessage.includes('eat')) {
      category = 'nutrition';
    } else if (lowerMessage.includes('motivation') || lowerMessage.includes('tired') || lowerMessage.includes('burnout')) {
      category = 'motivation';
    } else if (lowerMessage.includes('progress') || lowerMessage.includes('results') || lowerMessage.includes('track')) {
      category = 'progress';
    }

    const categoryResponses = responses[category];
    const response = categoryResponses[Math.floor(Math.random() * categoryResponses.length)];

    let personalizedResponse = response;
    if (userData) {
      const { completedWorkouts = 0, streak = 0 } = userData.workoutProgress || {};
      
      if (completedWorkouts > 0) {
        personalizedResponse += ` I see you've completed ${completedWorkouts} workouts - that's awesome!`;
      }
      if (streak > 0) {
        personalizedResponse += ` Your ${streak}-day streak is impressive, keep it up!`;
      }
    }

    res.json({ 
      reply: personalizedResponse,
      category 
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'FitTracker API is running',
    timestamp: new Date().toISOString(),
    database: 'MongoDB',
    version: '1.0.0'
  });
});

// Test Database Connection
app.get('/api/test-db', async (req, res) => {
  try {
    const databases = await db.admin().listDatabases();
    const userCount = await usersCollection.countDocuments();
    
    res.json({
      status: 'OK',
      database: 'Connected',
      totalUsers: userCount,
      databases: databases.databases.map(db => db.name)
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error',
      database: 'Disconnected',
      error: error.message
    });
  }
});

// View All Users (for development)
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    const users = await usersCollection.find({}, {
      projection: {
        password: 0,
        'profile.photoDataUrl': 0
      }
    }).toArray();
    
    res.json({
      totalUsers: users.length,
      users: users
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize server
async function startServer() {
  await connectToDatabase();
  
  app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(' FitTracker Server Started Successfully!');
    console.log('='.repeat(50));
    console.log(` Port: ${PORT}`);
    console.log(` MongoDB: ${MONGODB_URI}`);
    console.log(` Database: ${DB_NAME}`);
    console.log(` JWT: Enabled`);
    console.log(` Health Check: http://localhost:${PORT}/api/health`);
    console.log(` DB Test: http://localhost:${PORT}/api/test-db`);
    console.log('='.repeat(50));
  });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  process.exit(0);
});

startServer().catch(console.error);