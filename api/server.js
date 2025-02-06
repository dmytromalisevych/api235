const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const STORAGE_FILE = path.join(__dirname, 'items.json');
const USERS_FILE = path.join(__dirname, 'users.json');

const SECRET_KEY = 'your-secret-key';

app.use(cors());
app.use(bodyParser.json());

async function ensureFile(filePath, defaultData) {
    try {
        await fs.access(filePath);
    } catch (error) {
        await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
        console.log(`${filePath} created successfully`);
    }
}
async function updateUsersFile() {
    const users = [
        { id: 1, username: 'admin', password: 'admin123', role: 'Admin' },
        { id: 2, username: 'user', password: 'user123', role: 'User' }
    ];

    for (const user of users) {
        user.password = await bcrypt.hash(user.password, 10);
    }

    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('Файл users.json оновлено!');
}

updateUsersFile();
async function loadFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
        throw new Error(`Failed to load ${filePath}`);
    }
}

async function saveFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`${filePath} saved successfully`);
    } catch (error) {
        console.error(`Error saving ${filePath}:`, error);
        throw new Error(`Failed to save ${filePath}`);
    }
}

async function initializeStorage() {
    await ensureFile(STORAGE_FILE, [
        { id: 1, name: 'Item 1', description: 'Description 1' },
        { id: 2, name: 'Item 2', description: 'Description 2' },
    ]);

    await ensureFile(USERS_FILE, [
        { id: 1, username: 'admin', password: await bcrypt.hash('admin123', 10), role: 'Admin' },
        { id: 2, username: 'user', password: await bcrypt.hash('user123', 10), role: 'User' },
    ]);
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ message: 'Access token is missing' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
}
app.put('/api/items/:id', (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    let items = JSON.parse(fs.readFileSync('items.json', 'utf8'));

    const itemIndex = items.findIndex(item => item.id === parseInt(id));
    if (itemIndex === -1) {
        return res.status(404).json({ message: 'Товар не знайдено' });
    }

    items[itemIndex].name = name;
    items[itemIndex].description = description;

    fs.writeFileSync('items.json', JSON.stringify(items, null, 2));

    res.json({ message: 'Товар оновлено', item: items[itemIndex] });
});
async function loadItems() {
    try {
        const data = await fs.readFile(STORAGE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading items:', error);
        throw new Error('Failed to load items');
    }
}
async function saveItems(items) {
    try {
        await fs.writeFile(STORAGE_FILE, JSON.stringify(items, null, 2));
        console.log('Items saved successfully');
    } catch (error) {
        console.error('Error saving items:', error);
        throw new Error('Failed to save items');
    }
}
app.get('/api/items/:id', async (req, res) => {
    try {
        const items = await loadItems();
        const item = items.find(i => i.id === parseInt(req.params.id));
        if (!item) return res.status(404).json({ message: 'Item not found' });
        res.json(item);
    } catch (error) {
        console.error('GET /api/items/:id error:', error);
        res.status(500).json({ message: 'Error loading item' });
    }
});
app.delete('/api/items/:id', async (req, res) => {
    try {
        const items = await loadItems();
        const itemIndex = items.findIndex(i => i.id === parseInt(req.params.id));
        if (itemIndex === -1) return res.status(404).json({ message: 'Item not found' });

        const deletedItem = items.splice(itemIndex, 1)[0];
        await saveItems(items);
        console.log('Item deleted:', deletedItem);
        res.json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error('DELETE /api/items/:id error:', error);
        res.status(500).json({ message: 'Error deleting item' });
    }
});

function authorizeRoles(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        next();
    };
}

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: User login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const users = await loadFile(USERS_FILE);
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        console.log('Введений пароль:', password);
        console.log('Хешований пароль у файлі:', user.password);

        const match = await bcrypt.compare(password, user.password);
        console.log('Результат порівняння:', match);

        if (!match) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('POST /api/login error:', error);
        res.status(500).json({ message: 'Error logging in' });
    }
});


app.get('/api/admin', authenticateToken, authorizeRoles('Admin'), (req, res) => {
    res.json({ message: 'Welcome, Admin!' });
});

app.get('/api/user', authenticateToken, authorizeRoles('User', 'Admin'), (req, res) => {
    res.json({ message: 'Welcome, User!' });
});

app.post('/api/items', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);

        const newItem = {
            id: items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1,
            name: req.body.name,
            description: req.body.description
        };

        console.log('Новий товар:', newItem);

        items.push(newItem);
        await saveFile(STORAGE_FILE, items);
        res.status(201).json(newItem);
    } catch (error) {
        console.error('Помилка додавання товару:', error);
        res.status(500).json({ message: 'Помилка додавання товару' });
    }
});
app.patch('/api/items/:id', async (req, res) => {
    try {
        const items = await loadItems();
        const item = items.find(i => i.id === parseInt(req.params.id));

        if (!item) {
            return res.status(404).json({ message: 'Товар не знайдено' });
        }

        if (req.body.name) item.name = req.body.name;
        if (req.body.description) item.description = req.body.description;

        await saveItems(items);
        console.log('Товар оновлено:', item);
        res.json(item);
    } catch (error) {
        console.error('PATCH /api/items/:id error:', error);
        res.status(500).json({ message: 'Помилка оновлення товару' });
    }
});

app.get('/api/items', authenticateToken, async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);
        console.log('Отримані товари:', items);
        res.json(items);
    } catch (error) {
        console.error('Помилка отримання товарів:', error);
        res.status(500).json({ message: 'Помилка отримання товарів' });
    }
});

initializeStorage().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}).catch(error => {
    console.error('Failed to start server:', error);
});

const PORT = 3000;
