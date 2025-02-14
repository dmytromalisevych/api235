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
const PORT = 3000;
const STORAGE_FILE = path.join(__dirname, 'items.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const SECRET_KEY = 'dsgsdghdfhfsgs';

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'СКП',
            version: '1.0.0',
            description: 'Документація з використання СКП'
        },
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            }
        }
    },
    apis: ['./server.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
    console.log('Users file updated successfully');
}

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
 * components:
 *   schemas:
 *     Item:
 *       type: object
 *       required:
 *         - name
 *         - description
 *       properties:
 *         id:
 *           type: integer
 *           description: Автоматично згенерований ID товару
 *         name:
 *           type: string
 *           description: Назва товару
 *         description:
 *           type: string
 *           description: Опис товару
 *     User:
 *       type: object
 *       required:
 *         - username
 *         - password
 *       properties:
 *         username:
 *           type: string
 *         password:
 *           type: string
 */

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: Вхід користувача
 *     tags: [Автентифікація]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       200:
 *         description: Успішний вхід
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 */
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const users = await loadFile(USERS_FILE);
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ message: 'Невірні облікові дані' });
        }

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({ message: 'Невірні облікові дані' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('POST /api/login помилка:', error);
        res.status(500).json({ message: 'Помилка входу' });
    }
});

/**
 * @swagger
 * /api/items:
 *   get:
 *     summary: Отримати всі товари
 *     tags: [Товари]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Список всіх товарів
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Item'
 */
app.get('/api/items', authenticateToken, async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);
        res.json(items);
    } catch (error) {
        console.error('Помилка отримання товарів:', error);
        res.status(500).json({ message: 'Помилка отримання товарів' });
    }
});

/**
 * @swagger
 * /api/items:
 *   post:
 *     summary: Створити новий товар
 *     tags: [Товари]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Item'
 *     responses:
 *       201:
 *         description: Товар успішно створено
 */
app.post('/api/items', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);
        const newItem = {
            id: items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1,
            name: req.body.name,
            description: req.body.description
        };

        items.push(newItem);
        await saveFile(STORAGE_FILE, items);
        res.status(201).json(newItem);
    } catch (error) {
        console.error('Помилка додавання товару:', error);
        res.status(500).json({ message: 'Помилка додавання товару' });
    }
});

/**
 * @swagger
 * /api/items/{id}:
 *   get:
 *     summary: Отримати товар за ID
 *     tags: [Товари]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID товару
 *     responses:
 *       200:
 *         description: Деталі товару
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Item'
 */
app.get('/api/items/:id', async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);
        const item = items.find(i => i.id === parseInt(req.params.id));
        if (!item) return res.status(404).json({ message: 'Товар не знайдено' });
        res.json(item);
    } catch (error) {
        console.error('GET /api/items/:id помилка:', error);
        res.status(500).json({ message: 'Помилка завантаження товару' });
    }
});

/**
 * @swagger
 * /api/items/{id}:
 *   put:
 *     summary: Оновити товар
 *     tags: [Товари]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID товару
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Item'
 *     responses:
 *       200:
 *         description: Товар успішно оновлено
 */
app.put('/api/items/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);
        const index = items.findIndex(i => i.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ message: 'Товар не знайдено' });
        }

        items[index] = {
            ...items[index],
            name: req.body.name,
            description: req.body.description
        };

        await saveFile(STORAGE_FILE, items);
        res.json(items[index]);
    } catch (error) {
        console.error('PUT /api/items/:id помилка:', error);
        res.status(500).json({ message: 'Помилка оновлення товару' });
    }
});

/**
 * @swagger
 * /api/items/{id}:
 *   patch:
 *     summary: Частково оновити товар
 *     tags: [Товари]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID товару
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Товар успішно оновлено
 */
app.patch('/api/items/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);
        const item = items.find(i => i.id === parseInt(req.params.id));

        if (!item) {
            return res.status(404).json({ message: 'Товар не знайдено' });
        }

        if (req.body.name) item.name = req.body.name;
        if (req.body.description) item.description = req.body.description;

        await saveFile(STORAGE_FILE, items);
        res.json(item);
    } catch (error) {
        console.error('PATCH /api/items/:id помилка:', error);
        res.status(500).json({ message: 'Помилка оновлення товару' });
    }
});

/**
 * @swagger
 * /api/items/{id}:
 *   delete:
 *     summary: Видалити товар
 *     tags: [Товари]
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID товару
 *     responses:
 *       200:
 *         description: Товар успішно видалено
 */
app.delete('/api/items/:id', authenticateToken, authorizeRoles('Admin'), async (req, res) => {
    try {
        const items = await loadFile(STORAGE_FILE);
        const index = items.findIndex(i => i.id === parseInt(req.params.id));

        if (index === -1) {
            return res.status(404).json({ message: 'Товар не знайдено' });
        }

        items.splice(index, 1);
        await saveFile(STORAGE_FILE, items);
        res.json({ message: 'Товар успішно видалено' });
    } catch (error) {
        console.error('DELETE /api/items/:id помилка:', error);
        res.status(500).json({ message: 'Помилка видалення товару' });
    }
});

/**
 * @swagger
 * /api/admin:
 *   get:
 *     summary: Доступ тільки для адміністратора
 *     tags: [Адміністратор]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Вітальне повідомлення для адміністратора
 */
app.get('/api/admin', authenticateToken, authorizeRoles('Admin'), (req, res) => {
    res.json({ message: 'Ласкаво просимо, Адміністратор!' });
});

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Доступ користувача
 *     tags: [Користувач]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Вітальне повідомлення для користувача
 */
app.get('/api/user', authenticateToken, authorizeRoles('User', 'Admin'), (req, res) => {
    res.json({ message: 'Ласкаво просимо, Користувач!' });
});

initializeStorage().then(() => {
    app.listen(PORT, () => {
        console.log(`Сервер запущено на порту ${PORT}`);
        console.log(`Swagger документація доступна за адресою http://localhost:${PORT}/api-docs`);
    });
}).catch(error => {
    console.error('Не вдалося запустити сервер:', error);
});